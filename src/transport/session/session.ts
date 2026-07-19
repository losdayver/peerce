import { StateMachine } from "../../utils/stateMachine";
import { Message, MessageBuffer, MessageType } from "../messageBuffer";
import { TransceiverIPv4 } from "../transceiver";
import {
  SessionStateEventAction,
  SessionSMTypes,
  sessionStateTransitionMap,
} from "./sessionMeta";
import { ConnectingState } from "./logic/connectingState";
import { ConnectedState } from "./logic/connectedState";
import { ClosingState } from "./logic/closingState";
import { ClosedState } from "./logic/closedState";

export class Session {
  constructor(
    public transceiverIPv4: TransceiverIPv4,
    public address: string,
    public port: number
  ) {
    this.stateMachine = new StateMachine<SessionSMTypes["Config"]>(
      "idle",
      sessionStateTransitionMap,
      this.sessionStateBehaviors
    );
  }

  stateMachine: SessionSMTypes["StateMachine"];

  private sessionStateBehaviors: SessionSMTypes["Behaviors"] = {
    connecting: new ConnectingState(this),
    connected: new ConnectedState(this),
    closing: new ClosingState(this),
    closed: new ClosedState(this),
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
    void this.stateMachine.transitionTo("connecting");
    // todo await for connection event
  };

  close = () => {
    void this.stateMachine.transitionTo("closing");
    // todo await for closed event
  };
}
