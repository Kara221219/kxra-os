import assert from "node:assert/strict";
import { test } from "node:test";
import path from "node:path";
import {
  canonicalSeedManifest,
  canonicalSeedProfile,
  reconcileSeedState,
  validateStagingSeeder,
} from "../scripts/staging-seeds-core.mjs";

const root = path.resolve(import.meta.dirname, "..");
const projectRef = "abcdefghijklmnopqrst";
const base = {
  KXRA_ENVIRONMENT: "staging",
  KXRA_STAGING_PROJECT_REF: projectRef,
  KXRA_STAGING_MIGRATOR_DATABASE_URL: `postgresql://postgres:private-password@db.${projectRef}.supabase.co:5432/postgres?sslmode=verify-full`,
};

test("canonical staging seed manifest binds only reviewed public registers", () => {
  const manifest = canonicalSeedManifest(root);
  assert.equal(manifest.profile, canonicalSeedProfile);
  assert.match(manifest.sha256, /^[a-f0-9]{64}$/);
  assert.equal(manifest.bundle.projects.length, 7);
  assert.deepEqual(
    manifest.bundle.projects.map((project: { id: string }) => project.id),
    [
      "PROJECT-001",
      "PROJECT-002",
      "PROJECT-003",
      "PROJECT-004",
      "PROJECT-005",
      "PROJECT-006",
      "PROJECT-007",
    ],
  );
  assert.ok(manifest.recordCodes.includes("PROJECT-007-BRIEF"));
  assert.ok(!manifest.files.some((file) => file.name.includes("partner")));
});

test("canonical staging seed apply needs its own exact confirmation", () => {
  assert.equal(validateStagingSeeder(base, "plan").ok, true);
  const missing = validateStagingSeeder(base, "apply");
  assert.equal(missing.ok, false);
  assert.ok(
    missing.findings.includes(
      `KXRA_STAGING_SEED_CONFIRMATION must equal SEED:${projectRef}:codex/phase-2-completion`,
    ),
  );
  assert.equal(
    validateStagingSeeder(
      {
        ...base,
        KXRA_STAGING_SEED_CONFIRMATION: `SEED:${projectRef}:codex/phase-2-completion`,
      },
      "apply",
    ).ok,
    true,
  );
});

test("canonical staging seed history rejects unmanaged, changed and wrong profiles", () => {
  const manifest = canonicalSeedManifest(root);
  assert.deepEqual(reconcileSeedState(manifest, null, false), {
    applied: false,
  });
  assert.throws(
    () => reconcileSeedState(manifest, null, true),
    /STAGING_UNMANAGED_CANONICAL_SEED/,
  );
  assert.throws(
    () =>
      reconcileSeedState(
        manifest,
        { profile: manifest.profile, sha256: "a".repeat(64) },
        true,
      ),
    /STAGING_SEED_HASH_MISMATCH/,
  );
  assert.throws(
    () =>
      reconcileSeedState(
        manifest,
        { profile: "UNKNOWN", sha256: manifest.sha256 },
        true,
      ),
    /STAGING_SEED_PROFILE_MISMATCH/,
  );
  assert.deepEqual(
    reconcileSeedState(
      manifest,
      { profile: manifest.profile, sha256: manifest.sha256 },
      true,
    ),
    { applied: true },
  );
});
