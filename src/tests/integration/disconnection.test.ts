import { SimplePeer, ClosingReason } from "../../simple/simplePeer/simplePeer";
import { SimpleRelay } from "../../simple/simpleRelay";

const LOCALHOST = "127.0.0.1";
const EVENT_TIMEOUT_MS = 5_000;
const INTERRUPTED_PAYLOAD = Buffer.alloc(4 * 1024 * 1024, 0x61);

interface FixtureEvents {
  readonly closingReasons: ClosingReason[];
  readonly transportErrors: Error[];
  fullMessages: number;
}

interface PeerPairFixture {
  readonly peerA: SimplePeer;
  readonly peerB: SimplePeer;
  readonly relay: SimpleRelay;
  readonly peerAEvents: FixtureEvents;
  readonly peerBEvents: FixtureEvents;
  dispose(): Promise<void>;
}

const waitForEvent = (
  subscribe: (listener: () => void) => void,
  unsubscribe: (listener: () => void) => void,
  description: string,
  timeoutMs = EVENT_TIMEOUT_MS
): Promise<void> =>
  new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timeout);
      unsubscribe(onEvent);
    };
    const onEvent = () => {
      cleanup();
      resolve();
    };
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for ${description}`));
    }, timeoutMs);

    subscribe(onEvent);
  });

const waitForIncomingTransmission = (peer: SimplePeer, description: string) =>
  waitForEvent(
    (listener) => peer.once("onIncomingTransmissionStart", listener),
    (listener) => peer.off("onIncomingTransmissionStart", listener),
    description
  );

const waitForTransportClose = (
  peer: SimplePeer,
  description: string,
  timeoutMs = EVENT_TIMEOUT_MS
) =>
  waitForEvent(
    (listener) => peer.transceiver.once("onClosed", listener),
    (listener) => peer.transceiver.off("onClosed", listener),
    description,
    timeoutMs
  );

const createFixtureEvents = (peer: SimplePeer): FixtureEvents => {
  const events: FixtureEvents = {
    closingReasons: [],
    transportErrors: [],
    fullMessages: 0,
  };

  peer.on("onClosing", (reason) => events.closingReasons.push(reason));
  peer.on("onFullMessage", () => {
    events.fullMessages += 1;
  });
  peer.transceiver.on("onError", (error) => events.transportErrors.push(error));

  return events;
};

const throwCleanupErrors = (results: PromiseSettledResult<void>[]) => {
  const errors = results
    .filter(
      (result): result is PromiseRejectedResult => result.status === "rejected"
    )
    .map((result) => result.reason);

  if (errors.length > 0)
    throw new AggregateError(errors, "Failed to dispose peer-pair fixture");
};

const createConnectedPeerPair = async (
  relayPort: number,
  peerAPort: number,
  peerBPort: number
): Promise<PeerPairFixture> => {
  const relay = new SimpleRelay(LOCALHOST, relayPort);
  const peerA = new SimplePeer({
    selfTag: `peer-a-${peerAPort}`,
    distantTag: `peer-b-${peerBPort}`,
    relayAddr: LOCALHOST,
    relayPort,
    selfAddr: LOCALHOST,
    selfPort: peerAPort,
  });
  const peerB = new SimplePeer({
    selfTag: `peer-b-${peerBPort}`,
    distantTag: `peer-a-${peerAPort}`,
    relayAddr: LOCALHOST,
    relayPort,
    selfAddr: LOCALHOST,
    selfPort: peerBPort,
  });
  const peerAEvents = createFixtureEvents(peerA);
  const peerBEvents = createFixtureEvents(peerB);

  const fixture: PeerPairFixture = {
    peerA,
    peerB,
    relay,
    peerAEvents,
    peerBEvents,
    dispose: async () => {
      const peerResults = await Promise.allSettled([
        peerA.close(),
        peerB.close(),
      ]);
      const relayResults = await Promise.allSettled([relay.close()]);
      throwCleanupErrors([...peerResults, ...relayResults]);
    },
  };

  try {
    await relay.ready();
    await Promise.all([
      peerA.requestSessionViaRelayAsync(),
      peerB.requestSessionViaRelayAsync(),
    ]);
    return fixture;
  } catch (cause) {
    await fixture.dispose();
    throw cause;
  }
};

const expectCleanShutdown = (
  fixture: PeerPairFixture,
  peerAReason: ClosingReason,
  peerBReason: ClosingReason
) => {
  expect(fixture.peerAEvents.closingReasons).toEqual([peerAReason]);
  expect(fixture.peerBEvents.closingReasons).toEqual([peerBReason]);
  expect(fixture.peerAEvents.transportErrors).toEqual([]);
  expect(fixture.peerBEvents.transportErrors).toEqual([]);
  expect(fixture.peerA.stateMachine.getCurrentState()).toBe("closing");
  expect(fixture.peerB.stateMachine.getCurrentState()).toBe("closing");
};

const pendingRequestTTLms = 2_000;
test(
  "peer with a pending connection request disconnects after its TTL",
  async () => {
    const relay = new SimpleRelay(LOCALHOST, 46_150, { pendingRequestTTLms });
    const peer = new SimplePeer({
      selfTag: "peer-a-46151",
      distantTag: "missing-peer",
      relayAddr: LOCALHOST,
      relayPort: 46_150,
      selfAddr: LOCALHOST,
      selfPort: 46_151,
    });
    const peerEvents = createFixtureEvents(peer);

    try {
      await relay.ready();
      const requestStartedAt = Date.now();
      const peerClosed = waitForTransportClose(
        peer,
        "pending-request peer transport close",
        pendingRequestTTLms + 2 * EVENT_TIMEOUT_MS
      );

      void peer.requestSessionViaRelayAsync();
      await peerClosed;

      expect(Date.now() - requestStartedAt).toBeGreaterThanOrEqual(
        pendingRequestTTLms
      );
      expect(peerEvents.closingReasons).toEqual(["RELAY_CLOSE"]);
      expect(peerEvents.transportErrors).toEqual([]);
      expect(peer.stateMachine.getCurrentState()).toBe("closing");
    } finally {
      const peerResults = await Promise.allSettled([peer.close()]);
      const relayResults = await Promise.allSettled([relay.close()]);
      throwCleanupErrors([...peerResults, ...relayResults]);
    }
  },
  pendingRequestTTLms + 3 * EVENT_TIMEOUT_MS
);

test("peer A closes locally and peer B observes a remote disconnect", async () => {
  const fixture = await createConnectedPeerPair(46_100, 46_101, 46_102);

  try {
    const peerBClosed = waitForTransportClose(
      fixture.peerB,
      "peer B transport close"
    );

    await Promise.all([fixture.peerA.close(), peerBClosed]);

    expectCleanShutdown(fixture, "SELF_CLOSE", "DISTANT_CLOSE");
  } finally {
    await fixture.dispose();
  }
});

test("peer B closes locally and peer A observes a remote disconnect", async () => {
  const fixture = await createConnectedPeerPair(46_110, 46_111, 46_112);

  try {
    const peerAClosed = waitForTransportClose(
      fixture.peerA,
      "peer A transport close"
    );

    await Promise.all([fixture.peerB.close(), peerAClosed]);

    expectCleanShutdown(fixture, "DISTANT_CLOSE", "SELF_CLOSE");
  } finally {
    await fixture.dispose();
  }
});

test("sender disconnects while a large transmission is in progress", async () => {
  const fixture = await createConnectedPeerPair(46_120, 46_121, 46_122);

  try {
    const transmissionStarted = waitForIncomingTransmission(
      fixture.peerB,
      "peer B transmission start"
    );
    const peerBClosed = waitForTransportClose(
      fixture.peerB,
      "peer B transport close"
    );

    fixture.peerA.createOutgoingTransmission({
      fileName: "sender-disconnect.bin",
      payload: INTERRUPTED_PAYLOAD,
    });
    await transmissionStarted;
    await Promise.all([fixture.peerA.close(), peerBClosed]);

    expect(fixture.peerBEvents.fullMessages).toBe(0);
    expectCleanShutdown(fixture, "SELF_CLOSE", "DISTANT_CLOSE");
  } finally {
    await fixture.dispose();
  }
}, 10_000);

test("receiver disconnects while a large transmission is in progress", async () => {
  const fixture = await createConnectedPeerPair(46_130, 46_131, 46_132);

  try {
    const transmissionStarted = waitForIncomingTransmission(
      fixture.peerB,
      "peer B transmission start"
    );
    const peerAClosed = waitForTransportClose(
      fixture.peerA,
      "peer A transport close"
    );

    fixture.peerA.createOutgoingTransmission({
      fileName: "receiver-disconnect.bin",
      payload: INTERRUPTED_PAYLOAD,
    });
    await transmissionStarted;
    await Promise.all([fixture.peerB.close(), peerAClosed]);

    expect(fixture.peerBEvents.fullMessages).toBe(0);
    expectCleanShutdown(fixture, "DISTANT_CLOSE", "SELF_CLOSE");
  } finally {
    await fixture.dispose();
  }
}, 10_000);

test("both peers close repeatedly during bidirectional transmissions", async () => {
  const fixture = await createConnectedPeerPair(46_140, 46_141, 46_142);

  try {
    const peerAStarted = waitForIncomingTransmission(
      fixture.peerA,
      "peer A transmission start"
    );
    const peerBStarted = waitForIncomingTransmission(
      fixture.peerB,
      "peer B transmission start"
    );

    fixture.peerA.createOutgoingTransmission({
      fileName: "a-to-b.bin",
      payload: INTERRUPTED_PAYLOAD,
    });
    fixture.peerB.createOutgoingTransmission({
      fileName: "b-to-a.bin",
      payload: INTERRUPTED_PAYLOAD,
    });
    await Promise.all([peerAStarted, peerBStarted]);

    const firstPeerAClose = fixture.peerA.close();
    const secondPeerAClose = fixture.peerA.close();
    const firstPeerBClose = fixture.peerB.close();
    const secondPeerBClose = fixture.peerB.close();

    expect(secondPeerAClose).toBe(firstPeerAClose);
    expect(secondPeerBClose).toBe(firstPeerBClose);

    await Promise.all([firstPeerAClose, firstPeerBClose]);

    expect(fixture.peerAEvents.fullMessages).toBe(0);
    expect(fixture.peerBEvents.fullMessages).toBe(0);
    expectCleanShutdown(fixture, "SELF_CLOSE", "SELF_CLOSE");
  } finally {
    await fixture.dispose();
  }
}, 10_000);
