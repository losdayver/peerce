import { EventEmitter } from "node:stream";
import { setTimeout as nodeSleep } from "node:timers/promises";

export const getResolver = () => {
  let resolver: { resolve: (() => void) | undefined } = { resolve: undefined };
  const promise = new Promise((res) => {
    resolver.resolve = () => res(true);
  });
  return { promise, resolver };
};

export const sleep = (ms: number) => nodeSleep(ms);

export const once = <T>(emitter: EventEmitter, event: string) =>
  new Promise<T>((resolve) => {
    const listener = (payload: T) => {
      emitter.off(event, listener);
      resolve(payload);
    };
    emitter.on(event, listener);
  });
