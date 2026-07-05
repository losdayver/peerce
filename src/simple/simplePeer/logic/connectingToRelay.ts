import { StateMachineLogicEntryBase } from "@src/utils/stateMachine";
import { SimplePeerStateMachineConfig } from "@src/simple/simplePeer/stateMeta";
import { SimplePeer } from "@src/simple/simplePeer/simplePeer";
import { getResolver } from "@src/utils/promiseUtils";
import { AnsiColor, logInfo } from "@src/utils/logUtils";

export class ConnectingToRelay extends StateMachineLogicEntryBase<SimplePeerStateMachineConfig> {
  simplePeer: SimplePeer;

  constructor(simplePeer: SimplePeer) {
    super();
    this.simplePeer = simplePeer;
  }

  onEnter = async () => {
    const { initialParams, transceiver, stateMachine } = this.simplePeer;
    const { relayAddr, relayPort } = initialParams;

    logInfo("firing socket");

    await transceiver.listen();

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

    await stateMachine.doStateTransition("connectingToPeer");
  };
  logicHandler = () => {};
  onExit = () => {};
}
