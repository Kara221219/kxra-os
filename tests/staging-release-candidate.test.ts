import { after, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import pg from "pg";
import {
  applyReleaseCandidate,
  evidenceDigest,
  expectedReleaseBlockers,
  inspectReleaseCandidate,
  releaseCandidate,
  releaseCandidateEvidence,
  releaseCandidateFindings,
  releaseCandidateReadiness,
  validateReleaseCandidateOperator,
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

test("release candidate operator requires exact staging target and apply phrase", () => {
  const environment = {
    KXRA_ENVIRONMENT: "staging",
    KXRA_STAGING_PROJECT_REF: legalStagingProjectRef,
    KXRA_STAGING_MIGRATOR_DATABASE_URL: `postgresql://postgres:secret@db.${legalStagingProjectRef}.supabase.co:5432/postgres?sslmode=verify-full`,
  };
  assert.equal(validateReleaseCandidateOperator(environment, "plan").ok, true);
  assert.equal(
    validateReleaseCandidateOperator(environment, "apply").ok,
    false,
  );
  assert.equal(
    validateReleaseCandidateOperator(
      {
        ...environment,
        KXRA_STAGING_RELEASE_CONFIRMATION: `RELEASE-CANDIDATE:${legalStagingProjectRef}:${releaseCandidate.releaseVersion}:codex/phase-2-completion`,
      },
      "apply",
    ).ok,
    true,
  );
});

test("release evidence is immutable, bounded and does not invent completed reviews", () => {
  assert.deepEqual(
    releaseCandidateEvidence.providerEvidence.map((item: any) => item.key),
    ["CORE_STAGING", "AUTH_RLS", "STRIPE_TEST", "EMAIL_STAGING"],
  );
  assert.ok(
    releaseCandidateEvidence.providerEvidence.every((item: any) =>
      /^[a-f0-9]{64}$/.test(evidenceDigest(item)),
    ),
  );
  assert.deepEqual(
    releaseCandidate.commercialConfiguration.accessibility_review,
    {},
  );
  assert.deepEqual(
    releaseCandidate.commercialConfiguration.security_review,
    {},
  );
  assert.equal(releaseCandidate.state, "BLOCKED");
  assert.equal(releaseCandidate.commercialConfiguration.price_minor, 2900);
  assert.equal(releaseCandidate.commercialConfiguration.currency, "GBP");
});

test("release candidate applies idempotently, remains blocked and rejects drift", async () => {
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
      monthly: "price_monthlyReleaseCandidate123",
      annual: "price_annualReleaseCandidate123",
    });
    await applyReleaseCandidate(client);
    await applyReleaseCandidate(client);
    assert.deepEqual(
      releaseCandidateFindings(await inspectReleaseCandidate(client)),
      [],
    );
    const readiness = await releaseCandidateReadiness(client);
    assert.equal(readiness.ready, false);
    assert.deepEqual(readiness.blockers, expectedReleaseBlockers);
    await client.query(
      `update kxra.release_manifests set commercial_configuration=
       jsonb_set(commercial_configuration,'{price_minor}','1'::jsonb)
       where org_id=$1 and release_version=$2`,
      [releaseCandidate.orgId, releaseCandidate.releaseVersion],
    );
    await assert.rejects(
      () => applyReleaseCandidate(client),
      /RELEASE_CANDIDATE_TAKEOVER_REJECTED/,
    );
  } finally {
    await client.query("rollback");
    client.release();
  }
});
