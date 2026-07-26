import { SimplePeerStateShifterConfig } from "../stateMeta";
import { SimplePeer } from "../simplePeer";
import { StateShifterBehaviorBase } from "state-shifter";

export class Closing extends StateShifterBehaviorBase<SimplePeerStateShifterConfig> {
  simplePeer: SimplePeer;

  constructor(simplePeer: SimplePeer) {
    super();
    this.simplePeer = simplePeer;
  }

  onEnter = async () => {
    const { transceiver } = this.simplePeer;
    await transceiver.close();
  };
}
