import { TransceiverIPv4 } from "@src/transport/transceiver";
import {
  PeerToPeerSessionRequest,
  SimpleProtocolClientConfig,
} from "../simpleProtocol";
import { once } from "@src/utils/promiseUtils";
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
import { EventEmitter } from "node:stream";

interface SimplePeerEventEmitterMap {
  onConnectedToPeer: [sessionRequest: PeerToPeerSessionRequest];
}

export class SimplePeer {
  transceiver: TransceiverIPv4;
  stateMachine: SimplePeerStateMachine;
  initialParams: Required<SimpleProtocolClientConfig>;
  eventEmitter = new EventEmitter<SimplePeerEventEmitterMap>();

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
    const sessionPromise = once<PeerToPeerSessionRequest>(
      this.eventEmitter,
      "onConnectedToPeer"
    );
    await this.stateMachine.doStateTransition("connectingToRelay");
    return await sessionPromise;
  };

  // todo send method
}
