#!/usr/bin/env node
import { register } from "module-alias/register";
register;
import { SimpleRelay } from "@src/simple/simpleRelay";
import { envConfig } from "@src/utils/configConstructor";

// node ./dist/simple/bin/relay.js --relayAddr "127.0.0.1" --relayPort "5555" --selfTag "me" --distantTag "other" --payload "testpayload"
// p2p-s-relay --selfAddr "127.0.0.1" --selfPort "5555"
const simpleRelay = new SimpleRelay(envConfig.relayAddr!, envConfig.selfPort!);
