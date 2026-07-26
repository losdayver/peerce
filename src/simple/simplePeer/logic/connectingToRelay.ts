import { SimplePeerStateShifterConfig } from "../stateMeta";
import { SimplePeer } from "../simplePeer";
import { getResolver } from "../../../utils/promiseUtils";
import { logInfo } from "../../../utils/logUtils";
import { TransceiverIPv4Params } from "../../../transport/transceiver";
import { StateShifterBehaviorBase } from "state-shifter";

export class ConnectingToRelay extends StateShifterBehaviorBase<SimplePeerStateShifterConfig> {
  simplePeer: SimplePeer;

  constructor(simplePeer: SimplePeer) {
    super();
    this.simplePeer = simplePeer;
  }

  onEnter = async () => {
    const { initialParams, transceiver, stateMachine } = this.simplePeer;
    const { relayAddr, relayPort, selfAddr, selfPort } = initialParams;

    logInfo("firing socket");

    let selfObj: TransceiverIPv4Params["self"] | undefined = undefined;
    if (selfAddr && selfPort) selfObj = { address: selfAddr, port: selfPort };
    await transceiver.listen(selfObj);

    logInfo(`connecting to relay ${relayAddr}:${relayPort}`);
    transceiver.connect(relayAddr, relayPort);

    let { promise: connPromise, resolver: connResolver } = getResolver();
    const listener = (address: string, port: number) => {
      if (address == relayAddr && relayPort == port) connResolver.resolve?.();
    };
    transceiver.eventEmitter.addListener("onConnected", listener);
    await connPromise;

    logInfo(`connected to relay ${relayAddr}:${relayPort}`);

    transceiver.eventEmitter.removeListener("onConnected", listener);

    await stateMachine.shiftTo("connectingToPeer");
  };
}
