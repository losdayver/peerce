import { StateMachine } from "@src/utils/stateMachine";
import { Message, MessageBuffer, MessageType } from "../messageBuffer";
import { TransceiverIPv4 } from "../transceiver";
import {
  ClosedState,
  ClosingState,
  ConnectedState,
  ConnectingState,
  SessionStateMachine,
  SessionStateMachineConfig,
  SessionStateMachineLogic,
  sessionStateTransitionMap,
} from "./state";

export class Session {
  constructor(
    public transceiverIPv4: TransceiverIPv4,
    public address: string,
    public port: number
  ) {
    this.stateMachine = new StateMachine<SessionStateMachineConfig>(
      "idle",
      sessionStateTransitionMap,
      this.sessionStateLogic
    );
  }

  stateMachine: SessionStateMachine;

  private sessionStateLogic: SessionStateMachineLogic = {
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
    this.stateMachine.fireLogicHandler(msg);
  }

  connect() {
    this.stateMachine.doStateTransition("connecting");
  }

  close() {
    this.stateMachine.doStateTransition("closing");
  }
}
