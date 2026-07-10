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
import { sleep } from "@src/utils/promiseUtils";

export class ConnectedState extends StateMachineLogicEntryBase<
  SessionSMTypes["Config"]
> {
  constructor(public session: Session) {
    super();
  }

  private dataSender = new DataSender(this);
  private keepAliveNumSeconds = 10;
  private keepAliveInterval: NodeJS.Timeout | undefined;

  private readonly messageCollector: Record<
    DataMessage["uid"],
    {
      isCollected: boolean;
      data: Record<DataMessage["seq"], DataMessage>;
    }
  > = {};

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

  logicHandler: SessionSMTypes["LogicHandler"] = ({ action, payload }) => {
    if (action == SessionLogicHandlerAction.MESSAGE) {
      switch (payload.type) {
        case MessageType.DATA:
          // todo check all fields are satisfied for message to be DataMessage
          this.collectDataMessagePart(payload as DataMessage);
          break;
        case MessageType.DATA_ACK: {
          this.dataSender.collectDataAck(payload as DataAckMessage);
          break;
        }
        case MessageType.FIN:
          this.session.close();
      }
    } else if (action == SessionLogicHandlerAction.SEND_DATA) {
      this.dataSender.registerNewTransmission(payload);
    }
  };

  onExit = () => {
    clearInterval(this.keepAliveInterval);
  };
}

class DataSender {
  constructor(private connectedState: ConnectedState) {}

  private transmissionMap = new Map<DataMessage["uid"], Transmission>();

  collectDataAck = (message: DataAckMessage) => {
    const transmission = this.transmissionMap.get(message.uid);
    transmission?.collectDataAck(message);
  };

  registerNewTransmission = (data: string | Buffer) => {
    const transmission = new Transmission(this.connectedState, this);
    const uid = transmission.register(data);
    this.transmissionMap.set(uid, transmission);
    transmission.transmit();
  };

  unregisterTransmission = (uid: DataMessage["uid"]) => {
    this.transmissionMap.delete(uid);
  };
}

class Transmission {
  constructor(
    private connectedState: ConnectedState,
    private dataSender: DataSender
  ) {}

  private constructed: ReturnType<typeof MessageBuffer.construct> | undefined;
  private dataAckMap = new Map<DataAckMessage["ack"], DataAckMessage>();
  private greatestSequentialAckNum = -1;
  private resendTimer: NodeJS.Timeout | undefined;

  resetResendTimer = () => {
    if (this.resendTimer) clearTimeout(this.resendTimer);
    this.resendTimer = setTimeout(this.resend, 100);
  };

  private isTransmissionFin = false;

  isResending = false;
  resend = async () => {
    if (this.isResending) return;
    this.isResending = true;

    const {
      session: { transceiverIPv4, address, port },
    } = this.connectedState;

    for (
      let i = this.greatestSequentialAckNum + 1;
      i < this.constructed!.buffers.length;
      i++
    ) {
      const hasAck = this.dataAckMap.get(i);

      if (!hasAck) {
        transceiverIPv4.__send(address, port, this.constructed!.buffers[i]);
      }
      await sleep(1);
    }
    this.isResending = false;
    if (!this.isTransmissionFin) this.resetResendTimer();
  };

  register = (data: string | Buffer) => {
    const constructed = MessageBuffer.construct({
      type: MessageType.DATA,
      payload: typeof data == "string" ? Buffer.from(data) : data,
    });
    this.constructed = constructed;
    return constructed.uid;
  };

  transmit = () => {
    const { session } = this.connectedState;
    const { transceiverIPv4, address, port } = session;
    for (const buffer of this.constructed!.buffers)
      transceiverIPv4.__send(address, port, buffer);
    this.resetResendTimer();
  };

  collectDataAck = (message: DataAckMessage) => {
    this.dataAckMap.set(message.ack, message);
    if (message.ack == this.greatestSequentialAckNum + 1)
      this.greatestSequentialAckNum = message.ack;

    if (this.greatestSequentialAckNum + 1 == this.constructed?.buffers.length) {
      if (this.resendTimer) {
        this.isTransmissionFin = true;
        clearTimeout(this.resendTimer);
        this.dataSender.unregisterTransmission(this.constructed.uid);
      }
    } else this.resetResendTimer();
  };
}
