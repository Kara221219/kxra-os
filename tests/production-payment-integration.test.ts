import {
  isPaymentCancellationTransitionFile,
  verifyPaymentCancellationTransition,
} from "./support/payment-cancellation-transition";
import { historicalCompositionBytes } from "./support/composition-policy-bytes";
import {
  isNextSecurityTransitionFile,
  verifyNextSecurityTransition,
} from "./support/next-security-transition";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { integrationReleaseSource } from "../scripts/production-release-strategy.mjs";
import { hostedMigrationManifest } from "../scripts/hosted-release-guard.mjs";
const root = path.resolve(import.meta.dirname, ".."),
  manifest = JSON.parse(
    fs.readFileSync(
      path.join(
        root,
        "packages/release/production-payment-integration-v1.json",
      ),
      "utf8",
    ),
  );
const read = (p: string) => {
  assert.ok(!path.isAbsolute(p) && !p.split("/").includes(".."));
  const f = path.join(root, p);
  assert.equal(fs.realpathSync(f), f);
  return fs.readFileSync(f);
};
const sha = (b: Buffer) => crypto.createHash("sha256").update(b).digest("hex");
test("payment composition pins exact repair source and unchanged customer, proof and release policies", () => {
  assert.equal(
    manifest.baseComposition,
    "041d2009ea5258c9e5806c98360168f2b8f4e800",
  );
  assert.equal(
    manifest.reviewedPaymentHead,
    "8eb3f9d4c5a88fc885bc8a9b4a9077bc511d83d8",
  );
  assert.equal(
    manifest.classification,
    "LOCAL_PAYMENT_REPAIR_COMPOSITION_NOT_RELEASE_AUTHORIZATION",
  );
  assert.equal(manifest.paymentSourceFiles.length, 4);
  assert.equal(manifest.unchangedPolicyFiles.length, 15);
  for (const f of [
    ...manifest.paymentSourceFiles,
    ...manifest.unchangedPolicyFiles,
  ]) {
    const bytes = read(f.path);
    if (isPaymentCancellationTransitionFile(f.path))
      verifyPaymentCancellationTransition(f.path, bytes, f.sha256);
    else if (isNextSecurityTransitionFile(f.path))
      verifyNextSecurityTransition(f.path, bytes, f.sha256);
    else
      assert.equal(
        sha(historicalCompositionBytes(f.path, bytes, f.sha256)),
        f.sha256,
        f.path,
      );
  }
});
test("payment integration cannot enable billing, relax policy or promote migrations", () => {
  for (const key of [
    "authorization",
    "fullReleaseEligible",
    "defaultEnabled",
    "termsPricesFinancialCommitmentsChanged",
    "sqlOrScheduleChanges",
  ])
    assert.equal(manifest[key], false, key);
  assert.deepEqual(manifest.migrationPromotions, []);
  assert.equal(integrationReleaseSource(root).manifest.length, 119);
  assert.throws(() => hostedMigrationManifest(root), /FIXTURE_MIGRATION/);
  const env = read(".env.example").toString();
  for (const flag of [
    "KXRA_PORTAL_DELIVERY_ENABLED",
    "KXRA_MODERN_BILLING_DISPATCH_ENABLED",
    "KXRA_GITHUB_PROVIDER_ENABLED",
    "KXRA_GITHUB_OUTBOX_ENABLED",
  ])
    assert.match(env, new RegExp("^" + flag + "=false$", "m"));
  assert.equal(manifest.hostedGates.length, 5);
  for (const marker of ["END_OF_PAID_PERIOD", "Capacity", "quiescence"])
    assert.ok(
      manifest.hostedGates.some((g: string) => g.includes(marker)),
      marker,
    );
});
