import { SimplePeerStateShifterConfig } from "../stateMeta";
import { SimplePeer } from "../simplePeer";
import {
  PeerToPeerMessage,
  PeerToPeerMessageDescriptor,
  PeerToPeerSessionRequest,
} from "../../simpleProtocol";
import { logInfo } from "../../../utils/logUtils";
import { chunkPeerToPeerMessages, decryptPayload } from "../../simpleUtils";
import { StateShifterBehaviorBase } from "state-shifter";

export type ConnectedToPeerEventHandler = (
  params: PeerToPeerMessageDescriptor
) => void; // todo promise&

type IncomingChunk = Omit<PeerToPeerMessage, "payload"> & {
  payload: Buffer;
};

export class ConnectedToPeer extends StateShifterBehaviorBase<SimplePeerStateShifterConfig> {
  simplePeer: SimplePeer;
  constructor(simplePeer: SimplePeer) {
    super();
    this.simplePeer = simplePeer;
  }

  sessionRequest: PeerToPeerSessionRequest | undefined;
  derivedKey: Buffer | undefined;

  chunkCollector = new Map<
    PeerToPeerMessage["fileName"],
    Map<PeerToPeerMessage["chunkNo"], Buffer>
  >();
  private isActive = false;

  private addToChunkCollector = (chunk: IncomingChunk) => {
    let inner = this.chunkCollector.get(chunk.fileName);

    if (!inner) {
      inner = new Map<PeerToPeerMessage["chunkNo"], Buffer>();
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
        .map(([, payload]) => payload)
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
    const { fileName, messages } = chunkPeerToPeerMessages({
      ...params,
      encrypt: this.derivedKey !== undefined,
      secret: this.derivedKey,
    });
    for (const [index, msg] of messages.entries()) {
      if (!this.isActive || !transceiver.canSend(distantAddress, distantPort))
        return;
      await transceiver.send(distantAddress, distantPort, msg);
      this.simplePeer.emit(
        "onOutgoingTransmissionPercentageChange",
        fileName,
        (index + 1) / messages.length
      );
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

    const chunk = JSON.parse(msg.toString()) as PeerToPeerMessage;
    let payload: Buffer;

    if (this.derivedKey) {
      if (!chunk.authTag)
        throw new Error("Encrypted chunk does not contain an auth tag");

      payload = decryptPayload(
        chunk.payload,
        this.derivedKey,
        chunk.nonce!,
        chunk.authTag
      );
    } else {
      payload = Buffer.from(chunk.payload, "hex");
    }

    this.addToChunkCollector({ ...chunk, payload });
  };

  private onPeerSessionClosed = (address: string, port: number) => {
    const sessionRequest = this.sessionRequest;
    if (
      !sessionRequest ||
      address !== sessionRequest.distantAddress ||
      port !== sessionRequest.distantPort ||
      this.simplePeer.stateMachine.getCurrentState() !== "connectedToPeer"
    )
      return;

    this.simplePeer.emit("onClosing", "DISTANT_CLOSE");
    void this.simplePeer.stateMachine.shiftTo("closing");
  };

  onEnter = (
    _,
    sessionRequest: PeerToPeerSessionRequest & { derivedKey?: Buffer }
  ) => {
    const { transceiver } = this.simplePeer;
    this.sessionRequest = sessionRequest;
    this.derivedKey = sessionRequest.derivedKey;
    this.isActive = true;

    logInfo(
      `connected to peer ${sessionRequest.distantAddress}:${sessionRequest.distantPort}`
    );
    logInfo(`ready for data`);

    this.simplePeer.emit("onConnectedToPeer", sessionRequest);

    transceiver.on("onReceive", this.onReceiveMsg);
    transceiver.on("onSessionClosed", this.onPeerSessionClosed);
  };
  onExit = () => {
    this.isActive = false;
    this.simplePeer.transceiver.off("onReceive", this.onReceiveMsg);
    this.simplePeer.transceiver.off(
      "onSessionClosed",
      this.onPeerSessionClosed
    );
    this.chunkCollector.clear();
    this.sessionRequest = undefined;
  };
}
