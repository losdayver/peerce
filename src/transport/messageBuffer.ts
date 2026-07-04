import { chunkBuffer, crc32 } from "@src/utils/bufferUtils";
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
const SUM_SIZE = 4;
const HEADER_SIZE =
  TYPE_SIZE + UID_SIZE + SEQ_SIZE + TOTAL_SIZE + ACK_SIZE + SUM_SIZE;

export interface Message {
  type: MessageType;
  uid?: number;
  seq?: number;
  total?: number;
  ack?: number;
  checksum?: number;
  payload?: Buffer;
}

export interface DataMessage extends Message {
  type: MessageType;
  uid: number;
  seq: number;
  total: number;
  ack: number;
  checksum: number;
  payload: Buffer;
}

export class MessageBuffer {
  static maxPayloadSize = 500;

  static decode(buffer: Buffer): Message | null {
    const payloadSize = buffer.length - HEADER_SIZE;

    const checksum = buffer.readUIntBE(HEADER_SIZE - SUM_SIZE, SUM_SIZE);
    buffer.writeUIntBE(0, HEADER_SIZE - SUM_SIZE, SUM_SIZE);
    const initialChecksum = crc32(buffer);

    if (checksum != initialChecksum) return null;

    const message: { [K in keyof Message]: Message[K] | null } = {
      type: null,
      uid: null,
      seq: null,
      total: null,
      ack: null,
      checksum: null,
      payload: payloadSize >= 0 ? Buffer.alloc(payloadSize) : null,
    };

    let offset = 0;

    message.type = buffer.readUIntBE(offset, TYPE_SIZE);
    offset += TYPE_SIZE;
    message.uid = buffer.readUIntBE(offset, UID_SIZE);
    offset += UID_SIZE;
    message.seq = buffer.readUIntBE(offset, SEQ_SIZE);
    offset += SEQ_SIZE;
    message.ack = buffer.readUIntBE(offset, ACK_SIZE);
    offset += ACK_SIZE;
    message.total = buffer.readUIntBE(offset, TOTAL_SIZE);
    offset += TOTAL_SIZE;
    message.checksum = checksum;
    offset += SUM_SIZE;

    if (message.payload) {
      buffer.copy(message.payload, 0, offset);
    }

    return message as Message;
  }

  static construct(message: Message) {
    const { type, payload, ack } = message;

    const messages: Buffer[] = [];
    const uid = randomBytes(UID_SIZE).readUIntBE(0, UID_SIZE);

    let seq = 0;

    const chunks = payload
      ? chunkBuffer(payload, MessageBuffer.maxPayloadSize)
      : [Buffer.alloc(0)];

    const total = chunks.length;

    for (const chunk of chunks) {
      const buffer = Buffer.alloc(HEADER_SIZE + chunk.length);

      let offset = 0;

      buffer.writeUIntBE(type, offset, TYPE_SIZE);
      offset += TYPE_SIZE;
      buffer.writeUIntBE(uid, offset, UID_SIZE);
      offset += UID_SIZE;
      buffer.writeUIntBE(seq, offset, SEQ_SIZE);
      offset += SEQ_SIZE;
      buffer.writeUIntBE(ack ?? 0, offset, ACK_SIZE);
      offset += ACK_SIZE;
      buffer.writeUIntBE(total, offset, TOTAL_SIZE);
      const sumOffset = (offset += TOTAL_SIZE);
      offset += SUM_SIZE;

      if (chunk.length > 0) {
        chunk.copy(buffer, offset);
      }

      const checkSum = crc32(buffer);
      buffer.writeUIntBE(checkSum, sumOffset, SUM_SIZE);

      messages.push(buffer);
      seq += 1;
    }

    return messages;
  }
}
