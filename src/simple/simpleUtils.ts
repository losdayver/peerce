import crypto from "crypto";
import { PeerToPeerMessage } from "@src/simple/simpleProtocol";

export const chunkPeerToPeerMessages = ({
  payload,
  fileName,
  chunkLength = 200,
}: {
  payload: Buffer | string;
  fileName?: string;
  chunkLength?: number;
}): Buffer[] => {
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

    const msg: PeerToPeerMessage = {
      payload: payloadChunk.toString("base64"),
      fileName: generatedFileName,
      chunkNo,
      totalNo,
    };

    out.push(Buffer.from(JSON.stringify(msg)));
  }

  return out;
};
