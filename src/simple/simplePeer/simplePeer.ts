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

export type ClosingReason =
  | "RELAY_UNAVAILABLE"
  | "RELAY_CLOSE"
  | "DISTANT_CLOSE"
  | "SELF_CLOSE";

interface SimplePeerEventEmitterMap {
  onConnectedToRelay: [];
  onConnectedToPeer: [sessionRequest: PeerToPeerSessionRequest];
  onIncomingTransmissionStart: [fileName: string];
  onIncomingTransmissionPercentageChange: [
    fileName: string,
    percentage: number,
  ];
  onFullMessage: [{ buffer: Buffer; fileName: string }];
  onClosing: [reason: ClosingReason];
}

export class SimplePeer extends EventEmitter<SimplePeerEventEmitterMap> {
  transceiver: TransceiverIPv4;
  stateMachine: SimplePeerStateShifter;
  initialParams: Required<SimpleProtocolPeerConfig>;
  public __prematureClosePromise: Promise<"PREMATURE_CLOSE">;
  public __prematureCloseCallback: () => void;
  private closePromise: Promise<void> | undefined;

  constructor(initialParams: SimpleProtocolPeerConfig) {
    super();
    this.__prematureCloseCallback = null as any;
    this.__prematureClosePromise = new Promise((res) => {
      this.__prematureCloseCallback = () => res("PREMATURE_CLOSE");
    });
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

  createOutgoingTransmission = ({
    fileName,
    payload,
  }: PeerToPeerMessageDescriptor) => {
    if (this.stateMachine.getCurrentState() !== "connectedToPeer")
      throw new Error(
        `Cannot send data on ${this.stateMachine.getCurrentState()}`
      );
    (this.stateMachine.dispatchEvent as ConnectedToPeerEventHandler)({
      fileName,
      payload,
    });
  };

  close = (): Promise<void> => {
    if (this.closePromise) return this.closePromise;

    const state = this.stateMachine.getCurrentState();
    if (state === "closed" || state === "error") return Promise.resolve();
    if (state === "closing") {
      this.closePromise = this.transceiver.close();
      return this.closePromise;
    }

    let resolveClose: (() => void) | undefined;
    let rejectClose: ((reason?: unknown) => void) | undefined;
    this.closePromise = new Promise<void>((resolve, reject) => {
      resolveClose = resolve;
      rejectClose = reject;
    });

    this.__prematureCloseCallback();
    this.emit("onClosing", "SELF_CLOSE");
    void this.stateMachine
      .shiftTo("closing")
      .then(resolveClose, rejectClose);

    return this.closePromise;
  };
}
