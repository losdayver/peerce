import {
  AvailableTransitionsMap,
  StateMachine,
  StateMachineConfig,
  StateMachineLogic,
} from "../../utils/stateMachine";

export const simplePeerStateTransitionMap = {
  idle: ["connectingToRelay", "error"] as const,
  connectingToRelay: ["connectingToPeer", "error"] as const,
  connectingToPeer: ["connectedToPeer", "error"] as const,
  connectedToPeer: ["closing", "error"] as const,
  closing: ["closed", "error"] as const,
  closed: [] as const,
  error: [] as const,
} satisfies AvailableTransitionsMap;

export type SimplePeerStateMachineConfig = StateMachineConfig<
  typeof simplePeerStateTransitionMap,
  (params: any) => void
>;

export type SimplePeerStateMachine = StateMachine<SimplePeerStateMachineConfig>;
export type SimplePeerStateMachineLogic =
  StateMachineLogic<SimplePeerStateMachineConfig>;
export type AvailableStateKeys = keyof SimplePeerStateMachineConfig["atm"];
