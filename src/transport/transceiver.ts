import {
  AvailableTransitionsMap,
  StateMachine,
  StateMachineLogic,
} from "@src/utils/stateMachine";
import { EventEmitter } from "node:events";
import * as dgram from "node:dgram";

interface TransceiverEventEmitterMap {
  onConnected: [() => void];
  onClosed: [() => void];
  onError: [() => void];
  onReceive: [() => void];
}

const transceiverStateTransitionMap = {
  idle: ["listening", "error"] as const,
  listening: ["connecting", "error"] as const,
  connecting: ["connected", "error", "closing"] as const,
  connected: ["closing", "error"] as const,
  closing: ["closed", "error"] as const,
  closed: [] as const,
  error: [] as const,
} satisfies AvailableTransitionsMap;

export class TransceiverIPv4 {
  constructor(
    targetHost?: string,
    targetPort?: number,
    selfHost?: string,
    selfPort?: number
  ) {
    this.targetHost = targetHost;
    this.targetPort = targetPort;

    this.selfHost = selfHost;
    this.selfPort = selfPort;

    this.stateMachine = new StateMachine<typeof transceiverStateTransitionMap>(
      "idle",
      transceiverStateTransitionMap,
      this.transceiverStateLogic
    );
  }

  private socket: dgram.Socket | undefined;
  private targetHost: string | undefined;
  private targetPort: number | undefined;
  private selfHost: string | undefined;
  private selfPort: number | undefined;

  //#region state
  private setupSocket = () => {
    this.socket = dgram.createSocket("udp4");
    if (this.selfPort) this.socket.bind(this.selfPort, this.selfHost);
  };

  private bindSocketEvents = () => {
    const socket = this.socket!;

    socket.on("error", () => {
      this.stateMachine.doStateTransition("error");
    });

    socket.on("message", this.onRawMessage);
  };

  private onRawMessage = (data) => {
    console.info(data?.toString("utf8"));
    // here we parse messages and decipher them

    // do support for two mode of operation:
    // 1. two transceivers know each other's addresses and ports
    // 2. only one of two transceivers knows other's addresses and port.
    // The other one waits for all connections and binds other address and port upon connection
  };
  //#endregion

  private transceiverStateLogic: StateMachineLogic<
    typeof transceiverStateTransitionMap
  > = {
    listening: {
      onEnter: () => {
        this.setupSocket();
        this.bindSocketEvents();
      },
    },

    connecting: {
      onEnter: () => {},
    },

    connected: {
      onEnter: () => {},
    },

    error: {
      onEnter: () => {
        this.socket?.close();
      },
    },
  };

  public eventEmitter = new EventEmitter<TransceiverEventEmitterMap>();
  public stateMachine: StateMachine<typeof transceiverStateTransitionMap>;

  public listen() {
    this.stateMachine.doStateTransition("listening");
  }
  public connect() {
    this.stateMachine.doStateTransition("connecting");
  }
  public close() {
    this.stateMachine.doStateTransition("closing");
  }
  public send(msg: any) {
    this.socket?.send(msg, this.targetPort, this.targetHost);
  }
}
