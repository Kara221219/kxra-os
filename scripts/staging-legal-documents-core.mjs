import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateStagingTarget } from "./staging-migrations-core.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(
  root,
  "apps",
  "marketing",
  "content",
  "legal-draft-v1.json",
);
const approvalPath = path.join(
  root,
  "apps",
  "marketing",
  "content",
  "legal-approval-v1.json",
);

export const legalPackBytes = fs.readFileSync(sourcePath);
export const legalPack = JSON.parse(legalPackBytes.toString("utf8"));
export const legalApproval = JSON.parse(fs.readFileSync(approvalPath, "utf8"));
export const legalOrganisationId = "10000000-0000-4000-8000-000000000001";
export const legalStagingProjectRef = "jlebgsxcvhvpueuibekd";

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function approvedDocuments() {
  const actualPackHash = sha256(legalPackBytes);
  if (actualPackHash !== legalApproval.packSha256)
    throw Error("LEGAL_PACK_HASH_MISMATCH");
  if (
    legalApproval.packSha256 !==
    "8277d2cbad017feaf4fea238d9eecedd1e7cfff0aaab6fa80fca5a239a8783a9"
  )
    throw Error("LEGAL_APPROVAL_HASH_UNEXPECTED");
  if (legalApproval.vatStatus !== "NOT_VAT_REGISTERED")
    throw Error("LEGAL_VAT_STATUS_UNEXPECTED");
  return legalApproval.documents.map((approved) => {
    const source = legalPack.documents.find(
      (document) => document.slug === approved.slug,
    );
    if (!source) throw Error(`LEGAL_DOCUMENT_SOURCE_MISSING:${approved.slug}`);
    const renderedContent = JSON.stringify(source);
    if (sha256(renderedContent) !== approved.sha256)
      throw Error(`LEGAL_DOCUMENT_HASH_MISMATCH:${approved.slug}`);
    return {
      ...approved,
      title: source.title,
      documentType: source.documentType,
      renderedContent,
      immutableObjectKey: `git:apps/marketing/content/legal-draft-v1.json#${approved.slug};pack-sha256=${legalApproval.packSha256}`,
    };
  });
}

export const legalDocuments = Object.freeze(approvedDocuments());

const wording = {
  terms:
    "I confirm that I am acting for a business customer and accept the KXRA Business Subscription Terms version 1.",
  privacy:
    "I acknowledge that I have read the KXRA Privacy Notice version 1 and understand how KXRA handles personal data.",
};

