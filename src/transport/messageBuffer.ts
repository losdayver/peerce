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
const ACK_SIZE = 4;
const SUM_SIZE = 2;
const HEADER_SIZE = TYPE_SIZE + UID_SIZE + SEQ_SIZE + ACK_SIZE + SUM_SIZE;

export interface Message {
  type: MessageType;
  uid: number;
  seq: number;
  ack: number;
  checksum: number;
  payload?: Buffer;
}

export class MessageBuffer {
  static maxPayloadSize = 512;

  static decode() {}
  static construct(message: Pick<Message, "type" | "payload">) {
    const { type, payload = Buffer.alloc(0) } = message;

    const messages: Buffer[] = [];
    const uid = randomBytes(UID_SIZE).readUintBE(0, UID_SIZE);
    let seq = 0;

    for (const chunk of chunkBuffer(payload, MessageBuffer.maxPayloadSize)) {
      const buffer = Buffer.alloc(HEADER_SIZE + (payload?.length ?? 0));

      buffer.writeUIntBE(type, 0, TYPE_SIZE);
      buffer.writeUIntBE(uid, TYPE_SIZE, UID_SIZE);
      buffer.writeUIntBE(seq, UID_SIZE, SEQ_SIZE);
      buffer.writeUIntBE(0, SEQ_SIZE, ACK_SIZE); // todo implement
      buffer.writeUIntBE(0, ACK_SIZE, SUM_SIZE); // todo implement
      chunk.copy(buffer, HEADER_SIZE);

      // todo checksum

      messages.push(buffer);

      seq += 1;
    }

    return messages;
  }
}
