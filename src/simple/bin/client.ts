#!/usr/bin/env node
import { register } from "module-alias/register";
register;
import { SimplePeer } from "../simplePeer";
import { envConfig } from "@src/utils/configConstructor";

// node ./dist/simple/bin/client.js --relayAddr 127.0.0.1 --relayPort 5555 --selfTag me --distantTag other --payload testpayload
// p2p-s-client --relayAddr 127.0.0.1 --relayPort 5555 --selfTag me --distantTag other --payload testpayload
void (async () => {
  const simpleClient = new SimplePeer();
  await simpleClient.requestSessionViaRelay(
    envConfig.relayAddr!,
    envConfig.relayPort!,
    envConfig.selfTag!,
    envConfig.distantTag!,
    envConfig.payload
  );
})();
