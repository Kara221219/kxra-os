import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  evidenceDigest,
  inspectReleaseCandidate,
  releaseCandidate,
  releaseCandidateFindings,
  releaseCandidateReadiness,
} from "./staging-release-candidate-core.mjs";
import { validateStagingTarget } from "./staging-migrations-core.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const recoveryEvidencePath = path.join(
  root,
  "docs",
  "operations",
  "evidence",
  "hosted-recovery-evidence-v1.json",
);

export const recoveryEvidence = Object.freeze(
  JSON.parse(fs.readFileSync(recoveryEvidencePath, "utf8")),
);
export const recoveryEvidenceSha256 = evidenceDigest(recoveryEvidence);
export const releaseReviewEvidenceSha256 = Object.freeze({
  ACCESSIBILITY:
    "2feee278d56074fa3e3c0181764570216ce1cf53556f3851aea584b4411f2464",
  SECURITY: "cd40f172307dc3e27cddcebf108164fd11a0362724b5b344fa9aabac55f3f39d",
});
export const releaseFinalizationOperatorReference =
  "KXRA-STAGING-RELEASE-FINALIZATION-V1";

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

export function recoveryEvidenceFindings(value = recoveryEvidence) {
  const findings = [];
  if (
    value.schema !== "kxra-hosted-recovery-evidence-v1" ||
    value.environment !== "staging" ||
    value.provider !== "Supabase"
  )
    findings.push("hosted recovery evidence identity is invalid");
  if (
    value.sourceProjectRef !== "jlebgsxcvhvpueuibekd" ||
    !/^[a-z0-9]{20}$/.test(value.recoveryProjectRef || "") ||
    value.recoveryProjectRef === value.sourceProjectRef ||
    value.region !== "eu-west-2"
  )
    findings.push("hosted recovery project boundary is invalid");
  if (
    value.backup?.type !== "PHYSICAL" ||
    value.backup?.status !== "COMPLETED" ||
    value.backup?.createdAt !== "2026-10-03T06:38:46.000Z" ||
    value.restore?.status !== "COMPLETED" ||
    value.restore?.completedAt !== "2026-10-03T18:42:32.000Z" ||
    value.restore?.isolatedFromSource !== true
  )
    findings.push("hosted backup or isolated restore is incomplete");
  const verification = value.databaseVerification || {};
  if (
    verification.migrationCount !== 80 ||
    verification.latestMigration !==
      "0080_allow_checkout_after_cancelled_subscription.sql" ||
    verification.rlsProtectedTableCount !== 172 ||
    verification.releaseManifestCount !== 1 ||
    verification.releaseVersion !== releaseCandidate.releaseVersion ||
    verification.releaseState !== "BLOCKED" ||
    verification.projectRecordCount !== 12 ||
    verification.postBackupReviewTablePresent !== false
  )
    findings.push("restored database verification is incomplete");
  if (
    !Array.isArray(value.recoveryLimits) ||
    value.recoveryLimits.length !== 5 ||
    typeof value.assertion !== "string" ||
    value.assertion.length < 80
  )
    findings.push("recovery limits or assertion are incomplete");
  return findings;
}

export const recoveryProviderEvidence = Object.freeze({
  key: "BACKUP_RESTORE",
  status: "PASS",
  reference: "docs/operations/evidence/hosted-recovery-evidence-v1.json",
  sha256: recoveryEvidenceSha256,
});

export function validateReleaseFinalizationOperator(environment, command) {
  const findings = validateStagingTarget(environment);
  if (!["plan", "apply", "verify"].includes(command))
    findings.push("command must be plan, apply or verify");
  if (command === "apply") {
    const expected = `FINALIZE-RELEASE:${environment.KXRA_STAGING_PROJECT_REF || ""}:${releaseCandidate.releaseVersion}:${recoveryEvidenceSha256}:codex/phase-2-completion`;
    if (environment.KXRA_STAGING_FINALIZATION_CONFIRMATION !== expected)
      findings.push(
        `KXRA_STAGING_FINALIZATION_CONFIRMATION must equal ${expected}`,
      );
  }
  return { ok: findings.length === 0, findings };
}

