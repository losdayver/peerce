import { TransceiverIPv4 } from "@src/transport/transceiver";
import {
  PeerToPeerSessionRequest,
  PeerToRelaySessionRequest,
  SimpleProtocolClientConfig,
} from "./simpleProtocol";
import { getResolver } from "@src/utils/promiseUtils";

export class SimplePeer {
  transceiver: TransceiverIPv4;

  constructor() {
    this.transceiver = new TransceiverIPv4();
  }

  requestSessionViaRelay = async (
    params: Required<SimpleProtocolClientConfig>
  ) => {
    const { distantTag, relayAddr, relayPort, selfTag } = params;

    this.transceiver.listen();
    this.transceiver.connect(relayAddr, relayPort);

    let { promise: connPromise, resolver: connResolver } = getResolver();
    const listener = (address: string, port: number) => {
      if (address == relayAddr && relayPort == port) connResolver.resolve?.();
    };
    this.transceiver.eventEmitter.addListener("onConnected", listener);
    await connPromise;
    this.transceiver.eventEmitter.removeListener("onConnected", listener);

    this.transceiver.eventEmitter.addListener("onReceive", (addrObj, msg) =>
      this.onReceivePeerSessionRequest(addrObj, msg, params)
    );

    this.transceiver.send(
      relayAddr,
      relayPort,
      JSON.stringify({
        selfTag,
        distantTag,
      } satisfies PeerToRelaySessionRequest)
    );
  };

  /** Awaits PeerToPeerSessionRequest to be sent back from relay */
  onReceivePeerSessionRequest = async (
    { address, port }: { address: string; port: number },
    msg: string,
    params: Required<SimpleProtocolClientConfig>
  ) => {
    const { distantTag, payload, relayAddr, relayPort } = params;

    // Ignore messages that come NOT from the relay
    if (!(address == relayAddr && port == relayPort)) return;

    const receivedObj = JSON.parse(msg) as PeerToPeerSessionRequest;

    // Ignore messages that have wrong distantTag
    if (receivedObj.distantTag !== distantTag) return;
    this.transceiver.connect(
      receivedObj.distantAddress,
      receivedObj.distantPort
    );

    // Await connection from peer
    let { promise: connPromise, resolver: connResolver } = getResolver();
    const listener = (address: string, port: number) => {
      if (
        address == receivedObj.distantAddress &&
        port == receivedObj.distantPort
      )
        connResolver.resolve?.();
    };
    this.transceiver.eventEmitter.addListener("onConnected", listener);
    await connPromise;
    this.transceiver.eventEmitter.removeListener("onConnected", listener);

    // Relay connection is no longer necessary
    this.transceiver.closeSession(relayAddr, relayPort);

    this.transceiver.eventEmitter.addListener(
      "onReceive",
      ({ address, port }, msg) => {
        if (
          address == receivedObj.distantAddress &&
          port == receivedObj.distantPort
        )
          console.log(msg); // todo message is received here
      }
    );

    if (payload)
      this.transceiver.send(
        receivedObj.distantAddress,
        receivedObj.distantPort,
        payload
      );
  };
}
