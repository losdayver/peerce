import { TransceiverIPv4 } from "@src/transport/transceiver";
import {
  PeerToPeerMessageDescriptor,
  PeerToPeerSessionRequest,
  SimpleProtocolConfig,
  SimpleProtocolPeerConfig,
} from "@src/simple/simpleProtocol";
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
import {
  ConnectedToPeer,
  ConnectedToPeerLogicHandler,
} from "./logic/connectedToPeer";
import { EventEmitter } from "node:stream";

interface SimplePeerEventEmitterMap {
  onConnectedToPeer: [sessionRequest: PeerToPeerSessionRequest];
  onFullMessage: [{ buffer: Buffer; fileName: string }];
}

export class SimplePeer {
  transceiver: TransceiverIPv4;
  stateMachine: SimplePeerStateMachine;
  initialParams: Required<SimpleProtocolPeerConfig>;
  eventEmitter = new EventEmitter<SimplePeerEventEmitterMap>();

  constructor(initialParams: Required<SimpleProtocolPeerConfig>) {
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

  sendData = ({ fileName, payload }: PeerToPeerMessageDescriptor) => {
    if (this.stateMachine.currentState !== "connectedToPeer")
      throw new Error(`Cannot send data on ${this.stateMachine.currentState}`);
    (this.stateMachine.fireLogicHandler as ConnectedToPeerLogicHandler)({
      fileName,
      payload,
    });
  };

  // todo send method
}
