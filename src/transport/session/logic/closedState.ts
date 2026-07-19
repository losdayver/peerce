import { StateMachineBehaviorBase } from "../../../utils/stateMachine";
import { SessionSMTypes } from "../sessionMeta";
import { Session } from "../session";

export class ClosedState extends StateMachineBehaviorBase<
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
