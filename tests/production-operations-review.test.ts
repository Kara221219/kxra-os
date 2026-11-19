import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  productionOperationsPayload,
  productionOperationsSource,
  productionOperationsUpgrade,
  productionOperationsIntegration,
} from "../scripts/production-operations-review.mjs";
import { hostedMigrationManifest } from "../scripts/hosted-release-guard.mjs";
const root = path.resolve(import.meta.dirname, ".."),
  owned = fs.mkdtempSync(path.join(os.tmpdir(), "kxra-operations-profile-"));
after(() => fs.rmSync(owned, { recursive: true, force: true }));
function cohort() {
  const d = fs.mkdtempSync(path.join(owned, "candidate-"));
  for (const file of [
    "packages/release/hosted-schema-policy-v1.json",
    "packages/release/production-ai-review-v1.json",
    "packages/release/production-operations-review-v1.json",
    "database/production/ai-connection-admission-v1.sql",
    "database/proposals/ai-business-admission.sql",
    "database/production/review-operations-v1.sql",
    "database/production/review-operations-v1.manifest.json",
  ]) {
    fs.mkdirSync(path.dirname(path.join(d, file)), { recursive: true });
    fs.copyFileSync(path.join(root, file), path.join(d, file));
  }
  const p = productionOperationsPayload(d);
  fs.mkdirSync(path.join(d, "supabase/migrations"), { recursive: true });
  for (const m of p.ai.base.migrations)
    fs.copyFileSync(
      path.join(root, "supabase/migrations", m.name),
      path.join(d, "supabase/migrations", m.name),
    );
  for (const [name, bytes] of [
    [p.ai.spec.candidateMigration.name, p.ai.bytes],
    [p.spec.candidateMigration.name, p.bytes],
  ])
    fs.writeFileSync(path.join(d, "supabase/migrations", name), bytes);
  return d;
}
test("combined production review retains all full-feature gates and existing hosted refusal", () => {
  const x = productionOperationsIntegration(root);
  assert.equal(x.authorization, false);
  assert.equal(x.fullReleaseEligible, false);
  assert.equal(x.defaultEnabled, false);
  assert.equal(x.featureDependencies.length, 4);
  assert.ok(
    x.featureDependencies.every(
      (f: { required: boolean; status: string }) =>
        f.required && f.status.startsWith("BLOCKED_"),
    ),
  );
  assert.equal(productionOperationsSource(cohort()).length, 119);
  assert.throws(() => hostedMigrationManifest(cohort()), /UNKNOWN_MIGRATION/);
  assert.throws(() => productionOperationsSource(root), /FIXTURE_MIGRATION/);
});
test("review upgrade accepts only exact production117 or AI118 prefixes, never fixture history or overrides", () => {
  const d = cohort(),
    m = productionOperationsSource(d);
  const rows = (n: number) =>
    m.slice(0, n).map(({ name, sha256 }) => ({
      name,
      sha256,
      source_commit: "a".repeat(40),
    }));
  for (const [n, pending] of [
    [0, 119],
    [117, 2],
    [118, 1],
    [119, 0],
  ]) {
    const x = productionOperationsUpgrade(d, {
      managed: n > 0,
      applied: rows(n),
    });
    assert.equal(x.pending.length, pending);
    assert.equal(x.apply_implemented, false);
    assert.equal(x.authorization, false);
    assert.equal(x.fullReleaseEligible, false);
    assert.equal(x.rollback.automatic_schema_downgrade, false);
  }
  for (const applied of [
    [
      ...rows(117),
      { ...rows(118)[117], name: "0118_fixture_paired_agents.sql" },
    ],
    [
      ...rows(118),
      { ...rows(119)[118], name: "0119_paired_transport_confinement.sql" },
    ],
    rows(119).map((r, i) => (i === 118 ? { ...r, sha256: "f".repeat(64) } : r)),
    rows(119).slice(1),
  ])
    assert.throws(() =>
      productionOperationsUpgrade(d, { managed: true, applied }),
    );
  assert.throws(() =>
    productionOperationsUpgrade(d, {
      managed: true,
      applied: rows(117),
      authorization: true,
    }),
  );
});
test("profile rejects missing, altered, extra, symlinked migrations and arbitrary extensions", () => {
  for (const change of ["missing", "changed", "extra", "symlink"]) {
    const d = cohort(),
      f = path.join(d, "supabase/migrations/0119_review_operations.sql");
    if (change === "missing") fs.unlinkSync(f);
    if (change === "changed") fs.appendFileSync(f, "\n-- drift");
    if (change === "extra")
      fs.writeFileSync(
        path.join(d, "supabase/migrations/0120_unreviewed.sql"),
        "select 1;",
      );
    if (change === "symlink") {
      fs.unlinkSync(f);
      fs.symlinkSync(
        path.join(root, "database/production/review-operations-v1.sql"),
        f,
      );
    }
    assert.throws(() => productionOperationsSource(d));
  }
  assert.throws(
    () =>
      productionOperationsSource(cohort(), [
        "database/proposals/custom-apps.sql",
      ]),
    /EXTENSIONS_FORBIDDEN/,
  );
});
test("payload, source inventory, AI dependency and held authorization fields remain hash-bound", () => {
  for (const change of [
    "payload",
    "inventory",
    "ai",
    "flag",
    "grants",
    "policy",
    "authorization",
    "fullRelease",
    "override",
  ]) {
    const d = cohort(),
      f = path.join(d, "packages/release/production-operations-review-v1.json"),
      spec = JSON.parse(fs.readFileSync(f, "utf8"));
    if (change === "payload")
      fs.appendFileSync(path.join(d, spec.candidateMigration.payload), "\n");
    if (change === "inventory")
      fs.appendFileSync(
        path.join(d, "database/production/review-operations-v1.manifest.json"),
        "\n",
      );
    if (change === "ai")
      fs.appendFileSync(
        path.join(d, "packages/release/production-ai-review-v1.json"),
        "\n",
      );
    if (change === "flag") spec.defaultEnabled = true;
    if (change === "grants") spec.grantsSeeded = true;
    if (change === "policy") spec.policyDataSeeded = true;
    if (change === "authorization") spec.authorization = true;
    if (change === "fullRelease") spec.fullReleaseEligible = true;
    if (change === "override") spec.apply_implemented = true;
    fs.writeFileSync(f, JSON.stringify(spec));
    assert.throws(() => productionOperationsPayload(d));
  }
});
