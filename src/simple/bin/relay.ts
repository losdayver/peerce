#!/usr/bin/env node
import { register } from "module-alias/register";
register;
import { SimpleRelay } from "@src/simple/simpleRelay";
import { envConfig } from "@src/utils/configConstructor";

// node ./dist/simple/bin/relay.js --selfAddr 0.0.0.0 --selfPort 5555
// p2p-s-relay --selfAddr 0.0.0.0 --selfPort 5555
const simpleRelay = new SimpleRelay(envConfig.relayAddr!, envConfig.selfPort!);
