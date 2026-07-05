import { StateMachineLogicEntryBase } from "@src/utils/stateMachine";
import { SimplePeerStateMachineConfig } from "@src/simple/simplePeer/stateMeta";
import { SimplePeer } from "@src/simple/simplePeer/simplePeer";
import { PeerToPeerSessionRequest } from "@src/simple/simpleProtocol";
import { logInfo } from "@src/utils/logUtils";

export class ConnectedToPeer extends StateMachineLogicEntryBase<SimplePeerStateMachineConfig> {
  logicHandler = () => {};
  onEnter = (from, sessionRequest: PeerToPeerSessionRequest) => {
    logInfo(
      `connected to peer ${sessionRequest.distantAddress}:${sessionRequest.distantPort}`
    );
    logInfo(`ready for data`);
  };
  onExit = () => {};
  simplePeer: SimplePeer;

  constructor(simplePeer: SimplePeer) {
    super();
    this.simplePeer = simplePeer;
  }
}
