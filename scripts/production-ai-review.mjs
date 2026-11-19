// Offline-only review profile. Existing hosted operators/guard are deliberately unchanged.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { migrationManifest } from "./staging-migrations-core.mjs";
import {
  integrationReleaseSource,
  reviewMigrationUpgrade,
} from "./production-release-strategy.mjs";
const repo = path.resolve(import.meta.dirname, "..");
const hash = (x) => crypto.createHash("sha256").update(x).digest("hex");
const policyPath = "packages/release/hosted-schema-policy-v1.json",
  specPath = "packages/release/production-ai-review-v1.json";
export function productionAiPayload(root = repo) {
  const real = fs.realpathSync(root);
  for (const file of [policyPath, specPath]) {
    const p = path.join(real, file);
    if (fs.realpathSync(p) !== p || !fs.lstatSync(p).isFile())
      throw Error("AI_REVIEW_REGULAR_SOURCE_REQUIRED");
  }
  const spec = JSON.parse(fs.readFileSync(path.join(real, specPath), "utf8")),
    base = JSON.parse(fs.readFileSync(path.join(real, policyPath), "utf8"));
  if (
    Object.keys(spec).sort().join(",") !==
      [
        "version",
        "classification",
        "authorization",
        "objective",
        "basePolicySha256",
        "baseMigrationCount",
        "candidateMigration",
        "policyDataSeeded",
        "termsOrFinancialCommitmentsChanged",
        "hostedExecutorImplemented",
        "fullFeatureDependencies",
      ]
        .sort()
        .join(",") ||
    spec.classification !==
      "PRODUCTION_AI_MIGRATION_REVIEW_ONLY_NOT_FULL_RELEASE" ||
    spec.version !== 1 ||
    spec.authorization !== false ||
    spec.baseMigrationCount !== 117 ||
    spec.basePolicySha256 !==
      hash(fs.readFileSync(path.join(real, policyPath))) ||
    spec.objective !== "FULL_FEATURE_LAUNCH_NO_PILOT_SUBSTITUTION" ||
    spec.policyDataSeeded !== false ||
    spec.termsOrFinancialCommitmentsChanged !== false ||
    spec.hostedExecutorImplemented !== false
  )
    throw Error("AI_REVIEW_POLICY_INVALID");
  const m = spec.candidateMigration;
  if (
    Object.keys(m).sort().join(",") !==
      ["name", "payload", "sha256", "sourceProposal", "sourceProposalSha256"]
        .sort()
        .join(",") ||
    m.name !== "0118_ai_connection_admission.sql" ||
    m.payload !== "database/production/ai-connection-admission-v1.sql" ||
    m.sourceProposal !== "database/proposals/ai-business-admission.sql"
  )
    throw Error("AI_REVIEW_PAYLOAD_IDENTITY_INVALID");
  for (const [file, digest] of [
    [m.payload, m.sha256],
    [m.sourceProposal, m.sourceProposalSha256],
  ]) {
    const p = path.join(real, file);
    if (
      fs.realpathSync(p) !== p ||
      !fs.lstatSync(p).isFile() ||
      hash(fs.readFileSync(p)) !== digest
    )
      throw Error("AI_REVIEW_PAYLOAD_HASH_OR_TYPE_CHANGED");
  }
  const bytes = fs.readFileSync(path.join(real, m.payload), "utf8"),
    proposal = fs.readFileSync(path.join(real, m.sourceProposal), "utf8");
  if (
    bytes.slice(bytes.indexOf("begin;")) !==
    proposal.slice(proposal.indexOf("begin;"))
  )
    throw Error("AI_REVIEW_PROPOSAL_SEMANTICS_CHANGED");
  const required = [
    "Paired agents",
    "Customer connectors",
    "Schema-defined apps and records",
    "Signup, payment, AI connection and useful execution",
  ];
  if (
    JSON.stringify(spec.fullFeatureDependencies.map((f) => f.feature)) !==
      JSON.stringify(required) ||
    spec.fullFeatureDependencies.some(
      (f) =>
        f.required !== true ||
        !f.status.startsWith("BLOCKED_") ||
        typeof f.reason !== "string" ||
        !f.reason,
    )
  )
    throw Error("AI_REVIEW_FULL_FEATURE_REQUIREMENTS_CHANGED");
  return { spec, base, bytes };
}
export function productionAiSource(root, extensions = []) {
  if (!Array.isArray(extensions) || extensions.length)
    throw Error("HOSTED_RELEASE_EXTENSIONS_FORBIDDEN");
  const real = fs.realpathSync(root),
    dir = path.join(real, "supabase/migrations");
  if (fs.realpathSync(dir) !== dir) throw Error("AI_REVIEW_MIGRATION_SYMLINK");
  for (const name of fs.readdirSync(dir).filter((n) => n.endsWith(".sql"))) {
    const p = path.join(dir, name);
    if (fs.realpathSync(p) !== p || !fs.lstatSync(p).isFile())
      throw Error("AI_REVIEW_MIGRATION_NOT_REGULAR");
  }
  const { base, spec } = productionAiPayload(real),
    manifest = migrationManifest(real),
    allowed = [
      ...base.migrations,
      {
        name: spec.candidateMigration.name,
        sha256: spec.candidateMigration.sha256,
      },
    ];
  const fixtureNames = new Set(
    base.fixtureFiles
      .filter((f) => f.path.startsWith("supabase/migrations/"))
      .map((f) => path.basename(f.path)),
  );
  for (const m of manifest) {
    if (fixtureNames.has(m.name))
      throw Error("HOSTED_RELEASE_FIXTURE_MIGRATION:" + m.name);
    const a = allowed.find((x) => x.name === m.name);
    if (!a) throw Error("AI_REVIEW_UNKNOWN_MIGRATION:" + m.name);
    if (a.sha256 !== m.sha256)
      throw Error("AI_REVIEW_MIGRATION_HASH_CHANGED:" + m.name);
  }
  if (manifest.length !== 118) throw Error("AI_REVIEW_MANIFEST_INCOMPLETE");
  return manifest;
}
export function productionAiUpgrade(root, snapshot) {
  return {
    ...reviewMigrationUpgrade(productionAiSource(root), snapshot),
    fullReleaseEligible: false,
    objective: "FULL_FEATURE_LAUNCH_NO_PILOT_SUBSTITUTION",
  };
}
export function productionAiIntegration(root) {
  integrationReleaseSource(root);
  const { spec } = productionAiPayload(root);
  return {
    ...spec,
    status: "REVIEW_ONLY_FULL_FEATURE_RELEASE_BLOCKED",
    authorization: false,
    sourceMigrations: 119,
    productionBaseMigrations: 117,
    candidateAiMigrations: 118,
    fullReleaseEligible: false,
  };
}
