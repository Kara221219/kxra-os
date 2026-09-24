import { after, test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import pg from "pg";
import { runtimeFile } from "./support/runtime";
import {
  assertPublicWebsiteUrl,
  brandProfileEvidence,
  generateLocalBrandVariants,
  inferLocalBrandProfile,
  renderBrandExport,
} from "../packages/brand-studio";

const config = JSON.parse(
  fs.readFileSync(runtimeFile("database.json"), "utf8"),
);
const admin = new pg.Pool({ ...config, user: os.userInfo().username });
const org = "10000000-0000-4000-8000-000000000001";
const users = {
  owner: "20000000-0000-4000-8000-000000000001",
  partner: "20000000-0000-4000-8000-000000000002",
  viewer: "20000000-0000-4000-8000-000000000003",
  revoked: "20000000-0000-4000-8000-000000000004",
};
const p2 = "30000000-0000-4000-8000-000000000002";
const p3 = "30000000-0000-4000-8000-000000000003";

after(() => admin.end());

async function as(
  db: pg.PoolClient,
  user: keyof typeof users | null,
  organisationId = org,
) {
  await db.query("reset role");
  await db.query(`set local role ${user ? "authenticated" : "anon"}`);
  await db.query(
    "select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true),set_config('request.kxra.org_id',$3,true)",
    [
      user ? users[user] : "",
      JSON.stringify({
        sub: user ? users[user] : null,
        aal: "aal2",
        auth_time: Math.floor(Date.now() / 1000),
      }),
      user ? organisationId : "",
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

const profileData = {
  business_name: "Northstar Workshop",
  summary: "Northstar helps small teams make practical operating improvements.",
  tone: ["Clear", "Credible", "Practical"],
  audiences: ["UK small business owners"],
  offers: ["A structured operating review"],
  prohibited_claims: ["Guaranteed growth"],
  required_disclaimers: ["Results depend on customer circumstances."],
  palette: ["#10271F", "#C49A52"],
  typography: ["Accessible sans serif"],
};

test("Brand Studio rejects local/private source URLs and generates deterministic bounded drafts", () => {
  assert.equal(
    assertPublicWebsiteUrl("https://www.example.com/about"),
    "https://www.example.com/about",
  );
  for (const locator of [
    "http://example.com",
    "https://localhost/private",
    "https://127.0.0.1/private",
    "https://10.0.0.2/private",
    "https://user:pass@example.com/private",
    "https://example.com:8443/private",
  ])
    assert.throws(() => assertPublicWebsiteUrl(locator));
  const inferred = inferLocalBrandProfile({
    websiteUrl: "https://northstar.example/about",
    sourceText: "Northstar helps small teams improve how work gets done.",
    tone: "Clear, practical",
    audiences: "Small business owners",
    offers: "Operating review",
  });
  assert.equal(inferred.business_name, "Northstar");
  const input = {
    requestId: crypto.randomUUID(),
    inputSha256: "a".repeat(64),
    profile: profileData,
    campaign: {
      objective: "Introduce the operating review",
      audience: "UK small business owners",
      offer: "A structured operating review",
      channels: ["LINKEDIN", "EMAIL"],
      constraints: "Do not promise outcomes.",
      claims: [],
      success_measure: "Qualified replies",
    },
    channels: ["LINKEDIN", "EMAIL"],
    variantCount: 2,
  } as const;
  const first = generateLocalBrandVariants(input);
  const second = generateLocalBrandVariants(input);
  assert.deepEqual(first, second);
  assert.equal(first.length, 2);
  assert.match(first[0].content.warnings.join(" "), /No publication/);
  assert.match(renderBrandExport("MARKDOWN", first[0].content), /^# /);
});

test("Brand Studio preserves source/profile versions and requires exact review before export", () =>
  tx(async (db) => {
    await as(db, "owner");
    const generationUsageBefore = BigInt(
      (
        await db.query(
          `select coalesce((
            select consumed_units from kxra.usage_aggregates
            where org_id=$1 and feature_key='brand.generate'
           ),0)::text as consumed_units`,
          [org],
        )
      ).rows[0].consumed_units,
    );
    await as(db, "partner");
    const source = (
      await db.query(
        "select * from kxra.create_brand_source($1,'WEBSITE',$2,$3,$4,true,$5)",
        [
          p2,
          "https://northstar.example/about",
          "Northstar helps small teams make practical operating improvements.",
          "Synthetic fixture owner attests rights to this supplied text.",
          crypto.randomUUID(),
        ],
      )
    ).rows[0];
    assert.equal(source.version, 1);
    assert.equal(
      (
        await db.query(
          "select fetch_state from kxra.brand_source_versions where id=$1",
          [source.source_version_id],
        )
      ).rows[0].fetch_state,
      "PROVIDER_DISABLED",
    );
    const createdProfile = (
      await db.query(
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
    await db.query("select kxra.decide_brand_profile($1,1,'APPROVE',$2)", [
      createdProfile.profile_id,
      "Synthetic customer approval of exact version one.",
    ]);
    const corrected = {
      ...profileData,
      summary: "Customer-corrected Northstar operating review description.",
    };
    const revision = (
      await db.query("select * from kxra.revise_brand_profile($1,1,$2,$3,$4)", [
        createdProfile.profile_id,
        corrected,
        JSON.stringify(
          brandProfileEvidence(
            source.source_version_id,
            "USER-SUPPLIED INFORMATION",
          ),
        ),
        crypto.randomUUID(),
      ])
    ).rows[0];
    assert.equal(revision.version, 2);
    assert.deepEqual(
      (
        await db.query(
          `select version,status from kxra.brand_profile_versions
           where profile_id=$1 order by version`,
          [createdProfile.profile_id],
        )
      ).rows,
      [
        { version: 1, status: "APPROVED" },
        { version: 2, status: "DRAFT" },
      ],
    );
    assert.equal(
      (
        await db.query(
          "select approved_version from kxra.brand_profiles where id=$1",
          [createdProfile.profile_id],
        )
      ).rows[0].approved_version,
      1,
    );
    await db.query("select kxra.decide_brand_profile($1,2,'APPROVE',$2)", [
      createdProfile.profile_id,
      "Synthetic customer approval of corrected version two.",
    ]);
    assert.deepEqual(
      (
        await db.query(
          `select version,status from kxra.brand_profile_versions
           where profile_id=$1 order by version`,
          [createdProfile.profile_id],
        )
      ).rows,
      [
        { version: 1, status: "SUPERSEDED" },
        { version: 2, status: "APPROVED" },
      ],
    );

    const campaign = (
      await db.query(
        `select * from kxra.create_campaign_brief(
          $1,$2,2,$3,$4,$5,$6,$7,$8,$9,$10,$11
         )`,
        [
          p2,
          createdProfile.profile_id,
          "Northstar introduction",
          "Introduce the structured review",
          "UK small business owners",
          "A structured operating review",
          ["LINKEDIN", "EMAIL"],
          "Do not promise outcomes.",
          JSON.stringify([]),
          "Qualified replies",
          crypto.randomUUID(),
        ],
      )
    ).rows[0];
    await db.query("select kxra.decide_campaign_brief($1,1,'APPROVE',$2)", [
      campaign.brief_id,
      "Synthetic customer approval of exact campaign brief.",
    ]);
    const generation = (
      await db.query(
        "select * from kxra.begin_brand_generation($1,$2,2,$3,1,$4,2,$5)",
        [
          p2,
          createdProfile.profile_id,
          campaign.brief_id,
          ["LINKEDIN", "EMAIL"],
          crypto.randomUUID(),
        ],
      )
    ).rows[0];
    const outputs = generateLocalBrandVariants({
      requestId: generation.generation_request_id,
      inputSha256: generation.input_sha256,
      profile: generation.profile_data,
      campaign: {
        objective: generation.objective,
        audience: generation.audience,
        offer: generation.offer,
        channels: generation.channels,
        constraints: generation.constraints,
        claims: generation.claims,
        success_measure: generation.success_measure,
      },
      channels: generation.channels,
      variantCount: 2,
    });
    const completed = (
      await db.query("select * from kxra.complete_brand_generation($1,$2,$3)", [
        generation.generation_request_id,
        generation.input_sha256,
        JSON.stringify(outputs),
      ])
    ).rows[0];
    assert.equal(completed.result_state, "SUCCEEDED");
    assert.equal(completed.variant_ids.length, 2);
    const original = (
      await db.query("select * from kxra.creative_variants where id=$1", [
        completed.variant_ids[0],
      ])
    ).rows[0];
    await denied(
      db,
      "select kxra.review_creative_variant($1,$2,$3,'APPROVE_EXPORT',$4,$5)",
      [
        original.id,
        original.content_sha256,
        {
          brand: true,
          claims: false,
          rights: true,
          accessibility: true,
          compliance: true,
        },
        "Claims check has not passed.",
        crypto.randomUUID(),
      ],
    );
    const editedContent = {
      ...original.content,
      body: `${original.content.body} Customer edit.`,
    };
    const editedId = (
      await db.query("select kxra.revise_creative_variant($1,$2,$3,$4) as id", [
        original.id,
        original.content_sha256,
        editedContent,
        crypto.randomUUID(),
      ])
    ).rows[0].id;
    assert.equal(
      (
        await db.query("select state from kxra.creative_variants where id=$1", [
          original.id,
        ])
      ).rows[0].state,
      "SUPERSEDED",
    );
    const edited = (
      await db.query("select * from kxra.creative_variants where id=$1", [
        editedId,
      ])
    ).rows[0];
    const reviewId = (
      await db.query(
        "select kxra.review_creative_variant($1,$2,$3,'APPROVE_EXPORT',$4,$5) as id",
        [
          edited.id,
          edited.content_sha256,
          {
            brand: true,
            claims: true,
            rights: true,
            accessibility: true,
            compliance: true,
          },
          "All five review checks passed for this synthetic fixture.",
          crypto.randomUUID(),
        ],
      )
    ).rows[0].id;
    const exportId = (
      await db.query(
        "select kxra.create_brand_export($1,$2,$3,'MARKDOWN',$4) as id",
        [edited.id, edited.content_sha256, reviewId, crypto.randomUUID()],
      )
    ).rows[0].id;
    const delivery = (
      await db.query("select * from kxra.authorize_brand_export($1)", [
        exportId,
      ])
    ).rows[0];
    assert.equal(delivery.allowed, true);
    assert.equal(delivery.reason_code, "AUTHORIZED");
    assert.equal(delivery.content.body, editedContent.body);
    await as(db, "owner");
    const generationUsageAfter = BigInt(
      (
        await db.query(
          "select consumed_units from kxra.usage_aggregates where org_id=$1 and feature_key='brand.generate'",
          [org],
        )
      ).rows[0].consumed_units,
    );
    assert.equal(generationUsageAfter, generationUsageBefore + 2n);
    await as(db, "partner");
    await denied(
      db,
      `insert into kxra.creative_variants(
        org_id,project_id,request_id,channel,content,content_sha256,
        generation_input_sha256,adapter,adapter_version
       ) values($1,$2,$3,'EMAIL',$4,$5,$6,'FORGED','v1')`,
      [
        org,
        p2,
        generation.generation_request_id,
        original.content,
        original.content_sha256,
        generation.input_sha256,
      ],
    );

    await db.query("reset role");
    await db.query(
      `update kxra.entitlement_grants set state='REVOKED',revoked_at=now(),revoked_by=$1
       where org_id=$2 and feature_key='brand.export' and state='ACTIVE'`,
      [users.owner, org],
    );
    await as(db, "partner");
    const withheld = (
      await db.query("select * from kxra.authorize_brand_export($1)", [
        exportId,
      ])
    ).rows[0];
    assert.equal(withheld.allowed, false);
    assert.equal(withheld.reason_code, "ENTITLEMENT_CHANGED");
    assert.equal(
      (
        await db.query(
          "select count(*)::int as count from kxra.brand_export_deliveries where export_id=$1 and outcome='WITHHELD'",
          [exportId],
        )
      ).rows[0].count,
      1,
    );
  }));

test("Brand Studio RLS isolates projects and crafted project writes fail before context creation", () =>
  tx(async (db) => {
    await as(db, "owner");
    const source = (
      await db.query(
        "select * from kxra.create_brand_source($1,'MANUAL',null,$2,$3,true,$4)",
        [
          p3,
          "Private project-three brand source marker.",
          "Synthetic owner-provided source with rights attested.",
          crypto.randomUUID(),
        ],
      )
    ).rows[0];
    await as(db, "partner");
    assert.equal(
      (
        await db.query("select * from kxra.brand_sources where id=$1", [
          source.source_id,
        ])
      ).rowCount,
      0,
    );
    await denied(
      db,
      "select * from kxra.create_brand_source($1,'MANUAL',null,$2,$3,true,$4)",
      [
        p3,
        "Crafted cross-project source.",
        "Synthetic rights assertion.",
        crypto.randomUUID(),
      ],
    );
    await as(db, "viewer");
    assert.equal(
      (
        await db.query("select * from kxra.brand_sources where id=$1", [
          source.source_id,
        ])
      ).rowCount,
      1,
    );
    await denied(
      db,
      "select * from kxra.create_brand_source($1,'MANUAL',null,$2,$3,true,$4)",
      [
        p3,
        "Viewer cannot write.",
        "Synthetic rights assertion.",
        crypto.randomUUID(),
      ],
    );
    await as(db, "revoked");
    assert.equal(
      (await db.query("select * from kxra.brand_sources")).rowCount,
      0,
    );
    await as(db, null);
    assert.equal(
      (await db.query("select * from kxra.brand_sources")).rowCount,
      0,
    );
  }));
