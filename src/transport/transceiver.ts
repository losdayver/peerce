import { EventEmitter } from "node:events";
import * as dgram from "node:dgram";
import { Session } from "./session/session";
import { MessageBuffer, MessageType } from "./messageBuffer";
import {
  InferStateShifterTypes,
  StateShifter,
  StateShifterConfig,
  TransitionGraph,
} from "state-shifter";

export interface TransceiverEventMap {
  onConnected: [address: string, port: number];
  onSessionClosed: [address: string, port: number];
  onClosed: [];
  onError: [error: Error];
  onReceive: [{ address: string; port: number }, msg: Buffer];
}

const MAX_SESSIONS = 1_024;

const transceiverStateTransitionMap = {
  idle: ["listening", "closing", "error"] as const,
  listening: ["closing", "error"] as const,
  closing: ["closed", "error"] as const,
  closed: [] as const,
  error: [] as const,
} satisfies TransitionGraph;

export interface TransceiverIPv4Params {
  self?: {
    address: string;
    port: number;
  };
}

type TransceiverIPv4StateShifterConfig = StateShifterConfig<
  typeof transceiverStateTransitionMap,
  never
>;

export class TransceiverIPv4 extends EventEmitter<TransceiverEventMap> {
  constructor() {
    super();
    this.stateMachine = new StateShifter<TransceiverIPv4StateShifterConfig>(
      "idle",
      transceiverStateTransitionMap,
      this.transceiverStateBehaviors
    );
  }

  private socket: dgram.Socket | undefined;
  private selfAddress: TransceiverIPv4Params["self"] | undefined;
  private sessionMap: Map<string, Session> = new Map();
  private stateMachine: InferStateShifterTypes<TransceiverIPv4StateShifterConfig>["StateShifter"];
  private listenPromise: Promise<void> | undefined;
  private closePromise: Promise<void> | undefined;

  private bindSocket = async () => {
    const socket = dgram.createSocket("udp4");
    this.socket = socket;

    await new Promise<void>((resolve, reject) => {
      const onListening = () => {
        socket.off("error", onBindError);
        resolve();
      };
      const onBindError = (error: Error) => {
        socket.off("listening", onListening);
        reject(error);
      };

      socket.once("listening", onListening);
      socket.once("error", onBindError);

      if (this.selfAddress)
        socket.bind(this.selfAddress.port, this.selfAddress.address);
      else socket.bind(0);
    });
  };

  private bindSocketEvents = () => {
    const socket = this.socket;
    if (!socket) throw new Error("Cannot bind events without a socket");

    socket.on("error", this.onSocketError);
    socket.on("message", this.onSocketMessage);
  };

  private onSocketError = (error: Error) => {
    this.emit("onError", error);
    if (!this.closePromise)
      this.closePromise = this.fail(error).catch((cause) => {
        this.emit(
          "onError",
          new Error("Failed to recover from UDP socket error", { cause })
        );
      });
  };

  private onSocketMessage = (
    buffer: Buffer,
    { address, port }: dgram.RemoteInfo
  ) => {
    try {
      this.onRawMessage(address, port, buffer);
    } catch (cause) {
      const error = new Error("Failed to process UDP datagram", { cause });
      this.emit("onError", error);
    }
  };

  private closeSessions = async () => {
    const sessions = Array.from(this.sessionMap.values());
    const results = await Promise.allSettled(
      sessions.map((session) => session.closeAsync())
    );

    for (const result of results) {
      if (result.status === "rejected") {
        const error = new Error("Failed to close session", {
          cause: result.reason,
        });
        this.emit("onError", error);
      }
    }

    this.sessionMap.clear();
  };

  private closeSocket = async () => {
    const socket = this.socket;
    if (!socket) return;

    socket.off("message", this.onSocketMessage);

    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        socket.off("close", onClose);
        socket.off("error", onCloseError);
      };
      const onClose = () => {
        cleanup();
        resolve();
      };
      const onCloseError = (error: Error) => {
        cleanup();
        reject(error);
      };

      socket.once("close", onClose);
      socket.once("error", onCloseError);

