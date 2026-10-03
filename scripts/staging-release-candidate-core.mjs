import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  foundingPlan,
  inspectFoundingPlan,
} from "./staging-founding-plan-core.mjs";
import {
  inspectLegalDocuments,
  legalDocuments,
  legalDocumentFindings,
  legalOrganisationId,
} from "./staging-legal-documents-core.mjs";
import { validateStagingTarget } from "./staging-migrations-core.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidencePath = path.join(
  root,
  "docs",
  "operations",
  "evidence",
  "release-candidate-v1.json",
);
const publicationManifestPath = path.join(
  root,
  "apps",
  "marketing",
  "content",
  "publication-manifest.json",
);

export const releaseCandidateEvidence = Object.freeze(
  JSON.parse(fs.readFileSync(evidencePath, "utf8")),
);
const publicationManifest = JSON.parse(
  fs.readFileSync(publicationManifestPath, "utf8"),
);

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, stable(item)]),
    );
  return value;
}

function same(left, right) {
  return JSON.stringify(stable(left)) === JSON.stringify(stable(right));
}

export function evidenceDigest(item) {
  return sha256(JSON.stringify(stable(item)));
}

export const releaseCandidate = Object.freeze({
  orgId: legalOrganisationId,
  releaseName: releaseCandidateEvidence.releaseName,
  releaseVersion: releaseCandidateEvidence.releaseVersion,
  legalDocumentRefs: legalDocuments.map((document) => ({
    document_id: document.id,
    version: document.databaseVersion,
    sha256: document.sha256,
  })),
  commercialConfiguration: {
    plan_code: foundingPlan.key,
    plan_name: foundingPlan.name,
    price_minor: foundingPlan.versions[0].amountMinor,
    currency: foundingPlan.currency,
    billing_interval: foundingPlan.versions[0].interval,
    included_usage: {
      brand_studio_access: true,
      brand_generations_per_month: 120,
      brand_exports_per_month: 120,
      rollover: false,
    },
    custom_projects_separate: true,
    cancellation_policy:
      "Customers may cancel at any time. Cancellation takes effect at the end of the current paid billing period and prevents the next renewal.",
    refund_policy:
      "Started subscription periods are non-refundable except for duplicate or incorrect charges, a material service failure accepted by KXRA, or where law requires a refund.",
    grace_policy:
      "A failed renewal has a seven-calendar-day grace period. KXRA may then suspend generation and export and may provide read-only access for up to 30 days from the first failed payment.",
    tax_treatment:
      "KXRA is not VAT registered. VAT is not currently added to the stated price; any future chargeable tax must be configured and shown before payment.",
    retention_policy: {
      customer_data_days: 90,
      backup_days: 35,
      deletion_process:
        "After workspace closure, ordinary customer content is scheduled for deletion or irreversible anonymisation within 90 days; encrypted backup copies expire within a further 35 days unless a legal hold applies.",
      legal_basis:
        "Contract performance, requested pre-contract steps, legitimate interests, legal obligation and consent where applicable, as stated in the approved Privacy Notice.",
    },
    subprocessors: [
      {
        name: "Vercel",
        purpose: "Application hosting",
        location:
          "Provider-controlled locations; lawful UK transfer safeguards apply where required",
      },
      {
        name: "Supabase",
        purpose: "Authentication and database services",
        location:
          "Provider-controlled locations; lawful UK transfer safeguards apply where required",
      },
      {
        name: "Resend",
        purpose: "Transactional email",
        location:
          "Provider-controlled locations; lawful UK transfer safeguards apply where required",
      },
      {
        name: "Stripe",
        purpose: "Subscription billing and payment processing",
        location:
          "Provider-controlled locations; lawful UK transfer safeguards apply where required",
      },
    ],
    public_copy_sha256: publicationManifest.sha256,
    provider_evidence: releaseCandidateEvidence.providerEvidence.map(
      (item) => ({
        key: item.key,
        status: item.status,
        reference: item.reference,
        sha256: evidenceDigest(item),
      }),
    ),
    accessibility_review: {},
    security_review: {},
  },
  supportChannels: releaseCandidateEvidence.support,
  state: "BLOCKED",
  legalOwner: releaseCandidateEvidence.legalOwner,
  commercialOwner: releaseCandidateEvidence.commercialOwner,
  reviewedAt: releaseCandidateEvidence.reviewedAt,
});

export const expectedReleaseBlockers = Object.freeze([
  "PROVIDER_EVIDENCE_INCOMPLETE",
  "ACCESSIBILITY_REVIEW_MISSING_OR_INVALID",
  "SECURITY_REVIEW_MISSING_OR_INVALID",
]);

