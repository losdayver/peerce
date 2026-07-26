import { EventEmitter, once } from "node:stream";
import { Message, MessageBuffer } from "../messageBuffer";
import { TransceiverIPv4 } from "../transceiver";
import { ClosedBehavior } from "./behaviors/closed";
import { ClosingBehavior } from "./behaviors/closing";
import { ConnectedBehavior } from "./behaviors/connected";
import { ConnectingBehavior } from "./behaviors/connecting";
import {
  SessionStateEventAction,
  SessionSMTypes,
  sessionStateTransitionMap,
  SessionEventMap,
} from "./sessionMeta";
import { StateShifter } from "state-shifter";

export class Session extends EventEmitter<SessionEventMap> {
  constructor(
    public transceiverIPv4: TransceiverIPv4,
    public address: string,
    public port: number
  ) {
    super();
    this.stateMachine = new StateShifter<SessionSMTypes["Config"]>(
      "idle",
      sessionStateTransitionMap,
      this.sessionStateBehaviors
    );
  }

  stateMachine: SessionSMTypes["StateShifter"];

  private sessionStateBehaviors: SessionSMTypes["Behaviors"] = {
    connecting: new ConnectingBehavior(this),
    connected: new ConnectedBehavior(this),
    closing: new ClosingBehavior(this),
    closed: new ClosedBehavior(this),
  };

  sendOne(message: Message) {
    this.transceiverIPv4.__send(
      this.address,
      this.port,
      MessageBuffer.construct(message).buffers[0]
    );
  }

  sendData(raw: string | Buffer) {
    if (this.stateMachine.getCurrentState() != "connected")
      throw new Error("Cannot send while not connected");
    this.stateMachine.dispatchEvent({
      action: SessionStateEventAction.SEND_DATA,
      payload: raw,
    });
  }

  handleMessage(message: Message) {
    if (!message) return;
    this.stateMachine.dispatchEvent({
      action: SessionStateEventAction.MESSAGE,
      payload: message,
    });
  }

  connect = () => {
    void this.stateMachine.shiftTo("connecting");
  };

  connectAsync = async () => {
    void this.stateMachine.shiftTo("connecting");
    await Promise.race([
      once(this, "connected"),
      once(this, "closed"),
      once(this, "error"),
    ]);
  };

  close = () => {
    void this.stateMachine.shiftTo("closing");
  };

  closeAsync = async () => {
    void this.stateMachine.shiftTo("closing");
    await once(this, "closed");
  };
}
