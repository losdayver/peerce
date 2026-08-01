# peerce 🧪🚧

Experimental peer-to-peer data transfer for Node.js over UDP, with NAT hole punching and a coordination relay.

> 🚨⚠️🚧 **PRE-RELEASE SOFTWARE** 🚧⚠️🚨
>
> 🔥 The API and wire protocol may change without migration support.  
> 🔓 Traffic is not encrypted or authenticated.  
> 🌐 NAT traversal is not guaranteed on every network.  
> 💥 Disconnect recovery and delivery guarantees are still evolving.  
> 🧯 Do not use this package for production systems or sensitive data yet.

## Install

After publication, pre-release versions will be available under the `next` tag:

```bash
npm install peerce@next
```

## Quick start

Start a coordination relay:

```bash
npx peerce-relay --relayAddr 0.0.0.0 --selfPort 5555
```

Connect two peers with unique tags and ports:

```ts
import { SimplePeer } from "peerce";

const peer = new SimplePeer({
  selfTag: "alice",
  distantTag: "bob",
  relayAddr: "127.0.0.1",
  relayPort: 5555,
  selfAddr: "0.0.0.0",
  selfPort: 5556,
});

peer.on("onFullMessage", ({ fileName, buffer }) => {
  console.log(`received ${fileName}: ${buffer.length} bytes`);
});

await peer.requestSessionViaRelayAsync();
peer.createOutgoingTransmission({
  fileName: "hello.txt",
  payload: Buffer.from("hello"),
});

// Always release the UDP socket during shutdown.
await peer.close();
```

The other peer must use the reverse tags (`bob` → `alice`) and a different `selfPort`.

## Status

`0.2.0-alpha.0` is intended for experiments, feedback, and protocol development only. 🧪⚠️

## License

MIT
