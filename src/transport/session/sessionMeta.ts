import {
  TransitionGraph,
  InferStateMachineTypes,
  StateMachineConfig,
} from "../../utils/stateMachine";
import { Message } from "../messageBuffer";

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

type SessionSMConfig = StateMachineConfig<
  typeof sessionStateTransitionMap,
  (params: SessionStateEvent) => void
>;

export type SessionSMTypes = InferStateMachineTypes<SessionSMConfig>;
