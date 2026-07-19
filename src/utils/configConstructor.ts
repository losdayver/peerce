import { parseArgs, ParseArgsOptionDescriptor } from "node:util";
import { argv } from "node:process";
import {
  SimpleProtocolConfig,
  SimpleProtocolRelayConfig,
} from "../simple/simpleProtocol";

export interface FullConfig
  extends SimpleProtocolConfig, SimpleProtocolRelayConfig {}

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
  outDir: {
    type: "string",
  },
} satisfies Record<keyof FullConfig, ParseArgsOptionDescriptor>;

const { positionals, values } = parseArgs({
  args: argv.slice(2),
  options: cliOptions,
});

Object.assign(envConfig, values);
