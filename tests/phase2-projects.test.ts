import { after, test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import pg from "pg";
import { runtimeFile } from "./support/runtime";

const config = JSON.parse(
  fs.readFileSync(runtimeFile("database.json"), "utf8"),
);
const admin = new pg.Pool({ ...config, user: os.userInfo().username });
const org = "10000000-0000-4000-8000-000000000001";
const owner = "20000000-0000-4000-8000-000000000001";
const partner = "20000000-0000-4000-8000-000000000002";
const p6 = "30000000-0000-4000-8000-000000000006";
const p7 = "30000000-0000-4000-8000-000000000007";
const hash = (value: string) =>
  crypto.createHash("sha256").update(value).digest("hex");

after(() => admin.end());

async function as(db: pg.PoolClient, user: string | null, aal = "aal2") {
  await db.query("reset role");
  await db.query(`set local role ${user ? "authenticated" : "anon"}`);
  await db.query(
    "select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true),set_config('request.kxra.org_id',$3,true)",
    [
      user || "",
      JSON.stringify({
        sub: user,
        aal,
        auth_time: Math.floor(Date.now() / 1000),
      }),
      user ? org : "",
    ],
  );
}

async function tx(work: (db: pg.PoolClient) => Promise<void>) {
  const db = await admin.connect();
  try {
    await db.query("begin");
    await work(db);
  } finally {
    await db.query("rollback");
    db.release();
  }
}

async function denied(db: pg.PoolClient, sql: string, values: unknown[] = []) {
  await db.query("savepoint expected_denial");
  await assert.rejects(() => db.query(sql, values));
  await db.query("rollback to savepoint expected_denial");
}

async function assignContributor(db: pg.PoolClient, projectId: string) {
  await db.query("reset role");
  await db.query(
    `insert into kxra.project_memberships(org_id,project_id,user_id,role,active)
     values($1,$2,$3,'contributor',true)
     on conflict(project_id,user_id) do update set role='contributor',active=true,expires_at=null`,
    [org, projectId, partner],
  );
}

function youtubePackage(seed: string) {
  const sourceUrl = `https://example.com/source-${seed}`;
  return {
    sourcePack: [
      {
        source_url: sourceUrl,
        title: `Official synthetic source ${seed}`,
        published_at: "2026-09-01",
        accessed_at: "2026-09-24",
        source_type: "PRIMARY",
      },
    ],
    claims: [
      {
        claim_id: "CLAIM_001",
        text: "A synthetic bounded factual claim for the controlled fixture.",
        source_url: sourceUrl,
        classification: "EXTERNAL RESEARCH",
        script_usage:
          "Used in the opening explanation and attributed to the source.",
        review_state: "SUPPORTED",
      },
    ],
    script:
      "This is a synthetic Finance Unfolded script used only to prove the governed local workflow. " +
      "Every material statement maps to the source pack and no financial outcome, advice, promotion or public publication is promised.",
    redTeam: {
      financial_promotions_clear: true,
      misinformation_clear: true,
      originality_clear: true,
      advice_language_clear: true,
    },
    storyboard: {
      scenes: [{ description: "Synthetic title card and cited chart." }],
    },
    rights: {
      assets_cleared: true,
      music_cleared: true,
      voice_rights_cleared: true,
    },
    voice: {
      voice_type: "SYNTHETIC",
      provider: "LOCAL_FIXTURE",
      rights_basis: "Synthetic fixture generated for local testing only.",
      disclosure_required: true,
      disclosure_present: true,
    },
    render: {
      render_sha256: hash(`render-${seed}`),
      captions_sha256: hash(`captions-${seed}`),
      duration_seconds: 120,
      format: "MP4",
      local_only: true,
    },
    qa: {
      technical: true,
      captions: true,
      editorial: true,
      accessibility: true,
    },
    metadata: {
      title: `Synthetic finance history ${seed}`,
      description:
        "Controlled local fixture with source and disclosure metadata.",
      thumbnail_sha256: hash(`thumbnail-${seed}`),
      disclosure_text: "Contains synthetic narration used in a local fixture.",
      visibility: "PRIVATE",
      deceptive_metadata_clear: true,
    },
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

test("AT-38/43 YouTube package requires independent exact review and verified binding", () =>
  tx(async (db) => {
    await db.query("select kxra_private.disconnect_youtube_channel($1)", [p6]);
    await assignContributor(db, p6);
    const fixture = youtubePackage("one");
    await as(db, partner);
    const created = (
      await db.query(
        `select * from kxra.create_youtube_content_package(
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13
        )`,
        [
          p6,
          "Synthetic history topic",
          JSON.stringify(fixture.sourcePack),
          JSON.stringify(fixture.claims),
          fixture.script,
          fixture.redTeam,
          fixture.storyboard,
          fixture.rights,
          fixture.voice,
          fixture.render,
          fixture.qa,
          fixture.metadata,
          crypto.randomUUID(),
        ],
      )
    ).rows[0];
    assert.equal(created.version, 1);
    assert.match(created.content_sha256, /^[a-f0-9]{64}$/);
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from kxra.youtube_content_packages where id=$1",
          [created.package_id],
        )
      ).rows[0].n,
      1,
    );
    await denied(
      db,
      "insert into kxra.youtube_upload_intents(org_id,project_id,channel_binding_id,channel_binding_version,package_id,package_version_id,package_version,review_id,content_sha256,intent_sha256,idempotency_key,requested_by) values($1,$2,gen_random_uuid(),1,gen_random_uuid(),gen_random_uuid(),1,gen_random_uuid(),$3,$3,gen_random_uuid(),$4)",
      [org, p6, hash("bypass"), partner],
    );
    await denied(
      db,
      "select * from kxra.create_youtube_content_package($1,'Wrong project',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)",
      [
        p7,
        JSON.stringify(fixture.sourcePack),
        JSON.stringify(fixture.claims),
        fixture.script,
        fixture.redTeam,
        fixture.storyboard,
        fixture.rights,
        fixture.voice,
        fixture.render,
        fixture.qa,
        fixture.metadata,
        crypto.randomUUID(),
      ],
    );

    await as(db, owner);
    const review = (
      await db.query(
        "select result.* from kxra.review_youtube_content_package($1,1,$2,$3,'APPROVE_UPLOAD_INTENT','Independent synthetic review passed',$4) result",
        [
          created.package_version_id,
          created.content_sha256,
          youtubeChecks,
          crypto.randomUUID(),
        ],
      )
    ).rows[0];
    assert.equal(review.decision, "APPROVE_UPLOAD_INTENT");
    await denied(
      db,
      "select * from kxra.create_youtube_upload_intent($1,$2,$3,$4,$5)",
      [
        p6,
        created.package_version_id,
        review.id,
        created.content_sha256,
        crypto.randomUUID(),
      ],
    );
    await denied(
      db,
      "select * from kxra_private.record_youtube_channel_verification($1,$2,$3,$4,$5,$6,$7)",
      [
        p6,
        "@Finance-Unfolded247",
        "UCabcdefghijklmnopqrstuv",
        "fixture-grant-reference",
        hash("youtube.upload"),
        hash("provider-proof"),
        owner,
      ],
    );

    await db.query("reset role");
    const binding = (
      await db.query(
        "select result.* from kxra_private.record_youtube_channel_verification($1,$2,$3,$4,$5,$6,$7) result",
        [
          p6,
          "@Finance-Unfolded247",
          "UCabcdefghijklmnopqrstuv",
          "fixture-grant-reference",
          hash("youtube.upload"),
          hash("provider-proof"),
          owner,
        ],
      )
    ).rows[0];
    assert.equal(binding.state, "VERIFIED");

    await as(db, owner);
    const idempotency = crypto.randomUUID();
    const intent = (
      await db.query(
        "select result.* from kxra.create_youtube_upload_intent($1,$2,$3,$4,$5) result",
        [
          p6,
          created.package_version_id,
          review.id,
          created.content_sha256,
          idempotency,
        ],
      )
    ).rows[0];
    const retry = (
      await db.query(
        "select result.* from kxra.create_youtube_upload_intent($1,$2,$3,$4,$5) result",
        [
          p6,
          created.package_version_id,
          review.id,
          created.content_sha256,
          idempotency,
        ],
      )
    ).rows[0];
    assert.equal(retry.id, intent.id);
    assert.equal(intent.adapter, "DISABLED");
    assert.equal(intent.delivery_state, "NOT_SENT");
    assert.equal(intent.state, "READY");

    await db.query("reset role");
    await db.query("select kxra_private.disconnect_youtube_channel($1)", [p6]);
    await as(db, owner);
    assert.equal(
      (
        await db.query(
          "select state from kxra.youtube_upload_intents where id=$1",
          [intent.id],
        )
      ).rows[0].state,
      "WITHDRAWN",
    );
  }));

