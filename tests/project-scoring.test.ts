import { after, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import pg from "pg";
import { runtimeFile } from "./support/runtime";

const config = JSON.parse(
  fs.readFileSync(runtimeFile("database.json"), "utf8"),
);
const admin = new pg.Pool({ ...config, user: os.userInfo().username });
const org = "10000000-0000-4000-8000-000000000001";
const p2 = "30000000-0000-4000-8000-000000000002";
const users = {
  owner: "20000000-0000-4000-8000-000000000001",
  partner: "20000000-0000-4000-8000-000000000002",
  viewer: "20000000-0000-4000-8000-000000000003",
  revoked: "20000000-0000-4000-8000-000000000004",
};

after(() => admin.end());

async function as(
  db: pg.PoolClient,
  user: keyof typeof users | null,
  aal = "aal2",
) {
  await db.query("reset role");
  await db.query(`set local role ${user ? "authenticated" : "anon"}`);
  await db.query(
    "select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true),set_config('request.kxra.org_id',$3,true)",
    [
      user ? users[user] : "",
      JSON.stringify({
        sub: user ? users[user] : null,
        aal,
        auth_time: Math.floor(Date.now() / 1000),
      }),
      user ? org : "",
    ],
  );
}

async function denied(db: pg.PoolClient, sql: string, values: unknown[] = []) {
  await db.query("savepoint score_denied");
  await assert.rejects(() => db.query(sql, values));
  await db.query("rollback to savepoint score_denied");
}

async function fixture(db: pg.PoolClient) {
  const project = (
    await db.query("select governance_version from kxra.projects where id=$1", [
      p2,
    ])
  ).rows[0];
  const evidence = (
    await db.query(
      "select id,version from kxra.records where source_code='PROJECT-002-BRIEF' and status='accepted'",
    )
  ).rows[0];
  assert.ok(project && evidence);
  return { project, evidence };
}

function factor(
  factorKey: string,
  evidence: { id: string; version: number },
  rating = 4,
  confidence: Record<string, number> | null = null,
) {
  return {
    factor_key: factorKey,
    rating,
    rationale: `Exact synthetic rationale for ${factorKey}`,
    confidence,
    evidence: [{ record_id: evidence.id, version: evidence.version }],
  };
}

const factorKeys = [
  "customer_problem",
  "willingness_to_pay",
  "distribution",
  "economics",
  "market",
  "differentiation",
  "feasibility",
  "risk_capital",
  "team_partner",
  "scale_reuse",
];

test("AT-47 governed project scoring keeps partial scores unknown and applies exact full evidence", async () => {
  const db = await admin.connect();
  try {
    await db.query("begin");
    await as(db, "owner");
    let { project, evidence } = await fixture(db);
    const partial = (
      await db.query(
        "select * from kxra.request_project_score_approval($1,$2,$3,$4)",
        [
          p2,
          project.governance_version,
          JSON.stringify([factor("customer_problem", evidence)]),
          "Bound one currently evidenced factor",
        ],
      )
    ).rows[0];
    assert.equal(partial.action, "project.score");
    assert.equal(partial.payload.envelope_version, 2);
    assert.equal(partial.payload.before.venture_score, null);
    assert.equal(partial.payload.after.venture_score, null);
    assert.equal(Number(partial.payload.after.score_coverage), 0.15);
    assert.equal(Number(partial.payload.after.score_lower_bound), 12);
    assert.equal(Number(partial.payload.after.score_upper_bound), 97);
    assert.equal(
      (
        await db.query("select venture_score from kxra.projects where id=$1", [
          p2,
        ])
      ).rows[0].venture_score,
      null,
    );

    await as(db, "partner");
    assert.equal(
      (
        await db.query(
          "select count(*)::int as n from kxra.project_score_assessments",
        )
      ).rows[0].n,
      0,
    );
    await as(db, "owner", "aal1");
    await denied(db, "select kxra.decide_approval($1,$2,true)", [
      partial.id,
      partial.payload_hash,
    ]);
    await as(db, "owner");
    await db.query("select kxra.decide_approval($1,$2,true)", [
      partial.id,
      partial.payload_hash,
    ]);
    await db.query("select kxra.apply_project_score($1)", [partial.id]);
    await denied(db, "select kxra.apply_project_score($1)", [partial.id]);
    let scored = (
      await db.query(
        `select venture_score,confidence_score,score_coverage,
          score_lower_bound,score_upper_bound,governance_version
         from kxra.projects where id=$1`,
        [p2],
      )
    ).rows[0];
    assert.equal(scored.venture_score, null);
    assert.equal(scored.confidence_score, null);
    assert.equal(Number(scored.score_coverage), 0.15);
    assert.equal(Number(scored.score_lower_bound), 12);
    assert.equal(Number(scored.score_upper_bound), 97);

    for (const user of ["partner", "viewer", "revoked"] as const) {
      await as(db, user);
      const visible = (
        await db.query(
          "select state from kxra.project_score_assessments where id=$1",
          [partial.payload.assessment_id],
        )
      ).rows;
      assert.deepEqual(
        visible.map((row) => row.state),
        user === "partner" ? ["APPLIED"] : [],
      );
      assert.equal(
        (await db.query("select * from kxra.project_score_factors")).rowCount,
        user === "partner" ? 1 : 0,
      );
      assert.equal(
        (await db.query("select * from kxra.project_score_factor_evidence"))
          .rowCount,
        user === "partner" ? 1 : 0,
      );
    }
    await as(db, null);
    assert.equal(
      (await db.query("select * from kxra.project_score_assessments")).rowCount,
      0,
    );

    await as(db, "owner");
    project = { governance_version: scored.governance_version };
    const confidence = {
      quality: 0.5,
      independence: 0.5,
      recency: 0.5,
      directness: 0.5,
    };
    const complete = (
      await db.query(
        "select * from kxra.request_project_score_approval($1,$2,$3,$4)",
        [
          p2,
          project.governance_version,
          JSON.stringify(
            factorKeys.map((key) => factor(key, evidence, 4, confidence)),
          ),
          "Complete deterministic assessment",
        ],
      )
    ).rows[0];
    assert.equal(Number(complete.payload.after.venture_score), 80);
    assert.equal(Number(complete.payload.after.confidence_score), 6.25);
    assert.equal(Number(complete.payload.after.score_coverage), 1);
    await db.query("select kxra.decide_approval($1,$2,true)", [
      complete.id,
      complete.payload_hash,
    ]);
    await db.query("select kxra.apply_project_score($1)", [complete.id]);
    scored = (
      await db.query(
        "select venture_score,confidence_score,score_coverage from kxra.projects where id=$1",
        [p2],
      )
    ).rows[0];
    assert.equal(Number(scored.venture_score), 80);
    assert.equal(Number(scored.confidence_score), 6.25);
    assert.equal(Number(scored.score_coverage), 1);
    assert.deepEqual(
      (
        await db.query(
          "select state from kxra.project_score_assessments where id=any($1::uuid[]) order by created_at",
          [[partial.payload.assessment_id, complete.payload.assessment_id]],
        )
      ).rows.map((row) => row.state),
      ["SUPERSEDED", "APPLIED"],
    );
  } finally {
    await db.query("rollback");
    db.release();
  }
});

test("AT-47 score requests reject forged evidence, malformed factors and stale projects", async () => {
  const db = await admin.connect();
  try {
    await db.query("begin");
    await as(db, "owner");
    const { project, evidence } = await fixture(db);
    const other = (
      await db.query(
        "select id,version from kxra.records where source_code='PROJECT-003-BRIEF'",
      )
    ).rows[0];
    const request =
      "select * from kxra.request_project_score_approval($1,$2,$3,$4)";
    await denied(db, request, [
      p2,
      project.governance_version,
      JSON.stringify([factor("customer_problem", other)]),
      "Cross-project evidence must fail",
    ]);
    await denied(db, request, [
      p2,
      project.governance_version,
      JSON.stringify([
        factor("customer_problem", {
          ...evidence,
          version: evidence.version + 1,
        }),
      ]),
      "Stale evidence must fail",
    ]);
    await denied(db, request, [
      p2,
      project.governance_version,
      JSON.stringify([
        factor("customer_problem", evidence),
        factor("customer_problem", evidence),
      ]),
      "Duplicate factors must fail",
    ]);
    await denied(db, request, [
      p2,
      project.governance_version,
      JSON.stringify([
        factor("customer_problem", evidence, 4, {
          quality: 1,
          independence: 1,
          recency: 1,
        }),
      ]),
      "Incomplete confidence must fail",
    ]);

    const stale = (
      await db.query(request, [
        p2,
        project.governance_version,
        JSON.stringify([factor("customer_problem", evidence)]),
        "Project governance changes invalidate this request",
      ])
    ).rows[0];
    const current = (
      await db.query("select * from kxra.projects where id=$1", [p2])
    ).rows[0];
    const governance = (
      await db.query(
        "select * from kxra.request_project_governance_approval($1,$2,$3)",
        [
          p2,
          current.governance_version,
          JSON.stringify({
            lifecycle_stage: current.lifecycle_stage,
            disposition: current.disposition,
            next_gate: current.next_gate,
            next_action: `${current.next_action} · score stale test`,
            current_recommendation: current.current_recommendation,
            owner_user_id: current.owner_user_id,
          }),
        ],
      )
    ).rows[0];
    await db.query("select kxra.decide_approval($1,$2,true)", [
      governance.id,
      governance.payload_hash,
    ]);
    await db.query("select kxra.change_project_governance($1)", [
      governance.id,
    ]);
    await db.query("select kxra.decide_approval($1,$2,true)", [
      stale.id,
      stale.payload_hash,
    ]);
    await denied(db, "select kxra.apply_project_score($1)", [stale.id]);

    await as(db, "partner");
    await denied(
      db,
      "insert into kxra.project_score_assessments default values",
    );
    await denied(db, request, [
      p2,
      project.governance_version,
      JSON.stringify([factor("customer_problem", evidence)]),
      "Partner cannot create scores",
    ]);
  } finally {
    await db.query("rollback");
    db.release();
  }
});
