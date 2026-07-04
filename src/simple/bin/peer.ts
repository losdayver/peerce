#!/usr/bin/env node
import { register } from "module-alias/register";
register;
import { SimplePeer } from "../simplePeer";
import { envConfig, FullConfig } from "@src/utils/configConstructor";
import { readFileSync } from "node:fs";

// node ./dist/simple/bin/peer.js --relayAddr 127.0.0.1 --relayPort 5555 --selfTag me --distantTag other --payload testpayload
// p2p-s-peer --relayAddr 127.0.0.1 --relayPort 5555 --selfTag me --distantTag other --payload testpayload

if (envConfig.fromFile) envConfig.payload = readFileSync(envConfig.fromFile);

void (async () => {
  const simpleClient = new SimplePeer();
  await simpleClient.requestSessionViaRelay(envConfig as Required<FullConfig>);
})();
