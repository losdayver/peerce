import {
  TransitionGraph,
  InferStateShifterTypes,
  StateShifterConfig,
} from "state-shifter";

export const simplePeerStateTransitionMap = {
  idle: ["connectingToRelay", "error"] as const,
  connectingToRelay: ["connectingToPeer", "error"] as const,
  connectingToPeer: ["connectedToPeer", "error"] as const,
  connectedToPeer: ["closing", "error"] as const,
  closing: ["closed", "error"] as const,
  closed: [] as const,
  error: [] as const,
} satisfies TransitionGraph;

export type SimplePeerStateShifterConfig = StateShifterConfig<
  typeof simplePeerStateTransitionMap,
  (params: any) => void
>;

export type SimplePeerStateShifter =
  InferStateShifterTypes<SimplePeerStateShifterConfig>["StateShifter"];
export type SimplePeerStateShifterBehaviors =
  InferStateShifterTypes<SimplePeerStateShifterConfig>["Behaviors"];
export type AvailableStateKeys =
  InferStateShifterTypes<SimplePeerStateShifterConfig>["TransitionGraph"];
