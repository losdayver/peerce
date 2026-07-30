import { SimpleRelay } from "../simple/simpleRelay";
import { PeerToRelaySessionRequest } from "../simple/simpleProtocol";

const LOCALHOST = "127.0.0.1";

const createRequest = (
  selfTag: string,
  distantTag: string
): Buffer =>
  Buffer.from(
    JSON.stringify({
      selfTag,
      distantTag,
    } satisfies PeerToRelaySessionRequest)
  );

test("ignores malformed relay session requests", async () => {
  const relay = new SimpleRelay(LOCALHOST, 46_200);
  const send = jest
    .spyOn(relay.transceiver, "send")
    .mockImplementation(() => undefined);
  const consoleLog = jest
    .spyOn(console, "log")
    .mockImplementation(() => undefined);
  const peerAddress = { address: LOCALHOST, port: 46_201 };
  const invalidMessages = [
    Buffer.alloc(0),
    Buffer.from("{"),
    Buffer.from("[]"),
    Buffer.from("{}"),
    Buffer.from(JSON.stringify({ selfTag: 1, distantTag: "peer-b" })),
    Buffer.from(JSON.stringify({ selfTag: "peer-a", distantTag: false })),
    createRequest("same-peer", "same-peer"),
    createRequest("   ", "peer-b"),
    createRequest("peer-a\n", "peer-b"),
    createRequest("a".repeat(129), "peer-b"),
    Buffer.alloc(1_025, 0x61),
  ];

  try {
    await relay.ready();
    for (const message of invalidMessages)
      relay.onReceiveFromPeer(peerAddress, message);

    expect(send).not.toHaveBeenCalled();
  } finally {
    consoleLog.mockRestore();
    await relay.close();
  }
});

test("does not match a session request after its TTL expires", async () => {
  const relay = new SimpleRelay(LOCALHOST, 46_210);
  const send = jest
    .spyOn(relay.transceiver, "send")
    .mockImplementation(() => undefined);
  const consoleLog = jest
    .spyOn(console, "log")
    .mockImplementation(() => undefined);
  const now = jest.spyOn(Date, "now").mockReturnValue(100_000);

  try {
    await relay.ready();
    relay.onReceiveFromPeer(
      { address: LOCALHOST, port: 46_211 },
      createRequest("peer-a", "peer-b")
    );

    now.mockReturnValue(130_001);
    relay.onReceiveFromPeer(
      { address: LOCALHOST, port: 46_212 },
      createRequest("peer-b", "peer-a")
    );

    expect(send).not.toHaveBeenCalled();
  } finally {
    now.mockRestore();
    consoleLog.mockRestore();
    await relay.close();
  }
});

test("removes both requests after matching the peers", async () => {
  const relay = new SimpleRelay(LOCALHOST, 46_220);
  const send = jest
    .spyOn(relay.transceiver, "send")
    .mockImplementation(() => undefined);
  const consoleLog = jest
    .spyOn(console, "log")
    .mockImplementation(() => undefined);
  const peerA = { address: LOCALHOST, port: 46_221 };
  const peerB = { address: LOCALHOST, port: 46_222 };

  try {
    await relay.ready();
    relay.onReceiveFromPeer(peerA, createRequest("peer-a", "peer-b"));
    relay.onReceiveFromPeer(peerB, createRequest("peer-b", "peer-a"));

    expect(send).toHaveBeenCalledTimes(2);

    send.mockClear();
    relay.onReceiveFromPeer(peerB, createRequest("peer-b", "peer-a"));

    expect(send).not.toHaveBeenCalled();
  } finally {
    consoleLog.mockRestore();
    await relay.close();
  }
});
