import assert from "node:assert/strict";
import { test } from "node:test";
import path from "node:path";
import {
  expectedStagingDatabase,
  migrationManifest,
  reconcileMigrationState,
  validateStagingMigrator,
} from "../scripts/staging-migrations-core.mjs";

const root = path.resolve(import.meta.dirname, "..");
const projectRef = "abcdefghijklmnopqrst";
const base = {
  KXRA_ENVIRONMENT: "staging",
  KXRA_STAGING_PROJECT_REF: projectRef,
  KXRA_STAGING_MIGRATOR_DATABASE_URL: `postgresql://postgres:private-password@db.${projectRef}.supabase.co:5432/postgres?sslmode=verify-full`,
};

test("staging migration manifest is contiguous and hash-bound", () => {
  const manifest = migrationManifest(root);
  assert.equal(manifest.length, expectedStagingDatabase.migrations);
  assert.match(manifest[0].sha256, /^[a-f0-9]{64}$/);
  assert.equal(manifest.at(-1)?.name, "0074_add_venture_intake_projects.sql");
});

test("staging migrator accepts only the declared Supabase direct or session target", () => {
  assert.deepEqual(validateStagingMigrator(base, "plan"), {
    ok: true,
    findings: [],
  });
  assert.equal(
    validateStagingMigrator(
      {
        ...base,
        KXRA_STAGING_MIGRATOR_DATABASE_URL: `postgresql://postgres.${projectRef}:private-password@aws-0-eu-west-2.pooler.supabase.com:5432/postgres?sslmode=verify-full`,
      },
      "verify",
    ).ok,
    true,
  );
  const rejected = validateStagingMigrator(
    {
      ...base,
      VERCEL: "1",
      VERCEL_ENV: "production",
      KXRA_STAGING_MIGRATOR_DATABASE_URL: `postgresql://postgres:private-password@attacker.invalid:6543/postgres?sslmode=verify-full&sslmode=require&options=unsafe#fragment`,
    },
    "plan",
  );
  assert.equal(rejected.ok, false);
  assert.ok(
    rejected.findings.includes(
      "staging operator commands cannot run inside Vercel",
    ),
  );
  assert.ok(
    rejected.findings.includes("migrator URL must not contain a fragment"),
  );
  assert.ok(
    rejected.findings.includes("migrator URL must use sslmode=verify-full"),
  );
  assert.ok(
    rejected.findings.includes(
      "migrator URL must use direct or session-pooler port 5432",
    ),
  );
  assert.ok(
    rejected.findings.includes(
      "migrator URL must target the declared Supabase project",
    ),
  );
  assert.ok(
    rejected.findings.includes(
      "migrator URL may contain only the sslmode parameter",
    ),
  );
});

test("staging apply needs the exact project and phase-branch confirmation", () => {
  const missing = validateStagingMigrator(base, "apply");
  assert.equal(missing.ok, false);
  assert.ok(
    missing.findings.includes(
      `KXRA_STAGING_MIGRATION_CONFIRMATION must equal APPLY:${projectRef}:codex/phase-2-completion`,
    ),
  );
  assert.equal(
    validateStagingMigrator(
      {
        ...base,
        KXRA_STAGING_MIGRATION_CONFIRMATION: `APPLY:${projectRef}:codex/phase-2-completion`,
      },
      "apply",
    ).ok,
    true,
  );
});

test("staging migration state rejects unmanaged, unknown and altered history", () => {
  const manifest = migrationManifest(root);
  assert.throws(
    () => reconcileMigrationState(manifest, [], true),
    /STAGING_UNMANAGED_KXRA_SCHEMA/,
  );
  assert.throws(
    () =>
      reconcileMigrationState(
        manifest,
        [{ name: "9999_unknown.sql", sha256: "a".repeat(64) }],
        true,
      ),
    /STAGING_UNKNOWN_MIGRATION/,
  );
  assert.throws(
    () =>
      reconcileMigrationState(
        manifest,
        [{ name: manifest[0].name, sha256: "a".repeat(64) }],
        true,
      ),
    /STAGING_MIGRATION_HASH_MISMATCH/,
  );
  const one = reconcileMigrationState(
    manifest,
    [{ name: manifest[0].name, sha256: manifest[0].sha256 }],
    true,
  );
  assert.equal(one.applied, 1);
  assert.equal(one.pending.length, manifest.length - 1);
});
