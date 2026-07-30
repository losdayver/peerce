import * as z from "zod";
import { TransceiverIPv4 } from "../transport/transceiver";
import {
  PeerToPeerSessionRequest,
  PeerToRelaySessionRequest,
} from "./simpleProtocol";
import { AnsiColor, colorLog, logInfo } from "../utils/logUtils";

export abstract class PeerProxy {
  constructor(
    public readonly address: string,
    public readonly port: number
  ) {}

  abstract setup: (
    ownPeer: { address: string; port: number },
    distantPeer: { address: string; port: number }
  ) => void | Promise<void>;

  abstract close: () => Promise<void>;
}

type TagProxyMap = Record<string, PeerProxy>;

export class SimpleRelay {
  transceiver: TransceiverIPv4;
  private readonly listenPromise: Promise<void>;
  private closePromise: Promise<void> | undefined;

  private requestMap = new Map<
    `${PeerToRelaySessionRequest["selfTag"]}:${PeerToRelaySessionRequest["distantTag"]}`,
    { address: string; port: number }
  >();

  constructor(
    address: string,
    port: number,
    private tagProxyMap?: TagProxyMap
  ) {
    this.transceiver = new TransceiverIPv4();
    this.listenPromise = this.transceiver.listen({ address, port });
    void this.listenPromise.catch(() => undefined);

    this.transceiver.on("onReceive", this.onReceiveFromPeer);
    this.transceiver.on("onSessionClosed", this.onSessionClosed);
  }

  ready = () => this.listenPromise;

  close = (): Promise<void> => {
    this.closePromise ??= this.performClose();
    return this.closePromise;
  };

  private performClose = async () => {
    this.transceiver.off("onReceive", this.onReceiveFromPeer);
    this.transceiver.off("onSessionClosed", this.onSessionClosed);

    try {
      await this.transceiver.close();
    } finally {
      this.requestMap.clear();
    }
  };

  onSessionClosed = (address: string, port: number) => {
    for (const [key, peer] of this.requestMap.entries()) {
      if (peer.address === address && peer.port === port) {
        this.requestMap.delete(key);
      }
    }
  };

  onReceiveFromPeer = async (
    addrObj: { address: string; port: number },
    msg: Buffer
  ) => {
    const obj = JSON.parse(msg.toString()) as PeerToRelaySessionRequest;

    // todo zod or something
    this.requestMap.set(`${obj.selfTag}:${obj.distantTag}`, { ...addrObj });

    logInfo(`requesting ${obj.selfTag}:${obj.distantTag}`);

    const peerRequest = this.requestMap.get(`${obj.distantTag}:${obj.selfTag}`);

    if (peerRequest) {
      let proxy1: PeerProxy | undefined;
      let proxy2: PeerProxy | undefined;
      if (this.tagProxyMap) proxy1 = this.tagProxyMap[obj.selfTag];
      if (this.tagProxyMap) proxy2 = this.tagProxyMap[obj.distantTag];

      if (proxy1)
        await proxy1.setup(
          { address: addrObj.address, port: addrObj.port },
          {
            address: proxy2 ? proxy2.address : peerRequest.address,
            port: proxy2 ? proxy2.port : peerRequest.port,
          }
        );
      if (proxy2)
        await proxy2.setup(
          { address: peerRequest.address, port: peerRequest.port },
          {
            address: proxy1 ? proxy1.address : addrObj.address,
            port: proxy1 ? proxy1.port : addrObj.port,
          }
        );

      colorLog(
        `request satisfied ${obj.selfTag}:${obj.distantTag}`,
        AnsiColor.BRIGHTGREEN
      );
      this.transceiver.send(
        peerRequest.address,
        peerRequest.port,
        JSON.stringify({
          distantTag: obj.selfTag,
          distantAddress: proxy2 ? proxy2.address : addrObj.address,
          distantPort: proxy2 ? proxy2.port : addrObj.port,
        } satisfies PeerToPeerSessionRequest)
      );
      this.transceiver.send(
        addrObj.address,
        addrObj.port,
        JSON.stringify({
          distantTag: obj.distantTag,
          distantAddress: proxy1 ? proxy1.address : peerRequest.address,
          distantPort: proxy1 ? proxy1.port : peerRequest.port,
        } satisfies PeerToPeerSessionRequest)
      );
    }
  };
}