async function setOwnerContext(database, orgId) {
  const owner = (
    await database.query(
      "select id from kxra.members where org_id=$1 and role='owner' and active order by id limit 1",
      [orgId],
    )
  ).rows[0];
  if (!owner) throw Error("RELEASE_FINALIZATION_OWNER_MISSING");
  await database.query(
    "select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true),set_config('request.kxra.org_id',$3,true)",
    [owner.id, JSON.stringify({ sub: owner.id, aal: "aal2" }), orgId],
  );
  return owner.id;
}

export async function inspectReleaseFinalization(database) {
  const candidate = await inspectReleaseCandidate(database);
  if (!candidate.manifest)
    return {
      ...candidate,
      ownerId: null,
      candidateSha256: null,
      reviews: [],
      finalization: null,
    };
  const ownerId = await setOwnerContext(database, candidate.manifest.org_id);
  const reviews = (
    await database.query(
      `select id,review_type,reviewer_id,reviewer_name,candidate_sha256,
        evidence_sha256,checklist,status,attested_at
       from kxra.release_review_attestations
       where release_manifest_id=$1 order by review_type`,
      [candidate.manifest.id],
    )
  ).rows;
  const finalization = (
    await database.query(
      `select id,org_id,release_manifest_id,base_candidate_sha256,
        recovery_evidence_sha256,recovery_evidence,
        accessibility_attestation_id,security_attestation_id,
        operator_reference,finalized_at
       from kxra.release_finalizations where release_manifest_id=$1`,
      [candidate.manifest.id],
    )
  ).rows[0];
  const candidateSha256 = finalization
    ? finalization.base_candidate_sha256
    : (
        await database.query(
          "select kxra.release_candidate_digest($1) as sha256",
          [candidate.manifest.id],
        )
      ).rows[0].sha256;
  return {
    ...candidate,
    ownerId,
    candidateSha256,
    reviews,
    finalization,
  };
}

function reviewMap(reviews) {
  return new Map(reviews.map((review) => [review.review_type, review]));
}

function checklistPasses(checklist) {
  return (
    checklist &&
    typeof checklist === "object" &&
    Object.keys(checklist).length > 0 &&
    Object.values(checklist).every((value) => value === true)
  );
}

function reviewSummary(review) {
  return {
    status: "PASS",
    reviewer: review.reviewer_name,
    reviewed_at: new Date(review.attested_at).toISOString(),
    evidence_sha256: review.evidence_sha256,
    attestation_id: review.id,
  };
}

export function finalizedCommercialConfiguration(reviews) {
  const byType = reviewMap(reviews);
  return {
    ...releaseCandidate.commercialConfiguration,
    provider_evidence: [
      ...releaseCandidate.commercialConfiguration.provider_evidence,
      recoveryProviderEvidence,
    ],
    accessibility_review: reviewSummary(byType.get("ACCESSIBILITY")),
    security_review: reviewSummary(byType.get("SECURITY")),
  };
}

