import { StateMachineBehaviorBase } from "../../../utils/stateMachine";
import { SimplePeerStateMachineConfig } from "../stateMeta";
import { SimplePeer } from "../simplePeer";
import { getResolver } from "../../../utils/promiseUtils";
import {
  PeerToPeerSessionRequest,
  PeerToRelaySessionRequest,
} from "../../simpleProtocol";
import { logInfo } from "../../../utils/logUtils";

export class ConnectingToPeer extends StateMachineBehaviorBase<SimplePeerStateMachineConfig> {
  simplePeer: SimplePeer;

  constructor(simplePeer: SimplePeer) {
    super();
    this.simplePeer = simplePeer;
  }

  onEnter = async () => {
    const { initialParams, transceiver, stateMachine } = this.simplePeer;
    const { distantTag, relayAddr, relayPort, selfTag } = initialParams;

    logInfo(`awaiting session request from "${distantTag}"`);

    // Awaiting session request
    let sessionRequest: PeerToPeerSessionRequest;
    let { promise: peerRequestPromise, resolver: peerRequestResolver } =
      getResolver();
    const sessionRequestListener = (addrObj, msg) => {
      if (addrObj.address == relayAddr && addrObj.port == relayPort) {
        // todo check msg for correct schema
        sessionRequest = JSON.parse(msg) as PeerToPeerSessionRequest;

        // Ignore messages that have wrong distantTag
        if (sessionRequest.distantTag !== distantTag) return;

        peerRequestResolver.resolve?.();
      }
    };
    transceiver.eventEmitter.addListener("onReceive", sessionRequestListener);

    transceiver.send(
      relayAddr,
      relayPort,
      JSON.stringify({
        selfTag,
        distantTag,
      } satisfies PeerToRelaySessionRequest)
    );

    await peerRequestPromise;
    transceiver.eventEmitter.removeListener(
      "onReceive",
      sessionRequestListener
    );

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
    transceiver.eventEmitter.addListener("onConnected", peerConnectionListener);
    await connPromise;

    transceiver.eventEmitter.removeListener(
      "onConnected",
      peerConnectionListener
    );

    await stateMachine.transitionTo("connectedToPeer", sessionRequest!);
  };
  onExit = () => {
    const { relayAddr, relayPort } = this.simplePeer.initialParams;
    logInfo(`closed relay connection`);
    this.simplePeer.transceiver.closeSession(relayAddr, relayPort);
  };
}
