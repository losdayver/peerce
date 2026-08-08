import { SimplePeerStateShifterConfig } from "../stateMeta";
import { SimplePeer } from "../simplePeer";
import { getResolver } from "../../../utils/promiseUtils";
import {
  PeerToPeerSessionRequest,
  PeerToRelaySessionRequest,
} from "../../simpleProtocol";
import { logInfo } from "../../../utils/logUtils";
import { StateShifterBehaviorBase } from "state-shifter";

export class ConnectingToPeer extends StateShifterBehaviorBase<SimplePeerStateShifterConfig> {
  constructor(private simplePeer: SimplePeer) {
    super();
  }

  onRelayClose = async () => {
    await this.simplePeer.close("RELAY_CLOSE");
  };

  onEnter = async () => {
    const { initialParams, transceiver, stateMachine } = this.simplePeer;
    const { distantTag, relayAddr, relayPort, selfTag } = initialParams;

    logInfo(`awaiting session request from "${distantTag}"`);

    transceiver.on("onSessionClosed", this.onRelayClose);

    // Awaiting session request
    let sessionRequest: PeerToPeerSessionRequest;
    let { promise: peerRequestPromise, resolver: peerRequestResolver } =
      getResolver();
    const sessionRequestListener = (
      addrObj: { address: string; port: number },
      msg: Buffer
    ) => {
      if (addrObj.address == relayAddr && addrObj.port == relayPort) {
        try {
          sessionRequest = JSON.parse(
            msg.toString()
          ) as PeerToPeerSessionRequest;
          // todo schema check json
          if (sessionRequest.distantTag !== distantTag) return;
          peerRequestResolver.resolve?.();
        } catch (e) {
          console.error(e);
        }
      }
    };
    transceiver.once("onReceive", sessionRequestListener);

    transceiver.send(
      relayAddr,
      relayPort,
      JSON.stringify({
        selfTag,
        distantTag,
      } satisfies PeerToRelaySessionRequest)
    );

    let value = await Promise.race([
      peerRequestPromise,
      this.simplePeer.__prematureClosePromise,
    ]);

    if (value == "PREMATURE_CLOSE") {
      return;
    }

    logInfo(`got session request from "${distantTag}"`);
    // Got session request object and trying to connect to peer

    logInfo(
      `connecting to peer ${sessionRequest!.distantAddress}:${sessionRequest!.distantPort}`
    );

    transceiver.connect(
      sessionRequest!.distantAddress,
      sessionRequest!.distantPort
    );

    // Await connection from peer
    let { promise: connPromise, resolver: connResolver } = getResolver();
    const peerConnectionListener = (address: string, port: number) => {
      if (
        address == sessionRequest.distantAddress &&
        port == sessionRequest.distantPort
      )
        connResolver.resolve?.();
    };
    transceiver.once("onConnected", peerConnectionListener);

    value = await Promise.race([
      connPromise,
      this.simplePeer.__prematureClosePromise,
    ]);
    if (value == "PREMATURE_CLOSE") {
      return;
    }

    this.simplePeer.emit("onConnectedToPeer", sessionRequest!);

    await stateMachine.shiftTo("connectedToPeer", sessionRequest!);
  };
  onExit = async () => {
    const { relayAddr, relayPort } = this.simplePeer.initialParams;
    this.simplePeer.transceiver.off("onSessionClosed", this.onRelayClose);
    logInfo(`closed relay connection`);
    await this.simplePeer.transceiver.closeSession(relayAddr, relayPort);
  };
}
