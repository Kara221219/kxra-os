import assert from "node:assert/strict";
import fs from "node:fs";

export const PRIVATE_FIXTURE_JSON_MAX_BYTES = 16_384;

/** Generated fixture metadata only. Directory/socket and database-target guards
 * remain with each caller. Validate and read the same inode, never reopen a path. */
export function readPrivateFixtureJson(file: string): Record<string, any> {
  assert.ok(fs.constants.O_NOFOLLOW, "No-follow file opens must be supported");
  const descriptor = fs.openSync(
    file,
    fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK,
  );
  try {
    const before = fs.fstatSync(descriptor, { bigint: true });
    assert.ok(before.isFile(), "Fixture metadata must be a regular file");
    assert.equal(before.uid, BigInt(process.getuid!()));
    assert.equal(
      before.mode & 0o022n,
      0n,
      "Fixture metadata cannot be externally writable",
    );
    assert.ok(
      before.size <= BigInt(PRIVATE_FIXTURE_JSON_MAX_BYTES),
      "Fixture metadata is oversized",
    );
    const bytes = Buffer.alloc(PRIVATE_FIXTURE_JSON_MAX_BYTES + 1);
    let length = 0;
    while (length < bytes.length) {
      const read = fs.readSync(
        descriptor,
        bytes,
        length,
        bytes.length - length,
        null,
      );
      if (!read) break;
      length += read;
    }
    assert.ok(
      length <= PRIVATE_FIXTURE_JSON_MAX_BYTES,
      "Fixture metadata grew beyond its limit",
    );
    const after = fs.fstatSync(descriptor, { bigint: true });
    assert.equal(
      after.size,
      before.size,
      "Fixture metadata changed while read",
    );
    assert.equal(
      after.mtimeNs,
      before.mtimeNs,
      "Fixture metadata changed while read",
    );
    assert.equal(
      after.ctimeNs,
      before.ctimeNs,
      "Fixture metadata changed while read",
    );
    const value: unknown = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(
        bytes.subarray(0, length),
      ),
    );
    assert.ok(
      value && typeof value === "object" && !Array.isArray(value),
      "Fixture metadata must be an object",
    );
    return value as Record<string, any>;
  } finally {
    fs.closeSync(descriptor);
  }
}
