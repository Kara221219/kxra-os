import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { assertBrowserRecoveryFixture } from "../scripts/browser-recovery-evidence.mjs";

const environment: NodeJS.ProcessEnv = {
  NODE_ENV: "development",
  KXRA_AUTH_MODE: "fixture",
  KXRA_ORIGIN: "http://127.0.0.1:3210",
  KXRA_RUNTIME: "/tmp/synthetic-browser-recovery-guard",
  KXRA_LOCAL_SECRET: "s".repeat(96),
  KXRA_CI_RUN_ID: "10000000-0000-4000-8000-000000000001",
  GITHUB_ACTIONS: "true",
  GITHUB_SHA: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  GITHUB_RUN_ID: "903",
  GITHUB_RUN_ATTEMPT: "1",
};
const config = { host: environment.KXRA_RUNTIME + "/socket" };
test("browser recovery accepts its exact synthetic Unix socket and source/run context", () => {
  assert.doesNotThrow(() => assertBrowserRecoveryFixture(config, environment));
  const local = { ...environment };
  for (const key of [
    "GITHUB_ACTIONS",
    "GITHUB_SHA",
    "GITHUB_RUN_ID",
    "GITHUB_RUN_ATTEMPT",
  ])
    delete local[key];
  assert.doesNotThrow(() => assertBrowserRecoveryFixture(config, local));
});
test("browser recovery rejects hosted, crossed-runtime, missing run and wrong-source contexts before a caller connects", () => {
  for (const change of [
    { NODE_ENV: "production" },
    { KXRA_AUTH_MODE: "hosted" },
    { KXRA_ORIGIN: "https://hosted.invalid" },
    { KXRA_RUNTIME: "/tmp/other-phase" },
    { DATABASE_URL: "not-a-connection" },
    { NEXT_PUBLIC_SUPABASE_URL: "https://supabase.invalid" },
    { VERCEL: "1" },
    { VERCEL_ENV: "preview" },
    { KXRA_CI_RUN_ID: "" },
    { GITHUB_ACTIONS: "false" },
    { GITHUB_SHA: "0".repeat(40) },
    { GITHUB_RUN_ID: "" },
    { GITHUB_RUN_ATTEMPT: "0" },
  ] as Partial<NodeJS.ProcessEnv>[])
    assert.throws(() =>
      assertBrowserRecoveryFixture(config, { ...environment, ...change }),
    );
  assert.throws(() =>
    assertBrowserRecoveryFixture({ host: "127.0.0.1" }, environment),
  );
});
