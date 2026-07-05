import { writeFileSync } from "node:fs";
import { TransceiverIPv4 } from "@src/transport/transceiver";
import {
  PeerToPeerSessionRequest,
  SimpleProtocolClientConfig,
} from "../simpleProtocol";
import { getResolver, sleep } from "@src/utils/promiseUtils";
import { StateMachine } from "@src/utils/stateMachine";
import {
  SimplePeerStateMachine,
  SimplePeerStateMachineConfig,
  SimplePeerStateMachineLogic,
  simplePeerStateTransitionMap,
} from "./stateMeta";
import { ConnectingToRelay } from "./logic/connectingToRelay";
import { ConnectingToPeer } from "./logic/connectingToPeer";
import { ConnectedToPeer } from "./logic/connectedToPeer";

export class SimplePeer {
  transceiver: TransceiverIPv4;
  stateMachine: SimplePeerStateMachine;
  initialParams: Required<SimpleProtocolClientConfig>;

  constructor(initialParams: Required<SimpleProtocolClientConfig>) {
    this.transceiver = new TransceiverIPv4();
    this.stateMachine = new StateMachine<SimplePeerStateMachineConfig>(
      "idle",
      simplePeerStateTransitionMap,
      this.simplePeerStateLogic
    );
    this.initialParams = initialParams;
  }

  simplePeerStateLogic: SimplePeerStateMachineLogic = {
    connectingToRelay: new ConnectingToRelay(this),
    connectingToPeer: new ConnectingToPeer(this),
    connectedToPeer: new ConnectedToPeer(this),
  };

  requestSessionViaRelay = async () => {
    await this.stateMachine.doStateTransition("connectingToRelay");
  };

  /** Awaits PeerToPeerSessionRequest to be sent back from relay */
  private onReceivePeerSessionRequest = async (
    { address, port }: { address: string; port: number },
    msg: Buffer,
    params: Required<SimpleProtocolClientConfig>
  ) => {
    const { distantTag, payload, relayAddr, relayPort } = params;

    // Ignore messages that come NOT from the relay
    if (!(address == relayAddr && port == relayPort)) return;

    const receivedObj = JSON.parse(msg.toString()) as PeerToPeerSessionRequest;

    // Ignore messages that have wrong distantTag
    if (receivedObj.distantTag !== distantTag) return;
    await this.transceiver.connect(
      receivedObj.distantAddress,
      receivedObj.distantPort
    );

    // Await connection from peer
    let { promise: connPromise, resolver: connResolver } = getResolver();
    const listener = (address: string, port: number) => {
      if (
        address == receivedObj.distantAddress &&
        port == receivedObj.distantPort
      )
        connResolver.resolve?.();
    };
    this.transceiver.eventEmitter.addListener("onConnected", listener);
    await connPromise;
    this.transceiver.eventEmitter.removeListener("onConnected", listener);

    // Relay connection is no longer necessary
    this.transceiver.closeSession(relayAddr, relayPort);

    this.transceiver.eventEmitter.addListener(
      "onReceive",
      async ({ address, port }, msg) => {
        if (
          address == receivedObj.distantAddress &&
          port == receivedObj.distantPort
        ) {
          if (!params.outFile) console.log(msg.toString());
          else writeFileSync(params.outFile, msg);
          this.transceiver.eventEmitter.removeAllListeners();
          this.transceiver.closeSession(address, port);

          await sleep(2000);

          this.transceiver.close();
        }
      }
    );

    if (payload)
      this.transceiver.send(
        receivedObj.distantAddress,
        receivedObj.distantPort,
        payload
      );
  };
}
