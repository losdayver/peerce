# peerce

Experimental peer-to-peer data transfer for Node.js over UDP, with NAT hole punching and a coordination relay.

> **Pre-release software**
>
> - The API and wire protocol may change without migration support.
> - Optional end-to-end encryption is available, but it is disabled by default.
> - NAT traversal is not guaranteed on every network.
> - Disconnect recovery and delivery guarantees are still evolving.
> - Do not use this package for production systems or sensitive data yet.

## Install

```bash
npm install peerce@latest
```

## Encrypted quick start

### 1. Generate peer keys

Generate a separate persistent X25519 key pair for each peer. This is a one-time operation; reuse the same vault between application restarts.

```bash
npx peerce-keygen --dir ./vault/alice
npx peerce-keygen --dir ./vault/bob
```

The vault contains the local key pairs and a `known-tags.json` file with the public keys previously observed for remote tags. Do not share the private-key files.

### 2. Start the coordination relay

```bash
npx peerce-start-relay --selfAddr 0.0.0.0 --selfPort 5555
```

The relay coordinates peer discovery and NAT hole punching. Encrypted payloads are protected end to end and are not decrypted by the relay.

### 3. Connect a peer

```ts
import { SimplePeer } from "peerce";

const peer = new SimplePeer({
  selfTag: "alice",
  distantTag: "bob",
  relayAddr: "127.0.0.1",
  relayPort: 5555,
  selfAddr: "0.0.0.0",
  selfPort: 5556,
  encrypt: true,
  vaultDir: "./vault/alice",
});

peer.on("onFullMessage", ({ fileName, buffer }) => {
  console.log(`received ${fileName}: ${buffer.length} bytes`);
});

peer.on("onEncryptionNegotiationFailed", () => {
  console.error("The remote peer did not negotiate encryption");
});

peer.on("onPublicKeyMismatch", (tag, knownKey, receivedKey) => {
  console.error(
    `Public key mismatch for ${tag}: expected ${knownKey.fingerprint}, received ${receivedKey.fingerprint}`
  );
});

const session = await peer.requestSessionViaRelayAsync();

if (session) {
  peer.createOutgoingTransmission({
    fileName: "hello.txt",
    payload: Buffer.from("hello"),
  });
}
```

The other peer must use the reverse tags (`bob` -> `alice`), its own vault (for example `./vault/bob`), and a different `selfPort` when both peers run on the same host. Both peers must set `encrypt: true`; otherwise the encryption negotiation fails.

After all transmissions finish, call `await peer.close()` from the application's shutdown path to release the UDP socket.

## Encrypted CLI exchange

Receiver:

```bash
npx peerce-exchange --relayAddr 127.0.0.1 --relayPort 5555 --selfAddr 0.0.0.0 --selfPort 5557 --selfTag bob --distantTag alice --outDir ./received --encrypt --vaultDir ./vault/bob
```

Sender:

```bash
npx peerce-exchange --relayAddr 127.0.0.1 --relayPort 5555 --selfAddr 0.0.0.0 --selfPort 5556 --selfTag alice --distantTag bob --fromFile ./hello.txt --encrypt --vaultDir ./vault/alice
```

## Encryption model

When `encrypt: true` is enabled, peerce currently uses:

- persistent X25519 key pairs for shared-secret derivation;
- HKDF-SHA-256 for the session encryption key;
- AES-256-GCM for payload encryption and authentication;
- trust on first use (TOFU) to associate a remote tag with its first observed public key.

On later connections, a changed public-key fingerprint produces `onPublicKeyMismatch` and closes the peer.

### Current security limitations

- Encryption is opt-in and must be enabled by both peers.
- Peer tags and the first key observed for a tag are not independently authenticated. Verify first-contact fingerprints through a trusted channel when peer identity matters.
- The protocol does not currently provide PKI or forward secrecy.
- Not all message metadata is included in authenticated additional data yet.
- The protocol is experimental and has not received an independent security audit.

## Unencrypted mode

Omitting `encrypt` (or setting it to `false`) keeps the existing plaintext mode. Plaintext mode provides neither confidentiality nor peer authentication and should only be used for local testing with non-sensitive data.

## Status

`0.2.0-alpha.X` is intended for experiments, feedback, and protocol development only.

## License

MIT
