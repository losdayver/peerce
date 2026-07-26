import { SessionStateEventAction, SessionSMTypes } from "../sessionMeta";
import { Session } from "../session";
import {
  DataAckMessage,
  DataMessage,
  Message,
  MessageBuffer,
  MessageType,
} from "../../messageBuffer";
import { sleep } from "../../../utils/promiseUtils";
import { StateShifterBehaviorBase } from "state-shifter";

const MAX_MESSAGE_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_IN_FLIGHT_MESSAGES = 64;
const INBOUND_MESSAGE_TTL_MS = 30_000;
const COLLECTOR_CLEANUP_INTERVAL_MS = 5_000;
const MAX_MESSAGE_PARTS = Math.ceil(
  MAX_MESSAGE_SIZE_BYTES / MessageBuffer.maxPayloadSize
);
const UINT32_MAX = 0xffff_ffff;

const isUInt32 = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isInteger(value) &&
  value >= 0 &&
  value <= UINT32_MAX;

interface InboundMessage {
  readonly total: number;
  readonly parts: Map<number, Buffer>;
  receivedBytes: number;
  lastActivityAt: number;
}

export class ConnectedBehavior extends StateShifterBehaviorBase<
  SessionSMTypes["Config"]
> {
  constructor(public session: Session) {
    super();
  }

  private dataSender = new DataSender(this);
  private keepAliveNumSeconds = 10;
  private keepAliveInterval: NodeJS.Timeout | undefined;
  private collectorCleanupInterval: NodeJS.Timeout | undefined;

  private readonly messageCollector = new Map<
    DataMessage["uid"],
    InboundMessage
  >();

  private isValidDataMessage = (message: Message): message is DataMessage => {
    return (
      message.type === MessageType.DATA &&
      isUInt32(message.uid) &&
      isUInt32(message.seq) &&
      isUInt32(message.total) &&
      message.total > 0 &&
      message.total <= MAX_MESSAGE_PARTS &&
      message.seq < message.total &&
      Buffer.isBuffer(message.payload) &&
      message.payload.length <= MessageBuffer.maxPayloadSize
    );
  };

  private removeExpiredMessages = () => {
    const now = Date.now();
    for (const [uid, message] of this.messageCollector) {
      if (now - message.lastActivityAt >= INBOUND_MESSAGE_TTL_MS)
        this.messageCollector.delete(uid);
    }
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
    const now = Date.now();
    let collectedMessage = this.messageCollector.get(message.uid);

    if (!collectedMessage) {
      if (this.messageCollector.size >= MAX_IN_FLIGHT_MESSAGES) return;

      collectedMessage = {
        total: message.total,
        parts: new Map(),
        receivedBytes: 0,
        lastActivityAt: now,
      };
      this.messageCollector.set(message.uid, collectedMessage);
    } else if (collectedMessage.total !== message.total) {
      return;
    }

    collectedMessage.lastActivityAt = now;

    if (collectedMessage.parts.has(message.seq)) {
      this.sendAck(message);
      return;
    }

    const receivedBytes =
      collectedMessage.receivedBytes + message.payload.length;
    if (receivedBytes > MAX_MESSAGE_SIZE_BYTES) {
      this.messageCollector.delete(message.uid);
      return;
    }

    collectedMessage.parts.set(message.seq, message.payload);
    collectedMessage.receivedBytes = receivedBytes;
    this.sendAck(message);

    if (collectedMessage.parts.size !== collectedMessage.total) return;

    const buffers: Buffer[] = [];
    for (let sequence = 0; sequence < collectedMessage.total; sequence++) {
      const part = collectedMessage.parts.get(sequence);
      if (!part) return;
      buffers.push(part);
    }

    this.messageCollector.delete(message.uid);
    this.session.emit(
      "receive",
      Buffer.concat(buffers, collectedMessage.receivedBytes)
    );
  };

  onEnter = () => {
    this.session.emit("connected");
    clearInterval(this.keepAliveInterval);
    this.keepAliveInterval = setInterval(() => {
      this.session.sendOne({ type: MessageType.KEEP_ALIVE });
    }, this.keepAliveNumSeconds * 1000);
    clearInterval(this.collectorCleanupInterval);
    this.collectorCleanupInterval = setInterval(
      this.removeExpiredMessages,
      COLLECTOR_CLEANUP_INTERVAL_MS
    );
  };

  eventHandler: SessionSMTypes["BehaviorEventHandler"] = ({
    action,
    payload,
  }) => {
    if (action == SessionStateEventAction.MESSAGE) {
      switch (payload.type) {
        case MessageType.DATA:
          if (this.isValidDataMessage(payload))
            this.collectDataMessagePart(payload);
          break;
        case MessageType.DATA_ACK: {
          this.dataSender.collectDataAck(payload as DataAckMessage);
          break;
        }
        case MessageType.FIN:
          this.session.close();
      }
    } else if (action == SessionStateEventAction.SEND_DATA) {
      this.dataSender.registerNewTransmission(payload);
    }
  };

  onExit = () => {
    clearInterval(this.keepAliveInterval);
    clearInterval(this.collectorCleanupInterval);
    this.messageCollector.clear();
    this.dataSender.dispose();
  };
}

