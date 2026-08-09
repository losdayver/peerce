import { EventEmitter, once } from "node:stream";
import { DataMessage, Message, MessageBuffer } from "../messageBuffer";
import { TransceiverIPv4 } from "../transceiver";
import { ClosedBehavior } from "./behaviors/closed";
import { ClosingBehavior } from "./behaviors/closing";
import { ConnectedBehavior } from "./behaviors/connected";
import { ConnectingBehavior } from "./behaviors/connecting";
import {
  SessionStateEventAction,
  SessionSMTypes,
  sessionStateTransitionMap,
  SessionEventMap,
} from "./sessionMeta";
import { StateShifter } from "state-shifter";

export class Session extends EventEmitter<SessionEventMap> {
  constructor(
    public transceiverIPv4: TransceiverIPv4,
    public address: string,
    public port: number
  ) {
    super();
    this.stateMachine = new StateShifter<SessionSMTypes["Config"]>(
      "idle",
      sessionStateTransitionMap,
      this.sessionStateBehaviors
    );
  }

  stateMachine: SessionSMTypes["StateShifter"];
  private closePromise: Promise<void> | undefined;

  isConnected = () => this.stateMachine.getCurrentState() === "connected";

  private sessionStateBehaviors: SessionSMTypes["Behaviors"] = {
    connecting: new ConnectingBehavior(this),
    connected: new ConnectedBehavior(this),
    closing: new ClosingBehavior(this),
    closed: new ClosedBehavior(this),
  };

  sendOne(message: Message) {
    this.transceiverIPv4.sendDatagram(
      this.address,
      this.port,
      MessageBuffer.construct(message).buffers[0]
    );
  }

  async sendData(raw: string | Buffer) {
    if (this.stateMachine.getCurrentState() != "connected")
      throw new Error("Cannot send while not connected");
    let resolve: () => void;
    const promise = new Promise<void>((res) => (resolve = res));
    const callback = (transmittedUid: DataMessage["uid"]) => {
      if (uid != transmittedUid) return;
      this.off("transmitted", callback);
      resolve();
    };
    this.on("transmitted", callback);
    const uid = this.stateMachine.dispatchEvent({
      action: SessionStateEventAction.SEND_DATA,
      payload: raw,
    }) as unknown as DataMessage["uid"];
    return await promise;
  }

  handleMessage(message: Message) {
    if (!message) return;
    this.stateMachine.dispatchEvent({
      action: SessionStateEventAction.MESSAGE,
      payload: message,
    });
  }

  connect = () => {
    void this.stateMachine.shiftTo("connecting");
  };

  connectAsync = async () => {
    void this.stateMachine.shiftTo("connecting");
    await Promise.race([
      once(this, "connected"),
      once(this, "closed"),
      once(this, "error"),
    ]);
  };

  close = () => this.closeAsync();

  closeAsync = () => {
    this.closePromise ??= this.performClose();
    return this.closePromise;
  };

  private performClose = async () => {
    const state = this.stateMachine.getCurrentState();
    if (state === "closed" || state === "error") return;

    const closedPromise = once(this, "closed");
    if (state !== "closing") await this.stateMachine.shiftTo("closing");
    await closedPromise;
  };
}
