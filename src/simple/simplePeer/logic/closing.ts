import { StateMachineBehaviorBase } from "../../../utils/stateMachine";
import { SimplePeerStateMachineConfig } from "../stateMeta";
import { SimplePeer } from "../simplePeer";

export class Closing extends StateMachineBehaviorBase<SimplePeerStateMachineConfig> {
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
