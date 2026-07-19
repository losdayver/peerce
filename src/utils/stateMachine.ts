type StateKey = string | symbol;

/** Declarations */

type StateMachineBehavior<Config extends StateMachineConfig> = {
  onEnter?: (
    from: keyof Config["transitionGraph"] | null,
    params?: any
  ) => void | Promise<void>; // null is for initial state enter
  onExit?: (to: keyof Config["transitionGraph"]) => void | Promise<void>;
  eventHandler?: Config["behaviorEventHandler"];
  [SK: string]: any;
};

type StateMachineBehaviors<Config extends StateMachineConfig> = {
  [K in keyof Config["transitionGraph"]]?: StateMachineBehavior<Config>;
};

export type StateMachineConfig<
  Transitions extends TransitionGraph = TransitionGraph,
  EventHandler extends (...args: any[]) => unknown = (...args: any[]) => void,
> = {
  transitionGraph: Transitions;
  behaviorEventHandler: EventHandler;
};

export type TransitionGraph = Record<StateKey, readonly StateKey[]>;

export abstract class StateMachineBehaviorBase<
  Config extends StateMachineConfig,
> implements StateMachineBehavior<Config> {
  eventHandler?: Config["behaviorEventHandler"];
  onEnter?: (
    from: keyof Config["transitionGraph"] | null,
    params?: any
  ) => void | Promise<void>;
  onExit?: (to: keyof Config["transitionGraph"]) => void | Promise<void>;
}

/** Use this to construct complex types */
export type InferStateMachineTypes<Config extends StateMachineConfig> = {
  StateMachine: StateMachine<Config>;
  Behaviors: StateMachineBehaviors<Config>;
  Behavior: StateMachineBehavior<Config>;
  BehaviorEventHandler: Config["behaviorEventHandler"];
  TransitionGraph: Config["transitionGraph"];
  Config: Config;
};

/** Implementations */

export class StateMachine<Config extends StateMachineConfig> {
  private currentState: keyof Config["transitionGraph"] | null = null;
  private started = false;

  constructor(
    private initialState: keyof Config["transitionGraph"],
    private transitionGraph: Config["transitionGraph"],
    private behaviors: StateMachineBehaviors<Config>,
    /** Invoke "start" method in constructor */
    implicitStart = true
  ) {
    if (implicitStart) void this.start();
  }

  start = async () => {
    if (this.started) throw new Error("Cannot start twice");
    this.currentState = this.initialState;
    this.started = true;
    await this.behaviors[this.currentState]?.onEnter?.(null);
  };

  getCurrentState = () => this.currentState;

  dispatchEvent(...args: Parameters<Config["behaviorEventHandler"]>) {
    if (this.currentState == null)
      throw new Error("Cannot dispatch event before state machine start");

    const handler = this.behaviors[this.currentState]?.eventHandler;
    if (handler) return handler(...args);
  }

  canTransition(
    from: keyof Config["transitionGraph"] | null,
    to: keyof Config["transitionGraph"]
  ) {
    if (from == null) return false;
    return this.transitionGraph[from].includes(to as StateKey);
  }

  async transitionTo<Params = unknown, ReturnT = unknown>(
    to: keyof Config["transitionGraph"],
    params?: Params
  ) {
    if (this.currentState == null)
      throw new Error("Cannot transition before state machine start");

    if (this.currentState == to) return;
    if (!this.canTransition(this.currentState, to)) {
      throw new Error(
        `Invalid state transition: ${String(this.currentState)} → ${String(to)}`
      );
    }

    await this.behaviors[this.currentState]?.onExit?.(to);
    const previousState = this.currentState;
    this.currentState = to;
    return (await this.behaviors[to]?.onEnter?.(
      previousState,
      params
    )) as ReturnT;
  }
}
