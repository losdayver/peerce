import { StateMachineLogicEntryBase } from "@src/utils/stateMachine";
import { SessionSMTypes } from "@src/transport/session/sessionMeta";
import { Session } from "@src/transport/session/session";
import { MessageBuffer, MessageType } from "@src/transport/messageBuffer";

export class ClosingState extends StateMachineLogicEntryBase<
  SessionSMTypes["Config"]
> {
  constructor(private session: Session) {
    super();
  }

  onEnter = async () => {
    // todo send a couple of them
    const [msg] = MessageBuffer.construct({ type: MessageType.FIN });
    this.session.transceiverIPv4.__send(
      this.session.address,
      this.session.port,
      msg
    );
    await this.session.stateMachine.doStateTransition("closed");
  };
}
