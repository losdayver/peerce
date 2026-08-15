#!/usr/bin/env node
import { parseArgs, ParseArgsOptionDescriptor } from "node:util";
import { argv } from "node:process";
import { homedir } from "node:os";
import { join } from "node:path";
import { createAndSaveKeyPair } from "../simpleUtils";

export interface KeygenConfig {
  dir?: string;
}

export const envConfig: KeygenConfig = {};

const cliOptions = {
  dir: { type: "string" },
} satisfies Record<keyof KeygenConfig, ParseArgsOptionDescriptor>;

const { values } = parseArgs({
  args: argv.slice(2),
  options: cliOptions,
});

Object.assign(envConfig, values);

let dir = envConfig.dir ?? join(homedir(), ".peerce", "vault");

// npx peerce-keygen --dir="vault"
void (async () => {
  await createAndSaveKeyPair(envConfig.dir!);
})();
