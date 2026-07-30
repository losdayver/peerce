import { randomBytes } from "node:crypto";
import { PeerLossyProxy } from "../testUtils";
import { once } from "../../utils/promiseUtils";
import { SimplePeer } from "../../simple/simplePeer/simplePeer";
import { SimpleRelay } from "../../simple/simpleRelay";

const localhost = "127.0.0.1";
const relayAddr = { address: localhost, port: 50656 };
const peer1Addr = { address: localhost, port: 50657 };
const peer2Addr = { address: localhost, port: 50658 };
const proxy1Addr = { address: localhost, port: 50659 };
const proxy2Addr = { address: localhost, port: 50660 };

// todo fix proxies

const proxy1 = new PeerLossyProxy(proxy1Addr.address, proxy1Addr.port);
const proxy2 = new PeerLossyProxy(proxy2Addr.address, proxy2Addr.port);

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

const relay = new SimpleRelay(relayAddr.address, relayAddr.port, {
  peer1: proxy1,
  peer2: proxy2,
});

test("Connection via relay", async () => {
  const promise = await Promise.all([
    peer1.requestSessionViaRelayAsync(),
    peer2.requestSessionViaRelayAsync(),
  ]);
  expect(promise).toBeTruthy();
});

test("Lossy data transmission", async () => {
  const massivePayload = randomBytes(100000).toString();

  const testData = { fileName: "testPayload", payload: massivePayload };
  const receivedFileNames: string[] = [];
  const receivedPercentages: number[] = [];
  const onPercentageChange = (fileName: string, percentage: number) => {
    receivedPercentages.push(percentage);
  };
  const dataPromise = once<{ buffer: Buffer; fileName: string }>(
    peer2,
    "onFullMessage"
  );
  peer2.once("onIncomingTransmissionStart", (fileName) => {
    receivedFileNames.push(fileName);
  });
  peer2.on("onIncomingTransmissionPercentageChange", onPercentageChange);
  proxy1.lossPercentage = 0.5;
  peer1.createOutgoingTransmission(testData);

  const data = await dataPromise;

  peer2.off("onIncomingTransmissionPercentageChange", onPercentageChange);

  expect(
    data.buffer.toString() == testData.payload &&
      data.fileName == testData.fileName
  ).toBeTruthy();
  expect(receivedFileNames).toEqual([testData.fileName]);
  expect(receivedPercentages.at(-1)).toBe(1);

  proxy1.lossPercentage = 0;
}, 10000);
