#!/usr/bin/env node
import { SimplePeer } from "../simplePeer/simplePeer";
import { readFileSync } from "node:fs";
import { join, basename, resolve } from "node:path";
import {
  AnsiColor,
  logError,
  logInfo,
  logProgress,
} from "../../utils/logUtils";
import { SimpleProtocolPeerConfig } from "../simpleProtocol";
import { parseArgs, ParseArgsOptionDescriptor } from "node:util";
import { argv } from "node:process";
import { mkdir, writeFile } from "node:fs/promises";

export interface PeerConfig extends SimpleProtocolPeerConfig {
  fromFile?: string;
  payload?: string | Buffer;
  outDir?: string;
}

export const envConfig: PeerConfig = {};

const cliOptions = {
  selfAddr: { type: "string" },
  selfPort: { type: "string" },
  selfTag: { type: "string" },
  distantTag: { type: "string" },
  relayAddr: { type: "string" },
  relayPort: { type: "string" },
  fromFile: { type: "string" },
  payload: { type: "string" },
  outDir: { type: "string" },
  encrypt: { type: "boolean" },
  vaultDir: { type: "string" },
} satisfies Record<keyof PeerConfig, ParseArgsOptionDescriptor>;

const { values } = parseArgs({
  args: argv.slice(2),
  options: cliOptions,
});

Object.assign(envConfig, values);

envConfig.selfPort = Number(values.selfPort);
envConfig.relayPort = Number(values.relayPort);

if (envConfig.fromFile) envConfig.payload = readFileSync(envConfig.fromFile);

// npx peerce-exchange --relayAddr 127.0.0.1 --relayPort 5555 --selfTag me --distantTag other --payload testpayload
void (async () => {
  const simplePeer = new SimplePeer(envConfig);

  simplePeer.on("onFullMessage", ({ buffer, fileName }) => {
    void (async () => {
      if (envConfig.outDir)
        await mkdir(resolve(envConfig.outDir), { recursive: true });

      const filePath = resolve(join(envConfig.outDir ?? "", fileName));

      await writeFile(filePath, buffer);

      logInfo(`saved to "${filePath}"`);

      await simplePeer.close();
    })();
  });

  simplePeer.on(
    "onIncomingTransmissionPercentageChange",
    (fileName, percentage) => {
      logProgress(`receiving ${fileName}`, percentage, AnsiColor.BRIGHTMAGENTA);
    }
  );

  simplePeer.on(
    "onOutgoingTransmissionPercentageChange",
    (fileName, percentage) => {
      logProgress(
        `transmitting ${fileName}`,
        percentage,
        AnsiColor.BRIGHTMAGENTA
      );
    }
  );

  await simplePeer.requestSessionViaRelayAsync();

  if (envConfig.payload)
    simplePeer.createOutgoingTransmission({
      payload: envConfig.payload,
      fileName: envConfig.fromFile ? basename(envConfig.fromFile) : undefined,
    });
})();
