import { EventEmitter } from "node:stream";

export const getResolver = () => {
  let resolver: { resolve: (() => void) | undefined } = { resolve: undefined };
  const promise = new Promise((res) => {
    resolver.resolve = () => res(true);
  });
  return { promise, resolver };
};

export const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

export const once = <T>(emitter: EventEmitter, event: string) =>
  new Promise<T>((resolve) => {
    const listener = (payload: T) => {
      emitter.off(event, listener);
      resolve(payload);
    };
    emitter.on(event, listener);
  });