export function releaseFinalizationStatus(state) {
  const unsafe = [...recoveryEvidenceFindings()];
  if (!state.manifest)
    return { unsafe: [...unsafe, "release candidate is missing"], pending: [] };
  if (!state.ownerId) unsafe.push("release owner is missing");
  const byType = reviewMap(state.reviews || []);
  if (
    state.reviews?.length !== 2 ||
    !byType.has("ACCESSIBILITY") ||
    !byType.has("SECURITY")
  )
    unsafe.push("exact accessibility and security attestations are required");
  for (const kind of ["ACCESSIBILITY", "SECURITY"]) {
    const review = byType.get(kind);
    if (
      !review ||
      review.status !== "PASS" ||
      review.candidate_sha256 !== state.candidateSha256 ||
      review.evidence_sha256 !== releaseReviewEvidenceSha256[kind] ||
      !checklistPasses(review.checklist)
    )
      unsafe.push(`${kind.toLowerCase()} attestation is invalid`);
  }
  if (unsafe.length) return { unsafe, pending: [] };

  const expectedCommercial = finalizedCommercialConfiguration(state.reviews);
  if (state.manifest.state === "BLOCKED") {
    const baseFindings = releaseCandidateFindings(state);
    if (baseFindings.length) unsafe.push(...baseFindings);
    if (state.finalization)
      unsafe.push("blocked release already has finalization evidence");
    return {
      unsafe,
      pending: unsafe.length ? [] : ["release evidence finalization pending"],
    };
  }
  if (state.manifest.state !== "READY")
    return {
      unsafe: [...unsafe, "release manifest state is not finalizable"],
      pending: [],
    };
  const accessibility = byType.get("ACCESSIBILITY");
  const security = byType.get("SECURITY");
  if (
    !state.finalization ||
    state.finalization.org_id !== releaseCandidate.orgId ||
    state.finalization.release_manifest_id !== state.manifest.id ||
    state.finalization.base_candidate_sha256 !== state.candidateSha256 ||
    state.finalization.recovery_evidence_sha256 !== recoveryEvidenceSha256 ||
    !same(state.finalization.recovery_evidence, recoveryEvidence) ||
    state.finalization.accessibility_attestation_id !== accessibility.id ||
    state.finalization.security_attestation_id !== security.id ||
    state.finalization.operator_reference !==
      releaseFinalizationOperatorReference ||
    !same(state.manifest.commercial_configuration, expectedCommercial)
  )
    unsafe.push("finalized release evidence differs from the reviewed source");
  return { unsafe, pending: [] };
}

export async function applyReleaseFinalization(database) {
  const initial = await inspectReleaseFinalization(database);
  const status = releaseFinalizationStatus(initial);
  if (status.unsafe.length)
    throw Error(
      `RELEASE_FINALIZATION_TAKEOVER_REJECTED:${status.unsafe.join(";")}`,
    );
  if (!status.pending.length) return initial;
  const byType = reviewMap(initial.reviews);
  const accessibility = byType.get("ACCESSIBILITY");
  const security = byType.get("SECURITY");
  const configuration = finalizedCommercialConfiguration(initial.reviews);
  const updated = await database.query(
    `update kxra.release_manifests
     set commercial_configuration=$1,state='READY'
     where id=$2 and state='BLOCKED'`,
    [JSON.stringify(configuration), initial.manifest.id],
  );
  if (updated.rowCount !== 1)
    throw Error("RELEASE_FINALIZATION_CONCURRENT_CHANGE");
  const finalization = (
    await database.query(
      `insert into kxra.release_finalizations(
        org_id,release_manifest_id,base_candidate_sha256,
        recovery_evidence_sha256,recovery_evidence,
        accessibility_attestation_id,security_attestation_id,operator_reference
       ) values($1,$2,$3,$4,$5,$6,$7,$8) returning *`,
      [
        initial.manifest.org_id,
        initial.manifest.id,
        initial.candidateSha256,
        recoveryEvidenceSha256,
        JSON.stringify(recoveryEvidence),
        accessibility.id,
        security.id,
        releaseFinalizationOperatorReference,
      ],
    )
  ).rows[0];
  await database.query(
    `insert into kxra.audit_events(org_id,actor_id,action,resource_id,metadata)
     values($1,null,'release.evidence.finalized',$2,$3)`,
    [
      initial.manifest.org_id,
      finalization.id,
      {
        manifest_id: initial.manifest.id,
        base_candidate_sha256: initial.candidateSha256,
        recovery_evidence_sha256: recoveryEvidenceSha256,
        operator_reference: releaseFinalizationOperatorReference,
      },
    ],
  );
  const readiness = await releaseCandidateReadiness(database);
  if (!readiness?.ready || readiness.blockers.length)
    throw Error(
      `RELEASE_FINALIZATION_READINESS_FAILED:${JSON.stringify(readiness)}`,
    );
  return inspectReleaseFinalization(database);
}