class DataSender {
  constructor(private connectedState: ConnectedBehavior) {}

  private transmissionMap = new Map<DataMessage["uid"], Transmission>();
  private isDisposed = false;

  collectDataAck = (message: DataAckMessage) => {
    if (this.isDisposed) return;
    const transmission = this.transmissionMap.get(message.uid);
    transmission?.collectDataAck(message);
  };

  registerNewTransmission = (data: string | Buffer) => {
    if (this.isDisposed) return;
    const transmission = new Transmission(this.connectedState, this);
    const uid = transmission.register(data);
    this.transmissionMap.set(uid, transmission);
    transmission.transmit();
  };

  unregisterTransmission = (uid: DataMessage["uid"]) => {
    this.transmissionMap.delete(uid);
  };

  dispose = () => {
    if (this.isDisposed) return;
    this.isDisposed = true;

    for (const transmission of this.transmissionMap.values())
      transmission.cancel();
    this.transmissionMap.clear();
  };
}

class Transmission {
  constructor(
    private connectedState: ConnectedBehavior,
    private dataSender: DataSender
  ) {}

  private constructed: ReturnType<typeof MessageBuffer.construct> | undefined;
  private dataAckMap = new Map<DataAckMessage["ack"], DataAckMessage>();
  private greatestSequentialAckNum = -1;
  private resendTimer: NodeJS.Timeout | undefined;

  resetResendTimer = () => {
    if (this.isStopped) return;
    if (this.resendTimer) clearTimeout(this.resendTimer);
    this.resendTimer = setTimeout(() => {
      this.resendTimer = undefined;
      void this.resend();
    }, 100);
  };

  private isTransmissionFin = false;
  private isCancelled = false;

  private get isStopped() {
    return this.isTransmissionFin || this.isCancelled;
  }

  isResending = false;
  resend = async () => {
    if (this.isResending || this.isStopped) return;
    this.isResending = true;

    try {
      const {
        session: { transceiverIPv4, address, port },
      } = this.connectedState;

      for (
        let i = this.greatestSequentialAckNum + 1;
        !this.isStopped &&
        i < Math.min(this.greatestSequentialAckNum + 20, this.constructed!.total);
        i++
      ) {
        const hasAck = this.dataAckMap.get(i);

        if (!hasAck) {
          transceiverIPv4.__send(address, port, this.constructed!.buffers[i]);
        }
        await sleep(1);
      }
    } finally {
      this.isResending = false;
      if (!this.isStopped) this.resetResendTimer();
    }
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
    if (this.isStopped) return;
    const { session } = this.connectedState;
    const { transceiverIPv4, address, port } = session;
    for (const buffer of this.constructed!.buffers)
      transceiverIPv4.__send(address, port, buffer);
    this.resetResendTimer();
  };

  collectDataAck = (message: DataAckMessage) => {
    if (this.isStopped) return;
    this.dataAckMap.set(message.ack, message);
    if (message.ack == this.greatestSequentialAckNum + 1)
      this.greatestSequentialAckNum = message.ack;

    if (this.greatestSequentialAckNum + 1 == this.constructed?.buffers.length) {
      this.isTransmissionFin = true;
      if (this.resendTimer) clearTimeout(this.resendTimer);
      this.resendTimer = undefined;
      this.dataSender.unregisterTransmission(this.constructed.uid);
    } else this.resetResendTimer();
  };

  cancel = () => {
    if (this.isStopped) return;
    this.isCancelled = true;
    if (this.resendTimer) clearTimeout(this.resendTimer);
    this.resendTimer = undefined;
  };
}
