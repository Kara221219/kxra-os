import { after, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import pg from "pg";
import {
  applyReleaseFinalization,
  inspectReleaseFinalization,
  recoveryEvidence,
  recoveryEvidenceFindings,
  recoveryEvidenceSha256,
  releaseFinalizationStatus,
  releaseReviewEvidenceSha256,
  validateReleaseFinalizationOperator,
} from "../scripts/staging-release-finalization-core.mjs";
import {
  applyReleaseCandidate,
  releaseCandidate,
} from "../scripts/staging-release-candidate-core.mjs";
import {
  applyFoundingPlan,
  foundingPlan,
} from "../scripts/staging-founding-plan-core.mjs";
import {
  applyLegalDocuments,
  legalStagingProjectRef,
} from "../scripts/staging-legal-documents-core.mjs";
import { runtimeFile } from "./support/runtime";

const config = JSON.parse(
  fs.readFileSync(runtimeFile("database.json"), "utf8"),
);
const database = new pg.Pool({ ...config, user: os.userInfo().username });

after(() => database.end());

const accessibility = {
  customer_journeys: true,
  keyboard_navigation: true,
  focus_visibility: true,
  screen_reader_labels: true,
  zoom_and_reflow: true,
  reduced_motion: true,
  form_errors: true,
  contrast_and_readability: true,
};
const security = {
  owner_access: true,
  partner_isolation: true,
  database_rls: true,
  ask_retrieval: true,
  whatsapp_permissions: true,
  ai_run_logging: true,
  approvals: true,
  cross_project_files_search: true,
  public_private_separation: true,
  threat_models: true,
};

test("release finalization requires exact target, evidence hash and apply phrase", () => {
  const environment = {
    KXRA_ENVIRONMENT: "staging",
    KXRA_STAGING_PROJECT_REF: legalStagingProjectRef,
    KXRA_STAGING_MIGRATOR_DATABASE_URL: `postgresql://postgres:secret@db.${legalStagingProjectRef}.supabase.co:5432/postgres?sslmode=verify-full`,
  };
  assert.equal(
    validateReleaseFinalizationOperator(environment, "plan").ok,
    true,
  );
  assert.equal(
    validateReleaseFinalizationOperator(environment, "apply").ok,
    false,
  );
  assert.equal(
    validateReleaseFinalizationOperator(
      {
        ...environment,
        KXRA_STAGING_FINALIZATION_CONFIRMATION: `FINALIZE-RELEASE:${legalStagingProjectRef}:${releaseCandidate.releaseVersion}:${recoveryEvidenceSha256}:codex/phase-2-completion`,
      },
      "apply",
    ).ok,
    true,
  );
  assert.deepEqual(recoveryEvidenceFindings(), []);
  assert.equal(recoveryEvidence.restore.status, "COMPLETED");
  assert.match(recoveryEvidenceSha256, /^[a-f0-9]{64}$/);
});

test("release finalization binds exact recovery and owner reviews without release authority", async () => {
  const client = await database.connect();
  try {
    await client.query("begin");
    await client.query(
      "delete from kxra.release_manifests where org_id=$1 and release_version=$2",
      [releaseCandidate.orgId, releaseCandidate.releaseVersion],
    );
    await client.query(
      "delete from kxra.legal_document_requirements where document_id in (select id from kxra.legal_documents where owner_approval_reference='KXRA-CUSTOMER-DOCUMENTS-V1-OWNER-APPROVAL')",
    );
    await client.query(
      "delete from kxra.legal_documents where owner_approval_reference='KXRA-CUSTOMER-DOCUMENTS-V1-OWNER-APPROVAL'",
    );
    await applyLegalDocuments(client);
    await client.query(
      "delete from kxra.price_references where plan_version_id in ($1,$2)",
      [foundingPlan.versions[0].id, foundingPlan.versions[1].id],
    );
    await client.query(
      "delete from kxra.plan_features where plan_version_id in ($1,$2)",
      [foundingPlan.versions[0].id, foundingPlan.versions[1].id],
    );
    await client.query("delete from kxra.plan_versions where plan_id=$1", [
      foundingPlan.id,
    ]);
    await client.query("delete from kxra.plans where id=$1", [foundingPlan.id]);
    await applyFoundingPlan(client, {
      monthly: "price_monthlyReleaseFinalization123",
      annual: "price_annualReleaseFinalization123",
    });
    await applyReleaseCandidate(client);
    const manifest = (
      await client.query(
        "select id from kxra.release_manifests where org_id=$1 and release_version=$2",
        [releaseCandidate.orgId, releaseCandidate.releaseVersion],
      )
    ).rows[0].id;
    const owner = (
      await client.query(
        "select id,display_name from kxra.members where org_id=$1 and role='owner' and active order by id limit 1",
        [releaseCandidate.orgId],
      )
    ).rows[0];
    await client.query(
      "select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true),set_config('request.kxra.org_id',$3,true)",
      [
        owner.id,
        JSON.stringify({ sub: owner.id, aal: "aal2" }),
        releaseCandidate.orgId,
      ],
    );
    const candidateSha256 = (
      await client.query("select kxra.release_candidate_digest($1) as sha256", [
        manifest,
      ])
    ).rows[0].sha256;
    for (const [kind, checklist] of [
      ["ACCESSIBILITY", accessibility],
      ["SECURITY", security],
    ] as const)
      await client.query(
        `insert into kxra.release_review_attestations(
          org_id,release_manifest_id,review_type,reviewer_id,reviewer_name,
          candidate_sha256,evidence_sha256,checklist,notes
         ) values($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          releaseCandidate.orgId,
          manifest,
          kind,
          owner.id,
          owner.display_name,
          candidateSha256,
          releaseReviewEvidenceSha256[kind],
          checklist,
          `Completed the exact synthetic ${kind.toLowerCase()} review for finalization testing.`,
        ],
      );

    const before = await inspectReleaseFinalization(client);
    assert.deepEqual(releaseFinalizationStatus(before), {
      unsafe: [],
      pending: ["release evidence finalization pending"],
    });
    await applyReleaseFinalization(client);
    await applyReleaseFinalization(client);
    const afterState = await inspectReleaseFinalization(client);
    assert.deepEqual(releaseFinalizationStatus(afterState), {
      unsafe: [],
      pending: [],
    });
    assert.equal(afterState.manifest.state, "READY");
    assert.equal(
      afterState.manifest.commercial_configuration.provider_evidence.at(-1).key,
      "BACKUP_RESTORE",
    );
    assert.equal(
      afterState.finalization.recovery_evidence_sha256,
      recoveryEvidenceSha256,
    );
    assert.equal(afterState.manifest.state === "RELEASED", false);

    await client.query(
      "update kxra.release_finalizations set recovery_evidence_sha256=$1 where release_manifest_id=$2",
      ["0".repeat(64), manifest],
    );
    assert.ok(
      releaseFinalizationStatus(
        await inspectReleaseFinalization(client),
      ).unsafe.includes(
        "finalized release evidence differs from the reviewed source",
      ),
    );
  } finally {
    await client.query("rollback");
    client.release();
  }
});
