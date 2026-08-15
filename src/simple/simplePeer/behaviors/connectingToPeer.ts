import { SimplePeerStateShifterConfig } from "../stateMeta";
import { SimplePeer } from "../simplePeer";
import { getResolver } from "../../../utils/promiseUtils";
import {
  KeysJson,
  PeerToPeerSessionRequest,
  PeerToRelaySessionRequest,
} from "../../simpleProtocol";
import { logInfo } from "../../../utils/logUtils";
import { StateShifterBehaviorBase } from "state-shifter";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  createHash,
  createPrivateKey,
  createPublicKey,
  diffieHellman,
  hkdfSync,
  KeyObject,
} from "node:crypto";
import { homedir } from "node:os";
import { getKnownTagsEntry, upsertKnownTagsEntry } from "../../simpleUtils";

export class ConnectingToPeer extends StateShifterBehaviorBase<SimplePeerStateShifterConfig> {
  constructor(private simplePeer: SimplePeer) {
    super();
  }

  onRelayClose = async () => {
    await this.simplePeer.close("RELAY_CLOSE");
  };

  onEnter = async () => {
    const { initialParams, transceiver, stateMachine } = this.simplePeer;
    const { distantTag, relayAddr, relayPort, selfTag } = initialParams;

    let privateKey: KeyObject | undefined;
    let publicKey: string | undefined;

    if (this.simplePeer.initialParams.encrypt) {
      const { vaultDir = join(homedir(), ".peerce", "vault") } =
        this.simplePeer.initialParams;
      const keysJson = JSON.parse(
        await readFile(join(vaultDir, "keys.json"), "utf8")
      ) as KeysJson;
      const latestEntry = keysJson.at(-1);

      if (!latestEntry) throw new Error("No keys found in keys.json");

      const [privateKeyPem, publicKeyPem] = await Promise.all([
        readFile(join(vaultDir, latestEntry.privateKeyFile)),
        readFile(join(vaultDir, latestEntry.publicKeyFile)),
      ]);

      privateKey = createPrivateKey(privateKeyPem);
      publicKey = publicKeyPem.toString("utf8");
    }

    logInfo(`awaiting session request from "${distantTag}"`);

    transceiver.on("onSessionClosed", this.onRelayClose);

    // Awaiting session request from relay
    let sessionRequest: PeerToPeerSessionRequest;
    let { promise: peerRequestPromise, resolver: peerRequestResolver } =
      getResolver();
    const sessionRequestListener = (
      addrObj: { address: string; port: number },
      msg: Buffer
    ) => {
      if (addrObj.address == relayAddr && addrObj.port == relayPort) {
        try {
          sessionRequest = JSON.parse(
            msg.toString()
          ) as PeerToPeerSessionRequest;
          // todo schema check json
          if (sessionRequest.distantTag !== distantTag) return;
          peerRequestResolver.resolve?.();
        } catch (e) {
          console.error(e);
        }
      }
    };
    transceiver.on("onReceive", sessionRequestListener);

    let value: unknown;
    try {
      void transceiver.send(
        relayAddr,
        relayPort,
        JSON.stringify({
          selfTag,
          distantTag,
          encrypt: this.simplePeer.initialParams.encrypt,
          ...(this.simplePeer.initialParams.encrypt && publicKey
            ? { publicKey }
            : {}),
        } satisfies PeerToRelaySessionRequest)
      );

      value = await Promise.race([
        peerRequestPromise,
        this.simplePeer.__prematureClosePromise,
      ]);
    } finally {
      transceiver.off("onReceive", sessionRequestListener);
    }

    if (value == "PREMATURE_CLOSE") {
      return;
    }

    logInfo(`got session request from "${distantTag}"`);
    // Got session request object and trying to connect to peer

    if (
      sessionRequest!.negotiationFailure === "ENCRYPTION_MISMATCH" ||
      Boolean(this.simplePeer.initialParams.encrypt) !==
        Boolean(sessionRequest!.encrypt)
    ) {
      this.simplePeer.emit("onEncryptionNegotiationFailed", sessionRequest!);
      await stateMachine.shiftTo("closing");
      return;
    }

    let derivedKey: Buffer | undefined;
    if (this.simplePeer.initialParams.encrypt) {
      if (!privateKey || !publicKey)
        throw new Error("Local key pair was not loaded");
      if (!sessionRequest!.publicKey)
        throw new Error("Distant peer did not provide its public key");

      const distantPublicKey = createPublicKey(sessionRequest!.publicKey);

      const publicKeyFingerprint = createHash("sha256")
        .update(sessionRequest!.publicKey)
        .digest("hex");

      const knownTagsDir =
        this.simplePeer.initialParams.vaultDir ??
        join(homedir(), ".peerce", "vault");
      const knownTagsEntry = await getKnownTagsEntry(
        this.simplePeer.initialParams.distantTag,
        knownTagsDir
      );

      if (!knownTagsEntry)
        await upsertKnownTagsEntry(
          this.simplePeer.initialParams.distantTag,
          {
            fingerprint: publicKeyFingerprint,
            publicKey: sessionRequest!.publicKey,
            lastUpdate: new Date().toISOString(),
          },
          knownTagsDir
        );
      else if (knownTagsEntry.fingerprint !== publicKeyFingerprint)
        // do nothing until action is taken outside of this code
        this.simplePeer.emit(
          "onPublicKeyMismatch",
          this.simplePeer.initialParams.distantTag,
          knownTagsEntry,
          {
            fingerprint: publicKeyFingerprint,
            publicKey: sessionRequest!.publicKey,
          }
        );

      const sharedSecret = diffieHellman({
        privateKey,
        publicKey: distantPublicKey,
      });

      derivedKey = Buffer.from(
        hkdfSync("sha256", sharedSecret, sessionRequest!.salt!, "todo: aad", 32)
      );
    }

    logInfo(
      `connecting to peer ${sessionRequest!.distantAddress}:${sessionRequest!.distantPort}`
    );

    // Await connection from peer
    let { promise: connPromise, resolver: connResolver } = getResolver();
    const peerConnectionListener = (address: string, port: number) => {
      if (
        address == sessionRequest.distantAddress &&
        port == sessionRequest.distantPort
      )
        connResolver.resolve?.();
    };
    transceiver.on("onConnected", peerConnectionListener);

    try {
      transceiver.connect(
        sessionRequest!.distantAddress,
        sessionRequest!.distantPort
      );

      value = await Promise.race([
        connPromise,
        this.simplePeer.__prematureClosePromise,
      ]);
    } finally {
      transceiver.off("onConnected", peerConnectionListener);
    }
    if (value == "PREMATURE_CLOSE") {
      return;
    }

    this.simplePeer.emit("onConnectedToPeer", sessionRequest!);

    await stateMachine.shiftTo("connectedToPeer", {
      ...sessionRequest!,
      derivedKey,
    });
  };
  onExit = async () => {
    const { relayAddr, relayPort } = this.simplePeer.initialParams;
    this.simplePeer.transceiver.off("onSessionClosed", this.onRelayClose);
    logInfo(`closed relay connection`);
    await this.simplePeer.transceiver.closeSession(relayAddr, relayPort);
  };
}
