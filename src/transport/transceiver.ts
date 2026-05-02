import {
  AvailableTransitionsMap,
  StateMachine,
  StateMachineConfig,
  StateMachineLogic,
} from "@src/utils/stateMachine";
import { EventEmitter } from "node:events";
import * as dgram from "node:dgram";
import { Session } from "@src/transport/session";

interface TransceiverEventEmitterMap {
  onConnected: [(address: string, port: number) => void];
  onClosed: [() => void];
  onError: [() => void];
  onReceive: [() => void];
}

const transceiverStateTransitionMap = {
  idle: ["listening", "error"] as const,
  listening: ["closing", "error"] as const,
  closing: ["closed", "error"] as const,
  closed: [] as const,
  error: [] as const,
} satisfies AvailableTransitionsMap;

interface TransceiverIPv4Params {
  self?: {
    address: string;
    port: number;
  };
}

type TransceiverIPv4StateMachineConfig = StateMachineConfig<
  typeof transceiverStateTransitionMap,
  never,
  TransceiverIPv4
>;

export class TransceiverIPv4 {
  constructor() {
    this.stateMachine = new StateMachine<TransceiverIPv4StateMachineConfig>(
      "idle",
      transceiverStateTransitionMap,
      this.transceiverStateLogic
    );
  }

  private socket: dgram.Socket | undefined;
  private selfAddress: TransceiverIPv4Params["self"] | undefined;
  private sessionMap: Map<string, Session> = new Map();
  private stateMachine: StateMachine<TransceiverIPv4StateMachineConfig>;

  private setupSocket = () => {
    this.socket = dgram.createSocket("udp4");
    if (this.selfAddress)
      this.socket.bind(this.selfAddress.port, this.selfAddress.address);
  };

  private bindSocketEvents = () => {
    const socket = this.socket!;

    socket.on("error", () => {
      this.stateMachine.doStateTransition("error");
    });

    socket.on("message", (msg, { address, port }) =>
      this.onRawMessage(address, port, msg)
    );
  };

  private onRawMessage = (address: string, port: number, msg: Buffer) => {
    const key = `${address}:${port}`;

    let session = this.sessionMap.get(key);

    if (!session) {
      session = new Session(this, address, port);
      this.sessionMap.set(key, session);
      session.connect();
    }

    session.handleMessage(msg);
  };

  private transceiverStateLogic: StateMachineLogic<TransceiverIPv4StateMachineConfig> =
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
          this.socket?.close();
          this.stateMachine.doStateTransition("closed");
        },
      },

      error: {
        onEnter: () => {
          this.socket?.close();
        },
      },
    };

  public eventEmitter = new EventEmitter<TransceiverEventEmitterMap>();

  public listen(self?: TransceiverIPv4Params["self"]) {
    if (this.stateMachine.currentState != "idle")
      throw new Error(`cannot listen on ${this.stateMachine.currentState}`);

    this.selfAddress = self;
    this.stateMachine.doStateTransition("listening");
  }
  public connect(address: string, port: number) {
    if (this.stateMachine.currentState != "listening")
      throw new Error(`cannot connect on ${this.stateMachine.currentState}`);

    const session = new Session(this, address, port);
    this.sessionMap.set(`${address}:${port}`, session);
    session.connect();
  }
  public disconnect(address: string, port: number) {
    const session = this.sessionMap.get(`${address}:${port}`);
    if (session) session.disconnect();
  }
  public close() {
    this.stateMachine.doStateTransition("closing");
  }
  public __send(address: string, port: number, msg: any) {
    this.socket?.send(msg, port, address);
  }
  public send(address: string, port: number, msg: any) {
    const session = this.sessionMap.get(`${address}:${port}`);
    if (!session) return;
    session.sendData(msg);
  }
}
