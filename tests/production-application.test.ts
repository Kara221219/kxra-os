import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import { applicationReleaseCohort } from "../scripts/application-release-cohort.mjs";
import {
  applicationDigest,
  applicationLock,
  assertApplicationIdentity,
  operateApplication,
  validateApplicationEnvironment,
  validateApplicationProfiles,
} from "../scripts/production-application-core.mjs";
import { productionProjectRef } from "../scripts/production-migrations-core.mjs";
const sourceCommit = "a".repeat(40);
const cohort = applicationReleaseCohort();
const planSha256 = "b".repeat(64);
const base = {
  KXRA_ENVIRONMENT: "production",
  KXRA_PRODUCTION_PROJECT_REF: productionProjectRef,
  KXRA_PRODUCTION_SOURCE_COMMIT: sourceCommit,
  KXRA_PRODUCTION_MIGRATOR_DATABASE_URL: `postgresql://postgres:test-only@db.${productionProjectRef}.supabase.co:5432/postgres?sslmode=verify-full`,
};
test("application operator keeps historical lock and fixed direct target", () => {
  assert.equal(applicationLock, "kxra-production-migrations");
  assert.equal(validateApplicationEnvironment(base, "plan").ok, true);
  assert.equal(validateApplicationEnvironment(base, "verify").ok, true);
});
for (const [name, patch] of [
  [
    "foreign host",
    {
      KXRA_PRODUCTION_MIGRATOR_DATABASE_URL:
        base.KXRA_PRODUCTION_MIGRATOR_DATABASE_URL.replace(
          `db.${productionProjectRef}.supabase.co`,
          "attacker.invalid",
        ),
    },
  ],
  [
    "pooler",
    {
      KXRA_PRODUCTION_MIGRATOR_DATABASE_URL: `postgresql://postgres.${productionProjectRef}:test-only@aws-0-eu-west-1.pooler.supabase.com/postgres?sslmode=verify-full`,
    },
  ],
  ["TLS off", { NODE_TLS_REJECT_UNAUTHORIZED: "0" }],
  [
    "options",
    {
      KXRA_PRODUCTION_MIGRATOR_DATABASE_URL:
        base.KXRA_PRODUCTION_MIGRATOR_DATABASE_URL +
        "&options=-csearch_path=public",
    },
  ],
  [
    "wrong database",
    {
      KXRA_PRODUCTION_MIGRATOR_DATABASE_URL:
        base.KXRA_PRODUCTION_MIGRATOR_DATABASE_URL.replace(
          "/postgres?",
          "/template1?",
        ),
    },
  ],
  ["Vercel", { VERCEL: "1" }],
  ["staging", { KXRA_ENVIRONMENT: "staging" }],
] as const)
  test(`application operator rejects ${name}`, () =>
    assert.equal(
      validateApplicationEnvironment({ ...base, ...patch }, "plan").ok,
      false,
    ));
test("application apply binds separate project, source and plan confirmation", () => {
  assert.equal(validateApplicationEnvironment(base, "apply").ok, false);
  const env = {
    ...base,
    KXRA_PRODUCTION_APPLICATION_PLAN_SHA256: planSha256,
    KXRA_PRODUCTION_APPLICATION_CONFIRMATION: `APPLICATION126:${productionProjectRef}:${sourceCommit}:${planSha256}`,
  };
  assert.equal(validateApplicationEnvironment(env, "apply").ok, true);
  assert.equal(
    validateApplicationEnvironment(
      { ...env, KXRA_PRODUCTION_APPLICATION_PLAN_SHA256: "c".repeat(64) },
      "apply",
    ).ok,
    false,
  );
  assert.equal(validateApplicationEnvironment(env, "reset").ok, false);
});
const identity = {
  database: "postgres",
  username: "postgres",
  session_username: "postgres",
  project_ref: null,
  server_version: "140019",
  recovery: false,
};
test("absent optional project marker is permitted without fabrication", async () => {
  assert.deepEqual(
    await assertApplicationIdentity({
      query: async () => ({ rows: [identity] }),
    }),
    identity,
  );
});
for (const patch of [
  { project_ref: "foreign" },
  { database: "other" },
  { username: "postgres_foreign" },
  { session_username: "other" },
  { recovery: true },
])
  test(`database identity refuses ${JSON.stringify(patch)}`, async () => {
    await assert.rejects(
      assertApplicationIdentity({
        query: async () => ({ rows: [{ ...identity, ...patch }] }),
      }),
    );
  });
test("source catalog policy is complete exact and not a hosted acceptance claim", () => {
  const policy = JSON.parse(
    fs.readFileSync(
      new URL(
        "../packages/release/production-application-targets-v1.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const profiles = validateApplicationProfiles(policy);
  for (const p of profiles)
    assert.equal(
      p.sourceCohortSha256,
      applicationDigest(
        cohort.migrations.map(({ name, sha256 }: any) => ({ name, sha256 })),
      ),
    );
  assert.throws(() =>
    validateApplicationProfiles({ ...policy, projectRef: "foreign" }),
  );
  assert.throws(() =>
    validateApplicationProfiles({
      ...policy,
      profiles: [{ id: "bad", catalogs: {} }],
    }),
  );
});
test("apply refuses missing exact plan before SQL", async () => {
  const statements: string[] = [];
  await assert.rejects(
    operateApplication(
      {
        query: async (q: string) => {
          statements.push(q);
          return { rows: [] };
        },
      },
      {
        command: "apply",
        cohort,
        sourceCommit,
        profiles: [],
        planSha256: undefined,
      },
    ),
    /APPLICATION_REVIEWED_PLAN_REQUIRED/,
  );
  assert.deepEqual(statements, []);
});
test("read-only plan rolls back without any DDL when identity fails", async () => {
  const statements: string[] = [];
  await assert.rejects(
    operateApplication(
      {
        query: async (q: string) => {
          statements.push(q);
          return { rows: [{ ...identity, username: "wrong" }] };
        },
      },
      {
        command: "plan",
        cohort,
        sourceCommit,
        profiles: [],
        planSha256: undefined,
      },
    ),
    /APPLICATION_TARGET_IDENTITY_INVALID/,
  );
  assert.equal(
    statements[0],
    "begin isolation level repeatable read read only",
  );
  assert.equal(statements.at(-1), "rollback");
  assert.ok(
    statements.every(
      (q) => !/create|alter|insert|update|delete|lock table/i.test(q),
    ),
  );
});
test("busy historical lock fails without opening a migration transaction", async () => {
  const statements: string[] = [];
  await assert.rejects(
    operateApplication(
      {
        query: async (q: string) => {
          statements.push(q);
          return { rows: [{ locked: false }] };
        },
      },
      { command: "apply", cohort, sourceCommit, profiles: [], planSha256 },
    ),
    /APPLICATION_OPERATOR_BUSY/,
  );
  assert.equal(statements.length, 1);
});
test("applicationDigest is actual SHA256, including when no profile exists", () => {
  assert.equal(
    applicationDigest(null),
    "74234e98afe7498fb5daf1f36ac2d78acc339464f950703b8c019892f982b90b",
  );
});
