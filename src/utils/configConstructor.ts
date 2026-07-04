import { parseArgs, ParseArgsOptionDescriptor } from "node:util";
import { argv } from "node:process";
import {
  SimpleProtocolClientConfig,
  SimpleProtocolRelayConfig,
} from "@src/simple/simpleProtocol";

export interface FullConfig
  extends SimpleProtocolClientConfig, SimpleProtocolRelayConfig {}

export const envConfig: FullConfig = {};

const cliOptions = {
  relayAddr: {
    type: "string",
  },
  relayPort: {
    type: "string",
  },
  selfTag: {
    type: "string",
  },
  distantTag: {
    type: "string",
  },
  payload: {
    type: "string",
  },
  selfAddr: {
    type: "string",
  },
  selfPort: {
    type: "string",
  },
  fromFile: {
    type: "string",
  },
  outFile: {
    type: "string",
  },
} satisfies Record<keyof FullConfig, ParseArgsOptionDescriptor>;

const { positionals, values } = parseArgs({
  args: argv.slice(2),
  options: cliOptions,
});

Object.assign(envConfig, values);
