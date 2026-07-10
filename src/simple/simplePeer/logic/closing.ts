import { StateMachineLogicEntryBase } from "@src/utils/stateMachine";
import { SimplePeerStateMachineConfig } from "@src/simple/simplePeer/stateMeta";
import { SimplePeer } from "@src/simple/simplePeer/simplePeer";

export class Closing extends StateMachineLogicEntryBase<SimplePeerStateMachineConfig> {
  simplePeer: SimplePeer;

  constructor(simplePeer: SimplePeer) {
    super();
    this.simplePeer = simplePeer;
  }

  onEnter = async () => {
    const { transceiver } = this.simplePeer;
    transceiver.close();
  };
}
