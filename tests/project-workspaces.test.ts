import { after, test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import pg from "pg";

const config = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), ".runtime/database.json"), "utf8"),
);
const admin = new pg.Pool({ ...config, user: os.userInfo().username });
const org = "10000000-0000-4000-8000-000000000001";
const users = {
  owner: "20000000-0000-4000-8000-000000000001",
  partner: "20000000-0000-4000-8000-000000000002",
  viewer: "20000000-0000-4000-8000-000000000003",
  revoked: "20000000-0000-4000-8000-000000000004",
};
const projects = {
  p1: "30000000-0000-4000-8000-000000000001",
  p2: "30000000-0000-4000-8000-000000000002",
  p3: "30000000-0000-4000-8000-000000000003",
  p4: "30000000-0000-4000-8000-000000000004",
  p5: "30000000-0000-4000-8000-000000000005",
};

after(() => admin.end());

async function as(
  db: pg.PoolClient,
  user: keyof typeof users | null,
  aal = "aal2",
) {
  await db.query("reset role");
  await db.query(`set local role ${user ? "authenticated" : "anon"}`);
  const id = user ? users[user] : null;
  await db.query(
    "select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",
    [
      id || "",
      JSON.stringify({
        sub: id,
        aal,
        auth_time: Math.floor(Date.now() / 1000),
      }),
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

async function acceptedEvidence(db: pg.PoolClient, sourceCode: string) {
  const row = (
    await db.query(
      "select id,version from kxra.records where source_code=$1 and status='accepted'",
      [sourceCode],
    )
  ).rows[0];
  assert.ok(row, sourceCode);
  return row as { id: string; version: number };
}

test("AT-23 every project exposes the exact common and specialist module contract", () =>
  tx(async (db) => {
    await as(db, "owner");
    const counts = (
      await db.query(
        `select p.code,
          count(*) filter(where m.module_group='COMMON')::int as common,
          count(*) filter(where m.module_group='SPECIALIST')::int as specialist
         from kxra.projects p join kxra.project_workspace_modules m on m.project_id=p.id
         group by p.code order by p.code`,
      )
    ).rows;
    assert.deepEqual(counts, [
      { code: "PROJECT-001", common: 18, specialist: 8 },
      { code: "PROJECT-002", common: 18, specialist: 12 },
      { code: "PROJECT-003", common: 18, specialist: 12 },
      { code: "PROJECT-004", common: 18, specialist: 13 },
      { code: "PROJECT-005", common: 18, specialist: 16 },
    ]);
    assert.deepEqual(
      (
        await db.query(
          `select label from kxra.project_workspace_modules
           where project_id=$1 and module_group='COMMON' order by position`,
          [projects.p1],
        )
      ).rows.map((row) => row.label),
      [
        "Overview",
        "Problem",
        "Customer",
        "Value Proposition",
        "Market",
        "Research",
        "Assumptions",
        "Experiments",
        "Decisions",
        "Risks",
        "Finance",
        "Roadmap",
        "Tasks",
        "Files",
        "Activity",
        "Metrics",
        "Partners",
        "Approvals",
      ],
    );
    assert.equal(
      (
        await db.query(
          "select count(*)::int as n from kxra.project_gate_policies",
        )
      ).rows[0].n,
      5,
    );

    await as(db, "partner");
    assert.equal(
      (
        await db.query(
          "select count(*)::int as n from kxra.project_workspace_modules",
        )
      ).rows[0].n,
      30,
    );
    assert.equal(
      (
        await db.query(
          "select count(*)::int as n from kxra.project_workspace_modules where project_id=$1",
          [projects.p3],
        )
      ).rows[0].n,
      0,
    );
    await as(db, "revoked");
    assert.equal(
      (await db.query("select * from kxra.project_workspace_modules")).rowCount,
      0,
    );
  }));

test("AT-23 typed workspace entries validate payloads, versions, review and RLS", () =>
  tx(async (db) => {
    await as(db, "partner");
    const entry = (
      await db.query(
        `select * from kxra.create_workspace_entry(
          $1,'problem','Synthetic bounded problem','Partner-supplied draft',
          'USER-SUPPLIED INFORMATION','project_shared',$2,'[]'::jsonb
         )`,
        [projects.p2, { statement: "A precise synthetic customer problem" }],
      )
    ).rows[0];
    assert.equal(entry.status, "DRAFT");
    assert.equal(entry.version, 1);
    await denied(
      db,
      `select * from kxra.create_workspace_entry(
        $1,'problem','Wrong project','Denied','USER-SUPPLIED INFORMATION',
        'project_shared',$2,'[]'::jsonb)`,
      [projects.p3, { statement: "Cross-project" }],
    );
    await denied(
      db,
      `insert into kxra.workspace_entries(
        org_id,project_id,module_key,record_type,title,summary,payload,
        classification,visibility,created_by
       ) values($1,$2,'problem','NARRATIVE','Bypass','Bypass',$3,
        'USER-SUPPLIED INFORMATION','project_shared',$4)`,
      [org, projects.p2, { statement: "Bypass" }, users.partner],
    );

    await as(db, "owner");
    const reviewed = (
      await db.query("select * from kxra.review_workspace_entry($1,1)", [
        entry.id,
      ])
    ).rows[0];
    assert.equal(reviewed.status, "REVIEWED");
    assert.equal(reviewed.version, 2);
    assert.deepEqual(
      (
        await db.query(
          "select version,status from kxra.workspace_entry_versions where entry_id=$1 order by version",
          [entry.id],
        )
      ).rows,
      [
        { version: 1, status: "DRAFT" },
        { version: 2, status: "REVIEWED" },
      ],
    );
    await denied(db, "select * from kxra.review_workspace_entry($1,2)", [
      entry.id,
    ]);

    await denied(
      db,
      `select * from kxra.create_workspace_entry(
        $1,'midday-reports','Unsafe report','Must fail','EXTERNAL RESEARCH',
        'project_shared',$2,'[]'::jsonb)`,
      [
        projects.p4,
        {
          report_period: "Synthetic midday",
          summary: "Synthetic",
          paper_only: false,
        },
      ],
    );
    const paper = (
      await db.query(
        `select * from kxra.create_workspace_entry(
          $1,'midday-reports','Paper report','Paper-only evidence',
          'EXTERNAL RESEARCH','project_shared',$2,'[]'::jsonb)`,
        [
          projects.p4,
          {
            report_period: "Synthetic midday",
            summary: "No execution",
            paper_only: true,
          },
        ],
      )
    ).rows[0];
    assert.equal(paper.payload.paper_only, true);
  }));

test("AT-23 P002 compatibility cannot be verified without exact current evidence", () =>
  tx(async (db) => {
    await as(db, "owner");
    const rows = (
      await db.query(
        `select id,vehicle_family,supplier_sku,fitment_state,safety_state,version
         from kxra.vehicle_compatibility where project_id=$1 order by vehicle_family`,
        [projects.p2],
      )
    ).rows;
    assert.equal(rows.length, 3);
    assert.ok(
      rows.every(
        (row) =>
          row.supplier_sku === null &&
          row.fitment_state === "UNKNOWN" &&
          row.safety_state === "UNKNOWN",
      ),
    );
    await denied(
      db,
      "update kxra.vehicle_compatibility set fitment_state='VERIFIED' where id=$1",
      [rows[0].id],
    );
    await denied(
      db,
      "select * from kxra.verify_vehicle_compatibility($1,1,'SKU-001',$2,1,$2,1)",
      [rows[0].id, crypto.randomUUID()],
    );
    const source = await acceptedEvidence(db, "PROJECT-002-BRIEF");
    const verified = (
      await db.query(
        "select * from kxra.verify_vehicle_compatibility($1,1,'SKU-001',$2,$3,$2,$3)",
        [rows[0].id, source.id, source.version],
      )
    ).rows[0];
    assert.equal(verified.supplier_sku, "SKU-001");
    assert.equal(verified.fitment_state, "VERIFIED");
    assert.equal(verified.safety_state, "VERIFIED");
    await denied(
      db,
      "select * from kxra.verify_vehicle_compatibility($1,1,'STALE',$2,$3,$2,$3)",
      [rows[0].id, source.id, source.version],
    );
    const wrongProject = await acceptedEvidence(db, "PROJECT-003-BRIEF");
    await denied(
      db,
      "select * from kxra.verify_vehicle_compatibility($1,1,'CROSS',$2,$3,$2,$3)",
      [rows[1].id, wrongProject.id, wrongProject.version],
    );
  }));

test("AT-23 P003 property assets preserve real, generated and inferred provenance", () =>
  tx(async (db) => {
    await as(db, "owner");
    const generated = (
      await db.query(
        "select * from kxra.create_property_asset($1,'photos','Synthetic generated view','PHOTO','AI_GENERATED')",
        [projects.p3],
      )
    ).rows[0];
    const real = (
      await db.query(
        "select * from kxra.create_property_asset($1,'floorplans','Synthetic real floorplan','FLOORPLAN','REAL_INPUT')",
        [projects.p3],
      )
    ).rows[0];
    assert.equal(generated.origin, "AI_GENERATED");
    assert.equal(real.origin, "REAL_INPUT");
    await denied(
      db,
      "update kxra.property_assets set origin='REAL_INPUT' where id=$1",
      [generated.id],
    );
    const evidence = await acceptedEvidence(db, "PROJECT-003-BRIEF");
    const reviewed = (
      await db.query(
        "select * from kxra.review_property_asset($1,1,$2,$3,$2,$3)",
        [real.id, evidence.id, evidence.version],
      )
    ).rows[0];
    assert.equal(reviewed.rights_state, "CONFIRMED");
    assert.equal(reviewed.geometry_state, "PASSED");
    const wrong = await acceptedEvidence(db, "PROJECT-002-BRIEF");
    await denied(
      db,
      "select * from kxra.review_property_asset($1,1,$2,$3,null,null)",
      [generated.id, wrong.id, wrong.version],
    );

    await as(db, "viewer");
    assert.equal(
      (
        await db.query(
          "select count(*)::int as n from kxra.property_assets where id=any($1::uuid[])",
          [[generated.id, real.id]],
        )
      ).rows[0].n,
      2,
    );
    await denied(
      db,
      "select * from kxra.create_property_asset($1,'photos','Viewer bypass','PHOTO','REAL_INPUT')",
      [projects.p3],
    );
  }));

test("AT-23 P001 revisit recommendations cite all five current evidence categories", () =>
  tx(async (db) => {
    await db.query("reset role");
    const refs: { id: string; version: number }[] = [];
    for (const category of [
      "route",
      "liquidity",
      "recovery",
      "buyer",
      "regulatory",
    ]) {
      const id = crypto.randomUUID();
      const row = (
        await db.query(
          `insert into kxra.records(
            id,org_id,project_id,kind,title,body,classification,visibility,status,created_by
           ) values($1,$2,$3,'knowledge',$4,'Synthetic AT-23 evidence',
            'EXTERNAL RESEARCH','project_shared','accepted',$5)
           returning id,version`,
          [id, org, projects.p1, `AT-23 ${category}`, users.owner],
        )
      ).rows[0];
      refs.push(row);
    }
    await as(db, "owner");
    const review = (
      await db.query(
        `select * from kxra.create_clpr_revisit_review(
          $1,'MONITOR','Continue monitoring until the evidence changes',
          $2,$3,$4,$5,$6,$7,$8,$9,$10,$11
         )`,
        [
          projects.p1,
          refs[0].id,
          refs[0].version,
          refs[1].id,
          refs[1].version,
          refs[2].id,
          refs[2].version,
          refs[3].id,
          refs[3].version,
          refs[4].id,
          refs[4].version,
        ],
      )
    ).rows[0];
    assert.equal(review.route_evidence_id, refs[0].id);
    assert.equal(review.liquidity_evidence_id, refs[1].id);
    assert.equal(review.recovery_evidence_id, refs[2].id);
    assert.equal(review.buyer_evidence_id, refs[3].id);
    assert.equal(review.regulatory_evidence_id, refs[4].id);
    await denied(
      db,
      `select * from kxra.create_clpr_revisit_review(
        $1,'REVISIT','One record cannot represent five evidence categories',
        $2,$3,$2,$3,$2,$3,$2,$3,$2,$3)`,
      [projects.p1, refs[0].id, refs[0].version],
    );
    await denied(
      db,
      `select kxra.create_gate_evidence_packet(
        $1,'P001_REVISIT','Duplicate categories','Must remain blocked',$2,$3)`,
      [
        projects.p1,
        {
          route_evidenced: true,
          liquidity_evidenced: true,
          recovery_evidenced: true,
          buyer_evidenced: true,
          regulatory_evidenced: true,
        },
        Array.from({ length: 5 }, () => ({
          record_id: refs[0].id,
          version: refs[0].version,
        })),
      ],
    );
    const cross = await acceptedEvidence(db, "PROJECT-002-BRIEF");
    await denied(
      db,
      `select * from kxra.create_clpr_revisit_review(
        $1,'REVISIT','Cross-project evidence must fail',
        $2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        projects.p1,
        cross.id,
        cross.version,
        refs[1].id,
        refs[1].version,
        refs[2].id,
        refs[2].version,
        refs[3].id,
        refs[3].version,
        refs[4].id,
        refs[4].version,
      ],
    );
  }));

test("AT-23 P004 has paper-only records and no live execution path", () =>
  tx(async (db) => {
    await as(db, "owner");
    const project = (
      await db.query(
        "select live_execution_enabled from kxra.projects where id=$1",
        [projects.p4],
      )
    ).rows[0];
    assert.equal(project.live_execution_enabled, false);
    assert.equal(
      (
        await db.query(
          `select count(*)::int as n from pg_proc p
           join pg_namespace n on n.oid=p.pronamespace
           where n.nspname='kxra' and p.proname~'(broker|live_trade|execute_trade)'`,
        )
      ).rows[0].n,
      0,
    );
    await denied(
      db,
      `select * from kxra.create_workspace_entry(
        $1,'p004-research','Non-paper record','Must fail','HYPOTHESIS',
        'project_shared',$2,'[]'::jsonb)`,
      [
        projects.p4,
        { topic: "Synthetic", observation: "Unsafe", paper_only: false },
      ],
    );
    const paper = (
      await db.query(
        `select * from kxra.create_workspace_entry(
          $1,'p004-research','Paper observation','No execution','HYPOTHESIS',
          'project_shared',$2,'[]'::jsonb)`,
        [
          projects.p4,
          { topic: "Synthetic", observation: "Paper only", paper_only: true },
        ],
      )
    ).rows[0];
    assert.equal(paper.payload.paper_only, true);
    await db.query("reset role");
    await denied(
      db,
      "update kxra.projects set live_execution_enabled=true where id=$1",
      [projects.p4],
    );
  }));

test("AT-23 P005 stops at exact demand-gated local prototype authority", () =>
  tx(async (db) => {
    await as(db, "owner");
    const opportunity = (
      await db.query(
        "select * from kxra.create_digital_opportunity($1,'Synthetic opportunity','A specific synthetic buyer problem')",
        [projects.p5],
      )
    ).rows[0];
    assert.equal(opportunity.stage, "DISCOVERY");
    assert.equal(opportunity.opportunity_score, null);
    assert.equal(opportunity.confidence_score, null);
    await denied(
      db,
      "update kxra.digital_opportunities set stage='LOCAL_PROTOTYPE_AUTHORIZED' where id=$1",
      [opportunity.id],
    );
    const source = await acceptedEvidence(db, "PROJECT-005-BRIEF");
    const evidenced = (
      await db.query(
        "select * from kxra.attach_digital_demand_evidence($1,1,$2,$3)",
        [opportunity.id, source.id, source.version],
      )
    ).rows[0];
    assert.equal(evidenced.stage, "EVIDENCE_REVIEW");
    await denied(
      db,
      "select * from kxra.authorize_digital_local_prototype($1,2,$2)",
      [opportunity.id, crypto.randomUUID()],
    );

    const refs = JSON.stringify([
      { record_id: source.id, version: source.version },
    ]);
    const packet = (
      await db.query(
        `select kxra.create_gate_evidence_packet(
          $1,'P005_LOCAL_PROTOTYPE','Synthetic demand gate','Local-only test',$2,$3
         ) as id`,
        [
          projects.p5,
          { buyer_problem: opportunity.buyer_problem, demand_reviewed: true },
          refs,
        ],
      )
    ).rows[0].id;
    const acceptance = (
      await db.query(
        "select * from kxra.request_approval('record.accept',$1,$2)",
        [projects.p5, { record_id: packet, version: 1 }],
      )
    ).rows[0];
    await db.query("select kxra.decide_approval($1,$2,true)", [
      acceptance.id,
      acceptance.payload_hash,
    ]);
    await db.query("select kxra.accept_record($1)", [acceptance.id]);
    const gate = (
      await db.query(
        "select * from kxra.request_project_gate_approval($1,$2)",
        [
          projects.p5,
          {
            gate: "P005_LOCAL_PROTOTYPE",
            evidence_id: packet,
            evidence_version: 2,
          },
        ],
      )
    ).rows[0];
    await db.query("select kxra.decide_approval($1,$2,true)", [
      gate.id,
      gate.payload_hash,
    ]);
    const authorization = (
      await db.query("select kxra.authorize_project_gate($1) as id", [gate.id])
    ).rows[0].id;
    const local = (
      await db.query(
        "select * from kxra.authorize_digital_local_prototype($1,2,$2)",
        [opportunity.id, authorization],
      )
    ).rows[0];
    assert.equal(local.stage, "LOCAL_PROTOTYPE_AUTHORIZED");
    assert.equal(local.opportunity_score, null);
    assert.equal(local.confidence_score, null);
    assert.equal(
      (
        await db.query(
          "select product_creation_enabled from kxra.projects where id=$1",
          [projects.p5],
        )
      ).rows[0].product_creation_enabled,
      false,
    );
    await db.query("reset role");
    await denied(
      db,
      "update kxra.digital_opportunities set stage='PUBLISHED' where id=$1",
      [opportunity.id],
    );
  }));
