import { ConnectedToPeer } from "../simple/simplePeer/behaviors/connectedToPeer";
import { ConnectingToPeer } from "../simple/simplePeer/behaviors/connectingToPeer";
import { SimplePeer, ClosingReason } from "../simple/simplePeer/simplePeer";
import { PeerToPeerSessionRequest } from "../simple/simpleProtocol";

test("closes SimplePeer when the connected remote session closes", () => {
  const simplePeer = new SimplePeer({});
  const behavior = new ConnectedToPeer(simplePeer);
  const sessionRequest: PeerToPeerSessionRequest = {
    distantTag: "remote",
    distantAddress: "127.0.0.1",
    distantPort: 50_001,
  };
  const closingReasons: ClosingReason[] = [];

  jest
    .spyOn(simplePeer.stateMachine, "getCurrentState")
    .mockReturnValue("connectedToPeer");
  const shiftTo = jest
    .spyOn(simplePeer.stateMachine, "shiftTo")
    .mockResolvedValue(undefined);
  simplePeer.on("onClosing", (reason) => closingReasons.push(reason));

  behavior.onEnter(undefined, sessionRequest);
  simplePeer.transceiver.emit(
    "onSessionClosed",
    sessionRequest.distantAddress,
    sessionRequest.distantPort + 1
  );

  expect(shiftTo).not.toHaveBeenCalled();

  simplePeer.transceiver.emit(
    "onSessionClosed",
    sessionRequest.distantAddress,
    sessionRequest.distantPort
  );

  expect(closingReasons).toEqual(["DISTANT_CLOSE"]);
  expect(shiftTo).toHaveBeenCalledTimes(1);
  expect(shiftTo).toHaveBeenCalledWith("closing");

  behavior.onExit();
});

test("ConnectingToPeer does not miss a synchronous peer connection", async () => {
  const relayAddress = "127.0.0.1";
  const relayPort = 50_010;
  const peerAddress = "127.0.0.1";
  const peerPort = 50_011;
  const simplePeer = new SimplePeer({
    selfTag: "self",
    distantTag: "remote",
    relayAddr: relayAddress,
    relayPort,
  });
  const behavior = new ConnectingToPeer(simplePeer);

  jest.spyOn(simplePeer.transceiver, "send").mockResolvedValue(undefined);
  const connect = jest
    .spyOn(simplePeer.transceiver, "connect")
    .mockImplementation((address, port) => {
      simplePeer.transceiver.emit("onConnected", address, port);
    });
  const shiftTo = jest
    .spyOn(simplePeer.stateMachine, "shiftTo")
    .mockResolvedValue(undefined);

  const connection = behavior.onEnter();

  simplePeer.transceiver.emit(
    "onReceive",
    { address: relayAddress, port: relayPort + 1 },
    Buffer.from("unrelated")
  );
  simplePeer.transceiver.emit(
    "onReceive",
    { address: relayAddress, port: relayPort },
    Buffer.from(
      JSON.stringify({
        distantTag: "remote",
        distantAddress: peerAddress,
        distantPort: peerPort,
      } satisfies PeerToPeerSessionRequest)
    )
  );

  await connection;

  expect(connect).toHaveBeenCalledWith(peerAddress, peerPort);
  expect(shiftTo).toHaveBeenCalledWith("connectedToPeer", {
    distantTag: "remote",
    distantAddress: peerAddress,
    distantPort: peerPort,
    derivedKey: undefined,
  });
});
