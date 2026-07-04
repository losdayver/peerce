export const getResolver = () => {
  let resolver: { resolve: (() => void) | undefined } = { resolve: undefined };
  const promise = new Promise((res) => {
    resolver.resolve = () => res(true);
  });
  return { promise, resolver };
};
