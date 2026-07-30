#!/usr/bin/env node
import { SimplePeer } from "../simplePeer/simplePeer";
import { envConfig, FullConfig } from "../../utils/configConstructor";
import { readFileSync, writeFileSync } from "node:fs";
import { join, basename } from "node:path";
import { logInfo } from "../../utils/logUtils";

// node ./dist/simple/bin/peer.js --relayAddr 127.0.0.1 --relayPort 5555 --selfTag me --distantTag other --payload testpayload
// p2p-s-peer --relayAddr 127.0.0.1 --relayPort 5555 --selfTag me --distantTag other --payload testpayload

if (envConfig.fromFile) envConfig.payload = readFileSync(envConfig.fromFile);

void (async () => {
  const simplePeer = new SimplePeer(envConfig as Required<FullConfig>);
  simplePeer.on("onFullMessage", ({ buffer, fileName }) => {
    writeFileSync(join(envConfig.outDir ?? "", fileName), buffer);
    console.log();
    logInfo(`saved to "${join(envConfig.outDir ?? "", fileName)}"`);
    process.exit(0);
  });
  await simplePeer.requestSessionViaRelayAsync();
  if (envConfig.payload)
    simplePeer.createOutgoingTransmission({
      payload: envConfig.payload,
      fileName: envConfig.fromFile ? basename(envConfig.fromFile) : undefined,
    });
})();
