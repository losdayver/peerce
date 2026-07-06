import { StateMachineLogicEntryBase } from "@src/utils/stateMachine";
import { SimplePeerStateMachineConfig } from "@src/simple/simplePeer/stateMeta";
import { SimplePeer } from "@src/simple/simplePeer/simplePeer";
import {
  PeerToPeerMessage,
  PeerToPeerMessageDescriptor,
  PeerToPeerSessionRequest,
} from "@src/simple/simpleProtocol";
import { logInfo } from "@src/utils/logUtils";
import { chunkPeerToPeerMessages } from "@src/simple/simpleUtils";
import { sleep } from "@src/utils/promiseUtils";

export type ConnectedToPeerLogicHandler = (
  params: PeerToPeerMessageDescriptor
) => void; // todo promise&

export class ConnectedToPeer extends StateMachineLogicEntryBase<SimplePeerStateMachineConfig> {
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

  private addToChunkCollector = (chunk: PeerToPeerMessage) => {
    const inner =
      this.chunkCollector.get(chunk.fileName) ??
      (this.chunkCollector.set(
        chunk.fileName,
        new Map<PeerToPeerMessage["chunkNo"], PeerToPeerMessage["payload"]>()
      ),
      this.chunkCollector.get(chunk.fileName)!);

    inner.set(chunk.chunkNo, chunk.payload);
    logInfo(
      `receiving "${chunk.fileName}" ${Math.ceil((inner.size / chunk.totalNo) * 100)}%`
    );

    if (inner.size !== chunk.totalNo) return;

    const allB64Strings = [
      ...this.chunkCollector.get(chunk.fileName)!.values(),
    ];

    const fullBuffer = Buffer.concat(
      allB64Strings.map((b64) => Buffer.from(b64, "base64"))
    );

    this.simplePeer.eventEmitter.emit("onFullMessage", {
      fileName: chunk.fileName,
      buffer: fullBuffer,
    });
    this.chunkCollector.delete(chunk.fileName);
  };

  logicHandler: ConnectedToPeerLogicHandler = async (params) => {
    const { transceiver } = this.simplePeer;
    const { distantAddress, distantPort } = this.sessionRequest!;
    logInfo(`sending "${params.fileName}"`);
    const messages = chunkPeerToPeerMessages(params);
    for (const msg of messages) {
      await sleep(1); // todo wtf?
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

    logInfo(
      `connected to peer ${sessionRequest.distantAddress}:${sessionRequest.distantPort}`
    );
    logInfo(`ready for data`);

    this.simplePeer.eventEmitter.emit("onConnectedToPeer", sessionRequest);

    transceiver.eventEmitter.on("onReceive", this.onReceiveMsg);
  };
  onExit = () => {
    this.simplePeer.transceiver.eventEmitter.off(
      "onReceive",
      this.onReceiveMsg
    );
  };
}
