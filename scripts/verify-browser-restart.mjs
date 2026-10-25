import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import pg from "pg";
import {
  assertBrowserRecoveryFixture,
  browserRecoveryEvidence,
  browserObjectEvidence,
} from "./browser-recovery-evidence.mjs";

const root = path.resolve(import.meta.dirname, "..");
const runtime = path.resolve(
  process.env.KXRA_RUNTIME || path.join(root, ".runtime"),
);
const config = JSON.parse(
  fs.readFileSync(path.join(runtime, "database.json"), "utf8"),
);
assertBrowserRecoveryFixture(config);
async function snapshot() {
  const client = new pg.Client({ ...config, user: os.userInfo().username });
  await client.connect();
  try {
    return {
      database: await browserRecoveryEvidence(client),
      objects: await browserObjectEvidence(client, runtime),
    };
  } finally {
    await client.end();
  }
}
const before = await snapshot();
for (const action of ["stop", "start"])
  execFileSync(process.execPath, ["scripts/database.mjs", action], {
    cwd: root,
    stdio: "inherit",
  });
assert.deepEqual(await snapshot(), before);
console.log("Browser idea/proposal/upload restart digest verification PASS.");