test("AT-38 package creator cannot finally approve their own content", () =>
  tx(async (db) => {
    const fixture = youtubePackage("self-review");
    await as(db, owner);
    const created = (
      await db.query(
        `select * from kxra.create_youtube_content_package(
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13
        )`,
        [
          p6,
          "Owner-authored synthetic package",
          JSON.stringify(fixture.sourcePack),
          JSON.stringify(fixture.claims),
          fixture.script,
          fixture.redTeam,
          fixture.storyboard,
          fixture.rights,
          fixture.voice,
          fixture.render,
          fixture.qa,
          fixture.metadata,
          crypto.randomUUID(),
        ],
      )
    ).rows[0];
    await denied(
      db,
      "select * from kxra.review_youtube_content_package($1,1,$2,$3,'APPROVE_UPLOAD_INTENT','Self review must fail',$4)",
      [
        created.package_version_id,
        created.content_sha256,
        youtubeChecks,
        crypto.randomUUID(),
      ],
    );
  }));

const repositoryControls = {
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

const repositoryToolchain = {
  secret_scanner: "fixture-secret-scanner 1.0",
  malware_scanner: "fixture-signature-scanner 1.0",
  dependency_scanner: "fixture-osv-scanner 1.0",
  sbom_tool: "fixture-sbom 1.0",
  sast_tool: "fixture-sast 1.0",
  workflow_inspector: "fixture-workflow-inspector 1.0",
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

test("AT-40/41/42 repository adoption stops at an approved no-execution branch intent", () =>
  tx(async (db) => {
    await assignContributor(db, p7);
    const commit = "a".repeat(40);
    const tree = "b".repeat(40);
    await as(db, partner);
    const candidate = (
      await db.query(
        `select result.* from kxra.create_repository_candidate(
          $1,'example-org','controlled-fixture','https://github.com/example-org/controlled-fixture',
          'main',$2,$3,$4,'Fixture licence observation','Concept-level evaluation only',$5
        ) result`,
        [p7, commit, tree, "2026-09-24T12:00:00Z", crypto.randomUUID()],
      )
    ).rows[0];
    assert.equal(candidate.state, "METADATA_ONLY");
    await denied(
      db,
      "select * from kxra.record_repository_quarantine($1,$2,$3,$4,$5,100,$6,'fixture-v1','Partner cannot attest owner controls',$7)",
      [
        candidate.id,
        commit,
        tree,
        hash("archive"),
        hash("manifest"),
        repositoryControls,
        crypto.randomUUID(),
      ],
    );

    await as(db, owner);
    const quarantine = (
      await db.query(
        "select result.* from kxra.record_repository_quarantine($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) result",
        [
          candidate.id,
          commit,
          tree,
          hash("archive"),
          hash("manifest"),
          1024,
          repositoryControls,
          "fixture-quarantine-v1",
          "Controlled fixture passed bounded archive controls without execution.",
          crypto.randomUUID(),
        ],
      )
    ).rows[0];
    assert.equal(quarantine.result, "ACCEPTED");
    assert.match(
      quarantine.object_reference,
      /^private:\/\/repository-quarantine\//,
    );
    await denied(
      db,
      `select * from kxra.record_repository_assessment(
        $1,$2,$3,'[]',$4,$5,$6,$7,$8,$9,$10,$11,0,0,$12,$13,$14
       )`,
      [
        candidate.id,
        quarantine.id,
        repositoryToolchain,
        "CLEAR",
        "CLEAR",
        "NO_FINDING",
        "NO_FINDING",
        "PASS",
        "PASS",
        "PASS",
        "PASS",
        "This repository is malware-free and safe repository content.",
        "Residual risk remains despite a bounded test.",
        crypto.randomUUID(),
      ],
    );
    const assessment = (
      await db.query(
        `select result.* from kxra.record_repository_assessment(
          $1,$2,$3,'[]',$4,$5,$6,$7,$8,$9,$10,$11,0,0,$12,$13,$14
         ) result`,
        [
          candidate.id,
          quarantine.id,
          repositoryToolchain,
          "CLEAR",
          "CLEAR",
          "NO_FINDING",
          "NO_FINDING",
          "PASS",
          "PASS",
          "PASS",
          "PASS",
          "No findings were detected in the tested scope; this is not a safety guarantee.",
          "Unknown future revisions and untested runtime behavior remain residual risks.",
          crypto.randomUUID(),
        ],
      )
    ).rows[0];
    assert.equal(assessment.disposition, "PASS");

    await as(db, partner);
    const proposal = (
      await db.query(
        `select * from kxra.create_repository_adoption_proposal(
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10
         )`,
        [
          candidate.id,
          assessment.id,
          "Reuse one bounded manifest organization concept in KXRA OS.",
          JSON.stringify(["concept: manifest organization"]),
          "Retain required attribution and licence notice for any copied expression.",
          "Add one typed manifest adapter without importing candidate runtime code.",
          "Candidate text remains untrusted data and receives no tool authority.",
          "Run schema, RLS, HTTP and browser regression tests.",
          "Delete the isolated adapter and restore the prior manifest loader.",
          crypto.randomUUID(),
        ],
      )
    ).rows[0];
    assert.equal(proposal.version, 1);
    await denied(
      db,
      "select * from kxra.create_repository_implementation_intent($1,$2,gen_random_uuid(),$3,'codex/controlled-adoption',$4)",
      [
        p7,
        proposal.proposal_version_id,
        proposal.proposal_sha256,
        crypto.randomUUID(),
      ],
    );

    await as(db, owner);
    const review = (
      await db.query(
        "select result.* from kxra.review_repository_adoption_proposal($1,1,$2,$3,'APPROVE_IMPLEMENTATION_INTENT','Independent scope and security review passed',$4) result",
        [
          proposal.proposal_version_id,
          proposal.proposal_sha256,
          adoptionChecks,
          crypto.randomUUID(),
        ],
      )
    ).rows[0];
    const idempotency = crypto.randomUUID();
    const intent = (
      await db.query(
        "select result.* from kxra.create_repository_implementation_intent($1,$2,$3,$4,'codex/controlled-adoption',$5) result",
        [
          p7,
          proposal.proposal_version_id,
          review.id,
          proposal.proposal_sha256,
          idempotency,
        ],
      )
    ).rows[0];
    const retry = (
      await db.query(
        "select result.* from kxra.create_repository_implementation_intent($1,$2,$3,$4,'codex/controlled-adoption',$5) result",
        [
          p7,
          proposal.proposal_version_id,
          review.id,
          proposal.proposal_sha256,
          idempotency,
        ],
      )
    ).rows[0];
    assert.equal(retry.id, intent.id);
    assert.equal(intent.git_execution_state, "NOT_STARTED");
    assert.equal(intent.merge_enabled, false);
    assert.equal(intent.release_enabled, false);
    assert.equal(intent.deploy_enabled, false);
    await denied(
      db,
      "update kxra.repository_candidates set state='METADATA_ONLY' where id=$1",
      [candidate.id],
    );

    await as(db, partner);
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from kxra.repository_candidates where id=$1",
          [candidate.id],
        )
      ).rows[0].n,
      1,
    );
    await db.query("reset role");
    await db.query(
      "update kxra.project_memberships set active=false where project_id=$1 and user_id=$2",
      [p7, partner],
    );
    await as(db, partner);
    assert.equal(
      (await db.query("select * from kxra.repository_candidates")).rowCount,
      0,
    );
  }));
