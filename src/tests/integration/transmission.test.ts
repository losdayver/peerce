import { randomBytes } from "node:crypto";
import { UDPLossyProxy } from "@src/tests/testUtils";
import { once } from "@src/utils/promiseUtils";
import { SimplePeer } from "@src/simple/simplePeer/simplePeer";
import { SimpleRelay } from "@src/simple/simpleRelay";
import { register } from "module-alias/register";
register;

const relayAddr = { address: "127.0.0.1", port: 5656 };
const peer1Addr = { address: "127.0.0.1", port: 5657 };
const peer2Addr = { address: "127.0.0.1", port: 5658 };
const proxy1Addr = { address: "127.0.0.1", port: 5659 };
const proxy2Addr = { address: "127.0.0.1", port: 5660 };

// todo fix proxies

const proxy1 = new UDPLossyProxy(
  proxy1Addr.address,
  proxy1Addr.port,
  peer1Addr,
  peer2Addr,
  relayAddr
);

const proxy2 = new UDPLossyProxy(
  proxy2Addr.address,
  proxy2Addr.port,
  peer2Addr,
  peer1Addr,
  relayAddr
);

const peer1 = new SimplePeer({
  selfTag: "peer1",
  distantTag: "peer2",
  relayAddr: relayAddr.address,
  relayPort: relayAddr.port,
  selfAddr: peer1Addr.address,
  selfPort: peer1Addr.port,
}); 

const peer2 = new SimplePeer({
  selfTag: "peer2",
  distantTag: "peer1",
  relayAddr: relayAddr.address,
  relayPort: relayAddr.port,
  selfAddr: peer2Addr.address,
  selfPort: peer2Addr.port,
});

const relay = new SimpleRelay(relayAddr.address, relayAddr.port);

beforeAll(() => {
  proxy1.start();
  proxy2.start();
});

test("Connection via relay", async () => {
  const promise = await Promise.all([
    peer1.requestSessionViaRelay(),
    peer2.requestSessionViaRelay(),
  ]);
  proxy1.wasConnectedViaRelay();
  proxy2.wasConnectedViaRelay();
  expect(promise).toBeTruthy();
});

test("Data transmission", async () => {
  const massivePayload = randomBytes(100000).toString();

  const testData = { fileName: "testPayload", payload: massivePayload };
  const dataPromise = once<{ buffer: Buffer; fileName: string }>(
    peer2.eventEmitter,
    "onFullMessage"
  );
  peer1.sendData(testData);

  const data = await dataPromise;

  expect(
    data.buffer.toString() == testData.payload &&
      data.fileName == testData.fileName
  ).toBeTruthy();
});
