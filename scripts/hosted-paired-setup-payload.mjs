// Offline source composition only. No database, credentials, provider or activation.
import path from "node:path";
import crypto from "node:crypto";
import assert from "node:assert/strict";
import {
  assertCustomerProviderCompositionTransition,
  assertCustomerProviderCompositionRoot,
  readCustomerProviderCompositionFile,
} from "./customer-provider-composition-transition.mjs";
const repo = path.resolve(import.meta.dirname, ".."),
  sha = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const changes = [
  "apps/os/components/PairedSetupForm.tsx",
  "apps/os/components/PairedSetupPage.production.tsx",
  "apps/os/lib/paired-setup.production.ts",
  "tests/production-paired-composition.test.ts",
];
export function hostedPairedSetupPayload(root = repo) {
  assertCustomerProviderCompositionRoot(root);
  const spec = JSON.parse(
    readCustomerProviderCompositionFile(
      root,
      "packages/release/hosted-paired-setup-v1.json",
    ).toString("utf8"),
  );
  assert.equal(
    spec.classification,
    "REQUEST_ONLY_HOSTED_SETUP_SOURCE_NOT_ACTIVATION",
  );
  assert.equal(spec.baseCommit, "b763774d86c28b64b5549662feb5a20d3a509fc7");
  for (const flag of [
    "authorization",
    "defaultEnabled",
    "fullReleaseEligible",
    "numberedMigrationsChanged",
    "deviceCredentialsIssued",
    "providerExecutionImplemented",
  ])
    assert.equal(spec[flag], false);
  assert.equal(
    spec.requiredSqlSessionGuard,
    "kxra_paired_admission.hosted_setup_session_current()",
  );
  assert.deepEqual(spec.transitions.map((f) => f.path).sort(), changes);
  assert.equal(
    new Set(spec.sourceFiles.map((f) => f.path)).size,
    spec.sourceFiles.length,
  );
  for (const file of [...spec.sourceFiles, ...spec.preservedSources]) {
    assert.ok(
      !path.isAbsolute(file.path) && !file.path.split("/").includes(".."),
    );
    if (
      assertCustomerProviderCompositionTransition(file.path, file.sha256, root)
    )
      continue;
    assert.equal(
      sha(readCustomerProviderCompositionFile(root, file.path)),
      file.sha256,
      file.path,
    );
  }
  const prior = JSON.parse(
    readCustomerProviderCompositionFile(
      root,
      "packages/release/production-paired-integration-v1.json",
    ).toString("utf8"),
  );
  for (const change of spec.transitions) {
    assert.equal(
      [...prior.integratedSourceFiles, ...prior.preservedCompositionFiles].find(
        (f) => f.path === change.path,
      )?.sha256,
      change.priorSha256,
    );
    assert.equal(
      spec.sourceFiles.find((f) => f.path === change.path)?.sha256,
      change.sha256,
    );
  }
  return spec;
}
export function assertHostedPairedSetupTransition(file, baseSha, root = repo) {
  if (assertCustomerProviderCompositionTransition(file, baseSha, root)) return;
  const actual = sha(readCustomerProviderCompositionFile(root, file));
  if (actual === baseSha) return;
  const spec = hostedPairedSetupPayload(root),
    change = spec.transitions.find((t) => t.path === file);
  assert.ok(change, "UNREVIEWED_HOSTED_SETUP_TRANSITION " + file);
  assert.equal(change.priorSha256, baseSha);
  assert.equal(change.sha256, actual);
}
