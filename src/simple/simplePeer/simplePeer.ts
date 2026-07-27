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
import { EventEmitter } from "node:stream";
import { StateShifter } from "state-shifter";
import { ConnectingToRelay } from "./behaviors/connectingToRelay";
import { ConnectingToPeer } from "./behaviors/connectingToPeer";
import {
  ConnectedToPeer,
  ConnectedToPeerEventHandler,
} from "./behaviors/connectedToPeer";
import { Closing } from "./behaviors/closing";

interface SimplePeerEventEmitterMap {
  onConnectedToRelay: [];
  onConnectedToPeer: [sessionRequest: PeerToPeerSessionRequest];
  onIncomingTransmissionStart: [fileName: string];
  onIncomingTransmissionPercentageChange: [
    fileName: string,
    percentage: number,
  ];
  onFullMessage: [{ buffer: Buffer; fileName: string }];
}

export class SimplePeer extends EventEmitter<SimplePeerEventEmitterMap> {
  transceiver: TransceiverIPv4;
  stateMachine: SimplePeerStateShifter;
  initialParams: Required<SimpleProtocolPeerConfig>;

  constructor(initialParams: SimpleProtocolPeerConfig) {
    super();
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

  requestSessionViaRelayAsync = async () => {
    const sessionPromise = once<PeerToPeerSessionRequest>(
      this,
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
