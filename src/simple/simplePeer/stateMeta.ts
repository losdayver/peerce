import {
  TransitionGraph,
  InferStateMachineTypes,
  StateMachineConfig,
} from "../../utils/stateMachine";

export const simplePeerStateTransitionMap = {
  idle: ["connectingToRelay", "error"] as const,
  connectingToRelay: ["connectingToPeer", "error"] as const,
  connectingToPeer: ["connectedToPeer", "error"] as const,
  connectedToPeer: ["closing", "error"] as const,
  closing: ["closed", "error"] as const,
  closed: [] as const,
  error: [] as const,
} satisfies TransitionGraph;

export type SimplePeerStateMachineConfig = StateMachineConfig<
  typeof simplePeerStateTransitionMap,
  (params: any) => void
>;

export type SimplePeerStateMachine =
  InferStateMachineTypes<SimplePeerStateMachineConfig>["StateMachine"];
export type SimplePeerStateMachineBehaviors =
  InferStateMachineTypes<SimplePeerStateMachineConfig>["Behaviors"];
export type AvailableStateKeys =
  InferStateMachineTypes<SimplePeerStateMachineConfig>["TransitionGraph"];
