import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  productionAiPayload,
  productionAiSource,
  productionAiIntegration,
  productionAiUpgrade,
} from "../scripts/production-ai-review.mjs";
import { hostedMigrationManifest } from "../scripts/hosted-release-guard.mjs";
const root = path.resolve(import.meta.dirname, ".."),
  owned = fs.mkdtempSync(path.join(os.tmpdir(), "kxra-ai-review-unit-"));
after(() => fs.rmSync(owned, { recursive: true, force: true }));
function cohort() {
  const dir = fs.mkdtempSync(path.join(owned, "candidate-"));
  for (const file of [
    "packages/release/hosted-schema-policy-v1.json",
    "packages/release/production-ai-review-v1.json",
    "database/production/ai-connection-admission-v1.sql",
    "database/proposals/ai-business-admission.sql",
  ]) {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.copyFileSync(path.join(root, file), path.join(dir, file));
  }
  const { base, spec, bytes } = productionAiPayload(dir);
  fs.mkdirSync(path.join(dir, "supabase/migrations"), { recursive: true });
  for (const m of base.migrations)
    fs.copyFileSync(
      path.join(root, "supabase/migrations", m.name),
      path.join(dir, "supabase/migrations", m.name),
    );
  fs.writeFileSync(
    path.join(dir, "supabase/migrations", spec.candidateMigration.name),
    bytes,
  );
  return dir;
}
test("production review retains full objective, has no terms/financial seeds or hosted execution authority", () => {
  const p = productionAiIntegration(root);
  assert.equal(p.authorization, false);
  assert.equal(p.fullReleaseEligible, false);
  assert.equal(p.objective, "FULL_FEATURE_LAUNCH_NO_PILOT_SUBSTITUTION");
  assert.equal(p.termsOrFinancialCommitmentsChanged, false);
  assert.equal(p.fullFeatureDependencies.length, 4);
  assert.equal(productionAiSource(cohort()).length, 118);
  assert.throws(
    () => hostedMigrationManifest(cohort()),
    /HOSTED_RELEASE_UNKNOWN_MIGRATION/,
  );
  assert.throws(
    () => productionAiSource(root),
    /HOSTED_RELEASE_FIXTURE_MIGRATION/,
  );
});
test("new review profile rejects changed/extra/missing/symlinked migration and unapproved extensions", () => {
  for (const kind of ["changed", "extra", "missing", "symlink"]) {
    const d = cohort(),
      p = path.join(d, "supabase/migrations/0118_ai_connection_admission.sql");
    if (kind === "changed") fs.appendFileSync(p, "\n-- changed");
    if (kind === "extra")
      fs.writeFileSync(
        path.join(d, "supabase/migrations/0119_unreviewed.sql"),
        "select 1;",
      );
    if (kind === "missing") fs.unlinkSync(p);
    if (kind === "symlink") {
      fs.unlinkSync(p);
      fs.symlinkSync(
        path.join(root, "database/production/ai-connection-admission-v1.sql"),
        p,
      );
    }
    assert.throws(() => productionAiSource(d));
  }
  assert.throws(
    () =>
      productionAiSource(cohort(), [
        "database/proposals/customer-connectors.sql",
      ]),
    /EXTENSIONS_FORBIDDEN/,
  );
});
test("review payload/source policy/objective remain hash bound and cannot silently drop a feature", () => {
  for (const kind of [
    "payload",
    "proposal",
    "base",
    "objective",
    "feature",
    "override",
  ]) {
    const d = cohort(),
      file = path.join(d, "packages/release/production-ai-review-v1.json"),
      m = JSON.parse(fs.readFileSync(file, "utf8"));
    if (kind === "payload")
      fs.appendFileSync(path.join(d, m.candidateMigration.payload), "\n");
    if (kind === "proposal")
      fs.appendFileSync(
        path.join(d, m.candidateMigration.sourceProposal),
        "\n",
      );
    if (kind === "base")
      fs.appendFileSync(
        path.join(d, "packages/release/hosted-schema-policy-v1.json"),
        "\n",
      );
    if (kind === "objective") m.objective = "PILOT";
    if (kind === "feature") m.fullFeatureDependencies.pop();
    if (kind === "override") m.fullReleaseEligible = true;
    fs.writeFileSync(file, JSON.stringify(m));
    assert.throws(() => productionAiPayload(d));
  }
});
test("117 upgrade plan has one genuine migration,118 resumes none and fixture119/hash drift is refused", () => {
  const d = cohort(),
    m = productionAiSource(d),
    rows = (n: number) =>
      m
        .slice(0, n)
        .map(({ name, sha256 }: { name: string; sha256: string }) => ({
          name,
          sha256,
          source_commit: "a".repeat(40),
        }));
  const p = productionAiUpgrade(d, { managed: true, applied: rows(117) });
  assert.equal(p.pending.length, 1);
  assert.equal(p.pending[0].name, "0118_ai_connection_admission.sql");
  assert.equal(p.apply_implemented, false);
  assert.equal(p.authorization, false);
  assert.equal(
    productionAiUpgrade(d, { managed: true, applied: rows(118) }).pending
      .length,
    0,
  );
  assert.throws(
    () =>
      productionAiUpgrade(d, {
        managed: true,
        applied: [
          ...rows(117),
          {
            name: "0118_fixture_paired_agents.sql",
            sha256: "a".repeat(64),
            source_commit: "b".repeat(40),
          },
        ],
      }),
    /UNKNOWN_MIGRATION/,
  );
  const r = rows(118);
  r[117].sha256 = "0".repeat(64);
  assert.throws(
    () => productionAiUpgrade(d, { managed: true, applied: r }),
    /HASH_MISMATCH/,
  );
});
