#!/usr/bin/env node
import { register } from "module-alias/register";
register;
import { SimplePeer } from "../simplePeer/simplePeer";
import { envConfig, FullConfig } from "@src/utils/configConstructor";
import { readFileSync, writeFileSync } from "node:fs";
import { join, basename } from "node:path";
import { logInfo } from "@src/utils/logUtils";

// node ./dist/simple/bin/peer.js --relayAddr 127.0.0.1 --relayPort 5555 --selfTag me --distantTag other --payload testpayload
// p2p-s-peer --relayAddr 127.0.0.1 --relayPort 5555 --selfTag me --distantTag other --payload testpayload

if (envConfig.fromFile) envConfig.payload = readFileSync(envConfig.fromFile);

void (async () => {
  const simplePeer = new SimplePeer(envConfig as Required<FullConfig>);
  simplePeer.eventEmitter.on("onFullMessage", ({ buffer, fileName }) => {
    writeFileSync(join(envConfig.outDir ?? "", fileName), buffer);
    logInfo(`saved to "${join(envConfig.outDir ?? "", fileName)}"`);
  });
  await simplePeer.requestSessionViaRelay();
  if (envConfig.payload)
    simplePeer.sendData({
      payload: envConfig.payload,
      fileName: basename(envConfig.fromFile!),
    });
})();
