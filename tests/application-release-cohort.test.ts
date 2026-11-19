import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applicationReleaseCohort,
  applicationReleasePlan,
} from "../scripts/application-release-cohort.mjs";
const cohort = applicationReleaseCohort();
const rows = cohort.migrations.map((m: { name: string; sha256: string }) => ({
  name: m.name,
  sha256: m.sha256,
  source_commit: cohort.manifest.sourceCommit,
}));
test("application cohort contains exact baseline and nine genuine payloads, not external fences or fixture pairing", () => {
  assert.equal(cohort.migrations.length, 126);
  assert.equal(cohort.migrations[117].name, "0118_ai_connection_admission.sql");
  assert.equal(
    cohort.migrations[124].name,
    "0125_custom_app_session_attestation.sql",
  );
  assert.ok(
    cohort.migrations
      .slice(117)
      .every(
        (m: { name: string }) =>
          !m.name.includes("fixture") && !m.name.includes("external_fence"),
      ),
  );
  assert.equal(cohort.migrations[125].name, "0126_paired_setup_session.sql");
  assert.equal(cohort.manifest.externalDomains.length, 2);
});
for (const prefix of [0, 113, 117, 118, 119, 120, 124, 125, 126])
  test(`ordered matching prefix ${prefix} has exact remaining plan`, () => {
    const plan = applicationReleasePlan(cohort, rows.slice(0, prefix));
    assert.equal(plan.pending.length, 126 - prefix);
    assert.equal(plan.authorization, false);
    assert.equal(plan.fullReleaseEligible, false);
  });
for (const [name, changed] of [
  [
    "fixture118",
    [
      ...rows.slice(0, 117),
      { ...rows[117], name: "0118_fixture_paired_agents.sql" },
    ],
  ],
  ["changed hash", [{ ...rows[0], sha256: "0".repeat(64) }]],
  ["missing prefix", rows.slice(1, 3)],
  ["duplicate", [rows[0], rows[0]]],
  ["reordered", [rows[1], rows[0]]],
  ["missing provenance", [{ ...rows[0], source_commit: "" }]],
  ["extra migration", [...rows, rows[124]]],
] as const)
  test(`refuses ${name} without proposing apply`, () =>
    assert.throws(() => applicationReleasePlan(cohort, changed)));

for (const mutation of [
  "changed bytes",
  "unknown file",
  "missing file",
  "symlink",
  "reordered manifest",
  "forged external domain",
])
  test(`source validation refuses ${mutation}`, () => {
    const root = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), "kxra-cohort-source-")),
    );
    const source = path.resolve(import.meta.dirname, "..");
    try {
      for (const rel of [
        "database/releases/application-v1",
        "database/production",
        "supabase/migrations",
      ])
        fs.cpSync(path.join(source, rel), path.join(root, rel), {
          recursive: true,
        });
      fs.mkdirSync(path.join(root, "packages/release"), { recursive: true });
      fs.copyFileSync(
        path.join(source, "packages/release/hosted-schema-policy-v1.json"),
        path.join(root, "packages/release/hosted-schema-policy-v1.json"),
      );
      const dir = path.join(root, "database/releases/application-v1"),
        file = path.join(
          dir,
          "migrations/0125_custom_app_session_attestation.sql",
        );
      if (mutation === "changed bytes")
        fs.appendFileSync(file, "\n-- modified\n");
      if (mutation === "unknown file")
        fs.writeFileSync(
          path.join(dir, "migrations/0126_unknown.sql"),
          "select 1;",
        );
      if (mutation === "missing file") fs.unlinkSync(file);
      if (mutation === "symlink") {
        fs.unlinkSync(file);
        fs.symlinkSync(
          path.join(
            root,
            "database/production/custom-app-session-attestation-v1.sql",
          ),
          file,
        );
      }
      if (
        mutation === "reordered manifest" ||
        mutation === "forged external domain"
      ) {
        const manifestFile = path.join(dir, "manifest.json"),
          spec = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
        if (mutation === "reordered manifest")
          [spec.migrations[117], spec.migrations[118]] = [
            spec.migrations[118],
            spec.migrations[117],
          ];
        else spec.externalDomains[0].applicationInstallForbidden = false;
        fs.writeFileSync(manifestFile, JSON.stringify(spec));
      }
      assert.throws(() => applicationReleaseCohort(root));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
