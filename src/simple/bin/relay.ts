#!/usr/bin/env node
import { SimpleRelay } from "../simpleRelay";
import { parseArgs, ParseArgsOptionDescriptor } from "node:util";
import { argv } from "node:process";
import { SimpleProtocolRelayConfig } from "../simpleProtocol";

export interface RelayConfig extends SimpleProtocolRelayConfig {}

export const envConfig: RelayConfig = {};

const cliOptions = {
  selfAddr: { type: "string" },
  selfPort: { type: "string" },
} satisfies Record<keyof RelayConfig, ParseArgsOptionDescriptor>;

const { values } = parseArgs({
  args: argv.slice(2),
  options: cliOptions,
});

Object.assign(envConfig, values);

// npx peerce-relay --selfAddr 0.0.0.0 --selfPort 5555
new SimpleRelay(envConfig.selfAddr!, envConfig.selfPort!);
