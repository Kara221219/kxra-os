import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import { applicationDigest } from "../scripts/production-application-core.mjs";
import {
  ledgerMetadataFindings,
  validateUpgradeProfiles,
  validateUpgradeEnvironment,
  operateApplicationUpgrade,
} from "../scripts/production-application-upgrade-core.mjs";
const shape = JSON.parse(
  fs.readFileSync(
    new URL(
      "../packages/release/production-application-upgrade-ledger-v1.json",
      import.meta.url,
    ),
    "utf8",
  ),
).shape;
function metadata(major = 17): any {
  return {
    shape: structuredClone(shape),
    droppedColumns: 0,
    policies: [],
    triggers: [],
    rules: [],
    columnAcls: [],
    acls: [
      "DELETE",
      "INSERT",
      "REFERENCES",
      "SELECT",
      "TRIGGER",
      "TRUNCATE",
      "UPDATE",
      ...(major >= 17 ? ["MAINTAIN"] : []),
    ]
      .sort()
      .map((privilege) => ({
        grantee: "postgres",
        grantor: "postgres",
        privilege,
        grantable: false,
      })),
  };
}
for (const major of [14, 17])
  test(`RLS-enabled exact ledger metadata accepted on ${major}`, () =>
    assert.deepEqual(
      ledgerMetadataFindings(metadata(major), String(major)),
      [],
    ));
for (const privilege of ["TRUNCATE", "TRIGGER", "REFERENCES", "MAINTAIN"])
  test(`observed service_role ${privilege} remains an explicit blocker`, () => {
    const m = metadata();
    m.acls.push({
      grantee: "service_role",
      grantor: "postgres",
      privilege,
      grantable: false,
    });
    const result = ledgerMetadataFindings(m, "17");
    assert.equal(result[0].code, "LEDGER_NON_OWNER_PRIVILEGES_FORBIDDEN");
    assert.deepEqual(result[0].grants, m.acls.slice(-1));
  });
for (const [name, mutate] of [
  ["RLS disabled", (m: any) => (m.shape.table.rls = false)],
  ["FORCE RLS", (m: any) => (m.shape.table.force_rls = true)],
  ["other owner", (m: any) => (m.shape.table.owner = "service_role")],
  [
    "column default",
    (m: any) => (m.shape.columns[3].default = "clock_timestamp()"),
  ],
  [
    "extra column",
    (m: any) => m.shape.columns.push({ ...m.shape.columns[0], name: "extra" }),
  ],
  ["missing check", (m: any) => m.shape.constraints.pop()],
  ["unvalidated check", (m: any) => (m.shape.constraints[1].validated = false)],
  ["invalid index", (m: any) => (m.shape.indexes[0].valid = false)],
  ["policy", (m: any) => m.policies.push({ name: "open" })],
  ["trigger", (m: any) => m.triggers.push({ name: "write" })],
  ["rule", (m: any) => m.rules.push({ name: "rewrite" })],
  ["column ACL", (m: any) => m.columnAcls.push({ grantee: "authenticated" })],
  ["dropped column", (m: any) => (m.droppedColumns = 1)],
] as const)
  test(`ledger metadata refuses ${name}`, () => {
    const m = metadata();
    mutate(m);
    assert.ok(ledgerMetadataFindings(m, "17").length > 0);
  });
test("lossless timestamp fingerprint distinguishes a single microsecond", () => {
  const row = {
    name: "0001_core.sql",
    source_commit: "a".repeat(40),
    sha256: "b".repeat(64),
    applied_at: "2026-10-05T23:03:50.756352Z",
  };
  assert.notEqual(
    applicationDigest([row]),
    applicationDigest([{ ...row, applied_at: "2026-10-05T23:03:50.756353Z" }]),
  );
  assert.equal(
    new Date(row.applied_at).getTime(),
    new Date("2026-10-05T23:03:50.756353Z").getTime(),
  );
});
test("upgrade profile requires every exact82 through126 prefix", () => {
  const profile = {
    id: "application-upgrade-postgres17-source",
    serverMajor: "17",
    sourceCohortSha256: "a".repeat(64),
    catalogs: Object.fromEntries(
      Array.from({ length: 45 }, (_, i) => [String(i + 82), "b".repeat(64)]),
    ),
  };
  const policy = {
    version: 1,
    classification: "SOURCE_DERIVED_PREFIX82_126_NOT_HOSTED_ACCEPTANCE",
    minimumPrefix: 82,
    maximumPrefix: 126,
    projectRef: "lhbgeucifxxcdoyrnesf",
    profiles: [profile],
  };
  assert.deepEqual(validateUpgradeProfiles(policy), [profile]);
  const broken = structuredClone(policy);
  delete broken.profiles[0].catalogs["99"];
  assert.throws(() => validateUpgradeProfiles(broken));
  assert.throws(() =>
    validateUpgradeProfiles({ ...policy, minimumPrefix: 81 }),
  );
  assert.throws(() =>
    validateUpgradeProfiles({ ...policy, profiles: [profile, profile] }),
  );
});
test("upgrade apply requires its own exact source/project/plan confirmation", () => {
  const env = {
    KXRA_ENVIRONMENT: "production",
    KXRA_PRODUCTION_PROJECT_REF: "lhbgeucifxxcdoyrnesf",
    KXRA_PRODUCTION_SOURCE_COMMIT: "a".repeat(40),
    KXRA_PRODUCTION_MIGRATOR_DATABASE_URL:
      "postgresql://postgres:test-only@db.lhbgeucifxxcdoyrnesf.supabase.co/postgres?sslmode=verify-full",
    KXRA_PRODUCTION_APPLICATION_UPGRADE_PLAN_SHA256: "b".repeat(64),
    KXRA_PRODUCTION_APPLICATION_UPGRADE_CONFIRMATION: `UPGRADE82_126:lhbgeucifxxcdoyrnesf:${"a".repeat(40)}:${"b".repeat(64)}`,
  };
  assert.equal(validateUpgradeEnvironment(env, "apply").ok, true);
  assert.equal(
    validateUpgradeEnvironment(
      {
        ...env,
        KXRA_PRODUCTION_APPLICATION_UPGRADE_CONFIRMATION:
          "INITIALIZE:lhbgeucifxxcdoyrnesf",
      },
      "apply",
    ).ok,
    false,
  );
  assert.equal(validateUpgradeEnvironment(env, "reset").ok, false);
});
test("missing plan fails before any database operation", async () => {
  const calls: string[] = [];
  await assert.rejects(
    operateApplicationUpgrade(
      {
        query: async (q: string) => {
          calls.push(q);
          return { rows: [] };
        },
      },
      {
        command: "apply",
        sourceCommit: "a".repeat(40),
        cohort: {},
        profiles: [],
        planSha256: undefined,
      },
    ),
    /APPLICATION_UPGRADE_REVIEWED_PLAN_REQUIRED/,
  );
  assert.deepEqual(calls, []);
});
