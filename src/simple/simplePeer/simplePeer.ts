import { TransceiverIPv4 } from "../../transport/transceiver";
import {
  PeerToPeerMessageDescriptor,
  PeerToPeerSessionRequest,
  SimpleProtocolConfig,
  SimpleProtocolPeerConfig,
} from "../simpleProtocol";
import { once } from "../../utils/promiseUtils";
import {
  SimplePeerStateShifter,
  SimplePeerStateShifterConfig,
  SimplePeerStateShifterBehaviors,
  simplePeerStateTransitionMap,
} from "./stateMeta";
import { ConnectingToRelay } from "./logic/connectingToRelay";
import { ConnectingToPeer } from "./logic/connectingToPeer";
import {
  ConnectedToPeer,
  ConnectedToPeerEventHandler,
} from "./logic/connectedToPeer";
import { EventEmitter } from "node:stream";
import { Closing } from "./logic/closing";
import { StateShifter } from "state-shifter";

interface SimplePeerEventEmitterMap {
  onConnectedToPeer: [sessionRequest: PeerToPeerSessionRequest];
  onFullMessage: [{ buffer: Buffer; fileName: string }];
}

export class SimplePeer {
  transceiver: TransceiverIPv4;
  stateMachine: SimplePeerStateShifter;
  eventEmitter = new EventEmitter<SimplePeerEventEmitterMap>();
  initialParams: Required<SimpleProtocolPeerConfig>;

  constructor(initialParams: SimpleProtocolPeerConfig) {
    this.transceiver = new TransceiverIPv4();
    this.stateMachine = new StateShifter<SimplePeerStateShifterConfig>(
      "idle",
      simplePeerStateTransitionMap,
      this.simplePeerStateBehaviors
    );
    this.initialParams = initialParams as Required<SimpleProtocolPeerConfig>;
  }

  simplePeerStateBehaviors: SimplePeerStateShifterBehaviors = {
    connectingToRelay: new ConnectingToRelay(this),
    connectingToPeer: new ConnectingToPeer(this),
    connectedToPeer: new ConnectedToPeer(this),
    closing: new Closing(this),
  };

  requestSessionViaRelay = async () => {
    const sessionPromise = once<PeerToPeerSessionRequest>(
      this.eventEmitter,
      "onConnectedToPeer"
    );
    await this.stateMachine.shiftTo("connectingToRelay");
    return await sessionPromise;
  };

  sendData = ({ fileName, payload }: PeerToPeerMessageDescriptor) => {
    if (this.stateMachine.getCurrentState() !== "connectedToPeer")
      throw new Error(
        `Cannot send data on ${this.stateMachine.getCurrentState()}`
      );
    (this.stateMachine.dispatchEvent as ConnectedToPeerEventHandler)({
      fileName,
      payload,
    });
  };

  close = () => {
    void this.stateMachine.shiftTo("closing");
  };
}
