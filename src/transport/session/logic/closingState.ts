import { StateMachineLogicEntryBase } from "../../../utils/stateMachine";
import { SessionSMTypes } from "../sessionMeta";
import { Session } from "../session";
import { MessageBuffer, MessageType } from "../../messageBuffer";

export class ClosingState extends StateMachineLogicEntryBase<
  SessionSMTypes["Config"]
> {
  constructor(private session: Session) {
    super();
  }

  onEnter = async () => {
    // todo send a couple of them
    const {
      buffers: [msg],
    } = MessageBuffer.construct({ type: MessageType.FIN });
    this.session.transceiverIPv4.__send(
      this.session.address,
      this.session.port,
      msg
    );
    await this.session.stateMachine.doStateTransition("closed");
  };
}
