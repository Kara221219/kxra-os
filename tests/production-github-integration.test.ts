import { historicalCompositionBytes } from "./support/composition-policy-bytes";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { integrationReleaseSource } from "../scripts/production-release-strategy.mjs";
import {
  productionOperationsIntegration,
  productionOperationsSource,
} from "../scripts/production-operations-review.mjs";
import { hostedMigrationManifest } from "../scripts/hosted-release-guard.mjs";
const root = path.resolve(import.meta.dirname, ".."),
  m = JSON.parse(
    fs.readFileSync(
      path.join(root, "packages/release/production-github-integration-v1.json"),
      "utf8",
    ),
  );
const sha = (b: Buffer) => crypto.createHash("sha256").update(b).digest("hex");
const read = (p: string) => {
  assert.ok(!path.isAbsolute(p) && !p.split("/").includes(".."));
  const f = path.join(root, p);
  assert.equal(fs.realpathSync(f), f);
  assert.ok(fs.lstatSync(f).isFile());
  return fs.readFileSync(f);
};
test("integrated production composition retains exact reviewed component lineage and all source behavior", () => {
  assert.equal(
    m.classification,
    "LOCAL_PRODUCTION_COMPOSITION_REVIEW_NOT_RELEASE_AUTHORIZATION",
  );
  assert.deepEqual(m.reviewedHeads, {
    transport: "e1bcc90dd37566bbe7991b5adad3adab31fa4d92",
    outbox: "413ac0bf1068441f88e497e749cb0a320b2483c5",
    externalFence: "91bff50c9c212688062c6d2d891027ee7f70e279",
  });
  assert.equal(m.baseComposition, "bde07e39f47a12128c11554624c2e1c995bcb901");
  assert.equal(m.sourceFiles.length, 29);
  assert.equal(new Set(m.sourceFiles.map((f: any) => f.path)).size, 29);
  for (const f of m.sourceFiles) {
    const b = read(f.path);
    if (f.appendOnlyIntegrationNotes) {
      assert.ok(
        ["docs/operations/progress.md", "docs/operations/handover.md"].includes(
          f.path,
        ),
      );
      assert.ok(b.length > f.bytes);
      assert.equal(sha(b.subarray(0, f.bytes)), f.sha256);
    } else {
      const pinned = historicalCompositionBytes(f.path, b, f.sha256);
      assert.equal(pinned.length, f.bytes, f.path);
      assert.equal(sha(pinned), f.sha256, f.path);
    }
  }
});
test("original hosted and genuine119 review policies remain pinned with no GitHub migration promotion", () => {
  assert.equal(m.unchangedPolicyFiles.length, 8);
  for (const f of m.unchangedPolicyFiles)
    assert.equal(sha(read(f.path)), f.sha256, f.path);
  const source = integrationReleaseSource(root);
  assert.equal(source.manifest.length, 119);
  assert.equal(source.exclusions.length, 2);
  assert.deepEqual(m.migrationPromotions, []);
  assert.throws(() => hostedMigrationManifest(root), /FIXTURE_MIGRATION/);
  assert.throws(() => productionOperationsSource(root), /FIXTURE_MIGRATION/);
  assert.ok(
    m.sourceFiles.some(
      (f: any) => f.path === "database/production/github-outbox-v1.sql",
    ),
  );
  assert.ok(
    m.sourceFiles.some(
      (f: any) => f.path === "database/production/github-external-fence-v1.sql",
    ),
  );
});
test("integration manifest and server defaults cannot represent release or dispatch activation", () => {
  for (const k of [
    "authorization",
    "fullReleaseEligible",
    "defaultEnabled",
    "hostedExecutorImplemented",
    "productionSeededGrants",
    "termsOrFinancialCommitmentsChanged",
  ])
    assert.equal(m[k], false, k);
  assert.equal(m.objective, "FULL_FEATURE_LAUNCH_NO_PILOT_SUBSTITUTION");
  const spec = productionOperationsIntegration(root);
  assert.equal(spec.authorization, false);
  assert.equal(spec.fullReleaseEligible, false);
  assert.equal(spec.defaultEnabled, false);
  const env = read(".env.example").toString();
  for (const flag of [
    "KXRA_GITHUB_PROVIDER_ENABLED",
    "KXRA_GITHUB_OUTBOX_ENABLED",
  ])
    assert.match(env, new RegExp("^" + flag + "=false$", "m"));
});
test("combined recovery cohorts preserve independent-store, continuity and quiescence boundaries", () => {
  assert.match(m.schemaDomains.externalFenceReview, /Separate.*cluster/);
  assert.match(
    m.schemaDomains.externalFenceReview,
    /excluded from application migrations\/backups/,
  );
  assert.equal(m.requiredActivationGates.length, 6);
  for (const marker of [
    "RPO-zero",
    "store/realm/epoch",
    "worker-drain",
    "settling timer insufficient",
    "receipt projection",
  ])
    assert.ok(
      m.requiredActivationGates.some((s: string) => s.includes(marker)),
      marker,
    );
});
