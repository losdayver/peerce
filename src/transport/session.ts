import {
  AvailableTransitionsMap,
  StateMachine,
  StateMachineConfig,
  StateMachineLogic,
  StateMachineLogicEntry,
  StateMachineLogicEntryBase,
} from "@src/utils/stateMachine";
import {
  DataMessage,
  Message,
  MessageBuffer,
  MessageType,
} from "./messageBuffer";
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
    public transceiverIPv4: TransceiverIPv4,
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
      retriesNumSeconds: 5,
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
    connected: new ConnectedState(this),
  };

  sendOne(message: Message) {
    this.transceiverIPv4.__send(
      this.address,
      this.port,
      MessageBuffer.construct(message)[0]
    );
  }

  sendData(rawData: any) {
    const msgs = MessageBuffer.construct({
      type: MessageType.DATA,
      payload: Buffer.from(rawData),
    });

    // todo continuous sender. maybe put the logic into ConnectedState
    for (const msg of msgs) {
      this.transceiverIPv4.__send(this.address, this.port, msg);
    }
  }

  handleMessage(buffer: Buffer) {
    const message = MessageBuffer.decode(buffer);
    if (!message) return;

    this.stateMachine.fireLogicHandler(this, message);
  }

  connect() {
    this.stateMachine.doStateTransition("connecting");
  }

  disconnect() {
    // todo retries
    this.transceiverIPv4.__send(this.address, this.port, "disconnect me!");
  }
}

class ConnectedState extends StateMachineLogicEntryBase<SessionStateMachineConfig> {
  constructor(private session: Session) {
    super();
  }

  private sentMap = new Map<string, { length: number; messages: Message[] }>();
  private keepAliveNumSeconds = 10;
  private keepAliveInterval: NodeJS.Timeout | undefined;

  private readonly messageCollector: Record<
    DataMessage["uid"],
    {
      isCollected: boolean;
      data: Record<DataMessage["seq"], DataMessage>;
    }
  > = {};

  private sendAck(message: DataMessage) {
    this.session.sendOne({
      type: MessageType.DATA_ACK,
      uid: message.uid,
      ack: message.seq,
    });
  }

  private collectDataMessagePart(message: DataMessage) {
    let msgTuple = this.messageCollector[message.uid];
    if (!msgTuple)
      msgTuple = this.messageCollector[message.uid] = {
        isCollected: false,
        data: {},
      };

    msgTuple.data[message.seq] = message;

    this.sendAck(message);

    if (Object.keys(msgTuple.data).length == message.total) {
      msgTuple.isCollected = true;
      // todo collected message event
      const buffers = Object.values(msgTuple.data).map(
        ({ payload }) => payload
      );
      const fullMsgString = Buffer.concat(buffers).toString("utf8");
      this.session.transceiverIPv4.eventEmitter.emit(
        "onReceive",
        {
          address: this.session.address,
          port: this.session.port,
        },
        fullMsgString
      );
    }
  }

  onEnter = (_, master) => {
    this.session.transceiverIPv4.eventEmitter.emit(
      "onConnected",
      this.session.address,
      this.session.port
    );
    this.keepAliveInterval = setInterval(() => {
      master!.sendOne({ type: MessageType.KEEP_ALIVE });
    }, this.keepAliveNumSeconds * 1000);
  };

  onExit = () => {
    clearInterval(this.keepAliveInterval);
  };

  logicHandler = (master, message: Message) => {
    switch (message.type) {
      case MessageType.DATA:
        // todo check all fields are satisfied for message to me DataMessage
        this.collectDataMessagePart(message as DataMessage);
        break;
      case MessageType.DATA_ACK:
        this.sentMap;
        break;
      case MessageType.KEEP_ALIVE:
        console.log(
          `received from ${master.address}:${master.port}: KEEP ALIVE`
        );
    }
  };
}
