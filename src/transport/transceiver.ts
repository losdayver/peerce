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

interface TransceiverEventEmitterMap {
  onConnected: [address: string, port: number];
  onSessionClosed: [address: string, port: number];
  onClosed: [];
  onError: [];
  onReceive: [{ address: string; port: number }, msg: Buffer];
}

const transceiverStateTransitionMap = {
  idle: ["listening", "error"] as const,
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

export class TransceiverIPv4 {
  constructor() {
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

  private setupSocket = () => {
    this.socket = dgram.createSocket("udp4");
    if (this.selfAddress)
      this.socket.bind(this.selfAddress.port, this.selfAddress.address);
  };

  private bindSocketEvents = () => {
    const socket = this.socket!;

    socket.on("error", () => {
      void this.stateMachine.shiftTo("error");
    });

    socket.on("message", (msg, { address, port }) =>
      this.onRawMessage(address, port, msg)
    );
  };

  private createSession = (address: string, port: number) => {
    const session = new Session(this, address, port);
    const key = `${address}:${port}`;

    const onConnected = () => {
      this.eventEmitter.emit("onConnected", address, port);
    };
    const onReceive = (message: Buffer) => {
      this.eventEmitter.emit("onReceive", { address, port }, message);
    };
    const onClosed = () => {
      session.off("connected", onConnected);
      session.off("receive", onReceive);

      if (this.sessionMap.get(key) !== session) return;

      this.sessionMap.delete(key);
      this.eventEmitter.emit("onSessionClosed", address, port);
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
    let session = this.sessionMap.get(key);

    // Prevent FIN message from creating new session
    if (!session && msg?.type !== MessageType.FIN) {
      session = this.createSession(address, port);
      void session.connect();
    }

    session?.handleMessage(msg);
  };

  private transceiverStateBehaviors: InferStateShifterTypes<TransceiverIPv4StateShifterConfig>["Behaviors"] =
    {
      listening: {
        onEnter: () => {
          this.setupSocket();
          this.bindSocketEvents();
        },
      },

      closing: {
        onEnter: () => {
          this.socket?.removeAllListeners();
          this.sessionMap.values().forEach((session) => session.close());
          void this.stateMachine.shiftTo("closed");
        },
      },

      closed: {
        onEnter: () => {
          // setTimeout((this.socket as any).close, 2000); // todo close all sessions and await for all to close
        },
      },

      error: {
        onEnter: () => {
          this.socket?.close();
        },
      },
    };

  public eventEmitter = new EventEmitter<TransceiverEventEmitterMap>();

  public async listen(self?: TransceiverIPv4Params["self"]) {
    // todo refactor these
    if (this.stateMachine.getCurrentState() != "idle")
      throw new Error(
        `cannot listen on ${this.stateMachine.getCurrentState()}`
      );

    this.selfAddress = self;
    await this.stateMachine.shiftTo("listening");
  }
  public connect(address: string, port: number) {
    if (this.stateMachine.getCurrentState() != "listening")
      throw new Error(
        `cannot connect on ${this.stateMachine.getCurrentState()}`
      );

    const session = this.createSession(address, port);
    session.connect();
  }
  public closeSession(address: string, port: number) {
    const session = this.sessionMap.get(`${address}:${port}`);
    if (session) void session.close();
  }
  public close() {
    void this.stateMachine.shiftTo("closing");
  }
  public send(address: string, port: number, msg: string | Buffer) {
    const session = this.sessionMap.get(`${address}:${port}`);
    if (!session) return;
    session.sendData(msg);
  }
  public __send(address: string, port: number, msg: any) {
    this.socket?.send(msg, port, address);
  }
}
