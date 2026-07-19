import { MessageType } from "../../messageBuffer";
import { Session } from "../session";
import { SessionStateEventAction, SessionSMTypes } from "../sessionMeta";
import { StateMachineBehaviorBase } from "../../../utils/stateMachine";

export class ConnectingState extends StateMachineBehaviorBase<
  SessionSMTypes["Config"]
> {
  private retriesInterval?: NodeJS.Timeout;
  private retriesNumSeconds = 0.3;

  constructor(private session: Session) {
    super();
  }

  onEnter = () => {
    let retries = 10;
    clearInterval(this.retriesInterval);
    this.retriesInterval = setInterval(() => {
      this.session.sendOne({ type: MessageType.HELLO });
      retries -= 1;
      if (retries <= 0) void this.session.stateMachine.transitionTo("closing");
    }, this.retriesNumSeconds * 1000);
  };

  eventHandler: SessionSMTypes["BehaviorEventHandler"] = ({ action, payload }) => {
    if (action != SessionStateEventAction.MESSAGE) return;
    switch (payload.type) {
      case MessageType.HELLO:
        this.session.sendOne({ type: MessageType.HELLO_ACK });
        return;
      case MessageType.HELLO_ACK:
        this.session.sendOne({ type: MessageType.HELLO_ACK });
        void this.session.stateMachine.transitionTo("connected");
        return;
    }
  };

  onExit = () => {
    clearInterval(this.retriesInterval);
  };
}
