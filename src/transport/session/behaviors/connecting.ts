import { StateShifterBehaviorBase } from "state-shifter";
import { MessageType } from "../../messageBuffer";
import { Session } from "../session";
import { SessionStateEventAction, SessionSMTypes } from "../sessionMeta";

export class ConnectingBehavior extends StateShifterBehaviorBase<
  SessionSMTypes["Config"]
> {
  private retriesInterval?: NodeJS.Timeout;
  private retriesNumSeconds = 0.3;

  constructor(private session: Session) {
    super();
  }

  onEnter = () => {
    this.session.emit("connecting");
    let retries = 10;
    clearInterval(this.retriesInterval);
    this.retriesInterval = setInterval(() => {
      this.session.sendOne({ type: MessageType.HELLO });
      retries -= 1;
      if (retries <= 0) void this.session.stateMachine.shiftTo("closing");
    }, this.retriesNumSeconds * 1000);
  };

  eventHandler: SessionSMTypes["BehaviorEventHandler"] = ({
    action,
    payload,
  }) => {
    if (action != SessionStateEventAction.MESSAGE) return;
    switch (payload.type) {
      case MessageType.HELLO:
        this.session.sendOne({ type: MessageType.HELLO_ACK });
        return;
      case MessageType.HELLO_ACK:
        this.session.sendOne({ type: MessageType.HELLO_ACK });
        void this.session.stateMachine.shiftTo("connected");
        return;
    }
  };

  onExit = () => {
    clearInterval(this.retriesInterval);
  };
}
