import { StateMachineLogicEntryBase } from "@src/utils/stateMachine";
import {
  SessionLogicHandlerAction,
  SessionSMTypes,
} from "@src/transport/session/sessionMeta";
import { Session } from "@src/transport/session/session";
import {
  DataAckMessage,
  DataMessage,
  MessageType,
} from "@src/transport/messageBuffer";

export class ConnectedState extends StateMachineLogicEntryBase<
  SessionSMTypes["Config"]
> {
  constructor(private session: Session) {
    super();
  }

  private keepAliveNumSeconds = 10;
  private keepAliveInterval: NodeJS.Timeout | undefined;

  private readonly messageCollector: Record<
    DataMessage["uid"],
    {
      isCollected: boolean;
      data: Record<DataMessage["seq"], DataMessage>;
    }
  > = {};

  private readonly dataAckCollector = new Map<
    DataMessage["uid"],
    Set<DataMessage["seq"]>
  >();
  private dataAckTimers = new Map<DataMessage["uid"], NodeJS.Timeout>();

  collectAck = (message: DataAckMessage) => {
    const set =
      this.dataAckCollector.get(message.uid) ??
      this.dataAckCollector.set(message.uid, new Set()).get(message.uid);

    const hasAckChecker = () => {
      for (let i = 1; i <= message.total; i++) {
        const hasAck = set!.has(i);
        if (!hasAck) console.log("todo resend", message.ack);
      }
    };

    set?.add(message.ack);
    const timeout = this.dataAckTimers.get(message.uid);
    if (timeout) clearTimeout(timeout);

    if (set!.size != message.total)
      this.dataAckTimers.set(message.uid, setTimeout(hasAckChecker, 10));
  };

  private sendAck = (message: DataMessage) => {
    this.session.sendOne({
      type: MessageType.DATA_ACK,
      uid: message.uid,
      ack: message.seq,
      total: message.total,
    } satisfies DataAckMessage);
  };

  private collectDataMessagePart = (message: DataMessage) => {
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
      delete this.messageCollector[message.uid];
      this.session.transceiverIPv4.eventEmitter.emit(
        "onReceive",
        {
          address: this.session.address,
          port: this.session.port,
        },
        fullMsgString
      );
    }
  };

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

  logicHandler: SessionSMTypes["LogicHandler"] = ({
    action,
    payload: message,
  }) => {
    if (action == SessionLogicHandlerAction.MESSAGE) {
      switch (message.type) {
        case MessageType.DATA:
          // todo check all fields are satisfied for message to be DataMessage
          this.collectDataMessagePart(message as DataMessage);
          break;
        case MessageType.DATA_ACK: {
          this.collectAck(message as DataAckMessage);
          break;
        }
        case MessageType.FIN:
          this.session.close();
      }
    }
  };

  onExit = () => {
    clearInterval(this.keepAliveInterval);
  };
}
