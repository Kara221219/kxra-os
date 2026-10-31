import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  operationsRecoveryEvidence,
  operationsRecoveryPhaseAllowed,
  operationsRecoveryConfigurationAllowed,
} from "../scripts/operations-recovery-evidence.mjs";

test("retained operations proof returns finite counts/digests and never requests credentials or content", async () => {
  const queries: string[] = [];
  const evidence = await operationsRecoveryEvidence({
    query: async (sql: string) => {
      queries.push(sql);
      return { rows: [{ count: 2, sha256: "a".repeat(64) }] };
    },
  });
  assert.equal(Object.keys(evidence).length, 10);
  assert.equal(queries.length, 10);
  for (const query of queries)
    assert.doesNotMatch(
      query,
      /select\s+\*|\blease_token\b|encrypted_key|\bpassword\b|\bcookie\b|\boutput\b|\bbody\b|auth\.users/i,
    );
  for (const value of Object.values(evidence))
    assert.deepEqual(value, { count: 2, sha256: "a".repeat(64) });
});
test("unexpected/malformed evidence and database exceptions cannot expose planted content", async () => {
  const planted = "SYNTHETIC_PRIVATE_VALUE_DO_NOT_EMIT";
  for (const value of [
    { count: 1, sha256: "a".repeat(64), unexpected: planted },
    { count: 1, sha256: planted },
    { count: Infinity, sha256: "a".repeat(64) },
    null,
  ]) {
    await assert.rejects(
      operationsRecoveryEvidence({ query: async () => ({ rows: [value] }) }),
      (e: Error) => !e.message.includes(planted),
    );
  }
  await assert.rejects(
    operationsRecoveryEvidence({
      query: async () => {
        throw Error(planted);
      },
    }),
    /^Error: OPERATIONS_RECOVERY_QUERY_FAILED$/,
  );
  await assert.rejects(
    operationsRecoveryEvidence({
      query: async () => ({ rows: [{ count: 0, sha256: "a".repeat(64) }] }),
    }),
    /Missing operations recovery dataset/,
  );
});

test("both recovery entry points reject credential-bearing overrides before database or dump activity", () => {
  const parent = fs.mkdtempSync(
    path.join(os.tmpdir(), "kxra-ops-recovery-privacy-"),
  );
  const runtime = path.join(parent, "ci-room-delivery");
  const planted = "SYNTHETIC_PRIVATE_CONFIGURATION_DO_NOT_EMIT";
  try {
    fs.mkdirSync(runtime, { mode: 0o700 });
    fs.mkdirSync(path.join(runtime, "socket"), { mode: 0o700 });
    const base = {
      host: path.join(runtime, "socket"),
      port: 55479,
      user: "kxra_app",
      database: "postgres",
    };
    assert.equal(operationsRecoveryConfigurationAllowed(base, runtime), true);
    for (const extra of [
      { password: planted },
      { connectionString: `postgresql://${planted}@` },
      { ssl: { ca: planted } },
    ]) {
      const config = { ...base, ...extra };
      assert.equal(
        operationsRecoveryConfigurationAllowed(config, runtime),
        false,
      );
      fs.writeFileSync(
        path.join(runtime, "database.json"),
        JSON.stringify(config),
        { mode: 0o600 },
      );
      for (const [script, flag] of [
        ["scripts/verify-operations-recovery.mjs", "--snapshot"],
        ["scripts/verify-backup-restore.mjs", "--operations-proof"],
      ]) {
        const result = spawnSync(process.execPath, [script, flag], {
          encoding: "utf8",
          timeout: 5000,
          env: {
            PATH: process.env.PATH,
            NODE_ENV: "development",
            KXRA_AUTH_MODE: "fixture",
            KXRA_ORIGIN: "http://127.0.0.1:3210",
            KXRA_LOCAL_SECRET: "a".repeat(64),
            KXRA_RUNTIME: runtime,
            KXRA_CI_PHASE: "ci-room-delivery",
            KXRA_CI_RUN_ID: crypto.randomUUID(),
          },
        });
        assert.equal(result.status, 1);
        assert.ok(!`${result.stdout}${result.stderr}`.includes(planted));
        assert.match(
          result.stderr,
          /OPERATIONS_RECOVERY_CONFIGURATION_REJECTED/,
        );
        assert.equal(
          fs.existsSync(path.join(runtime, "operations-recovery-before.json")),
          false,
        );
        assert.equal(fs.existsSync(path.join(runtime, "restore-drill")), false);
      }
    }
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
});

test("operation recovery rejects cross-phase or inherited runtime identity", () => {
  for (const phase of ["ci-room-delivery", "ci-room-maintenance"])
    assert.equal(
      operationsRecoveryPhaseAllowed(`/synthetic/.runtime/${phase}`, phase),
      true,
    );
  for (const [runtime, phase] of [
    ["/synthetic/.runtime/ci", "ci-room-delivery"],
    ["/synthetic/.runtime/ci-room-delivery", "ci-room-maintenance"],
    ["ci-room-delivery", "ci-room-delivery"],
    ["/synthetic/.runtime/ci-room-delivery", undefined],
  ])
    assert.equal(operationsRecoveryPhaseAllowed(runtime, phase), false);
});
