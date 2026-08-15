import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { randomBytes } from "node:crypto";
import { SimplePeer } from "../../simple/simplePeer/simplePeer";
import { SimpleRelay } from "../../simple/simpleRelay";

const LOCALHOST = "127.0.0.1";
const ENCRYPTED_RELAY_PORT = 46_400;
const ENCRYPTED_PEER_A_PORT = 46_401;
const ENCRYPTED_PEER_B_PORT = 46_402;
const MISMATCH_RELAY_PORT = 46_410;
const MISMATCH_ENCRYPTED_PEER_PORT = 46_411;
const MISMATCH_PLAIN_PEER_PORT = 46_412;
const CLI_MISMATCH_RELAY_PORT = 46_420;
const EVENT_TIMEOUT_MS = 10_000;

const execFileAsync = promisify(execFile);
const keygenPath = resolve(__dirname, "../../simple/bin/keygen.js");
const exchangePath = resolve(__dirname, "../../simple/bin/peer.js");

let vaultRoot: string;
let peerAVault: string;
let peerBVault: string;

const withTimeout = <T>(promise: Promise<T>, description: string): Promise<T> =>
  new Promise<T>((resolvePromise, rejectPromise) => {
    const timeout = setTimeout(
      () => rejectPromise(new Error(`Timed out waiting for ${description}`)),
      EVENT_TIMEOUT_MS
    );

    void promise.then(
      (value) => {
        clearTimeout(timeout);
        resolvePromise(value);
      },
      (cause: unknown) => {
        clearTimeout(timeout);
        rejectPromise(cause);
      }
    );
  });

const waitForFullMessage = (
  peer: SimplePeer,
  expectedFileName: string
): Promise<Buffer> =>
  withTimeout(
    new Promise<Buffer>((resolvePromise) => {
      const onFullMessage = ({
        fileName,
        buffer,
      }: {
        fileName: string;
        buffer: Buffer;
      }) => {
        if (fileName !== expectedFileName) return;

        peer.off("onFullMessage", onFullMessage);
        resolvePromise(buffer);
      };

      peer.on("onFullMessage", onFullMessage);
    }),
    `file ${expectedFileName}`
  );

const closePeersAndRelay = async (
  relay: SimpleRelay,
  ...peers: SimplePeer[]
) => {
  const results = await Promise.allSettled([
    ...peers.map((peer) => peer.close()),
    relay.close(),
  ]);
  const errors = results
    .filter(
      (result): result is PromiseRejectedResult => result.status === "rejected"
    )
    .map((result) => result.reason);

  if (errors.length > 0)
    throw new AggregateError(errors, "Failed to close encryption fixture");
};

beforeAll(async () => {
  vaultRoot = await mkdtemp(join(tmpdir(), "peerce-encryption-test-"));
  peerAVault = join(vaultRoot, "peer-a");
  peerBVault = join(vaultRoot, "peer-b");

  await Promise.all([
    execFileAsync(process.execPath, [keygenPath, "--dir", peerAVault]),
    execFileAsync(process.execPath, [keygenPath, "--dir", peerBVault]),
  ]);
});

afterAll(async () => {
  if (vaultRoot) await rm(vaultRoot, { recursive: true, force: true });
});

test("two encrypted peers exchange messages using generated key pairs", async () => {
  const relay = new SimpleRelay(LOCALHOST, ENCRYPTED_RELAY_PORT);
  const peerA = new SimplePeer({
    selfTag: "encrypted-peer-a",
    distantTag: "encrypted-peer-b",
    relayAddr: LOCALHOST,
    relayPort: ENCRYPTED_RELAY_PORT,
    selfAddr: LOCALHOST,
    selfPort: ENCRYPTED_PEER_A_PORT,
    encrypt: true,
    vaultDir: peerAVault,
  });
  const peerB = new SimplePeer({
    selfTag: "encrypted-peer-b",
    distantTag: "encrypted-peer-a",
    relayAddr: LOCALHOST,
    relayPort: ENCRYPTED_RELAY_PORT,
    selfAddr: LOCALHOST,
    selfPort: ENCRYPTED_PEER_B_PORT,
    encrypt: true,
    vaultDir: peerBVault,
  });
  const transportErrors: Error[] = [];
  peerA.transceiver.on("onError", (error) => transportErrors.push(error));
  peerB.transceiver.on("onError", (error) => transportErrors.push(error));

  const messageFromA = {
    fileName: "encrypted-from-a.bin",
    payload: randomBytes(16_000),
  };
  const messageFromB = {
    fileName: "encrypted-from-b.bin",
    payload: randomBytes(20_000),
  };

  try {
    await relay.ready();
    await withTimeout(
      Promise.all([
        peerA.requestSessionViaRelayAsync(),
        peerB.requestSessionViaRelayAsync(),
      ]),
      "encrypted peer connection"
    );

    const receivedByA = waitForFullMessage(peerA, messageFromB.fileName);
    const receivedByB = waitForFullMessage(peerB, messageFromA.fileName);

    peerA.createOutgoingTransmission(messageFromA);
    peerB.createOutgoingTransmission(messageFromB);

    const [payloadReceivedByA, payloadReceivedByB] = await Promise.all([
      receivedByA,
      receivedByB,
    ]);

    expect(payloadReceivedByA.equals(messageFromB.payload)).toBe(true);
    expect(payloadReceivedByB.equals(messageFromA.payload)).toBe(true);
    expect(transportErrors).toEqual([]);
  } finally {
    await closePeersAndRelay(relay, peerA, peerB);
  }
}, 20_000);