      try {
        socket.close();
      } catch (cause) {
        cleanup();
        if (
          cause instanceof Error &&
          (cause as NodeJS.ErrnoException).code ===
            "ERR_SOCKET_DGRAM_NOT_RUNNING"
        ) {
          resolve();
          return;
        }
        reject(cause);
      }
    });

    socket.off("error", this.onSocketError);
    if (this.socket === socket) this.socket = undefined;
  };

  private fail = async (_error: Error) => {
    const state = this.stateMachine.getCurrentState();
    if (state === "closed" || state === "error") return;

    this.socket?.off("message", this.onSocketMessage);

    let cleanupError: unknown;
    try {
      await this.closeSessions();
      await this.closeSocket();
    } catch (cause) {
      cleanupError = cause;
    }

    const currentState = this.stateMachine.getCurrentState();
    if (currentState !== "closed" && currentState !== "error")
      await this.stateMachine.shiftTo("error");

    if (cleanupError)
      throw new Error("Failed to clean up transceiver after error", {
        cause: cleanupError,
      });
  };

  private createSession = (address: string, port: number) => {
    const key = `${address}:${port}`;
    if (this.sessionMap.has(key))
      throw new Error(`Session already exists for ${key}`);
    if (this.sessionMap.size >= MAX_SESSIONS)
      throw new Error(`Session limit of ${MAX_SESSIONS} reached`);

    const session = new Session(this, address, port);

    const onConnected = () => {
      this.emit("onConnected", address, port);
    };
    const onReceive = (message: Buffer) => {
      this.emit("onReceive", { address, port }, message);
    };
    const onClosed = () => {
      session.off("connected", onConnected);
      session.off("receive", onReceive);

      if (this.sessionMap.get(key) !== session) return;

      this.sessionMap.delete(key);
      this.emit("onSessionClosed", address, port);
    };

    session.once("connected", onConnected);
    session.on("receive", onReceive);
    session.once("closed", onClosed);
    this.sessionMap.set(key, session);

    return session;
  };

  private onRawMessage = (address: string, port: number, buffer: Buffer) => {
    const key = `${address}:${port}`;

    const msg = MessageBuffer.decode(buffer);
    if (!msg) return;

    switch (msg.type) {
      case MessageType.HELLO:
      case MessageType.HELLO_ACK:
      case MessageType.DATA:
      case MessageType.DATA_ACK:
      case MessageType.KEEP_ALIVE:
      case MessageType.FIN:
        break;
      default:
        return;
    }

    let session = this.sessionMap.get(key);

    if (!session) {
      if (msg.type !== MessageType.HELLO) return;
      if (this.sessionMap.size >= MAX_SESSIONS) return;

      session = this.createSession(address, port);
      void session.connect();
    }

    session?.handleMessage(msg);
  };

  private transceiverStateBehaviors: InferStateShifterTypes<TransceiverIPv4StateShifterConfig>["Behaviors"] =
    {
      listening: {
        onEnter: async () => {
          await this.bindSocket();
          this.bindSocketEvents();
        },
      },

      closing: {
        onEnter: async () => {
          this.socket?.off("message", this.onSocketMessage);
          await this.closeSessions();
          await this.closeSocket();
        },
      },

      closed: {
        onEnter: () => {
          this.emit("onClosed");
        },
      },

      error: {
        onEnter: () => {},
      },
    };

  private performClose = async () => {
    if (this.listenPromise) {
      try {
        await this.listenPromise;
      } catch (cause) {
        await this.fail(
          new Error("Listener failed while transceiver was closing", { cause })
        );
        return;
      }
    }

    const state = this.stateMachine.getCurrentState();
    if (state === "closed" || state === "error") return;

    try {
      await this.stateMachine.shiftTo("closing");
      await this.stateMachine.shiftTo("closed");
    } catch (cause) {
      const error = new Error("Failed to close transceiver", { cause });
      this.emit("onError", error);
      await this.fail(error);
      throw error;
    }
  };

  private performListen = async () => {
    try {
      await this.stateMachine.shiftTo("listening");
    } catch (cause) {
      const error = new Error("Failed to start UDP listener", { cause });
      this.emit("onError", error);
      if (!this.closePromise) {
        this.closePromise = this.fail(error);
        await this.closePromise;
      }
      throw error;
    }
  };

  public listen(self?: TransceiverIPv4Params["self"]) {
    if (this.stateMachine.getCurrentState() != "idle" || this.listenPromise)
      throw new Error(
        `cannot listen on ${this.stateMachine.getCurrentState()}`
      );

    this.selfAddress = self;
    this.listenPromise = this.performListen();
    return this.listenPromise;
  }

  public connect(address: string, port: number) {
    if (this.stateMachine.getCurrentState() != "listening" || this.closePromise)
      throw new Error(
        `cannot connect on ${this.stateMachine.getCurrentState()}`
      );

    const session = this.createSession(address, port);
    session.connect();
  }

  public async closeSession(address: string, port: number) {
    const session = this.sessionMap.get(`${address}:${port}`);
    if (session) await session.closeAsync();
  }

  public close(): Promise<void> {
    this.closePromise ??= this.performClose();
    return this.closePromise;
  }

  public send(address: string, port: number, msg: string | Buffer) {
    const session = this.sessionMap.get(`${address}:${port}`);
    if (!session)
      throw new Error(`Session does not exist for ${address}:${port}`);
    session.sendData(msg);
  }

  public sendDatagram(address: string, port: number, msg: Buffer) {
    const socket = this.socket;
    const state = this.stateMachine.getCurrentState();
    if (!socket || (state !== "listening" && state !== "closing"))
      throw new Error(`Cannot send datagram while transceiver is ${state}`);

    socket.send(msg, port, address, (error) => {
      if (error) this.onSocketError(error);
    });
  }
}
