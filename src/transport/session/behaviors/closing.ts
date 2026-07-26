import { SessionSMTypes } from "../sessionMeta";
import { Session } from "../session";
import { MessageBuffer, MessageType } from "../../messageBuffer";
import { StateShifterBehaviorBase } from "state-shifter";
import { sleep } from "../../../utils/promiseUtils";

export class ClosingBehavior extends StateShifterBehaviorBase<
  SessionSMTypes["Config"]
> {
  constructor(private session: Session) {
    super();
  }

  onEnter = async () => {
    this.session.emit("closing");
    for (let i = 0; i < 5; i++) {
      const {
        buffers: [msg],
      } = MessageBuffer.construct({ type: MessageType.FIN });
      this.session.transceiverIPv4.sendDatagram(
        this.session.address,
        this.session.port,
        msg
      );
      await sleep(1);
    }
    await this.session.stateMachine.shiftTo("closed");
  };
}