export function validateReleaseCandidateOperator(environment, command) {
  const findings = validateStagingTarget(environment);
  if (!["plan", "apply", "verify"].includes(command))
    findings.push("command must be plan, apply or verify");
  if (command === "apply") {
    const expected = `RELEASE-CANDIDATE:${environment.KXRA_STAGING_PROJECT_REF || ""}:${releaseCandidate.releaseVersion}:codex/phase-2-completion`;
    if (environment.KXRA_STAGING_RELEASE_CONFIRMATION !== expected)
      findings.push(`KXRA_STAGING_RELEASE_CONFIRMATION must equal ${expected}`);
  }
  return { ok: findings.length === 0, findings };
}

export async function inspectReleaseCandidate(database) {
  const manifest = (
    await database.query(
      `select id,org_id,release_name,release_version,legal_document_refs,
        commercial_configuration,support_channels,state,legal_owner,
        commercial_owner,reviewed_at
       from kxra.release_manifests where org_id=$1 and release_version=$2`,
      [releaseCandidate.orgId, releaseCandidate.releaseVersion],
    )
  ).rows[0];
  return {
    manifest,
    legal: await inspectLegalDocuments(database),
    plan: await inspectFoundingPlan(database),
  };
}

export function releaseCandidateFindings(state) {
  const findings = [];
  if (!state.legal || legalDocumentFindings(state.legal).length)
    findings.push("approved legal pack is incomplete or mismatched");
  if (
    !state.plan?.plan ||
    state.plan.plan.id !== foundingPlan.id ||
    state.plan.plan.plan_key !== foundingPlan.key ||
    state.plan.plan.name !== foundingPlan.name ||
    state.plan.plan.state !== "ACTIVE" ||
    state.plan.versions.length !== foundingPlan.versions.length ||
    state.plan.features.length !==
      foundingPlan.versions.length * foundingPlan.features.length
  )
    findings.push("founding plan is missing");
  const row = state.manifest;
  if (!row) return [...findings, "release candidate is missing"];
  if (
    row.org_id !== releaseCandidate.orgId ||
    row.release_name !== releaseCandidate.releaseName ||
    row.release_version !== releaseCandidate.releaseVersion ||
    !same(row.legal_document_refs, releaseCandidate.legalDocumentRefs) ||
    !same(
      row.commercial_configuration,
      releaseCandidate.commercialConfiguration,
    ) ||
    !same(row.support_channels, releaseCandidate.supportChannels) ||
    row.state !== releaseCandidate.state ||
    row.legal_owner !== releaseCandidate.legalOwner ||
    row.commercial_owner !== releaseCandidate.commercialOwner ||
    new Date(row.reviewed_at).toISOString() !== releaseCandidate.reviewedAt
  )
    findings.push("release candidate differs from the reviewed source");
  return findings;
}

export function unsafeReleaseCandidateState(state) {
  if (!state.manifest) return [];
  return releaseCandidateFindings(state);
}

export async function applyReleaseCandidate(database) {
  const initial = await inspectReleaseCandidate(database);
  const blockers = unsafeReleaseCandidateState(initial);
  if (blockers.length)
    throw Error(`RELEASE_CANDIDATE_TAKEOVER_REJECTED:${blockers.join(";")}`);
  if (!initial.manifest)
    await database.query(
      `insert into kxra.release_manifests(
        org_id,release_name,release_version,legal_document_refs,
        commercial_configuration,support_channels,state,legal_owner,
        commercial_owner,reviewed_at
       ) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        releaseCandidate.orgId,
        releaseCandidate.releaseName,
        releaseCandidate.releaseVersion,
        JSON.stringify(releaseCandidate.legalDocumentRefs),
        JSON.stringify(releaseCandidate.commercialConfiguration),
        JSON.stringify(releaseCandidate.supportChannels),
        releaseCandidate.state,
        releaseCandidate.legalOwner,
        releaseCandidate.commercialOwner,
        releaseCandidate.reviewedAt,
      ],
    );
}

export async function releaseCandidateReadiness(database) {
  const state = await inspectReleaseCandidate(database);
  if (!state.manifest) return null;
  const owner = (
    await database.query(
      "select id from kxra.members where org_id=$1 and role='owner' and active order by id limit 1",
      [releaseCandidate.orgId],
    )
  ).rows[0];
  if (!owner) throw Error("RELEASE_CANDIDATE_OWNER_MISSING");
  await database.query(
    "select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true),set_config('request.kxra.org_id',$3,true)",
    [
      owner.id,
      JSON.stringify({ sub: owner.id, aal: "aal2" }),
      releaseCandidate.orgId,
    ],
  );
  return (
    await database.query("select * from kxra.release_manifest_check($1)", [
      state.manifest.id,
    ])
  ).rows[0];
}
