// Exact application source cohort. This module never opens a database or loads credentials.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
const repo = path.resolve(import.meta.dirname, "..");
const sha = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const additions = [
  ["0118_ai_connection_admission.sql", "ai-connection-admission-v1.sql"],
  ["0119_review_operations.sql", "review-operations-v1.sql"],
  ["0120_github_outbox.sql", "github-outbox-v1.sql"],
  ["0121_paired_admission.sql", "paired-admission-v1.sql"],
  ["0122_paired_setup_policy.sql", "paired-setup-policy-v1.sql"],
  ["0123_paired_setup_options.sql", "paired-setup-options-v1.sql"],
  ["0124_custom_apps.sql", "custom-apps-v1.sql"],
  [
    "0125_custom_app_session_attestation.sql",
    "custom-app-session-attestation-v1.sql",
  ],
];
function regular(root, relative) {
  const file = path.join(root, relative);
  assert.equal(fs.realpathSync(file), file, "COHORT_SYMLINK_FORBIDDEN");
  assert.ok(fs.lstatSync(file).isFile(), "COHORT_REGULAR_FILE_REQUIRED");
  return fs.readFileSync(file);
}
export function applicationReleaseCohort(root = repo) {
  root = fs.realpathSync(root);
  const directory = "database/releases/application-v1";
  const manifest = JSON.parse(regular(root, `${directory}/manifest.json`));
  const baseline = JSON.parse(
    regular(root, "packages/release/hosted-schema-policy-v1.json"),
  );
  assert.equal(manifest.version, 1);
  assert.equal(
    manifest.classification,
    "APPLICATION_MIGRATION_COHORT_NOT_RUNTIME_OR_HOSTED_ACCEPTANCE",
  );
  assert.equal(
    manifest.sourceCommit,
    "b763774d86c28b64b5549662feb5a20d3a509fc7",
  );
  assert.equal(manifest.baselineCount, 117);
  assert.equal(manifest.migrationCount, 125);
  for (const flag of [
    "authorization",
    "fullReleaseEligible",
    "hostedExecutorImplemented",
  ])
    assert.equal(manifest[flag], false);
  assert.equal(baseline.migrations.length, 117);
  assert.equal(manifest.migrations.length, 125);
  assert.deepEqual(
    fs.readdirSync(path.join(root, directory, "migrations")).sort(),
    manifest.migrations.map((m) => m.name),
  );
  const migrations = manifest.migrations.map((entry, index) => {
    const expected =
      index < 117
        ? [
            baseline.migrations[index].name,
            `supabase/migrations/${baseline.migrations[index].name}`,
          ]
        : [
            additions[index - 117][0],
            `database/production/${additions[index - 117][1]}`,
          ];
    assert.deepEqual(Object.keys(entry).sort(), ["name", "sha256", "source"]);
    assert.equal(entry.name, expected[0]);
    assert.equal(entry.source, expected[1]);
    assert.match(entry.sha256, /^[a-f0-9]{64}$/);
    const bytes = regular(root, `${directory}/migrations/${entry.name}`);
    assert.equal(sha(bytes), entry.sha256, `COHORT_HASH:${entry.name}`);
    assert.deepEqual(
      bytes,
      regular(root, entry.source),
      `COHORT_SOURCE:${entry.name}`,
    );
    if (index < 117)
      assert.equal(entry.sha256, baseline.migrations[index].sha256);
    return {
      ...entry,
      bytes,
      sql: bytes
        .toString("utf8")
        .replace(/^([\s\S]*?)\bbegin;\s*/i, "$1")
        .replace(/commit;\s*$/i, ""),
    };
  });
  assert.equal(manifest.externalDomains.length, 2);
  for (const [index, name] of [
    "github-external-fence-v1.sql",
    "paired-external-fence-v1.sql",
  ].entries()) {
    const entry = manifest.externalDomains[index];
    assert.equal(entry.source, `database/production/${name}`);
    assert.equal(entry.applicationInstallForbidden, true);
    assert.equal(entry.sha256, sha(regular(root, entry.source)));
    assert.ok(!migrations.some((m) => m.source === entry.source));
  }
  return { manifest, migrations };
}
export function applicationReleasePlan(cohort, applied) {
  assert.ok(
    Array.isArray(applied) && applied.length <= cohort.migrations.length,
    "COHORT_LEDGER_INVALID",
  );
  for (const [index, row] of applied.entries()) {
    assert.equal(
      row.name,
      cohort.migrations[index].name,
      "COHORT_LEDGER_PREFIX_INVALID",
    );
    assert.equal(
      row.sha256,
      cohort.migrations[index].sha256,
      "COHORT_LEDGER_HASH_INVALID",
    );
    assert.match(
      row.source_commit,
      /^[a-f0-9]{40}$/,
      "COHORT_LEDGER_PROVENANCE_INVALID",
    );
  }
  return {
    authorization: false,
    fullReleaseEligible: false,
    applied: applied.length,
    pending: cohort.migrations
      .slice(applied.length)
      .map(({ name, sha256 }) => ({ name, sha256 })),
    livePrerequisites: [...cohort.manifest.livePrerequisites],
  };
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  assert.equal(process.argv.length, 2, "NO_TARGET_OR_ARGUMENTS_ACCEPTED");
  const c = applicationReleaseCohort();
  console.log(
    JSON.stringify(
      {
        status: "APPLICATION_COHORT_SOURCE_VERIFIED",
        authorization: false,
        fullReleaseEligible: false,
        migrations: c.migrations.length,
        externalDomains: c.manifest.externalDomains.length,
      },
      null,
      2,
    ),
  );
}
