type StateKeyType = string;

export type AvailableTransitionsMap = Record<StateKeyType, StateKeyType[]>;
export type StateMachineLogic<ATM extends AvailableTransitionsMap> = {
  [K in keyof ATM]?: {
    onEnter?: (from: keyof ATM | null) => void; // null is for initial state enter
    onExit?: (from: keyof ATM) => void;
  };
};

export class StateMachine<ATM extends AvailableTransitionsMap> {
  private currentState: keyof ATM;
  private logic: StateMachineLogic<ATM>;
  private transitions: ATM;

  constructor(
    initialState: keyof ATM,
    transitions: ATM,
    logic: StateMachineLogic<ATM>
  ) {
    this.currentState = initialState;
    this.transitions = transitions;
    this.logic = logic;
    this.logic[this.currentState]?.onEnter?.(null);
  }

  canTransition(from: keyof ATM, to: keyof ATM) {
    return this.transitions[from].includes(to as string);
  }

  doStateTransition(to: keyof ATM) {
    if (!this.canTransition(this.currentState, to)) {
      throw new Error(
        `Invalid state transition: ${String(this.currentState)} → ${String(to)}`
      );
    }

    this.logic[this.currentState]?.onExit?.(this.currentState);
    const bufferState = this.currentState;
    this.currentState = to;
    this.logic[to]?.onEnter?.(bufferState);
  }
}
