// Offline, exact review cohort only. Does not authorize or implement hosted execution.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { migrationManifest } from "./staging-migrations-core.mjs";
import { productionAiPayload } from "./production-ai-review.mjs";
import {
  integrationReleaseSource,
  reviewMigrationUpgrade,
} from "./production-release-strategy.mjs";
const repo = path.resolve(import.meta.dirname, "..");
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
const regular = (root, file) => {
  const p = path.join(root, file);
  if (fs.realpathSync(p) !== p || !fs.lstatSync(p).isFile())
    throw Error("OPERATIONS_REVIEW_REGULAR_SOURCE_REQUIRED");
  return fs.readFileSync(p);
};
export function productionOperationsPayload(root = repo) {
  const real = fs.realpathSync(root),
    ai = productionAiPayload(real);
  const spec = JSON.parse(
    regular(real, "packages/release/production-operations-review-v1.json"),
  );
  const keys = [
    "version",
    "classification",
    "authorization",
    "fullReleaseEligible",
    "objective",
    "baseAiReviewSha256",
    "operationsManifestSha256",
    "candidateMigration",
    "defaultEnabled",
    "policyDataSeeded",
    "grantsSeeded",
    "termsOrFinancialCommitmentsChanged",
    "hostedExecutorImplemented",
  ];
  if (
    Object.keys(spec).sort().join(",") !== keys.sort().join(",") ||
    spec.version !== 1 ||
    spec.classification !==
      "PRODUCTION_OPERATIONS_MIGRATION_REVIEW_ONLY_NOT_FULL_RELEASE" ||
    spec.authorization !== false ||
    spec.fullReleaseEligible !== false ||
    spec.objective !== ai.spec.objective ||
    spec.defaultEnabled !== false ||
    spec.policyDataSeeded !== false ||
    spec.grantsSeeded !== false ||
    spec.termsOrFinancialCommitmentsChanged !== false ||
    spec.hostedExecutorImplemented !== false ||
    spec.baseAiReviewSha256 !==
      sha(regular(real, "packages/release/production-ai-review-v1.json"))
  )
    throw Error("OPERATIONS_REVIEW_POLICY_INVALID");
  const m = spec.candidateMigration;
  if (
    !m ||
    Object.keys(m).sort().join(",") !== "name,payload,sha256" ||
    m.name !== "0119_review_operations.sql" ||
    m.payload !== "database/production/review-operations-v1.sql" ||
    !/^[a-f0-9]{64}$/.test(m.sha256)
  )
    throw Error("OPERATIONS_REVIEW_IDENTITY_INVALID");
  const manifestBytes = regular(
      real,
      "database/production/review-operations-v1.manifest.json",
    ),
    body = regular(real, m.payload),
    inventory = JSON.parse(manifestBytes);
  if (
    sha(manifestBytes) !== spec.operationsManifestSha256 ||
    sha(body) !== m.sha256 ||
    inventory.payload !== m.payload ||
    inventory.payloadSha256 !== m.sha256 ||
    inventory.requiredAiPayloadSha256 !== ai.spec.candidateMigration.sha256 ||
    inventory.hostedEligible !== false ||
    inventory.defaultEnabled !== false ||
    inventory.seededGrants !== false ||
    inventory.seededPolicies !== false ||
    inventory.fullFeatureLaunchRequired !== true
  )
    throw Error("OPERATIONS_REVIEW_HASH_OR_BOUNDARY_CHANGED");
  return { spec, ai, inventory, bytes: body.toString("utf8") };
}
export function productionOperationsSource(root, extensions = []) {
  if (!Array.isArray(extensions) || extensions.length)
    throw Error("HOSTED_RELEASE_EXTENSIONS_FORBIDDEN");
  const real = fs.realpathSync(root),
    dir = path.join(real, "supabase/migrations");
  if (fs.realpathSync(dir) !== dir)
    throw Error("OPERATIONS_REVIEW_MIGRATION_SYMLINK");
  for (const n of fs.readdirSync(dir).filter((n) => n.endsWith(".sql")))
    regular(real, "supabase/migrations/" + n);
  const { ai, spec } = productionOperationsPayload(real),
    manifest = migrationManifest(real);
  const allowed = [
    ...ai.base.migrations,
    {
      name: ai.spec.candidateMigration.name,
      sha256: ai.spec.candidateMigration.sha256,
    },
    {
      name: spec.candidateMigration.name,
      sha256: spec.candidateMigration.sha256,
    },
  ];
  const fixtureNames = ai.base.fixtureFiles
    .filter((f) => f.path.startsWith("supabase/migrations/"))
    .map((f) => path.basename(f.path));
  for (const m of manifest) {
    if (fixtureNames.includes(m.name))
      throw Error("HOSTED_RELEASE_FIXTURE_MIGRATION:" + m.name);
    const a = allowed.find((a) => a.name === m.name);
    if (!a) throw Error("OPERATIONS_REVIEW_UNKNOWN_MIGRATION:" + m.name);
    if (a.sha256 !== m.sha256)
      throw Error("OPERATIONS_REVIEW_MIGRATION_HASH_CHANGED:" + m.name);
  }
  if (manifest.length !== 119)
    throw Error("OPERATIONS_REVIEW_MANIFEST_INCOMPLETE");
  return manifest;
}
export function productionOperationsUpgrade(root, snapshot) {
  return {
    ...reviewMigrationUpgrade(productionOperationsSource(root), snapshot),
    authorization: false,
    fullReleaseEligible: false,
    defaultEnabled: false,
    objective: "FULL_FEATURE_LAUNCH_NO_PILOT_SUBSTITUTION",
  };
}
export function productionOperationsIntegration(root) {
  integrationReleaseSource(root);
  const p = productionOperationsPayload(root);
  return {
    ...p.spec,
    status: "REVIEW_ONLY_FULL_FEATURE_RELEASE_BLOCKED",
    featureDependencies: p.ai.spec.fullFeatureDependencies,
  };
}