test("peers report an encryption negotiation mismatch", async () => {
  const relay = new SimpleRelay(LOCALHOST, MISMATCH_RELAY_PORT);
  const encryptedPeer = new SimplePeer({
    selfTag: "mismatch-encrypted-peer",
    distantTag: "mismatch-plain-peer",
    relayAddr: LOCALHOST,
    relayPort: MISMATCH_RELAY_PORT,
    selfAddr: LOCALHOST,
    selfPort: MISMATCH_ENCRYPTED_PEER_PORT,
    encrypt: true,
    vaultDir: peerAVault,
  });
  const plainPeer = new SimplePeer({
    selfTag: "mismatch-plain-peer",
    distantTag: "mismatch-encrypted-peer",
    relayAddr: LOCALHOST,
    relayPort: MISMATCH_RELAY_PORT,
    selfAddr: LOCALHOST,
    selfPort: MISMATCH_PLAIN_PEER_PORT,
  });
  const encryptedConnected = jest.fn();
  const plainConnected = jest.fn();
  const encryptedNegotiationFailed = jest.fn();
  const plainNegotiationFailed = jest.fn();
  const encryptedConnect = jest.spyOn(encryptedPeer.transceiver, "connect");
  const plainConnect = jest.spyOn(plainPeer.transceiver, "connect");
  encryptedPeer.on("onConnectedToPeer", encryptedConnected);
  plainPeer.on("onConnectedToPeer", plainConnected);
  encryptedPeer.on("onEncryptionNegotiationFailed", encryptedNegotiationFailed);
  plainPeer.on("onEncryptionNegotiationFailed", plainNegotiationFailed);

  try {
    await relay.ready();
    const results = await withTimeout(
      Promise.allSettled([
        encryptedPeer.requestSessionViaRelayAsync(),
        plainPeer.requestSessionViaRelayAsync(),
      ]),
      "encryption mismatch rejection"
    );

    expect(results.map((result) => result.status)).toEqual([
      "fulfilled",
      "fulfilled",
    ]);
    for (const result of results) {
      if (result.status === "fulfilled") expect(result.value).toBeUndefined();
    }
    expect(encryptedConnected).not.toHaveBeenCalled();
    expect(plainConnected).not.toHaveBeenCalled();
    expect(encryptedNegotiationFailed).toHaveBeenCalledTimes(1);
    expect(plainNegotiationFailed).toHaveBeenCalledTimes(1);
    expect(encryptedNegotiationFailed).toHaveBeenCalledWith(
      expect.objectContaining({ negotiationFailure: "ENCRYPTION_MISMATCH" })
    );
    expect(plainNegotiationFailed).toHaveBeenCalledWith(
      expect.objectContaining({ negotiationFailure: "ENCRYPTION_MISMATCH" })
    );
    expect(encryptedConnect).toHaveBeenCalledTimes(1);
    expect(encryptedConnect).toHaveBeenCalledWith(
      LOCALHOST,
      MISMATCH_RELAY_PORT
    );
    expect(plainConnect).toHaveBeenCalledTimes(1);
    expect(plainConnect).toHaveBeenCalledWith(LOCALHOST, MISMATCH_RELAY_PORT);
    expect(encryptedPeer.stateMachine.getCurrentState()).toBe("closing");
    expect(plainPeer.stateMachine.getCurrentState()).toBe("closing");
  } finally {
    await closePeersAndRelay(relay, encryptedPeer, plainPeer);
  }
}, 20_000);

test("CLI peers report an encryption mismatch without attempting to send", async () => {
  const relay = new SimpleRelay(LOCALHOST, CLI_MISMATCH_RELAY_PORT);

  try {
    await relay.ready();
    const [encryptedResult, plainResult] = await Promise.all([
      execFileAsync(
        process.execPath,
        [
          exchangePath,
          "--relayAddr",
          LOCALHOST,
          "--relayPort",
          String(CLI_MISMATCH_RELAY_PORT),
          "--selfTag",
          "cli-encrypted-peer",
          "--distantTag",
          "cli-plain-peer",
          "--payload",
          "must-not-be-sent",
          "--encrypt",
          "--vaultDir",
          peerAVault,
        ],
        { timeout: EVENT_TIMEOUT_MS }
      ),
      execFileAsync(
        process.execPath,
        [
          exchangePath,
          "--relayAddr",
          LOCALHOST,
          "--relayPort",
          String(CLI_MISMATCH_RELAY_PORT),
          "--selfTag",
          "cli-plain-peer",
          "--distantTag",
          "cli-encrypted-peer",
        ],
        { timeout: EVENT_TIMEOUT_MS }
      ),
    ]);

    expect(encryptedResult.stdout).toContain("Encryption negotiation failed");
    expect(plainResult.stdout).toContain("Encryption negotiation failed");
    expect(encryptedResult.stderr).not.toContain("Cannot send data on closing");
    expect(encryptedResult.stderr).toBe("");
    expect(plainResult.stderr).toBe("");
  } finally {
    await relay.close();
  }
}, 20_000);
