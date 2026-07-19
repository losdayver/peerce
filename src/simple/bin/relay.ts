#!/usr/bin/env node
import { SimpleRelay } from "../simpleRelay";
import { envConfig } from "../../utils/configConstructor";

// node ./dist/simple/bin/relay.js --selfAddr 0.0.0.0 --selfPort 5555
// p2p-s-relay --selfAddr 0.0.0.0 --selfPort 5555
const simpleRelay = new SimpleRelay(envConfig.relayAddr!, envConfig.selfPort!);
