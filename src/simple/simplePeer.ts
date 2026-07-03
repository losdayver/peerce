import { TransceiverIPv4 } from "@src/transport/transceiver";
import {
  PeerToPeerSessionRequest,
  PeerToRelaySessionRequest,
} from "./simpleProtocol";

export class SimplePeer {
  transceiver: TransceiverIPv4;

  constructor() {
    this.transceiver = new TransceiverIPv4();
  }

  requestSessionViaRelay = async (
    relayAddr: string,
    relayPort: number,
    selfTag: string,
    distantTag: string,
    payload?: string
  ) => {
    this.transceiver.listen();
    this.transceiver.connect(relayAddr, relayPort);

    console.log("connecting to relay");

    await new Promise((res) => setTimeout(res, 2000)); // todo fix

    let resolver: () => void;
    let promise = new Promise((req) => (resolver = () => req(true)));

    const listener = (address, port) => {
      if (address == relayAddr && relayPort == port) resolver();
    };

    this.transceiver.eventEmitter.addListener("onConnected", listener);

    await promise;
    console.log("ready to send");
    this.transceiver.eventEmitter.removeListener("onConnected", listener);

    this.transceiver.send(
      relayAddr,
      relayPort,
      JSON.stringify({
        selfTag,
        distantTag,
      } satisfies PeerToRelaySessionRequest)
    );

    promise = new Promise((req) => (resolver = () => req(true)));

    this.transceiver.eventEmitter.addListener(
      "onReceive",
      async ({ address, port }, msg) => {
        if (!(address == relayAddr && relayPort == port)) return;
        const obj = JSON.parse(msg) as PeerToPeerSessionRequest;
        if (obj.distantTag !== distantTag) return;
        this.transceiver.connect(obj.distantAddress, obj.distantPort);
        // this.transceiver.disconnect(relayAddr, relayPort); // todo

        this.transceiver.eventEmitter.addListener(
          "onReceive",
          ({ address, port }, msg) => {
            if (address == obj.distantAddress && port == obj.distantPort)
              console.log(msg);
          }
        );

        await new Promise((res) => setTimeout(res, 10000)); // todo fix

        if (payload)
          this.transceiver.send(obj.distantAddress, obj.distantPort, payload);

        // todo disconnect from relay
      }
    );
  };
}
