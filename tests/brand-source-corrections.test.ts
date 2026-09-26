import { after, test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import pg from "pg";
import { runtimeFile } from "./support/runtime";
import { brandProfileEvidence } from "../packages/brand-studio";

const config = JSON.parse(
  fs.readFileSync(runtimeFile("database.json"), "utf8"),
);
const admin = new pg.Pool({ ...config, user: os.userInfo().username });
const org = "10000000-0000-4000-8000-000000000001";
const p2 = "30000000-0000-4000-8000-000000000002";
const p3 = "30000000-0000-4000-8000-000000000003";
const actors = {
  owner: "20000000-0000-4000-8000-000000000001",
  partner: "20000000-0000-4000-8000-000000000002",
  viewer: "20000000-0000-4000-8000-000000000003",
  revoked: "20000000-0000-4000-8000-000000000004",
};

const profileData = {
  business_name: "Northstar Workshop",
  summary: "Northstar provides structured operating reviews.",
  tone: ["Clear", "Practical"],
  audiences: ["UK small business owners"],
  offers: ["A structured operating review"],
  prohibited_claims: ["Guaranteed outcomes"],
  required_disclaimers: ["Results depend on customer circumstances."],
  palette: ["#10271F"],
  typography: ["Accessible sans serif"],
};

after(() => admin.end());

async function as(database: pg.PoolClient, actor: keyof typeof actors | null) {
  await database.query("reset role");
  await database.query(`set local role ${actor ? "authenticated" : "anon"}`);
  await database.query(
    "select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true),set_config('request.kxra.org_id',$3,true)",
    [
      actor ? actors[actor] : "",
      JSON.stringify({
        sub: actor ? actors[actor] : null,
        aal: "aal2",
        auth_time: Math.floor(Date.now() / 1000),
      }),
      actor ? org : "",
    ],
  );
}

async function transaction(work: (database: pg.PoolClient) => Promise<void>) {
  const database = await admin.connect();
  try {
    await database.query("begin");
    await work(database);
  } finally {
    await database.query("rollback");
    database.release();
  }
}

async function denied(
  database: pg.PoolClient,
  sql: string,
  values: unknown[] = [],
) {
  await database.query("savepoint expected_denial");
  await assert.rejects(() => database.query(sql, values));
  await database.query("rollback to savepoint expected_denial");
}

test("AT-35 source corrections are append-only, exact and stale profile evidence is blocked", () =>
  transaction(async (database) => {
    await as(database, "partner");
    const source = (
      await database.query(
        "select * from kxra.create_brand_source($1,'WEBSITE',$2,$3,$4,true,$5)",
        [
          p2,
          "https://northstar.example/about",
          "Northstar offers a general operating review.",
          "Synthetic fixture rights assertion.",
          crypto.randomUUID(),
        ],
      )
    ).rows[0];
    const profile = (
      await database.query(
        "select * from kxra.create_brand_profile($1,$2,$3,$4,$5)",
        [
          p2,
          "Northstar",
          profileData,
          JSON.stringify(brandProfileEvidence(source.source_version_id)),
          crypto.randomUUID(),
        ],
      )
    ).rows[0];
    await database.query(
      "select kxra.decide_brand_profile($1,1,'APPROVE',$2)",
      [profile.profile_id, "Reviewed against exact source version one."],
    );

    const requestId = crypto.randomUUID();
    const correctedText =
      "Northstar provides structured operating reviews for UK small businesses.";
    const correction = (
      await database.query(
        "select * from kxra.revise_brand_source($1,1,$2,$3,$4)",
        [
          source.source_id,
          correctedText,
          "The original evidence omitted the target customer segment.",
          requestId,
        ],
      )
    ).rows[0];
    assert.equal(correction.version, 2);
    const replay = (
      await database.query(
        "select * from kxra.revise_brand_source($1,1,$2,$3,$4)",
        [
          source.source_id,
          correctedText,
          "The original evidence omitted the target customer segment.",
          requestId,
        ],
      )
    ).rows[0];
    assert.deepEqual(replay, correction);
    await denied(
      database,
      "select * from kxra.revise_brand_source($1,1,$2,$3,$4)",
      [source.source_id, "Conflicting replay.", "Different reason.", requestId],
    );

    const versions = (
      await database.query(
        `select version,supplied_content,source_classification
         from kxra.brand_source_versions where source_id=$1 order by version`,
        [source.source_id],
      )
    ).rows;
    assert.equal(versions.length, 2);
    assert.equal(versions[0].version, 1);
    assert.equal(versions[1].supplied_content, correctedText);
    await database.query("reset role");
    assert.equal(
      versions[1].source_classification,
      "USER-SUPPLIED INFORMATION",
    );
    assert.deepEqual(
      (
        await database.query(
          `select revision_kind,revision_reason
           from kxra.brand_source_revision_metadata where source_version_id=$1`,
          [correction.source_version_id],
        )
      ).rows[0],
      {
        revision_kind: "USER_CORRECTION",
        revision_reason:
          "The original evidence omitted the target customer segment.",
      },
    );
    assert.equal(
      (
        await database.query(
          "select kxra_private.brand_profile_evidence_current($1) as current",
          [profile.profile_version_id],
        )
      ).rows[0].current,
      false,
    );
    await as(database, "partner");
    await denied(
      database,
      `select * from kxra.create_campaign_brief(
        $1,$2,1,$3,$4,$5,$6,$7,$8,$9,$10,$11
       )`,
      [
        p2,
        profile.profile_id,
        "Stale campaign",
        "Introduce the review",
        "UK small businesses",
        "Structured review",
        ["LINKEDIN"],
        "No unsupported claims.",
        [],
        "Qualified replies",
        crypto.randomUUID(),
      ],
    );

    const revisedProfile = (
      await database.query(
        "select * from kxra.revise_brand_profile($1,1,$2,$3,$4)",
        [
          profile.profile_id,
          { ...profileData, summary: correctedText },
          JSON.stringify(
            brandProfileEvidence(
              correction.source_version_id,
              "USER-SUPPLIED INFORMATION",
            ),
          ),
          crypto.randomUUID(),
        ],
      )
    ).rows[0];
    await database.query(
      "select kxra.decide_brand_profile($1,2,'APPROVE',$2)",
      [profile.profile_id, "Reviewed against corrected source version two."],
    );
    assert.equal(revisedProfile.version, 2);
    await database.query("reset role");
    assert.equal(
      (
        await database.query(
          "select kxra_private.brand_profile_evidence_current($1) as current",
          [revisedProfile.profile_version_id],
        )
      ).rows[0].current,
      true,
    );
  }));

test("AT-35 source correction denies viewer, revoked and crafted cross-project writes", () =>
  transaction(async (database) => {
    await as(database, "owner");
    const source = (
      await database.query(
        "select * from kxra.create_brand_source($1,'MANUAL',null,$2,$3,true,$4)",
        [
          p3,
          "Project three owner evidence.",
          "Synthetic fixture rights assertion.",
          crypto.randomUUID(),
        ],
      )
    ).rows[0];
    for (const actor of ["partner", "viewer", "revoked"] as const) {
      await as(database, actor);
      await denied(
        database,
        "select * from kxra.revise_brand_source($1,1,$2,$3,$4)",
        [
          source.source_id,
          "Unauthorized correction.",
          "This actor must not change the source.",
          crypto.randomUUID(),
        ],
      );
    }
  }));
