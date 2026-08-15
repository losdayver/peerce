#!/usr/bin/env node
import { parseArgs, ParseArgsOptionDescriptor } from "node:util";
import { argv } from "node:process";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { generateKeyPairSync, randomBytes } from "node:crypto";
import { logInfo } from "../../utils/logUtils";

interface KeysJsonEntry {
  privateKeyFile: string;
  publicKeyFile: string;
  dateCreated: string;
  primitive: string;
}

type KeysJson = KeysJsonEntry[];

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
  await mkdir(dir!, { recursive: true, mode: 0o700 });

  let keysJson: KeysJson = [];
  try {
    keysJson = JSON.parse(
      (await readFile(join(dir, "keys.json"))).toString()
    ) as KeysJson;
  } catch {}

  const { privateKey, publicKey } = generateKeyPairSync("x25519", {
    privateKeyEncoding: {
      type: "pkcs8",
      format: "pem",
    },
    publicKeyEncoding: {
      type: "spki",
      format: "pem",
    },
  });

  const now = new Date();

  const publicKeyFileName = randomBytes(15).toString("hex");
  const privateKeyFileName = randomBytes(15).toString("hex");

  await writeFile(join(dir, publicKeyFileName), publicKey);
  await writeFile(join(dir, privateKeyFileName), privateKey, { mode: 0o600 });

  keysJson.push({
    dateCreated: now.toISOString(),
    primitive: "x25519",
    publicKeyFile: publicKeyFileName,
    privateKeyFile: privateKeyFileName,
  });

  await writeFile(join(dir, "keys.json"), JSON.stringify(keysJson, null, 2));

  logInfo(`saved new keypair at "${resolve(dir)}"`);
})();
