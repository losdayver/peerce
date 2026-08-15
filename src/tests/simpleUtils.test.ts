import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { knownTags as KnownTags } from "../simple/simpleProtocol";
import { upsertKnownTagsEntry } from "../simple/simpleUtils";

const updateCount = 100;

let vaultDir: string;

beforeEach(async () => {
  vaultDir = await mkdtemp(join(tmpdir(), "peerce-known-tags-"));
});

afterEach(async () => {
  await rm(vaultDir, { recursive: true, force: true });
});

test("upsertKnownTagsEntry preserves concurrent updates", async () => {
  await Promise.all(
    Array.from({ length: updateCount }, (_, index) => {
      const tag = `peer-${index}`;
      return upsertKnownTagsEntry(
        tag,
        {
          publicKey: `public-key-${tag}`,
          fingerprint: `fingerprint-${tag}`,
          lastUpdate: new Date().toISOString(),
        },
        vaultDir
      );
    })
  );

  const knownTags = JSON.parse(
    await readFile(join(vaultDir, "known-tags.json"), "utf8")
  ) as KnownTags;

  expect(Object.keys(knownTags)).toHaveLength(updateCount);
  for (let index = 0; index < updateCount; index++) {
    const tag = `peer-${index}`;
    expect(knownTags[tag]).toMatchObject({
      publicKey: `public-key-${tag}`,
      fingerprint: `fingerprint-${tag}`,
    });
  }
});
