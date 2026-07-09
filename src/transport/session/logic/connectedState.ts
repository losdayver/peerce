import { StateMachineLogicEntryBase } from "@src/utils/stateMachine";
import {
  SessionLogicHandlerAction,
  SessionSMTypes,
} from "@src/transport/session/sessionMeta";
import { Session } from "@src/transport/session/session";
import {
  DataAckMessage,
  DataMessage,
  MessageBuffer,
  MessageType,
} from "@src/transport/messageBuffer";
import { logWarning } from "@src/utils/logUtils";
import { writeFileSync } from "node:fs";

export class ConnectedState extends StateMachineLogicEntryBase<
  SessionSMTypes["Config"]
> {
  constructor(private session: Session) {
    super();
  }

  private keepAliveNumSeconds = 10;
  private keepAliveInterval: NodeJS.Timeout | undefined;

  private readonly buffersToSendCache = new Map<DataMessage["uid"], Buffer[]>();

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

    // todo run this independently. receiving ack should only reset timeout for next check
    const hasAckChecker = () => {
      for (let i = 0; i < message.total; i++) {
        const hasAck = set!.has(i);
        if (!hasAck) {
          const { transceiverIPv4, address, port } = this.session;
          const buffers = this.buffersToSendCache.get(message.uid)!;
          if (buffers) {
            logWarning(`resending lost ${message.uid} seq: ${message.ack}`);
            transceiverIPv4.__send(address, port, buffers[i]);
          }
        }
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

      // writeFileSync(
      //   "misc/test/msg.json",
      //   Object.values(msgTuple.data)
      //     .map((message) => `${JSON.stringify(message, null, 2)}`)
      //     .join("\n")
      // );

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

  logicHandler: SessionSMTypes["LogicHandler"] = ({ action, payload }) => {
    if (action == SessionLogicHandlerAction.MESSAGE) {
      switch (payload.type) {
        case MessageType.DATA:
          // todo check all fields are satisfied for message to be DataMessage
          this.collectDataMessagePart(payload as DataMessage);
          break;
        case MessageType.DATA_ACK: {
          this.collectAck(payload as DataAckMessage);
          break;
        }
        case MessageType.FIN:
          this.session.close();
      }
    } else if (action == SessionLogicHandlerAction.SEND_DATA) {
      const { transceiverIPv4, address, port } = this.session;
      const constructed = MessageBuffer.construct({
        type: MessageType.DATA,
        payload: typeof payload == "string" ? Buffer.from(payload) : payload,
      });

      // writeFileSync(
      //   "misc/test/msg.json",
      //   Object.values(constructed.buffers)
      //     .map(
      //       (message) =>
      //         `${JSON.stringify(MessageBuffer.decode(message), null, 2)}`
      //     )
      //     .join("\n")
      // );

      this.buffersToSendCache.set(constructed.uid, constructed.buffers);

      for (const buffer of constructed.buffers)
        transceiverIPv4.__send(address, port, buffer);
    }
  };

  onExit = () => {
    clearInterval(this.keepAliveInterval);
  };
}
