import { once } from "node:events";
import { MessageBuffer } from "../transport/messageBuffer";
import { TransceiverIPv4 } from "../transport/transceiver";

test("rejects a datagram shorter than the protocol header", () => {
  expect(MessageBuffer.decode(Buffer.alloc(0))).toBeNull();
});

test("waits for the socket to bind and closes it idempotently", async () => {
  const transceiver = new TransceiverIPv4();
  const closedEvent = once(transceiver, "onClosed");

  await transceiver.listen();

  const firstClose = transceiver.close();
  const secondClose = transceiver.close();

  expect(secondClose).toBe(firstClose);
  await firstClose;
  await closedEvent;
});

test("rejects a duplicate session for the same endpoint", async () => {
  const transceiver = new TransceiverIPv4();
  await transceiver.listen();

  transceiver.connect("127.0.0.1", 9);
  expect(() => transceiver.connect("127.0.0.1", 9)).toThrow(
    "Session already exists"
  );

  await transceiver.close();
});
