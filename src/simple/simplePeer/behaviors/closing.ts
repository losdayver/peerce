import { SimplePeerStateShifterConfig } from "../stateMeta";
import { SimplePeer } from "../simplePeer";
import { StateShifterBehaviorBase } from "state-shifter";

export class Closing extends StateShifterBehaviorBase<SimplePeerStateShifterConfig> {
  constructor(private simplePeer: SimplePeer) {
    super();
  }

  onEnter = async () => {
    const { transceiver } = this.simplePeer;
    await transceiver.close();
  };
}
