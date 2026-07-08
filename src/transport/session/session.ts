import { StateMachine } from "@src/utils/stateMachine";
import {
  Message,
  MessageBuffer,
  MessageType,
} from "@src/transport/messageBuffer";
import { TransceiverIPv4 } from "@src/transport/transceiver";
import {
  SessionLogicHandlerAction,
  SessionSMTypes,
  sessionStateTransitionMap,
} from "@src/transport/session/sessionMeta";
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
      this.sessionStateLogic
    );
  }

  stateMachine: SessionSMTypes["StateMachine"];

  private sessionStateLogic: SessionSMTypes["Logic"] = {
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
    if (this.stateMachine.currentState != "connected")
      throw new Error("Cannot send while not connected");
    this.stateMachine.fireLogicHandler({
      action: SessionLogicHandlerAction.SEND_DATA,
      payload: raw,
    });
  }

  handleMessage(message: Message) {
    if (!message) return;
    this.stateMachine.fireLogicHandler({
      action: SessionLogicHandlerAction.MESSAGE,
      payload: message,
    });
  }

  connect = () => {
    void this.stateMachine.doStateTransition("connecting");
    // todo await for connection event
  };

  close = () => {
    void this.stateMachine.doStateTransition("closing");
    // todo await for closed event
  };
}
