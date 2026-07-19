import {
  AvailableTransitionsMap,
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
} satisfies AvailableTransitionsMap;

export const enum SessionLogicHandlerAction {
  MESSAGE = 1,
  SEND_DATA = 2,
}

type SessionLogicHandlerPairs =
  | {
      action: SessionLogicHandlerAction.MESSAGE;
      payload: Message;
    }
  | {
      action: SessionLogicHandlerAction.SEND_DATA;
      payload: string | Buffer;
    };

type SessionSMConfig = StateMachineConfig<
  typeof sessionStateTransitionMap,
  (params: SessionLogicHandlerPairs) => void
>;

export type SessionSMTypes = InferStateMachineTypes<SessionSMConfig>;
