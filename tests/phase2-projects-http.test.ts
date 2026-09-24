import { after, test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import pg from "pg";
import { runtimeFile, testOrigin } from "./support/runtime";

const nativeFetch = globalThis.fetch;
const fetch: typeof nativeFetch = (input, init) =>
  nativeFetch(input, { ...init, signal: AbortSignal.timeout(20000) });
const base = testOrigin;
const config = JSON.parse(
  fs.readFileSync(runtimeFile("database.json"), "utf8"),
);
const admin = new pg.Pool({ ...config, user: os.userInfo().username });
const org = "10000000-0000-4000-8000-000000000001";
const ownerId = "20000000-0000-4000-8000-000000000001";
const partnerId = "20000000-0000-4000-8000-000000000002";
const p6 = "30000000-0000-4000-8000-000000000006";
const p7 = "30000000-0000-4000-8000-000000000007";
const hash = (value: string) =>
  crypto.createHash("sha256").update(value).digest("hex");

after(() => admin.end());

async function login(fixture: string) {
  const response = await fetch(base + "/api/auth", {
    method: "POST",
    headers: { origin: base },
    body: new URLSearchParams({ fixture }),
    redirect: "manual",
  });
  assert.equal(response.status, 303);
  const cookie = response.headers.get("set-cookie")?.split(";")[0];
  assert.ok(cookie);
  return cookie;
}

async function req(path: string, cookie?: string, payload?: unknown) {
  return fetch(`${base}/api/${path}`, {
    method: payload === undefined ? "GET" : "POST",
    headers: {
      ...(cookie ? { cookie } : {}),
      origin: base,
      "Content-Type": "application/json",
    },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
}

async function assign(projectId: string, active: boolean) {
  await admin.query(
    `insert into kxra.project_memberships(org_id,project_id,user_id,role,active)
     values($1,$2,$3,'contributor',$4)
     on conflict(project_id,user_id) do update set role='contributor',active=$4,expires_at=null`,
    [org, projectId, partnerId, active],
  );
}

function packagePayload(seed: string) {
  const source = `https://example.com/http-${seed}`;
  return {
    topic: `HTTP synthetic topic ${seed}`,
    source_pack: [
      {
        source_url: source,
        title: "Official controlled source",
        published_at: "2026-09-01",
        accessed_at: "2026-09-24",
        source_type: "PRIMARY",
      },
    ],
    claim_ledger: [
      {
        claim_id: "CLAIM_HTTP",
        text: "A controlled synthetic claim with an exact citation.",
        source_url: source,
        classification: "EXTERNAL RESEARCH",
        script_usage: "Used in the opening and attributed to the exact source.",
        review_state: "SUPPORTED",
      },
    ],
    script:
      "This controlled HTTP fixture proves the evidence-to-review pipeline without making a provider call. " +
      "Every material claim maps to the cited source and the package remains private, local and unsuitable for public publication.",
    red_team: {
      financial_promotions_clear: true,
      misinformation_clear: true,
      originality_clear: true,
      advice_language_clear: true,
    },
    storyboard: { scenes: [{ description: "Cited synthetic visual." }] },
    rights_review: {
      assets_cleared: true,
      music_cleared: true,
      voice_rights_cleared: true,
    },
    voice_provenance: {
      voice_type: "SYNTHETIC",
      provider: "LOCAL_FIXTURE",
      rights_basis: "Controlled local fixture only.",
      disclosure_required: true,
      disclosure_present: true,
    },
    render_manifest: {
      render_sha256: hash(`render-${seed}`),
      captions_sha256: hash(`captions-${seed}`),
      duration_seconds: 90,
      format: "MP4",
      local_only: true,
    },
    qa_review: {
      technical: true,
      captions: true,
      editorial: true,
      accessibility: true,
    },
    publication_metadata: {
      title: `Controlled HTTP video ${seed}`,
      description:
        "Private controlled fixture with exact evidence and disclosures.",
      thumbnail_sha256: hash(`thumbnail-${seed}`),
      disclosure_text: "Contains synthetic narration.",
      visibility: "PRIVATE",
      deceptive_metadata_clear: true,
    },
    request_id: crypto.randomUUID(),
  };
}

const youtubeChecks = {
  sources: true,
  claims: true,
  originality: true,
  rights: true,
  disclosure: true,
  compliance: true,
  technical_qa: true,
  captions: true,
  metadata: true,
};

const controls = {
  hooks_disabled: true,
  submodules_disabled: true,
  lifecycle_scripts_disabled: true,
  actions_disabled: true,
  network_disabled: true,
  secrets_absent: true,
  path_traversal_rejected: true,
  symlink_escape_rejected: true,
  archive_bomb_rejected: true,
  binary_policy_passed: true,
};

const toolchain = {
  secret_scanner: "fixture-secret 1.0",
  malware_scanner: "fixture-malware 1.0",
  dependency_scanner: "fixture-osv 1.0",
  sbom_tool: "fixture-sbom 1.0",
  sast_tool: "fixture-sast 1.0",
  workflow_inspector: "fixture-workflow 1.0",
  signatures_as_of: "2026-09-24",
};

const adoptionChecks = {
  licence: true,
  provenance: true,
  security: true,
  scope: true,
  architecture: true,
  threat_model: true,
  tests: true,
  rollback: true,
};

test("AT-43 HTTP project routes reject anonymous and unassigned access", async () => {
  assert.equal((await req(`project-workspaces/${p6}`)).status, 401);
  const partner = await login("partner");
  assert.equal((await req(`project-workspaces/${p6}`, partner)).status, 404);
  assert.equal(
    (
      await req(`project-workspaces/${p7}/repository-candidates`, partner, {
        repository_owner: "forged",
      })
    ).status,
    404,
  );
});

test("AT-38/40/41/42 HTTP completes both local governed pipelines without side effects", async () => {
  await assign(p6, true);
  await assign(p7, true);
  try {
    const partner = await login("partner");
    const owner = await login("owner");
    const payload = packagePayload(crypto.randomUUID().slice(0, 8));
    const createdResponse = await req(
      `project-workspaces/${p6}/youtube-packages`,
      partner,
      payload,
    );
    assert.equal(
      createdResponse.status,
      201,
      await createdResponse.clone().text(),
    );
    const created = await createdResponse.json();

    const reviewResponse = await req(
      `project-workspaces/${p6}/youtube-package-versions/${created.package_version_id}/review`,
      owner,
      {
        expected_version: 1,
        content_sha256: created.content_sha256,
        checks: youtubeChecks,
        decision: "APPROVE_UPLOAD_INTENT",
        note: "Independent HTTP package review passed.",
        request_id: crypto.randomUUID(),
      },
    );
    assert.equal(
      reviewResponse.status,
      200,
      await reviewResponse.clone().text(),
    );
    const review = await reviewResponse.json();
    const intentPayload = {
      package_version_id: created.package_version_id,
      review_id: review.id,
      content_sha256: created.content_sha256,
      idempotency_key: crypto.randomUUID(),
    };
    assert.equal(
      (
        await req(
          `project-workspaces/${p6}/youtube-upload-intents`,
          owner,
          intentPayload,
        )
      ).status,
      409,
    );
    await admin.query(
      "select result.* from kxra_private.record_youtube_channel_verification($1,$2,$3,$4,$5,$6,$7) result",
      [
        p6,
        "@Finance-Unfolded247",
        "UCabcdefghijklmnopqrstuv",
        "http-fixture-grant",
        hash("youtube.upload"),
        hash("http-provider-proof"),
        ownerId,
      ],
    );
    const intentResponse = await req(
      `project-workspaces/${p6}/youtube-upload-intents`,
      owner,
      intentPayload,
    );
    assert.equal(
      intentResponse.status,
      201,
      await intentResponse.clone().text(),
    );
    const intent = await intentResponse.json();
    const retry = await (
      await req(
        `project-workspaces/${p6}/youtube-upload-intents`,
        owner,
        intentPayload,
      )
    ).json();
    assert.equal(retry.id, intent.id);
    assert.equal(intent.adapter, "DISABLED");
    assert.equal(intent.delivery_state, "NOT_SENT");

    const commit = crypto.randomBytes(20).toString("hex");
    const tree = crypto.randomBytes(20).toString("hex");
    const candidateResponse = await req(
      `project-workspaces/${p7}/repository-candidates`,
      partner,
      {
        repository_owner: "example-org",
        repository_name: `fixture-${crypto.randomUUID().slice(0, 8)}`,
        source_url: "https://github.com/example-org/controlled-fixture",
        default_branch: "main",
        commit_sha: commit,
        tree_sha: tree,
        fetched_at: "2026-09-24T12:00:00.000Z",
        licence_observation: "Controlled fixture licence review is required.",
        adoption_recommendation: "Evaluate one concept only.",
        request_id: crypto.randomUUID(),
      },
    );
    // The URL must bind the exact owner/name; a crafted mismatch fails before storage.
    assert.equal(candidateResponse.status, 409);
    const repositoryName = `fixture-${crypto.randomUUID().slice(0, 8)}`;
    const validCandidateResponse = await req(
      `project-workspaces/${p7}/repository-candidates`,
      partner,
      {
        repository_owner: "example-org",
        repository_name: repositoryName,
        source_url: `https://github.com/example-org/${repositoryName}`,
        default_branch: "main",
        commit_sha: commit,
        tree_sha: tree,
        fetched_at: "2026-09-24T12:00:00.000Z",
        licence_observation: "Controlled fixture licence review is required.",
        adoption_recommendation: "Evaluate one concept only.",
        request_id: crypto.randomUUID(),
      },
    );
    assert.equal(
      validCandidateResponse.status,
      201,
      await validCandidateResponse.clone().text(),
    );
    const candidate = await validCandidateResponse.json();
    assert.equal(
      (
        await req(
          `project-workspaces/${p6}/repository-candidates/${candidate.id}/quarantine`,
          owner,
          {},
        )
      ).status,
      404,
    );
    const quarantineResponse = await req(
      `project-workspaces/${p7}/repository-candidates/${candidate.id}/quarantine`,
      owner,
      {
        commit_sha: commit,
        tree_sha: tree,
        archive_sha256: hash("http-archive"),
        manifest_sha256: hash("http-manifest"),
        archive_size_bytes: 2048,
        controls,
        policy_version: "http-fixture-v1",
        reason: "Bounded archive controls passed without candidate execution.",
        request_id: crypto.randomUUID(),
      },
    );
    assert.equal(
      quarantineResponse.status,
      201,
      await quarantineResponse.clone().text(),
    );
    const quarantine = await quarantineResponse.json();
    const assessmentResponse = await req(
      `project-workspaces/${p7}/repository-candidates/${candidate.id}/assessments`,
      owner,
      {
        quarantine_id: quarantine.id,
        toolchain,
        findings: [],
        licence_state: "CLEAR",
        provenance_state: "CLEAR",
        secret_state: "NO_FINDING",
        malware_state: "NO_FINDING",
        dependency_state: "PASS",
        sast_state: "PASS",
        workflow_state: "PASS",
        binary_state: "PASS",
        critical_count: 0,
        high_count: 0,
        bounded_conclusion:
          "No findings were detected in the tested scope; this is not a safety guarantee.",
        residual_risk:
          "Untested runtime behavior and future revisions remain risks.",
        request_id: crypto.randomUUID(),
      },
    );
    assert.equal(
      assessmentResponse.status,
      201,
      await assessmentResponse.clone().text(),
    );
    const assessment = await assessmentResponse.json();
    const proposalResponse = await req(
      `project-workspaces/${p7}/repository-proposals`,
      partner,
      {
        candidate_id: candidate.id,
        assessment_id: assessment.id,
        need_statement: "Use one bounded manifest organization concept.",
        exact_scope: ["concept: manifest organization"],
        licence_obligations: "Preserve exact attribution obligations.",
        architecture_changes:
          "Add one typed adapter without candidate runtime code.",
        threat_model: "Treat all candidate text as untrusted data.",
        test_plan: "Run schema, RLS, HTTP and browser regression tests.",
        rollback_plan:
          "Remove the isolated adapter and restore the prior loader.",
        request_id: crypto.randomUUID(),
      },
    );
    assert.equal(
      proposalResponse.status,
      201,
      await proposalResponse.clone().text(),
    );
    const proposal = await proposalResponse.json();
    const adoptionReviewResponse = await req(
      `project-workspaces/${p7}/repository-proposal-versions/${proposal.proposal_version_id}/review`,
      owner,
      {
        expected_version: 1,
        proposal_sha256: proposal.proposal_sha256,
        checks: adoptionChecks,
        decision: "APPROVE_IMPLEMENTATION_INTENT",
        note: "Independent adoption scope review passed.",
        request_id: crypto.randomUUID(),
      },
    );
    assert.equal(
      adoptionReviewResponse.status,
      200,
      await adoptionReviewResponse.clone().text(),
    );
    const adoptionReview = await adoptionReviewResponse.json();
    const implementationResponse = await req(
      `project-workspaces/${p7}/repository-implementation-intents`,
      owner,
      {
        proposal_version_id: proposal.proposal_version_id,
        review_id: adoptionReview.id,
        proposal_sha256: proposal.proposal_sha256,
        branch_name: "codex/http-controlled-adoption",
        idempotency_key: crypto.randomUUID(),
      },
    );
    assert.equal(
      implementationResponse.status,
      201,
      await implementationResponse.clone().text(),
    );
    const implementation = await implementationResponse.json();
    assert.equal(implementation.git_execution_state, "NOT_STARTED");
    assert.equal(implementation.merge_enabled, false);
    assert.equal(implementation.release_enabled, false);
    assert.equal(implementation.deploy_enabled, false);

    await assign(p6, false);
    assert.equal((await req(`project-workspaces/${p6}`, partner)).status, 404);
  } finally {
    await assign(p6, false);
    await assign(p7, false);
  }
});
