import {
  InferStateShifterTypes,
  StateShifterConfig,
  TransitionGraph,
} from "state-shifter";
import { Message } from "../messageBuffer";

export interface SessionEventMap {
  connecting: [];
  connected: [];
  receive: [message: Buffer];
  closing: [];
  closed: [];
  error: [];
}

export const sessionStateTransitionMap = {
  idle: ["connecting", "error"] as const,
  connecting: ["connected", "closing", "error"] as const,
  connected: ["closing", "error"] as const,
  closing: ["closed", "error"] as const,
  closed: [] as const,
  error: [] as const,
} satisfies TransitionGraph;

export const enum SessionStateEventAction {
  MESSAGE = 1,
  SEND_DATA = 2,
}

type SessionStateEvent =
  | {
      action: SessionStateEventAction.MESSAGE;
      payload: Message;
    }
  | {
      action: SessionStateEventAction.SEND_DATA;
      payload: string | Buffer;
    };

type SessionSMConfig = StateShifterConfig<
  typeof sessionStateTransitionMap,
  (params: SessionStateEvent) => void
>;

export type SessionSMTypes = InferStateShifterTypes<SessionSMConfig>;
