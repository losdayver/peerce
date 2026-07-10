import { TransceiverIPv4 } from "@src/transport/transceiver";
import {
  PeerToPeerSessionRequest,
  PeerToRelaySessionRequest,
} from "./simpleProtocol";
import { AnsiColor, colorLog, logInfo } from "@src/utils/logUtils";

export class SimpleRelay {
  transceiver: TransceiverIPv4;

  private requestMap = new Map<
    `${PeerToRelaySessionRequest["selfTag"]}:${PeerToRelaySessionRequest["distantTag"]}`,
    { address: string; port: number }
  >();

  constructor(address: string, port: number) {
    this.transceiver = new TransceiverIPv4();
    void this.transceiver.listen({ address, port });

    this.transceiver.eventEmitter.on("onReceive", this.onReceiveFromPeer);
    this.transceiver.eventEmitter.on("onSessionClosed", this.onSessionClosed);
  }

  onSessionClosed = (address: string, port: number) => {
    for (const [key, peer] of this.requestMap.entries()) {
      if (peer.address === address && peer.port === port) {
        this.requestMap.delete(key);
      }
    }
  };

  onReceiveFromPeer = (
    addrObj: { address: string; port: number },
    msg: Buffer
  ) => {
    const obj = JSON.parse(msg.toString()) as PeerToRelaySessionRequest;

    // todo zod or something
    this.requestMap.set(`${obj.selfTag}:${obj.distantTag}`, { ...addrObj });

    logInfo(`requesting ${obj.selfTag}:${obj.distantTag}`);

    const peerRequest = this.requestMap.get(`${obj.distantTag}:${obj.selfTag}`);

    colorLog(
      `request satisfied ${obj.selfTag}:${obj.distantTag}`,
      AnsiColor.BRIGHTGREEN
    );

    if (peerRequest) {
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
}
