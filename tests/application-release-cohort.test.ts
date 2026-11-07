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
test("application cohort contains exact baseline and eight genuine payloads, not external fences or fixture pairing", () => {
  assert.equal(cohort.migrations.length, 125);
  assert.equal(cohort.migrations[117].name, "0118_ai_connection_admission.sql");
  assert.equal(
    cohort.migrations[124].name,
    "0125_custom_app_session_attestation.sql",
  );
  assert.ok(
    cohort.migrations
      .slice(117)
      .every(
        (m) =>
          !m.name.includes("fixture") && !m.name.includes("external_fence"),
      ),
  );
  assert.equal(cohort.manifest.externalDomains.length, 2);
});
for (const prefix of [0, 113, 117, 118, 119, 120, 124, 125])
  test(`ordered matching prefix ${prefix} has exact remaining plan`, () => {
    const plan = applicationReleasePlan(cohort, rows.slice(0, prefix));
    assert.equal(plan.pending.length, 125 - prefix);
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
