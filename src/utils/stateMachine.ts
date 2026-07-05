type StateKeyType = string;

export type StateMachineConfig<
  ATM extends AvailableTransitionsMap = AvailableTransitionsMap,
  HandlerType extends Function = (...args) => void,
> = {
  atm: ATM;
  handler: HandlerType;
};

export type StateMachineLogicEntry<Config extends StateMachineConfig> = {
  onEnter?: (
    from: keyof Config["atm"] | null,
    params?: any
  ) => void | Promise<void>; // null is for initial state enter
  onExit?: (to: keyof Config["atm"]) => void | Promise<void>;
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
  abstract logicHandler?: Config["handler"];
  abstract onEnter?: (
    from: keyof Config["atm"] | null,
    params?: any
  ) => void | Promise<void>;
  abstract onExit?: (to: keyof Config["atm"]) => void | Promise<void>;
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
    void this.logic[this.currentState]?.onEnter?.(null);
  }

  fireLogicHandler(...args: Parameters<Config["handler"]>) {
    const handler = this.logic[this.currentState]?.logicHandler;
    if (handler) return handler(...args);
  }

  canTransition(from: keyof Config["atm"], to: keyof Config["atm"]) {
    return this.transitions[from].includes(to as string);
  }

  async doStateTransition<Params = unknown, ReturnT = unknown>(
    to: keyof Config["atm"],
    params?: Params
  ) {
    // console.info(
    //   `transitioning: from "${String(this.currentState)}" => "${String(to)}"`
    // );

    if (this.currentState == to) return;
    if (!this.canTransition(this.currentState, to)) {
      throw new Error(
        `Invalid state transition: ${String(this.currentState)} → ${String(to)}`
      );
    }

    await this.logic[this.currentState]?.onExit?.(to);
    const bufferState = this.currentState;
    this.currentState = to;
    return (await this.logic[to]?.onEnter?.(bufferState, params)) as ReturnT;
  }
}
