import crypto, {
  createCipheriv,
  createDecipheriv,
  generateKeyPairSync,
  randomBytes,
} from "crypto";
import {
  KnownTagsEntry,
  KnownTagsJson as KnownTags,
  PeerToPeerMessage,
  KeysJson,
  KnownTagsJson,
} from "./simpleProtocol";
import { mkdir, readFile, writeFile } from "fs/promises";
import { join, resolve } from "path";
import { logInfo } from "../utils/logUtils";

let knownTagsUpdateQueue: Promise<void> = Promise.resolve();

const hasErrorCode = (
  cause: unknown,
  code: string
): cause is NodeJS.ErrnoException =>
  typeof cause === "object" &&
  cause !== null &&
  "code" in cause &&
  cause.code === code;

const parseKnownTags = (serialized: string): KnownTags => {
  const value: unknown = JSON.parse(serialized);
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error("known-tags.json must contain a JSON object");

  return value as KnownTags;
};

const readKnownTagsForUpdate = async (filePath: string): Promise<KnownTags> => {
  try {
    return parseKnownTags(await readFile(filePath, "utf8"));
  } catch (cause) {
    if (hasErrorCode(cause, "ENOENT")) return {};
    throw cause;
  }
};

export const chunkPeerToPeerMessages = ({
  payload,
  fileName,
  chunkLength = 4096,
  encrypt = false,
  secret = undefined,
}: {
  payload: Buffer | string;
  fileName?: string;
  chunkLength?: number;
  encrypt?: boolean;
  secret?: Buffer;
}): { fileName: string; messages: Buffer[] } => {
  const payloadBuf = Buffer.isBuffer(payload)
    ? payload
    : Buffer.from(payload, "utf8");

  const generatedFileName =
    fileName ??
    crypto.createHash("sha256").update(payloadBuf).digest("hex").slice(0, 32);

  const totalNo = Math.max(1, Math.ceil(payloadBuf.length / chunkLength));

  const out: Buffer[] = [];
  for (let chunkNo = 1; chunkNo <= totalNo; chunkNo++) {
    const start = (chunkNo - 1) * chunkLength;
    const end = Math.min(payloadBuf.length, chunkNo * chunkLength);

    const payloadChunk = payloadBuf.subarray(start, end); // важно: subarray без копий

    let serializedPayload = payloadChunk.toString("hex");
    let authTag: string | undefined;
    let nonce: string | undefined;

    if (encrypt) {
      if (!secret) throw new Error("Encryption secret is required");

      nonce = randomBytes(32).toString("hex"); // todo counter

      const encrypted = encryptPayload(payloadChunk, secret, nonce);
      serializedPayload = encrypted.ciphertext;
      authTag = encrypted.tag;
    }

    const msg: PeerToPeerMessage = {
      payload: serializedPayload,
      fileName: generatedFileName,
      chunkNo,
      totalNo,
      ...(encrypt ? { authTag, nonce } : {}),
    };

    out.push(Buffer.from(JSON.stringify(msg)));
  }

  return { fileName: generatedFileName, messages: out };
};

export const encryptPayload = (
  payload: Buffer,
  secret: Buffer,
  nonce: string
) => {
  const cipher = createCipheriv("aes-256-gcm", secret, nonce);
  // todo aad
  const ciphertext = Buffer.concat([
    cipher.update(Buffer.from(payload)),
    cipher.final(),
  ]).toString("hex");
  const tag = cipher.getAuthTag().toString("hex");
  return { ciphertext, tag };
};

export const decryptPayload = (
  payload: string,
  secret: Buffer,
  nonce: string,
  authTag: string
) => {
  const decipher = createDecipheriv("aes-256-gcm", secret, nonce);
  // todo aad
  decipher.setAuthTag(Buffer.from(authTag, "hex"));

  try {
    return Buffer.concat([
      decipher.update(Buffer.from(payload, "hex")),
      decipher.final(),
    ]);
  } catch {
    throw new Error("Auth tag is incorrect");
  }
};

export const getKnownTagsEntry = async (
  tag: string,
  dir: string
): Promise<KnownTagsEntry | false> => {
  try {
    const knownTags = parseKnownTags(
      await readFile(join(dir, "known-tags.json"), "utf8")
    );
    return knownTags[tag] ?? false;
  } catch {
    return false;
  }
};

export const getKnownTagsJson = async (
  dir: string
): Promise<KnownTagsJson | false> => {
  try {
    const knownTags = parseKnownTags(
      await readFile(join(dir, "known-tags.json"), "utf8")
    );
    return knownTags;
  } catch {
    return false;
  }
};

export const upsertKnownTagsEntry = (
  tag: string,
  entry: KnownTagsEntry,
  dir: string
): Promise<void> => {
  if (tag.length === 0) return Promise.reject(new Error("Tag cannot be empty"));

  const update = knownTagsUpdateQueue
    .catch(() => undefined)
    .then(async () => {
      await mkdir(dir, { recursive: true, mode: 0o700 });
      const filePath = join(dir, "known-tags.json");
      const knownTags = await readKnownTagsForUpdate(filePath);
      knownTags[tag] = { ...entry };
      await writeFile(filePath, JSON.stringify(knownTags, null, 2), {
        encoding: "utf8",
        mode: 0o600,
      });
    });

  knownTagsUpdateQueue = update;
  return update;
};

export const createAndSaveKeyPair = async (dir: string) => {
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
};
