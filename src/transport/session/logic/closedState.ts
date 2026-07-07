import { StateMachineLogicEntryBase } from "@src/utils/stateMachine";
import { SessionSMTypes } from "@src/transport/session/sessionMeta";
import { Session } from "@src/transport/session/session";

export class ClosedState extends StateMachineLogicEntryBase<
  SessionSMTypes["Config"]
> {
  constructor(private session: Session) {
    super();
  }

  onEnter = () => {
    this.session.transceiverIPv4.__deleteSessionFormMap(
      this.session.address,
      this.session.port
    );
  };
}
