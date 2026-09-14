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
  user: keyof typeof users | string | null,
  aal = "aal2",
) {
  await db.query("reset role");
  await db.query(`set local role ${user ? "authenticated" : "anon"}`);
  const id = user && user in users ? users[user as keyof typeof users] : user;
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

async function denied(db: pg.PoolClient, sql: string, values: unknown[] = []) {
  await db.query("savepoint expected_denial");
  await assert.rejects(() => db.query(sql, values));
  await db.query("rollback to savepoint expected_denial");
}

test("AT-08 completes an exact-version P002 operating loop and isolates it", async () => {
  const db = await admin.connect();
  try {
    await db.query("begin");
    await as(db, "partner");
    const idea = (
      await db.query(
        `insert into kxra.records(org_id,project_id,kind,title,body,classification,visibility)
         values($1,$2,'idea','Synthetic fitment idea','Test a bounded fitment validation service','USER-SUPPLIED INFORMATION','project_shared')
         returning id,version`,
        [org, p2],
      )
    ).rows[0];
    const submitted = (
      await db.query("select id,version,status from kxra.submit_idea($1,$2)", [
        idea.id,
        idea.version,
      ])
    ).rows[0];
    assert.equal(submitted.status, "submitted");
    assert.equal(submitted.version, 2);

    await as(db, "owner");
    const evidence = (
      await db.query(
        "select id,version from kxra.records where source_code='PROJECT-002-BRIEF' and status='accepted'",
      )
    ).rows[0];
    assert.ok(evidence);
    const refs = [{ record_id: evidence.id, version: evidence.version }];
    const experiment = (
      await db.query(
        "select kxra.create_experiment($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) as id",
        [
          p2,
          idea.id,
          submitted.version,
          "Synthetic SKU evidence experiment",
          "A bounded evidence review can validate one exact SKU",
          "25.0000",
          "GBP",
          "One SKU has complete fitment and safety evidence",
          "Stop if supplier evidence is incomplete",
          JSON.stringify(refs),
        ],
      )
    ).rows[0].id;
    const experimentRow = (
      await db.query("select id,version,status from kxra.records where id=$1", [
        experiment,
      ])
    ).rows[0];
    assert.equal(experimentRow.version, 1);
    assert.equal(experimentRow.status, "draft");

    await denied(
      db,
      `insert into kxra.records(org_id,project_id,kind,title,classification,visibility)
       values($1,$2,'experiment','Bypass','HYPOTHESIS','project_shared')`,
      [org, p2],
    );

    const task = (
      await db.query("select kxra.assign_workflow_task($1,$2,$3,$4,$5) as id", [
        experiment,
        experimentRow.version,
        users.partner,
        "Review the synthetic SKU packet",
        "Record an attributable outcome against the assigned experiment version",
      ])
    ).rows[0].id;

    await as(db, "partner");
    const result = (
      await db.query(
        "select kxra.record_experiment_result($1,$2,$3,$4,$5,$6) as id",
        [
          experiment,
          experimentRow.version,
          "success",
          "The synthetic packet contained the required fields.",
          "1 of 1 synthetic SKU packets complete",
          JSON.stringify(refs),
        ],
      )
    ).rows[0].id;
    await db.query("select kxra.complete_workflow_task($1,1,$2)", [
      task,
      "Recorded the attributable synthetic result.",
    ]);

    await as(db, "owner");
    const decision = (
      await db.query(
        "select kxra.create_linked_decision($1,$2,$3,$4,$5,$6,$7,$8) as id",
        [
          p2,
          experiment,
          experimentRow.version,
          result,
          "Proceed with one bounded synthetic prototype",
          "Proceed only with the exact tested synthetic SKU packet.",
          JSON.stringify(refs),
          null,
        ],
      )
    ).rows[0].id;
    const approval = (
      await db.query(
        "select * from kxra.request_approval('record.accept',$1,$2)",
        [p2, { record_id: decision, version: 1 }],
      )
    ).rows[0];
    await db.query("select kxra.decide_approval($1,$2,true)", [
      approval.id,
      approval.payload_hash,
    ]);
    await db.query("select kxra.accept_record($1)", [approval.id]);
    const accepted = (
      await db.query(
        "select version,status,body from kxra.records where id=$1",
        [decision],
      )
    ).rows[0];
    assert.equal(accepted.status, "accepted");
    assert.equal(accepted.version, 2);
    assert.equal(
      (
        await db.query(
          "select count(*)::int as n from kxra.record_links where from_record_id=$1 and from_version=2 and relation in ('decides_experiment','uses_evidence')",
          [decision],
        )
      ).rows[0].n,
      2,
    );

    const superseding = (
      await db.query(
        "select kxra.create_linked_decision($1,$2,$3,$4,$5,$6,$7,$8) as id",
        [
          p2,
          experiment,
          experimentRow.version,
          result,
          "Refine the bounded synthetic prototype",
          "Retain the evidence boundary and add a second synthetic review.",
          JSON.stringify(refs),
          decision,
        ],
      )
    ).rows[0].id;
    const secondApproval = (
      await db.query(
        "select * from kxra.request_approval('record.accept',$1,$2)",
        [p2, { record_id: superseding, version: 1 }],
      )
    ).rows[0];
    await db.query("select kxra.decide_approval($1,$2,true)", [
      secondApproval.id,
      secondApproval.payload_hash,
    ]);
    await db.query("select kxra.accept_record($1)", [secondApproval.id]);
    assert.equal(
      (
        await db.query(
          "select count(*)::int as n from kxra.record_links where from_record_id=$1 and from_version=2 and relation='supersedes' and to_record_id=$2 and to_version=2",
          [superseding, decision],
        )
      ).rows[0].n,
      1,
    );
    assert.equal(
      (
        await db.query(
          "select count(*)::int as n from kxra.workflow_task_versions where task_id=$1",
          [task],
        )
      ).rows[0].n,
      2,
    );
    assert.equal(
      (
        await db.query("update kxra.records set body='rewrite' where id=$1", [
          decision,
        ])
      ).rowCount,
      0,
    );
    for (const table of [
      "record_links",
      "experiment_results",
      "result_evidence",
      "workflow_tasks",
      "workflow_task_versions",
    ]) {
      await denied(db, `delete from kxra.${table}`);
    }

    await as(db, "viewer");
    for (const table of [
      "record_links",
      "experiment_results",
      "workflow_tasks",
    ])
      assert.equal((await db.query(`select * from kxra.${table}`)).rowCount, 0);
    await denied(
      db,
      "select kxra.record_experiment_result($1,1,'success','forged','forged',$2)",
      [experiment, JSON.stringify(refs)],
    );
    await as(db, "revoked");
    assert.equal(
      (await db.query("select * from kxra.workflow_tasks where id=$1", [task]))
        .rowCount,
      0,
    );

    await db.query("reset role");
    const foreignOrg = crypto.randomUUID();
    const foreignOwner = crypto.randomUUID();
    await db.query(
      "insert into kxra.organisations values($1,'Synthetic foreign org')",
      [foreignOrg],
    );
    await db.query(
      "insert into kxra.members(id,org_id,display_name,role) values($1,$2,'Foreign owner','owner')",
      [foreignOwner, foreignOrg],
    );
    await as(db, foreignOwner);
    assert.equal(
      (await db.query("select * from kxra.record_links")).rowCount,
      0,
    );
    await denied(
      db,
      "select kxra.assign_workflow_task($1,1,$2,'forged','forged')",
      [experiment, foreignOwner],
    );
  } finally {
    await db.query("rollback");
    db.release();
  }
});
