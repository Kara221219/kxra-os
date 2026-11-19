// Offline review strategy only. No database driver, network or apply capability.
import fs from "node:fs";
import path from "node:path";
import {
  migrationManifest,
  reconcileMigrationState,
} from "./staging-migrations-core.mjs";
import { hostedMigrationManifest } from "./hosted-release-guard.mjs";
const policy = JSON.parse(
  fs.readFileSync(
    new URL(
      "../packages/release/hosted-schema-policy-v1.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
export function integrationReleaseSource(root) {
  const real = fs.realpathSync(root),
    dir = path.join(real, "supabase/migrations");
  if (fs.realpathSync(dir) !== dir)
    throw Error("RELEASE_STRATEGY_SOURCE_SYMLINK");
  for (const name of fs.readdirSync(dir).filter((n) => n.endsWith(".sql")))
    if (!fs.lstatSync(path.join(dir, name)).isFile())
      throw Error("RELEASE_STRATEGY_SOURCE_NOT_REGULAR");
  const exclusions = policy.fixtureFiles.filter((f) =>
    f.path.startsWith("supabase/migrations/"),
  );
  if (
    exclusions.length !== 2 ||
    exclusions[0].path !==
      "supabase/migrations/0118_fixture_paired_agents.sql" ||
    exclusions[1].path !==
      "supabase/migrations/0119_paired_transport_confinement.sql"
  )
    throw Error("RELEASE_STRATEGY_EXCLUSIONS_CHANGED");
  const expected = [
      ...policy.migrations,
      ...exclusions.map((f) => ({
        name: path.basename(f.path),
        sha256: f.sha256,
      })),
    ],
    manifest = migrationManifest(real);
  if (
    JSON.stringify(manifest.map(({ name, sha256 }) => ({ name, sha256 }))) !==
    JSON.stringify(expected)
  )
    throw Error("RELEASE_STRATEGY_SOURCE_HASH_OR_SET_CHANGED");
  return { manifest, exclusions };
}
export function reviewHostedUpgrade(root, snapshot) {
  return reviewMigrationUpgrade(hostedMigrationManifest(root), snapshot);
}
// Offline plan over already validated in-memory source; grants no apply authority.
export function reviewMigrationUpgrade(manifest, snapshot) {
  if (
    !snapshot ||
    typeof snapshot !== "object" ||
    Array.isArray(snapshot) ||
    Object.keys(snapshot).sort().join(",") !== "applied,managed" ||
    typeof snapshot.managed !== "boolean" ||
    !Array.isArray(snapshot.applied)
  )
    throw Error("RELEASE_UPGRADE_SNAPSHOT_INVALID");
  const names = new Set();
  for (const row of snapshot.applied) {
    if (
      !row ||
      typeof row !== "object" ||
      Array.isArray(row) ||
      Object.keys(row).sort().join(",") !== "name,sha256,source_commit" ||
      typeof row.name !== "string" ||
      typeof row.sha256 !== "string" ||
      typeof row.source_commit !== "string" ||
      !/^[a-f0-9]{64}$/.test(row.sha256) ||
      !/^[a-f0-9]{40}$/.test(row.source_commit) ||
      names.has(row.name)
    )
      throw Error("RELEASE_UPGRADE_LEDGER_INVALID");
    names.add(row.name);
  }
  const state = reconcileMigrationState(
    manifest,
    snapshot.applied,
    snapshot.managed,
  );
  if (snapshot.applied.length && !snapshot.managed)
    throw Error("RELEASE_UPGRADE_SCHEMA_LEDGER_INCONSISTENT");
  if (snapshot.applied.some((row, i) => row.name !== manifest[i]?.name))
    throw Error("RELEASE_UPGRADE_LEDGER_NOT_PREFIX");
  return {
    status:
      state.applied === 0
        ? "INITIALIZATION_REVIEW_REQUIRED"
        : state.pending.length
          ? "UPGRADE_REVIEW_REQUIRED"
          : "UP_TO_DATE_REVIEW_REQUIRED",
    authorization: false,
    apply_implemented: false,
    applied: state.applied,
    pending: state.pending.map(({ name, sha256 }) => ({ name, sha256 })),
    rollback: {
      automatic_schema_downgrade: false,
      application_rollback_requires_compatible_schema: true,
      restore_requires_separate_approved_target: true,
    },
  };
}
