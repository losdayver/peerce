import { SimplePeer } from "../../simple/simplePeer/simplePeer";
import { SimpleRelay } from "../../simple/simpleRelay";

const LOCALHOST = "127.0.0.1";
const RELAY_PORT = 46_300;
const PEER_A_PORT = 46_301;
const PEER_B_PORT = 46_302;
const RECEIVE_TIMEOUT_MS = 10_000;

interface TestFile {
  readonly fileName: string;
  readonly payload: Buffer;
}

const filesFromA: TestFile[] = [
  {
    fileName: "from-a-1.bin",
    payload: Buffer.alloc(24_000, 0xa1),
  },
  {
    fileName: "from-a-2.bin",
    payload: Buffer.alloc(32_000, 0xa2),
  },
];

const filesFromB: TestFile[] = [
  {
    fileName: "from-b-1.bin",
    payload: Buffer.alloc(28_000, 0xb1),
  },
  {
    fileName: "from-b-2.bin",
    payload: Buffer.alloc(36_000, 0xb2),
  },
];

const receiveFiles = (
  peer: SimplePeer,
  expectedCount: number
): Promise<Map<string, Buffer>> =>
  new Promise((resolve, reject) => {
    const received = new Map<string, Buffer>();
    const cleanup = () => {
      clearTimeout(timeout);
      peer.off("onFullMessage", onFullMessage);
    };
    const onFullMessage = ({
      fileName,
      buffer,
    }: {
      fileName: string;
      buffer: Buffer;
    }) => {
      received.set(fileName, buffer);
      if (received.size !== expectedCount) return;

      cleanup();
      resolve(received);
    };
    const timeout = setTimeout(() => {
      cleanup();
      reject(
        new Error(
          `Timed out after receiving ${received.size}/${expectedCount} files`
        )
      );
    }, RECEIVE_TIMEOUT_MS);

    peer.on("onFullMessage", onFullMessage);
  });

const expectFiles = (
  received: Map<string, Buffer>,
  expected: TestFile[]
) => {
  expect(received.size).toBe(expected.length);
  for (const file of expected)
    expect(received.get(file.fileName)?.equals(file.payload)).toBe(true);
};

test("two peers simultaneously transfer multiple files to each other", async () => {
  const relay = new SimpleRelay(LOCALHOST, RELAY_PORT);
  const peerA = new SimplePeer({
    selfTag: "bidirectional-peer-a",
    distantTag: "bidirectional-peer-b",
    relayAddr: LOCALHOST,
    relayPort: RELAY_PORT,
    selfAddr: LOCALHOST,
    selfPort: PEER_A_PORT,
  });
  const peerB = new SimplePeer({
    selfTag: "bidirectional-peer-b",
    distantTag: "bidirectional-peer-a",
    relayAddr: LOCALHOST,
    relayPort: RELAY_PORT,
    selfAddr: LOCALHOST,
    selfPort: PEER_B_PORT,
  });
  const transportErrors: Error[] = [];

  peerA.transceiver.on("onError", (error) => transportErrors.push(error));
  peerB.transceiver.on("onError", (error) => transportErrors.push(error));

  try {
    await relay.ready();
    await Promise.all([
      peerA.requestSessionViaRelayAsync(),
      peerB.requestSessionViaRelayAsync(),
    ]);

    const receivedByA = receiveFiles(peerA, filesFromB.length);
    const receivedByB = receiveFiles(peerB, filesFromA.length);

    for (const file of filesFromA)
      peerA.createOutgoingTransmission(file);
    for (const file of filesFromB)
      peerB.createOutgoingTransmission(file);

    const [peerAFiles, peerBFiles] = await Promise.all([
      receivedByA,
      receivedByB,
    ]);

    expectFiles(peerAFiles, filesFromB);
    expectFiles(peerBFiles, filesFromA);
    expect(transportErrors).toEqual([]);
  } finally {
    const peerResults = await Promise.allSettled([
      peerA.close(),
      peerB.close(),
    ]);
    const relayResults = await Promise.allSettled([relay.close()]);
    const cleanupError = [...peerResults, ...relayResults].find(
      (result) => result.status === "rejected"
    );

    if (cleanupError?.status === "rejected") throw cleanupError.reason;
  }
}, 15_000);
