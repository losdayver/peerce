import { MessageType } from "../../messageBuffer";
import { Session } from "../session";
import {
  SessionLogicHandlerAction,
  SessionSMTypes,
} from "../sessionMeta";
import { StateMachineLogicEntryBase } from "../../../utils/stateMachine";

export class ConnectingState extends StateMachineLogicEntryBase<
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
      if (retries <= 0)
        void this.session.stateMachine.doStateTransition("closing");
    }, this.retriesNumSeconds * 1000);
  };

  logicHandler: SessionSMTypes["LogicHandler"] = ({ action, payload }) => {
    if (action != SessionLogicHandlerAction.MESSAGE) return;
    switch (payload.type) {
      case MessageType.HELLO:
        this.session.sendOne({ type: MessageType.HELLO_ACK });
        return;
      case MessageType.HELLO_ACK:
        this.session.sendOne({ type: MessageType.HELLO_ACK });
        void this.session.stateMachine.doStateTransition("connected");
        return;
    }
  };

  onExit = () => {
    clearInterval(this.retriesInterval);
  };
}
