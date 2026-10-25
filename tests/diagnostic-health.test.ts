import test from "node:test";
import assert from "node:assert/strict";
import { diagnosticHealth } from "./support/diagnostic-health";
const environment: NodeJS.ProcessEnv = {
  NODE_ENV: "development",
  KXRA_AUTH_MODE: "fixture",
  KXRA_ORIGIN: "http://127.0.0.1:3210",
  KXRA_RUNTIME: "/tmp/synthetic-health-test",
  KXRA_LOCAL_SECRET: "s".repeat(96),
  KXRA_CI_RUN_ID: "10000000-0000-4000-8000-000000000001",
  KXRA_SAFE_DIAGNOSTICS_ENABLED: "true",
  GITHUB_ACTIONS: "true",
  GITHUB_SHA: "a".repeat(40),
  GITHUB_RUN_ID: "123",
  GITHUB_RUN_ATTEMPT: "1",
};
test("invalid fixture, hosted, origin and run contexts are rejected before any fetch", async () => {
  const changes: NodeJS.ProcessEnv[] = [
    { KXRA_SAFE_DIAGNOSTICS_ENABLED: "false" },
    { KXRA_AUTH_MODE: "hosted" },
    { NODE_ENV: "production" },
    { VERCEL: "1" },
    { VERCEL_ENV: "production" },
    { NEXT_PUBLIC_SUPABASE_URL: "https://invalid.example" },
    { DATABASE_URL: "synthetic" },
    { KXRA_ORIGIN: "https://hosted.invalid" },
    { KXRA_ORIGIN: "http://localhost:3210" },
    { KXRA_ORIGIN: "http://127.0.0.1:3210?poison=1" },
    { KXRA_CI_RUN_ID: "" },
    { KXRA_CI_RUN_ID: "poison" },
    { GITHUB_ACTIONS: "false" },
    { GITHUB_SHA: "invalid" },
    { GITHUB_RUN_ID: "" },
    { GITHUB_RUN_ATTEMPT: "0" },
  ];
  for (const change of changes) {
    let calls = 0;
    await assert.rejects(
      diagnosticHealth({ ...environment, ...change }, (async () => {
        calls++;
        throw Error("Must not fetch");
      }) as typeof fetch),
      /SAFE_DIAGNOSTIC_HEALTH_REJECTED/,
    );
    assert.equal(calls, 0);
  }
});
test("valid health transport is exact loopback with redirects disabled and no credentials", async () => {
  let calls = 0;
  const transport = async (url: URL | RequestInfo, init?: RequestInit) => {
    calls++;
    assert.equal(String(url), "http://127.0.0.1:3210/api/health");
    assert.equal(init?.redirect, "error");
    assert.equal(init?.headers, undefined);
    return Response.json({
      service: "kxra-os",
      run_id: environment.KXRA_CI_RUN_ID,
    });
  };
  assert.deepEqual(
    await diagnosticHealth(environment, transport as typeof fetch),
    { service: "kxra-os", run_id: environment.KXRA_CI_RUN_ID },
  );
  assert.equal(calls, 1);
});
test("health identity, unknown fields and oversized body fail with a fixed error", async () => {
  for (const body of [
    { service: "other", run_id: environment.KXRA_CI_RUN_ID },
    { service: "kxra-os", run_id: "20000000-0000-4000-8000-000000000002" },
    {
      service: "kxra-os",
      run_id: environment.KXRA_CI_RUN_ID,
      token: "POISON_DO_NOT_EXPORT",
    },
    "x".repeat(2049),
  ]) {
    await assert.rejects(
      diagnosticHealth(environment, (async () =>
        typeof body === "string"
          ? new Response(body)
          : Response.json(body)) as typeof fetch),
      /^Error: SAFE_DIAGNOSTIC_HEALTH_REJECTED$/,
    );
  }
  await assert.rejects(
    diagnosticHealth(environment, (async () => {
      throw Error("POISON_PRIVATE_TRANSPORT_ERROR");
    }) as typeof fetch),
    /^Error: SAFE_DIAGNOSTIC_HEALTH_REJECTED$/,
  );
});
