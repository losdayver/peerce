import crypto, { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { PeerToPeerMessage } from "./simpleProtocol";

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
