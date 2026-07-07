import { StateMachineLogicEntryBase } from "@src/utils/stateMachine";
import {
  SessionLogicHandlerAction,
  SessionSMTypes,
} from "@src/transport/session/sessionMeta";
import { Session } from "@src/transport/session/session";
import {
  DataMessage,
  Message,
  MessageType,
} from "@src/transport/messageBuffer";

export class ConnectedState extends StateMachineLogicEntryBase<
  SessionSMTypes["Config"]
> {
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

  logicHandler: SessionSMTypes["LogicHandler"] = ({ action, payload }) => {
    if (action == SessionLogicHandlerAction.MESSAGE) {
      switch (payload.type) {
        case MessageType.DATA:
          // todo check all fields are satisfied for message to be DataMessage
          this.collectDataMessagePart(payload as DataMessage);
          break;
        case MessageType.DATA_ACK: {
          this.sentMap;
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
