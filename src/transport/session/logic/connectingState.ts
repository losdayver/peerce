import { MessageType } from "@src/transport/messageBuffer";
import { Session } from "@src/transport/session/session";
import {
  SessionLogicHandlerAction,
  SessionSMTypes,
} from "@src/transport/session/sessionMeta";
import { StateMachineLogicEntryBase } from "@src/utils/stateMachine";

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