export const legalRequirements = Object.freeze(
  legalDocuments
    .filter((document) => document.requiredFor)
    .map((document, index) => ({
      id: `c0471000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      documentId: document.id,
      documentVersion: document.databaseVersion,
      documentSha256: document.sha256,
      relationshipType: document.requiredFor,
      acceptanceWording: wording[document.slug],
      acceptanceWordingSha256: sha256(wording[document.slug]),
    })),
);

export function validateLegalDocumentOperator(environment, command) {
  const findings = validateStagingTarget(environment);
  if (!["plan", "apply", "verify"].includes(command))
    findings.push("command must be plan, apply or verify");
  if (environment.KXRA_STAGING_PROJECT_REF !== legalStagingProjectRef)
    findings.push(`staging project must be ${legalStagingProjectRef}`);
  if (command === "apply") {
    const expected = `LEGAL-DOCUMENTS:${legalStagingProjectRef}:${legalApproval.packSha256}:codex/phase-2-completion`;
    if (environment.KXRA_STAGING_LEGAL_CONFIRMATION !== expected)
      findings.push(`KXRA_STAGING_LEGAL_CONFIRMATION must equal ${expected}`);
  }
  return { ok: findings.length === 0, findings };
}

export async function inspectLegalDocuments(database) {
  const documents = (
    await database.query(
      `select id,org_id,document_type,audience,jurisdiction,version,title,
        rendered_content,content_sha256,immutable_object_key,status,effective_at,
        owner_approval_reference,owner_approved_at,independent_review_reference
       from kxra.legal_documents where id=any($1::uuid[]) order by id`,
      [legalDocuments.map((document) => document.id)],
    )
  ).rows;
  const requirements = (
    await database.query(
      `select id,org_id,membership_id,relationship_type,plan_scope,document_id,
        document_version,document_sha256,mandatory,state,acceptance_wording,
        acceptance_wording_version,acceptance_wording_sha256,effective_at
       from kxra.legal_document_requirements where id=any($1::uuid[]) order by id`,
      [legalRequirements.map((requirement) => requirement.id)],
    )
  ).rows;
  const conflicts = (
    await database.query(
      `select id,document_type,audience,jurisdiction,version from kxra.legal_documents
       where org_id=$1 and (document_type,audience,jurisdiction,version) in
        (select * from unnest($2::text[],$3::text[],$4::text[],$5::int[]))
        and not(id=any($6::uuid[]))`,
      [
        legalOrganisationId,
        legalDocuments.map((document) => document.documentType),
        legalDocuments.map((document) => document.audience),
        legalDocuments.map(() => "GB"),
        legalDocuments.map((document) => document.databaseVersion),
        legalDocuments.map((document) => document.id),
      ],
    )
  ).rows;
  const unexpectedActive = (
    await database.query(
      `select id from kxra.legal_document_requirements
       where org_id=$1 and state='ACTIVE' and not(id=any($2::uuid[]))`,
      [
        legalOrganisationId,
        legalRequirements.map((requirement) => requirement.id),
      ],
    )
  ).rows;
  return { documents, requirements, conflicts, unexpectedActive };
}

export function legalDocumentFindings(state) {
  const findings = [];
  for (const expected of legalDocuments) {
    const row = state.documents.find((item) => item.id === expected.id);
    if (
      !row ||
      row.org_id !== legalOrganisationId ||
      row.document_type !== expected.documentType ||
      row.audience !== expected.audience ||
      row.jurisdiction !== "GB" ||
      row.version !== expected.databaseVersion ||
      row.title !== expected.title ||
      row.rendered_content !== expected.renderedContent ||
      row.content_sha256 !== expected.sha256 ||
      row.immutable_object_key !== expected.immutableObjectKey ||
      row.status !== "APPROVED" ||
      !row.effective_at ||
      row.owner_approval_reference !== legalApproval.approvalId ||
      !row.owner_approved_at ||
      row.independent_review_reference !== null
    )
      findings.push(`${expected.slug} document mismatch`);
  }
  for (const expected of legalRequirements) {
    const row = state.requirements.find((item) => item.id === expected.id);
    if (
      !row ||
      row.org_id !== legalOrganisationId ||
      row.membership_id !== null ||
      row.relationship_type !== expected.relationshipType ||
      row.plan_scope !== "founding" ||
      row.document_id !== expected.documentId ||
      row.document_version !== expected.documentVersion ||
      row.document_sha256 !== expected.documentSha256 ||
      row.mandatory !== true ||
      row.state !== "ACTIVE" ||
      row.acceptance_wording !== expected.acceptanceWording ||
      row.acceptance_wording_version !== 1 ||
      row.acceptance_wording_sha256 !== expected.acceptanceWordingSha256 ||
      !row.effective_at
    )
      findings.push(`${expected.id} requirement mismatch`);
  }
  if (state.documents.length !== legalDocuments.length)
    findings.push("unexpected approved document count");
  if (state.requirements.length !== legalRequirements.length)
    findings.push("unexpected legal requirement count");
  return findings;
}

export function unsafeLegalDocumentState(state) {
  const findings = [];
  if (state.conflicts.length)
    findings.push("conflicting legal document version");
  if (state.unexpectedActive.length)
    findings.push("unexpected active legal requirement");
  if (state.documents.length || state.requirements.length)
    findings.push(...legalDocumentFindings(state));
  return findings;
}

export async function applyLegalDocuments(database) {
  const initial = await inspectLegalDocuments(database);
  const blockers = unsafeLegalDocumentState(initial);
  if (blockers.length)
    throw Error(`LEGAL_DOCUMENT_TAKEOVER_REJECTED:${blockers.join(";")}`);
  for (const document of legalDocuments)
    await database.query(
      `insert into kxra.legal_documents(
        id,org_id,document_type,audience,jurisdiction,version,title,
        rendered_content,content_sha256,immutable_object_key,status,effective_at,
        owner_approval_reference,owner_approved_at,independent_review_reference
       ) values($1,$2,$3,$4,'GB',$5,$6,$7,$8,$9,'APPROVED',now(),$10,now(),null)
       on conflict(id,version) do nothing`,
      [
        document.id,
        legalOrganisationId,
        document.documentType,
        document.audience,
        document.databaseVersion,
        document.title,
        document.renderedContent,
        document.sha256,
        document.immutableObjectKey,
        legalApproval.approvalId,
      ],
    );
  for (const requirement of legalRequirements)
    await database.query(
      `insert into kxra.legal_document_requirements(
        id,org_id,relationship_type,plan_scope,document_id,document_version,
        document_sha256,mandatory,state,acceptance_wording,
        acceptance_wording_version,acceptance_wording_sha256,effective_at
       ) values($1,$2,$3,'founding',$4,$5,$6,true,'ACTIVE',$7,1,$8,now())
       on conflict(id) do nothing`,
      [
        requirement.id,
        legalOrganisationId,
        requirement.relationshipType,
        requirement.documentId,
        requirement.documentVersion,
        requirement.documentSha256,
        requirement.acceptanceWording,
        requirement.acceptanceWordingSha256,
      ],
    );
  const findings = legalDocumentFindings(await inspectLegalDocuments(database));
  if (findings.length)
    throw Error(`LEGAL_DOCUMENT_APPLY_MISMATCH:${findings.join(";")}`);
}
