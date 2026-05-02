import {
  AvailableTransitionsMap,
  StateMachine,
  StateMachineConfig,
  StateMachineLogic,
  StateMachineLogicEntry,
  StateMachineLogicEntryBase,
} from "@src/utils/stateMachine";
import { Message, MessageBuffer, MessageType } from "./messageBuffer";
import { TransceiverIPv4 } from "./transceiver";

const sessionStateTransitionMap = {
  idle: ["connecting", "error"] as const,
  connecting: ["connected", "closing", "error"] as const,
  connected: ["closing", "error"] as const,
  closing: ["closed", "error"] as const,
  closed: [] as const,
  error: [] as const,
} satisfies AvailableTransitionsMap;

type SessionLogicHandler = (master: Session, message: Message) => void;

type SessionStateMachineConfig = StateMachineConfig<
  typeof sessionStateTransitionMap,
  SessionLogicHandler,
  Session
>;

type SessionStateMachine = StateMachine<SessionStateMachineConfig>;
type SessionStateMachineLogic = StateMachineLogic<SessionStateMachineConfig>;
type SessionStateMachineLogicEntry =
  StateMachineLogicEntry<SessionStateMachineConfig>;

export class Session {
  constructor(
    private transceiverIPv4: TransceiverIPv4,
    public address: string,
    public port: number
  ) {
    this.stateMachine = new StateMachine<SessionStateMachineConfig>(
      "idle",
      sessionStateTransitionMap,
      this.sessionStateLogic,
      this
    );
  }

  private stateMachine: SessionStateMachine;

  private sessionStateLogic: SessionStateMachineLogic = {
    connecting: {
      retriesInterval: null,
      retriesNumSeconds: 0.5,
      onEnter(_, master) {
        let retries = 10;
        this.retriesInterval = setInterval(() => {
          master!.sendOne({
            type: MessageType.HELLO,
          });
          retries -= 1;

          if (retries <= 0) master?.stateMachine.doStateTransition("closing");
        }, this.retriesNumSeconds * 1000);
      },
      logicHandler(master, message) {
        switch (message.type) {
          case MessageType.HELLO:
            master!.sendOne({
              type: MessageType.HELLO_ACK,
            });
            return;
          case MessageType.HELLO_ACK:
            master!.sendOne({
              type: MessageType.HELLO_ACK,
            });
            master.stateMachine.doStateTransition("connected");
            return;
        }
      },
      onExit(to, master) {
        clearInterval(this.retriesInterval);
      },
    } satisfies SessionStateMachineLogicEntry,
    connected: new ConnectedState(),
  };

  private sendOne(message: Message) {
    this.transceiverIPv4.__send(
      this.address,
      this.port,
      MessageBuffer.construct(message)[0]
    );
  }

  handleMessage(buffer: Buffer) {
    const message = MessageBuffer.decode(buffer);

    this.stateMachine.fireLogicHandler(this, message);
  }

  connect() {
    this.stateMachine.doStateTransition("connecting");
  }

  sendData(msg: any) {
    // todo serialization logic and ack await
    this.transceiverIPv4.__send(
      this.address,
      this.port,
      MessageBuffer.construct({
        type: MessageType.DATA,
        payload: Buffer.from(msg),
      })
    );
  }

  disconnect() {
    // todo retries
    this.transceiverIPv4.__send(this.address, this.port, "disconnect me!");
  }
}

class ConnectedState extends StateMachineLogicEntryBase<SessionStateMachineConfig> {
  sentMap = new Map<string, { length: number; messages: Message[] }>();
  keepAliveNumSeconds = 10;
  keepAliveInterval: NodeJS.Timeout | undefined;

  onEnter = (_, master) => {
    this.keepAliveInterval = setInterval(() => {
      master!.sendOne({ type: MessageType.KEEP_ALIVE });
    }, this.keepAliveNumSeconds * 1000);
  };

  onExit = () => {
    clearInterval(this.keepAliveInterval);
  };

  logicHandler = (master, message) => {
    switch (message.type) {
      case MessageType.DATA:
      case MessageType.DATA_ACK:
        console.log(
          `received from ${master.address}:${master.port}: ${message.payload?.toString("utf8")}`
        );
        this.sentMap;
      case MessageType.KEEP_ALIVE:
        console.log(
          `received from ${master.address}:${master.port}: KEEP ALIVE`
        );
    }
  };
}
