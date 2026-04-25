export function chunkBuffer(buffer: Buffer, chunkSize: number): Buffer[] {
  const chunks: Buffer[] = [];
  for (let i = 0; i < buffer.length; i += chunkSize)
    chunks.push(buffer.subarray(i, i + chunkSize));
  return chunks;
}
