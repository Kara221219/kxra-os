import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  syntheticEnvironment,
  commandFor,
  assertNoEnvironmentFiles,
} from "./run.mjs";

test("hosted secrets, fixture targets and executable preloads never reach synthetic children", () => {
  const env = syntheticEnvironment({
    PATH: "/bin",
    HOME: "/synthetic",
    TMPDIR: "/tmp",
    DATABASE_URL: "blocked",
    KXRA_ORIGIN: "https://blocked.invalid",
    KXRA_RUNTIME: "/blocked",
    KXRA_LOCAL_SECRET: "blocked",
    STRIPE_SECRET_KEY: "blocked",
    HF_CREDENTIALS: "blocked",
    NODE_OPTIONS: "--import=blocked",
    VERCEL: "1",
    NEXT_PUBLIC_SUPABASE_URL: "blocked",
  });
  assert.deepEqual(env, {
    PATH: "/bin",
    HOME: "/synthetic",
    TMPDIR: "/tmp",
    CI: "true",
    NEXT_TELEMETRY_DISABLED: "1",
  });
});
test("unknown modes fail closed and full acceptance preserves the existing isolated CI harness", () => {
  assert.throws(() => commandFor("https://target.invalid"), /QA_MODE_REJECTED/);
  assert.deepEqual(commandFor("services"), [
    "scripts/ci.mjs",
    "--services-only",
  ]);
  assert.deepEqual(commandFor("full"), ["scripts/ci.mjs"]);
});
test("Next automatic environment-file loading is rejected before starting any process", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "kxra-qa-guard-"));
  try {
    for (const app of ["os", "marketing", "email-worker"])
      fs.mkdirSync(path.join(root, "apps", app), { recursive: true });
    fs.writeFileSync(path.join(root, ".env.example"), "");
    assertNoEnvironmentFiles(root);
    fs.writeFileSync(path.join(root, "apps/os/.env.local"), "synthetic");
    assert.throws(
      () => assertNoEnvironmentFiles(root),
      /QA_ENVIRONMENT_FILE_PRESENT/,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("explicit PostgreSQL selection also controls dump/restore child tools", () => {
  const env = syntheticEnvironment({
    PATH: "/old/bin",
    KXRA_PG_BIN: "/selected/bin",
  });
  assert.equal(env.PATH, ["/selected/bin", "/old/bin"].join(path.delimiter));
  assert.equal(env.KXRA_PG_BIN, "/selected/bin");
});
