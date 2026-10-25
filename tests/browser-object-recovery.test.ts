import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { browserObjectEvidence } from "../scripts/browser-recovery-evidence.mjs";

async function fixture(
  work: (
    runtime: string,
    file: string,
    client: { query: () => Promise<{ rows: object[] }> },
  ) => Promise<void>,
) {
  const runtime = fs.mkdtempSync(path.join(os.tmpdir(), "kxra-object-proof-"));
  fs.chmodSync(runtime, 0o700);
  fs.mkdirSync(path.join(runtime, "objects"), { mode: 0o700 });
  const file = path.join(runtime, "objects", "proof.txt");
  const bytes = Buffer.from("Synthetic recovery object");
  fs.writeFileSync(file, bytes, { mode: 0o600 });
  const row = {
    id: "10000000-0000-4000-8000-000000000001",
    object_key: "proof.txt",
    sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
    size_bytes: bytes.length,
  };
  try {
    await work(runtime, file, { query: async () => ({ rows: [row] }) });
  } finally {
    fs.rmSync(runtime, { recursive: true, force: true });
  }
}

test("browser restart proof detects missing objects and same-sized byte corruption", async () => {
  await fixture(async (runtime, file, client) => {
    const evidence = await browserObjectEvidence(client, runtime);
    assert.equal(evidence.count, 1);
    assert.match(evidence.sha256, /^[a-f0-9]{64}$/);
    const original = fs.readFileSync(file);
    fs.writeFileSync(file, Buffer.alloc(original.length, 65));
    await assert.rejects(() => browserObjectEvidence(client, runtime));
    fs.unlinkSync(file);
    await assert.rejects(() => browserObjectEvidence(client, runtime), {
      code: "ENOENT",
    });
  });
});

test("browser object proof rejects symlinks, hardlinks and traversal before accepting bytes", async () => {
  await fixture(async (runtime, file, client) => {
    const original = file + ".original";
    fs.renameSync(file, original);
    fs.symlinkSync(original, file);
    await assert.rejects(() => browserObjectEvidence(client, runtime));
    fs.unlinkSync(file);
    fs.linkSync(original, file);
    await assert.rejects(() => browserObjectEvidence(client, runtime));
    const unsafe = {
      query: async () => ({
        rows: [
          {
            id: "synthetic",
            object_key: "../outside",
            size_bytes: 1,
            sha256: "0".repeat(64),
          },
        ],
      }),
    };
    await assert.rejects(
      () => browserObjectEvidence(unsafe, runtime),
      /Unsafe browser object key/,
    );
  });
});
