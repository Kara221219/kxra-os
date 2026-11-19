import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import pg from "pg";
import { assertBrowserRecoveryFixture } from "./browser-recovery-evidence.mjs";
import {
  operationsRecoveryEvidence,
  operationsRecoveryPhaseAllowed,
  operationsRecoveryConfigurationAllowed,
} from "./operations-recovery-evidence.mjs";
async function main() {
  const mode = process.argv.slice(2).join(" ");
  assert.ok(["--snapshot", "--verify"].includes(mode));
  const runtime = path.resolve(process.env.KXRA_RUNTIME || "");
  const config = JSON.parse(
    fs.readFileSync(path.join(runtime, "database.json"), "utf8"),
  );
  assert.ok(
    operationsRecoveryConfigurationAllowed(config, runtime),
    "OPERATIONS_RECOVERY_CONFIGURATION_REJECTED",
  );
  assert.ok(
    operationsRecoveryPhaseAllowed(runtime, process.env.KXRA_CI_PHASE),
    "OPERATIONS_RECOVERY_PHASE_REJECTED",
  );
  assertBrowserRecoveryFixture(config);
  const sourceSha = execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    timeout: 2000,
  }).trim();
  const client = new pg.Client({ ...config, user: os.userInfo().username });
  await client.connect();
  let evidence;
  try {
    await client.query("begin read only");
    evidence = await operationsRecoveryEvidence(client);
    await client.query("rollback");
  } finally {
    await client.end();
  }
  const current = { sourceSha, runId: process.env.KXRA_CI_RUN_ID, evidence };
  const file = path.join(runtime, "operations-recovery-before.json");
  if (mode === "--snapshot")
    fs.writeFileSync(file, JSON.stringify(current), {
      flag: "wx",
      mode: 0o600,
    });
  else {
    const fd = fs.openSync(
      file,
      fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW,
    );
    try {
      const stat = fs.fstatSync(fd);
      assert.ok(
        stat.isFile() &&
          stat.uid === process.getuid() &&
          stat.nlink === 1 &&
          (stat.mode & 0o077) === 0 &&
          stat.size < 32768,
      );
      let stored;
      try {
        stored = JSON.parse(fs.readFileSync(fd, "utf8"));
      } catch {
        throw Error("OPERATIONS_RECOVERY_RECEIPT_INVALID");
      }
      assert.ok(
        JSON.stringify(stored) === JSON.stringify(current),
        "OPERATIONS_RECOVERY_STATE_MISMATCH",
      );
    } finally {
      fs.closeSync(fd);
    }
    fs.writeFileSync(
      path.join(runtime, "operations-recovery-after.json"),
      JSON.stringify({ ...current, result: "PASS" }),
      { flag: "wx", mode: 0o600 },
    );
  }
  console.log(
    mode === "--snapshot"
      ? "Operations retained-state recovery snapshot ready."
      : "Operations retained-state restart proof PASS.",
  );
}
try {
  await main();
} catch (error) {
  const category =
    error instanceof Error &&
    /^OPERATIONS_RECOVERY_(?:QUERY_FAILED|FIELDS_INVALID|DIGEST_INVALID|RESULT_INVALID|PHASE_REJECTED|STATE_MISMATCH|RECEIPT_INVALID|CONFIGURATION_REJECTED)$/.test(
      error.message,
    )
      ? error.message
      : "OPERATIONS_RECOVERY_CHECK_FAILED";
  console.error(category);
  process.exitCode = 1;
}
