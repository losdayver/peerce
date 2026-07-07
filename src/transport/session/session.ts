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
      MessageBuffer.construct(message)[0]
    );
  }

  sendData(msg: string | Buffer) {
    const msgs = MessageBuffer.construct({
      type: MessageType.DATA,
      payload: typeof msg == "string" ? Buffer.from(msg) : msg,
    });

    // todo continuous sender. maybe put the logic into ConnectedState
    for (const msg of msgs) {
      this.transceiverIPv4.__send(this.address, this.port, msg);
    }
  }

  handleMessage(msg?: Message | null) {
    if (!msg) return;
    this.stateMachine.fireLogicHandler({
      action: SessionLogicHandlerAction.MESSAGE,
      payload: msg,
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
