import { MessageBuffer, MessageType } from "./messageBuffer";
import { TransceiverIPv4 } from "./transceiver";

export class Session {
  constructor(
    private transceiverIPv4: TransceiverIPv4,
    public address: string,
    public port: number
  ) {}

  connect() {
    // todo retries
    this.transceiverIPv4.__send(
      this.address,
      this.port,
      MessageBuffer.construct({
        type: MessageType.DATA,
        payload: Buffer.from("connect to me!"),
      })
    );
  }

  send(msg: any) {
    // todo serialization logic and ack await
    this.transceiverIPv4.__send(
      this.address,
      this.port,
      MessageBuffer.construct({
        type: MessageType.DATA,
        payload: Buffer.from(msg),
      })
    );
  }

  disconnect() {
    // todo retries
    this.transceiverIPv4.__send(this.address, this.port, "disconnect me!");
  }

  handleMessage(buffer: Buffer) {
    console.info(`[${this.address}:${this.port}]`, buffer.toString("utf8"));
  }
}
