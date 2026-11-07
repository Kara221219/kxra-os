import {
  isPaymentCancellationTransitionFile,
  verifyPaymentCancellationTransition,
} from "./support/payment-cancellation-transition";
import { assertHostedPairedSetupTransition } from "../scripts/hosted-paired-setup-payload.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  historicalCompositionBytes,
  pairedSetupEnvironmentAppend,
} from "./support/composition-policy-bytes";
const root = path.resolve(import.meta.dirname, ".."),
  sha = (b: Buffer) => crypto.createHash("sha256").update(b).digest("hex"),
  prior = Buffer.from("# Existing controls\nKXRA_BILLING_HTTP_ENABLED=false\n"),
  expected = sha(prior),
  approved = Buffer.concat([prior, Buffer.from(pairedSetupEnvironmentAppend)]);
test("historical source pins accept only the exact reviewed default-off append", () => {
  assert.deepEqual(
    historicalCompositionBytes(".env.example", prior, expected),
    prior,
  );
  assert.deepEqual(
    historicalCompositionBytes(".env.example", approved, expected),
    prior,
  );
  for (const bytes of [
    Buffer.from(approved.toString().replace("UI_PROOF=0", "UI_PROOF=1")),
    Buffer.from(
      approved.toString().replace("HTTP_ENABLED=false", "HTTP_ENABLED=true"),
    ),
    Buffer.concat([approved, Buffer.from("UNKNOWN_FLAG=true\n")]),
    Buffer.from(approved.toString().replace("# Existing", "# Changed")),
  ])
    assert.throws(() =>
      historicalCompositionBytes(".env.example", bytes, expected),
    );
  assert.throws(() =>
    historicalCompositionBytes("other-policy.json", approved, expected),
  );
});
test("paired composition preserves historical manifests and exact authority pins", () => {
  const m = JSON.parse(
    fs.readFileSync(
      path.join(root, "packages/release/production-paired-integration-v1.json"),
      "utf8",
    ),
  );
  for (const key of [
    "authorization",
    "fullReleaseEligible",
    "defaultEnabled",
    "customerPolicyChanged",
    "numberedMigrationsChanged",
  ])
    assert.equal(m[key], false, key);
  for (const f of [...m.integratedSourceFiles, ...m.preservedCompositionFiles])
    if (isPaymentCancellationTransitionFile(f.path))
      verifyPaymentCancellationTransition(
        f.path,
        fs.readFileSync(path.join(root, f.path)),
        f.sha256,
      );
    else assertHostedPairedSetupTransition(f.path, f.sha256, root);
  for (const name of [
    "production-payment-integration-v1.json",
    "production-refresh-integration-v1.json",
  ]) {
    const prior = JSON.parse(
      fs.readFileSync(path.join(root, "packages/release", name), "utf8"),
    );
    const files =
      prior.unchangedPolicyFiles ?? prior.unchangedAuthorityPolicyFiles;
    for (const f of files)
      assert.equal(
        sha(
          historicalCompositionBytes(
            f.path,
            fs.readFileSync(path.join(root, f.path)),
            f.sha256,
          ),
        ),
        f.sha256,
        f.path,
      );
  }
  assert.deepEqual(m.migrationPromotions, []);
  assert.match(
    fs.readFileSync(path.join(root, ".env.example"), "utf8"),
    /^KXRA_PAIRED_SETUP_UI_PROOF=0$/m,
  );
});
