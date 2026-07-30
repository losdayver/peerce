import { ConnectedToPeer } from "../simple/simplePeer/behaviors/connectedToPeer";
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
