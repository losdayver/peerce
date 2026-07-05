import { StateMachineLogicEntryBase } from "@src/utils/stateMachine";
import { SimplePeerStateMachineConfig } from "@src/simple/simplePeer/stateMeta";
import { SimplePeer } from "@src/simple/simplePeer/simplePeer";
import { PeerToPeerSessionRequest } from "@src/simple/simpleProtocol";
import { logInfo } from "@src/utils/logUtils";
import { writeFileSync } from "node:fs";
import { sleep } from "@src/utils/promiseUtils";

export class ConnectedToPeer extends StateMachineLogicEntryBase<SimplePeerStateMachineConfig> {
  simplePeer: SimplePeer;
  constructor(simplePeer: SimplePeer) {
    super();
    this.simplePeer = simplePeer;
  }

  logicHandler = () => {};
  onEnter = (from, sessionRequest: PeerToPeerSessionRequest) => {
    const { transceiver, initialParams } = this.simplePeer;

    logInfo(
      `connected to peer ${sessionRequest.distantAddress}:${sessionRequest.distantPort}`
    );
    logInfo(`ready for data`);

    this.simplePeer.eventEmitter.emit("onConnectedToPeer", sessionRequest);

    // todo remove this
    transceiver.eventEmitter.addListener(
      "onReceive",
      async ({ address, port }, msg) => {
        if (
          address == sessionRequest.distantAddress &&
          port == sessionRequest.distantPort
        ) {
          if (!initialParams.outFile) console.log(msg.toString());
          else writeFileSync(initialParams.outFile, msg);
          transceiver.eventEmitter.removeAllListeners();
          transceiver.closeSession(address, port);

          await sleep(2000);

          transceiver.close();
        }
      }
    );

    if (initialParams.payload)
      transceiver.send(
        sessionRequest.distantAddress,
        sessionRequest.distantPort,
        initialParams.payload
      );
  };
  onExit = () => {};
}
