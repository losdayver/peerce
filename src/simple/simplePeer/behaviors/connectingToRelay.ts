import { SimplePeerStateShifterConfig } from "../stateMeta";
import { SimplePeer } from "../simplePeer";
import { getResolver } from "../../../utils/promiseUtils";
import { logInfo } from "../../../utils/logUtils";
import { TransceiverIPv4Params } from "../../../transport/transceiver";
import { StateShifterBehaviorBase } from "state-shifter";

export class ConnectingToRelay extends StateShifterBehaviorBase<SimplePeerStateShifterConfig> {
  constructor(private simplePeer: SimplePeer) {
    super();
  }

  onEnter = async () => {
    const { initialParams, transceiver, stateMachine } = this.simplePeer;
    const { relayAddr, relayPort, selfAddr, selfPort } = initialParams;

    let selfObj: TransceiverIPv4Params["self"] | undefined = undefined;
    if (selfAddr && selfPort) selfObj = { address: selfAddr, port: selfPort };
    await transceiver.listen(selfObj);

    let isConnected = false;
    let { promise: connPromise, resolver: connResolver } = getResolver();
    const connectedListener = (address: string, port: number) => {
      isConnected = true;
      if (address == relayAddr && relayPort == port) connResolver.resolve?.();
    };
    const disconnectedListener = (address: string, port: number) => {
      if (address == relayAddr && relayPort == port) connResolver.resolve?.();
    };
    transceiver.once("onConnected", connectedListener);
    transceiver.once("onSessionClosed", disconnectedListener);

    logInfo(`connecting to relay ${relayAddr}:${relayPort}`);
    transceiver.connect(relayAddr, relayPort);
    await connPromise;

    if (!isConnected) {
      this.simplePeer.emit("onClosing", "RELAY_UNAVAILABLE");
      void stateMachine.shiftTo("closing");
      return;
    }

    this.simplePeer.emit("onConnectedToRelay");

    logInfo(`connected to relay ${relayAddr}:${relayPort}`);

    await stateMachine.shiftTo("connectingToPeer");
  };
}
