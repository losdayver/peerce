import { SimplePeerStateShifterConfig } from "../stateMeta";
import { SimplePeer } from "../simplePeer";
import {
  PeerToPeerMessage,
  PeerToPeerMessageDescriptor,
  PeerToPeerSessionRequest,
} from "../../simpleProtocol";
import { AnsiColor, logInfo, logProgress } from "../../../utils/logUtils";
import { chunkPeerToPeerMessages } from "../../simpleUtils";
import { sleep } from "../../../utils/promiseUtils";
import { StateShifterBehaviorBase } from "state-shifter";

export type ConnectedToPeerEventHandler = (
  params: PeerToPeerMessageDescriptor
) => void; // todo promise&

export class ConnectedToPeer extends StateShifterBehaviorBase<SimplePeerStateShifterConfig> {
  simplePeer: SimplePeer;
  constructor(simplePeer: SimplePeer) {
    super();
    this.simplePeer = simplePeer;
  }

  sessionRequest: PeerToPeerSessionRequest | undefined;

  chunkCollector = new Map<
    PeerToPeerMessage["fileName"],
    Map<PeerToPeerMessage["chunkNo"], PeerToPeerMessage["payload"]>
  >();
  private isActive = false;

  private addToChunkCollector = (chunk: PeerToPeerMessage) => {
    let inner = this.chunkCollector.get(chunk.fileName);

    if (!inner) {
      inner = new Map<
        PeerToPeerMessage["chunkNo"],
        PeerToPeerMessage["payload"]
      >();
      this.chunkCollector.set(chunk.fileName, inner);
      this.simplePeer.emit("onIncomingTransmissionStart", chunk.fileName);
    }

    inner.set(chunk.chunkNo, chunk.payload);

    const progress = inner.size / chunk.totalNo;
    this.simplePeer.emit(
      "onIncomingTransmissionPercentageChange",
      chunk.fileName,
      progress
    );

    if (inner.size !== chunk.totalNo) return;

    const chunks = this.chunkCollector.get(chunk.fileName)!;

    const fullBuffer = Buffer.concat(
      [...chunks.entries()]
        .sort(([a], [b]) => a - b)
        .map(([, payload]) => Buffer.from(payload, "base64"))
    );

    this.simplePeer.emit("onFullMessage", {
      fileName: chunk.fileName,
      buffer: fullBuffer,
    });
    this.chunkCollector.delete(chunk.fileName);
  };

  eventHandler: ConnectedToPeerEventHandler = async (params) => {
    const { transceiver } = this.simplePeer;
    const { distantAddress, distantPort } = this.sessionRequest!;
    logInfo(`sending "${params.fileName}"`);
    const messages = chunkPeerToPeerMessages(params);
    for (const msg of messages) {
      await sleep(1); // todo wtf?
      if (!this.isActive) return;
      transceiver.send(distantAddress, distantPort, msg);
    }
  };

  private onReceiveMsg = (
    { address, port }: { address: string; port: number },
    msg: Buffer
  ) => {
    const sessionRequest = this.sessionRequest!;
    if (
      !(
        address == sessionRequest.distantAddress &&
        port == sessionRequest.distantPort
      )
    )
      return;

    this.addToChunkCollector(JSON.parse(msg.toString()));
  };

  onEnter = (_, sessionRequest: PeerToPeerSessionRequest) => {
    const { transceiver } = this.simplePeer;
    this.sessionRequest = sessionRequest;
    this.isActive = true;

    logInfo(
      `connected to peer ${sessionRequest.distantAddress}:${sessionRequest.distantPort}`
    );
    logInfo(`ready for data`);

    this.simplePeer.emit("onConnectedToPeer", sessionRequest);

    transceiver.on("onReceive", this.onReceiveMsg);
  };
  onExit = () => {
    this.isActive = false;
    this.simplePeer.transceiver.off("onReceive", this.onReceiveMsg);
    this.chunkCollector.clear();
    this.sessionRequest = undefined;
  };
}
