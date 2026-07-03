import { TransceiverIPv4 } from "@src/transport/transceiver";
import {
  PeerToPeerSessionRequest,
  PeerToRelaySessionRequest,
} from "./simpleProtocol";

export class SimpleRelay {
  transceiver: TransceiverIPv4;

  private requestMap = new Map<
    `${PeerToRelaySessionRequest["selfTag"]}:${PeerToRelaySessionRequest["distantTag"]}`,
    { address: string; port: number }
  >();

  constructor(address: string, port: number) {
    this.transceiver = new TransceiverIPv4();
    this.transceiver.listen({ address, port });

    this.transceiver.eventEmitter.on("onReceive", this.onReceiveFromPeer);
  }

  onReceiveFromPeer = (
    addrObj: { address: string; port: number },
    msg: string
  ) => {
    // todo zod or something
    const obj = JSON.parse(msg) as PeerToRelaySessionRequest;
    console.log("adding new record to target map", addrObj, msg);

    this.requestMap.set(`${obj.selfTag}:${obj.distantTag}`, { ...addrObj });

    const peerRequest = this.requestMap.get(`${obj.distantTag}:${obj.selfTag}`);

    if (peerRequest) {
      // todo
      console.log("doing relay logic");
      this.transceiver.send(
        peerRequest.address,
        peerRequest.port,
        JSON.stringify({
          distantTag: obj.selfTag,
          distantAddress: addrObj.address,
          distantPort: addrObj.port,
        } satisfies PeerToPeerSessionRequest)
      );
      this.transceiver.send(
        addrObj.address,
        addrObj.port,
        JSON.stringify({
          distantTag: obj.distantTag,
          distantAddress: peerRequest.address,
          distantPort: peerRequest.port,
        } satisfies PeerToPeerSessionRequest)
      );
    }
  };

  doAddressExchange = () => {};
}
