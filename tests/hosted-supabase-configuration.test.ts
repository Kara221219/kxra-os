import assert from "node:assert/strict";
import test from "node:test";
import { hostedSupabaseConfiguration } from "../packages/authz/hosted-supabase";
import { hostedSelfServiceConfiguration } from "../packages/authz/hosted-self-service";
import { hostedRoomOperations } from "../packages/workspace/hosted-operations";
import { roomWorkerAuthorized } from "../packages/workspace/room-worker-auth";
import { roomMaintenanceAuthorized } from "../packages/workspace/room-maintenance";
import { localModeConfiguration } from "../packages/authz/local-guard.production";
import {
  localPrincipal,
  issueFixtureSession,
  fakeAuthProvider,
} from "../apps/os/lib/local-runtime.production";
const configuration = {
  NODE_ENV: "production",
  KXRA_ENVIRONMENT: "staging",
  KXRA_ORIGIN: "https://synthetic-staging.example.invalid",
  NEXT_PUBLIC_SUPABASE_URL: "https://jlebgsxcvhvpueuibekd.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "synthetic-public-key-not-a-credential",
} as const;
const secret = "a".repeat(64);
test("hosted authentication is bound to production, intended Supabase project and a nonlocal HTTPS origin", () => {
  assert.ok(hostedSupabaseConfiguration(configuration));
  assert.ok(
    hostedSupabaseConfiguration({
      ...configuration,
      KXRA_ENVIRONMENT: "production",
      NEXT_PUBLIC_SUPABASE_URL: "https://lhbgeucifxxcdoyrnesf.supabase.co",
    }),
  );
  for (const bad of [
    {},
    { ...configuration, NODE_ENV: "development" },
    { ...configuration, KXRA_ENVIRONMENT: "production" },
    { ...configuration, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "" },
    { ...configuration, NEXT_PUBLIC_SUPABASE_URL: "https://wrong.supabase.co" },
  ])
    assert.equal(hostedSupabaseConfiguration(bad), null);
  for (const origin of [
    "http://127.0.0.1:3210",
    "https://localhost",
    "https://localhost.",
    "https://x.localhost",
    "https://127.0.0.1",
    "https://127.1",
    "https://2130706433",
    "https://0x7f000001",
    "https://8.8.8.8",
    "https://[::1]",
    "https://[::ffff:127.0.0.1]",
    "https://user:synthetic@x.example.invalid",
    "https://x.example.invalid/path",
    "https://x.example.invalid?query=1",
    "https://x.example.invalid#fragment",
  ])
    assert.equal(
      hostedSupabaseConfiguration({ ...configuration, KXRA_ORIGIN: origin }),
      null,
    );
});
test("capabilities remain separately default off and reject malformed binding before reading worker secrets", () => {
  for (const enabled of [false, true]) {
    const badBinding = new Proxy(
      {
        ...configuration,
        KXRA_HOSTED_ROOM_JOBS: enabled ? "true" : "false",
        KXRA_ROOM_MAINTENANCE_ENABLED: enabled ? "true" : "false",
        NEXT_PUBLIC_SUPABASE_URL: "https://wrong.supabase.co",
      },
      {
        get(target, key) {
          if (key === "KXRA_ROOM_WORKER_SECRET")
            throw Error("PRIVATE_SECRET_READ");
          return Reflect.get(target, key);
        },
      },
    );
    assert.equal(hostedRoomOperations(badBinding), false);
    assert.equal(roomWorkerAuthorized(null, badBinding), false);
    assert.equal(roomMaintenanceAuthorized(null, badBinding), false);
  }
  const env = {
    ...configuration,
    KXRA_HOSTED_ROOM_JOBS: "true",
    KXRA_ROOM_MAINTENANCE_ENABLED: "true",
    KXRA_ROOM_WORKER_SECRET: secret,
  };
  assert.equal(roomWorkerAuthorized(`Bearer ${secret}`, env), true);
  assert.equal(roomMaintenanceAuthorized(`Bearer ${secret}`, env), true);
  for (const header of [
    null,
    "",
    secret,
    `Bearer ${"b".repeat(64)}`,
    `Bearer ${secret}x`,
  ]) {
    assert.equal(roomWorkerAuthorized(header, env), false);
    assert.equal(roomMaintenanceAuthorized(header, env), false);
  }
  assert.equal(
    hostedSelfServiceConfiguration({
      ...configuration,
      KXRA_HOSTED_SELF_SERVICE_ENABLED: "false",
    }),
    null,
  );
});
test("obsolete selector cannot activate a production fixture implementation", async () => {
  // Deliberate truth-table change: the obsolete label is not consulted. The
  // actual shipping implementation remains Supabase-only with validated binding.
  const env = {
    ...configuration,
    KXRA_AUTH_MODE: "fixture",
    KXRA_HOSTED_ROOM_JOBS: "true",
    KXRA_ROOM_WORKER_SECRET: secret,
  };
  assert.equal(hostedRoomOperations(env), true);
  assert.equal(localModeConfiguration(env), false);
  assert.equal(await localPrincipal(), null);
  await assert.rejects(
    issueFixtureSession("synthetic"),
    /Local authentication is unavailable/,
  );
  assert.throws(fakeAuthProvider, /Local authentication is unavailable/);
  const fixture = {
    NODE_ENV: "development",
    KXRA_AUTH_MODE: "fixture",
    KXRA_ORIGIN: "http://127.0.0.1:3210",
    KXRA_HOSTED_ROOM_JOBS: "true",
    KXRA_ROOM_WORKER_SECRET: secret,
  };
  assert.equal(hostedRoomOperations(fixture), false);
  assert.equal(roomWorkerAuthorized(`Bearer ${secret}`, fixture), false);
});
