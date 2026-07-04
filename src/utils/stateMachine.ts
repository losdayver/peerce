type StateKeyType = string;

export type StateMachineConfig<
  ATM extends AvailableTransitionsMap = AvailableTransitionsMap,
  HandlerType extends Function = (...args) => void,
> = {
  atm: ATM;
  handler: HandlerType;
};

export type StateMachineLogicEntry<Config extends StateMachineConfig> = {
  onEnter?: (from: keyof Config["atm"] | null) => void; // null is for initial state enter
  onExit?: (to: keyof Config["atm"]) => void;
  logicHandler?: Config["handler"];
  [SK: string]: any;
};
export type AvailableTransitionsMap = Record<StateKeyType, StateKeyType[]>;
export type StateMachineLogic<Config extends StateMachineConfig> = {
  [K in keyof Config["atm"]]?: StateMachineLogicEntry<Config>;
};

export abstract class StateMachineLogicEntryBase<
  Config extends StateMachineConfig,
> implements StateMachineLogicEntry<Config> {
  abstract logicHandler?: Config["handler"] | undefined;
  abstract onEnter?: ((from: keyof Config["atm"] | null) => void) | undefined;
  abstract onExit?: ((to: keyof Config["atm"]) => void) | undefined;
}

export class StateMachine<Config extends StateMachineConfig> {
  public currentState: keyof Config["atm"];

  constructor(
    initialState: keyof Config["atm"],
    private transitions: Config["atm"],
    private logic: StateMachineLogic<Config>
  ) {
    this.currentState = initialState;
    this.transitions = transitions;
    this.logic = logic;
    this.logic[this.currentState]?.onEnter?.(null);
  }

  fireLogicHandler(...args: Parameters<Config["handler"]>) {
    const handler = this.logic[this.currentState]?.logicHandler;
    if (handler) return handler(...args);
  }

  canTransition(from: keyof Config["atm"], to: keyof Config["atm"]) {
    return this.transitions[from].includes(to as string);
  }

  doStateTransition(to: keyof Config["atm"]) {
    // console.info(
    //   `transitioning ${(this.master as any)?.constructor?.name ?? ""}: from "${String(this.currentState)}" => "${String(to)}"`
    // );

    if (this.currentState == to) return;
    if (!this.canTransition(this.currentState, to)) {
      throw new Error(
        `Invalid state transition: ${String(this.currentState)} → ${String(to)}`
      );
    }

    this.logic[this.currentState]?.onExit?.(to);
    const bufferState = this.currentState;
    this.currentState = to;
    this.logic[to]?.onEnter?.(bufferState);
  }
}
