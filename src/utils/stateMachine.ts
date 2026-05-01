type StateKeyType = string;

export type AvailableTransitionsMap = Record<StateKeyType, StateKeyType[]>;
export type StateMachineLogic<
  ATM extends AvailableTransitionsMap,
  HandlerType extends Function = never,
  MasterType extends object = never,
> = {
  [K in keyof ATM]?: {
    onEnter?: (from: keyof ATM | null, master?: MasterType) => void; // null is for initial state enter
    onExit?: (to: keyof ATM, master?: MasterType) => void;
    logicHandler?: HandlerType;
    [SK: string]: any;
  };
};

export class StateMachine<
  ATM extends AvailableTransitionsMap,
  HandlerType extends (...args: any) => any = never,
  MasterType extends object = never,
> {
  public currentState: keyof ATM;

  constructor(
    initialState: keyof ATM,
    private transitions: ATM,
    private logic: StateMachineLogic<ATM, HandlerType, MasterType>,
    private master?: MasterType // origin instance
  ) {
    this.currentState = initialState;
    this.transitions = transitions;
    this.logic = logic;
    this.logic[this.currentState]?.onEnter?.(null);
  }

  fireLogicHandler(...args: Parameters<HandlerType>) {
    const handler = this.logic[this.currentState]?.logicHandler;
    if (handler) return handler(...args);
  }

  canTransition(from: keyof ATM, to: keyof ATM) {
    return this.transitions[from].includes(to as string);
  }

  doStateTransition(to: keyof ATM) {
    console.info(
      `transitioning ${(this.master as any)?.constructor?.name ?? ""}: from "${String(this.currentState)}" => "${String(to)}"`
    );

    if (this.currentState == to) return;
    if (!this.canTransition(this.currentState, to)) {
      throw new Error(
        `Invalid state transition: ${String(this.currentState)} → ${String(to)}`
      );
    }

    this.logic[this.currentState]?.onExit?.(to, this.master);
    const bufferState = this.currentState;
    this.currentState = to;
    this.logic[to]?.onEnter?.(bufferState, this.master);
  }
}
