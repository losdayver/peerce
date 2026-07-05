import {
  AvailableTransitionsMap,
  StateMachine,
  StateMachineConfig,
  StateMachineLogic,
  StateMachineLogicEntry,
  StateMachineLogicEntryBase,
} from "@src/utils/stateMachine";
import { Session } from "./session";
import {
  DataMessage,
  Message,
  MessageBuffer,
  MessageType,
} from "@src/transport/messageBuffer";

export const sessionStateTransitionMap = {
  idle: ["connecting", "error"] as const,
  connecting: ["connected", "closing", "error"] as const,
  connected: ["closing", "error"] as const,
  closing: ["closed", "error"] as const,
  closed: [] as const,
  error: [] as const,
} satisfies AvailableTransitionsMap;

export type SessionLogicHandler = (message: Message) => void;

export type SessionStateMachineConfig = StateMachineConfig<
  typeof sessionStateTransitionMap,
  SessionLogicHandler
>;

export type SessionStateMachine = StateMachine<SessionStateMachineConfig>;
export type SessionStateMachineLogic =
  StateMachineLogic<SessionStateMachineConfig>;
export type SessionStateMachineLogicEntry =
  StateMachineLogicEntry<SessionStateMachineConfig>;

export class ConnectedState extends StateMachineLogicEntryBase<SessionStateMachineConfig> {
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
      const buffers = Object.values(msgTuple.data).map(
        ({ payload }) => payload
      );
      const fullMsgString = Buffer.concat(buffers);
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

  onEnter = () => {
    this.session.transceiverIPv4.eventEmitter.emit(
      "onConnected",
      this.session.address,
      this.session.port
    );
    clearInterval(this.keepAliveInterval);
    this.keepAliveInterval = setInterval(() => {
      this.session.sendOne({ type: MessageType.KEEP_ALIVE });
    }, this.keepAliveNumSeconds * 1000);
  };

  onExit = () => {
    clearInterval(this.keepAliveInterval);
  };

  logicHandler = async (message: Message) => {
    switch (message.type) {
      case MessageType.DATA:
        // todo check all fields are satisfied for message to me DataMessage
        this.collectDataMessagePart(message as DataMessage);
        break;
      case MessageType.DATA_ACK: {
        this.sentMap;
        break;
      }
      case MessageType.FIN:
        await this.session.close();
    }
  };
}

export class ConnectingState extends StateMachineLogicEntryBase<SessionStateMachineConfig> {
  private retriesInterval?: NodeJS.Timeout;
  private retriesNumSeconds = 0.3;

  constructor(private session: Session) {
    super();
  }

  onEnter = () => {
    let retries = 10;
    clearInterval(this.retriesInterval);
    this.retriesInterval = setInterval(async () => {
      this.session.sendOne({ type: MessageType.HELLO });
      retries -= 1;
      if (retries <= 0)
        await this.session.stateMachine.doStateTransition("closing");
    }, this.retriesNumSeconds * 1000);
  };

  logicHandler = async (message) => {
    switch (message.type) {
      case MessageType.HELLO:
        this.session.sendOne({ type: MessageType.HELLO_ACK });
        return;
      case MessageType.HELLO_ACK:
        this.session.sendOne({ type: MessageType.HELLO_ACK });
        await this.session.stateMachine.doStateTransition("connected");
        return;
    }
  };

  onExit = () => {
    clearInterval(this.retriesInterval);
  };
}

export class ClosingState extends StateMachineLogicEntryBase<SessionStateMachineConfig> {
  constructor(private session: Session) {
    super();
  }

  logicHandler = () => {};
  onExit = () => {};
  onEnter = async (_) => {
    const [msg] = MessageBuffer.construct({ type: MessageType.FIN });
    this.session.transceiverIPv4.__send(
      this.session.address,
      this.session.port,
      msg
    );
    await this.session.stateMachine.doStateTransition("closed");
  };
}

export class ClosedState extends StateMachineLogicEntryBase<SessionStateMachineConfig> {
  constructor(private session: Session) {
    super();
  }

  logicHandler = () => {};
  onExit = () => {};
  onEnter = () => {
    this.session.transceiverIPv4.__deleteSessionFormMap(
      this.session.address,
      this.session.port
    );
  };
}
