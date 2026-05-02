import { chunkBuffer } from "@src/utils/bufferUtils";
import { randomBytes } from "node:crypto";

export const enum MessageType {
  HELLO = 0,
  HELLO_ACK = 1,
  DATA = 2,
  DATA_ACK = 3,
  KEEP_ALIVE = 4,
  FIN = 5,
}

const TYPE_SIZE = 1;
const UID_SIZE = 4;
const SEQ_SIZE = 4;
const TOTAL_SIZE = 4;
const ACK_SIZE = 4;
const SUM_SIZE = 2;
const HEADER_SIZE =
  TYPE_SIZE + UID_SIZE + SEQ_SIZE + TOTAL_SIZE + ACK_SIZE + SUM_SIZE;

export interface Message {
  type: MessageType;
  uid?: number;
  seq?: number;
  ack?: number;
  checksum?: number;
  payload?: Buffer;
}

export class MessageBuffer {
  static maxPayloadSize = 512;

  static decode(buffer: Buffer): Message {
    const payloadSize = buffer.length - HEADER_SIZE;

    const message: { [K in keyof Message]: Message[K] | null } = {
      type: null,
      uid: null,
      seq: null,
      ack: null,
      checksum: null,
      payload: payloadSize >= 0 ? Buffer.alloc(payloadSize) : null,
    };

    message.type = buffer.readUIntBE(0, TYPE_SIZE);
    message.uid = buffer.readUIntBE(TYPE_SIZE, UID_SIZE);
    message.seq = buffer.readUIntBE(UID_SIZE, SEQ_SIZE);
    message.ack = buffer.readUIntBE(SEQ_SIZE, ACK_SIZE);
    message.ack = buffer.readUIntBE(ACK_SIZE, TOTAL_SIZE);
    message.checksum = buffer.readUIntBE(TOTAL_SIZE, SUM_SIZE);
    message.payload && buffer.copy(message.payload as Buffer, 0, HEADER_SIZE);

    return message as Message;
  }

  static construct(message: Pick<Message, "type" | "payload">) {
    const { type, payload } = message;

    const messages: Buffer[] = [];
    const uid = randomBytes(UID_SIZE).readUintBE(0, UID_SIZE);
    let seq = 0;

    const chunks = payload
      ? chunkBuffer(payload, MessageBuffer.maxPayloadSize)
      : [Buffer.alloc(0)];

    const total = chunks.length;

    for (const chunk of chunks) {
      const buffer = Buffer.alloc(HEADER_SIZE + chunk.length);

      buffer.writeUIntBE(type, 0, TYPE_SIZE);
      buffer.writeUIntBE(uid, TYPE_SIZE, UID_SIZE);
      buffer.writeUIntBE(seq, UID_SIZE, SEQ_SIZE);
      buffer.writeUIntBE(0, SEQ_SIZE, ACK_SIZE); // todo ack
      buffer.writeUIntBE(
        total,
        TYPE_SIZE + UID_SIZE + SEQ_SIZE + ACK_SIZE,
        TOTAL_SIZE
      );
      buffer.writeUIntBE(
        0,
        TYPE_SIZE + UID_SIZE + SEQ_SIZE + ACK_SIZE + TOTAL_SIZE,
        SUM_SIZE
      ); // checksum

      if (chunk.length > 0) chunk.copy(buffer, HEADER_SIZE);

      messages.push(buffer);
      seq += 1;
    }

    return messages;
  }
}
