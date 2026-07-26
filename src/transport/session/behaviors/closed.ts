import { SessionSMTypes } from "../sessionMeta";
import { Session } from "../session";
import { StateShifterBehaviorBase } from "state-shifter";

export class ClosedBehavior extends StateShifterBehaviorBase<
  SessionSMTypes["Config"]
> {
  constructor(private session: Session) {
    super();
  }

  onEnter = () => {
    this.session.emit("closed");
  };
}
