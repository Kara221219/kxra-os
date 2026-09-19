import { after, test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import pg from "pg";
import { runtimeFile } from "./support/runtime";

const config = JSON.parse(
  fs.readFileSync(runtimeFile("database.json"), "utf8"),
);
const admin = new pg.Pool({ ...config, user: os.userInfo().username });
const org = "10000000-0000-4000-8000-000000000001";
const p2 = "30000000-0000-4000-8000-000000000002";
const p3 = "30000000-0000-4000-8000-000000000003";
const users = {
  owner: "20000000-0000-4000-8000-000000000001",
  partner: "20000000-0000-4000-8000-000000000002",
  viewer: "20000000-0000-4000-8000-000000000003",
};

after(() => admin.end());

async function as(
  db: pg.PoolClient,
  user: keyof typeof users,
  aal = "aal2",
  authTime = Math.floor(Date.now() / 1000),
) {
  await db.query("reset role");
  await db.query("set local role authenticated");
  await db.query(
    "select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",
    [
      users[user],
      JSON.stringify({ sub: users[user], aal, auth_time: authTime }),
    ],
  );
}

async function denied(db: pg.PoolClient, sql: string, values: unknown[] = []) {
  await db.query("savepoint expected_denial");
  await assert.rejects(() => db.query(sql, values));
  await db.query("rollback to savepoint expected_denial");
}

async function createIdea(
  db: pg.PoolClient,
  projectId: string | null,
  title: string,
  extra: Record<string, unknown> = {},
) {
  return (
    await db.query("select * from kxra.create_idea($1)", [
      {
        project_id: projectId,
        title,
        raw_idea: `Raw ${title}`,
        evidence: [],
        ...extra,
      },
    ])
  ).rows[0];
}

test("AT-22 typed ideas preserve every field, version and exact submitter/share boundary", async () => {
  const db = await admin.connect();
  try {
    await db.query("begin");
    const marker = crypto.randomUUID();
    await as(db, "partner");
    const evidence = (
      await db.query(
        "select id,version from kxra.records where source_code='PROJECT-002-BRIEF'",
      )
    ).rows[0];
    const own = await createIdea(db, p2, `AT-22 own ${marker}`, {
      structured_summary: "Structured summary",
      problem_statement: "Specific problem",
      target_customer: "Specific customer",
      validation_plan: "Run a bounded interview test",
      next_experiment: "Interview five synthetic participants",
      source_note: "Partner portal acceptance fixture",
      evidence: [{ record_id: evidence.id, version: evidence.version }],
    });
    assert.equal(own.state, "NEW");
    assert.equal(own.source_type, "PARTNER_PORTAL");
    assert.equal(own.venture_score, null);
    assert.equal(own.confidence_score, null);

    const updated = (
      await db.query("select * from kxra.update_idea($1,$2,$3)", [
        own.record_id,
        own.version,
        {
          title: `AT-22 own revised ${marker}`,
          raw_idea: "Revised raw idea",
          structured_summary: "Revised structured summary",
          problem_statement: "Revised problem",
          target_customer: "Revised customer",
          validation_plan: "Revised validation plan",
          next_experiment: "Revised next experiment",
          source_note: "Revised source note",
          evidence: [{ record_id: evidence.id, version: evidence.version }],
        },
      ])
    ).rows[0];
    assert.equal(updated.version, own.version + 1);
    assert.equal(updated.structured_summary, "Revised structured summary");
    assert.equal(
      (
        await db.query(
          "select count(*)::int as n from kxra.idea_versions where record_id=$1",
          [own.record_id],
        )
      ).rows[0].n,
      2,
    );
    assert.equal(
      (
        await db.query(
          "select count(*)::int as n from kxra.idea_evidence where idea_record_id=$1",
          [own.record_id],
        )
      ).rows[0].n,
      2,
    );
    await denied(db, "select * from kxra.update_idea($1,$2,$3)", [
      own.record_id,
      own.version,
      { title: "stale", raw_idea: "stale", evidence: [] },
    ]);
    await denied(
      db,
      `insert into kxra.records(
        org_id,project_id,kind,title,classification,visibility
       ) values($1,$2,'idea','bypass','USER-SUPPLIED INFORMATION','project_shared')`,
      [org, p2],
    );
    await denied(
      db,
      "update kxra.ideas set state='BUILDING' where record_id=$1",
      [own.record_id],
    );

    await as(db, "owner");
    const shared = await createIdea(db, p2, `AT-22 shared ${marker}`);
    const hidden = await createIdea(db, p2, `AT-22 hidden ${marker}`);
    const otherProject = await createIdea(db, p3, `AT-22 p3 ${marker}`);
    const shareApproval = (
      await db.query(
        "select * from kxra.request_idea_share_approval($1,$2,true)",
        [shared.record_id, users.partner],
      )
    ).rows[0];
    assert.equal(shareApproval.state, "REQUESTED");
    assert.equal(shareApproval.payload.envelope_version, 2);
    await db.query("select kxra.decide_approval($1,$2,true)", [
      shareApproval.id,
      shareApproval.payload_hash,
    ]);
    await db.query("select kxra.change_idea_share($1)", [shareApproval.id]);
    await denied(db, "select kxra.change_idea_share($1)", [shareApproval.id]);

    await as(db, "partner");
    const visible = (
      await db.query(
        "select record_id from kxra.ideas where record_id=any($1::uuid[]) order by record_id",
        [
          [
            own.record_id,
            shared.record_id,
            hidden.record_id,
            otherProject.record_id,
          ],
        ],
      )
    ).rows.map((row) => row.record_id);
    assert.deepEqual(visible.sort(), [own.record_id, shared.record_id].sort());
    const visibleRecords = (
      await db.query(
        "select id from kxra.records where id=any($1::uuid[]) order by id",
        [
          [
            own.record_id,
            shared.record_id,
            hidden.record_id,
            otherProject.record_id,
          ],
        ],
      )
    ).rows.map((row) => row.id);
    assert.deepEqual(visibleRecords.sort(), visible.sort());

    await as(db, "viewer");
    assert.deepEqual(
      (
        await db.query(
          "select record_id from kxra.ideas where record_id=any($1::uuid[])",
          [[own.record_id, shared.record_id, hidden.record_id]],
        )
      ).rows,
      [],
    );
    assert.deepEqual(
      (
        await db.query("select record_id from kxra.ideas where record_id=$1", [
          otherProject.record_id,
        ])
      ).rows,
      [],
    );

    await as(db, "owner");
    assert.equal(
      (
        await db.query(
          "select count(*)::int as n from kxra.ideas where record_id=any($1::uuid[])",
          [
            [
              own.record_id,
              shared.record_id,
              hidden.record_id,
              otherProject.record_id,
            ],
          ],
        )
      ).rows[0].n,
      4,
    );

    await db.query("reset role");
    await db.query(
      "update kxra.project_memberships set active=false where project_id=$1 and user_id=$2",
      [p2, users.partner],
    );
    await as(db, "partner");
    assert.equal(
      (
        await db.query(
          "select count(*)::int as n from kxra.ideas where record_id=any($1::uuid[])",
          [[own.record_id, shared.record_id]],
        )
      ).rows[0].n,
      0,
    );
  } finally {
    await db.query("rollback");
    db.release();
  }
});

test("AT-22 every Idea state transition is validated and archived ideas stop", async () => {
  const db = await admin.connect();
  try {
    await db.query("begin");
    await as(db, "owner");
    let idea = await createIdea(
      db,
      p2,
      `AT-22 lifecycle ${crypto.randomUUID()}`,
    );
    const visited = [idea.state];
    for (const state of [
      "TRIAGE",
      "VALIDATING",
      "PROMISING",
      "BUILDING",
      "PAUSED",
      "REJECTED",
      "TRIAGE",
      "ARCHIVED",
    ]) {
      idea = (
        await db.query("select * from kxra.transition_idea($1,$2,$3,$4)", [
          idea.record_id,
          idea.version,
          state,
          `AT-22 move to ${state}`,
        ])
      ).rows[0];
      visited.push(idea.state);
    }
    assert.deepEqual(
      new Set(visited),
      new Set([
        "NEW",
        "TRIAGE",
        "VALIDATING",
        "PROMISING",
        "BUILDING",
        "PAUSED",
        "REJECTED",
        "ARCHIVED",
      ]),
    );
    await denied(db, "select * from kxra.transition_idea($1,$2,'TRIAGE',$3)", [
      idea.record_id,
      idea.version,
      "Archived is terminal",
    ]);
    assert.equal(
      (
        await db.query(
          "select count(*)::int as n from kxra.idea_versions where record_id=$1",
          [idea.record_id],
        )
      ).rows[0].n,
      visited.length,
    );
  } finally {
    await db.query("rollback");
    db.release();
  }
});

test("AT-24 every enabled consequential action has a complete hash-bound envelope", async () => {
  const db = await admin.connect();
  try {
    await db.query("begin");
    await as(db, "owner");
    const marker = crypto.randomUUID();
    const note = (
      await db.query(
        `insert into kxra.records(
          org_id,project_id,kind,title,body,classification,visibility
         ) values($1,$2,'note',$3,'AT-24','USER-SUPPLIED INFORMATION','project_shared')
         returning id,version`,
        [org, p2, `AT-24 note ${marker}`],
      )
    ).rows[0];
    const recordApproval = (
      await db.query(
        "select * from kxra.request_approval('record.accept',$1,$2)",
        [p2, { record_id: note.id, version: note.version }],
      )
    ).rows[0];
    const membershipApproval = (
      await db.query(
        "select * from kxra.request_approval('membership.change',$1,$2)",
        [
          p2,
          {
            user_id: users.partner,
            role: "viewer",
            active: true,
            expires_at: null,
          },
        ],
      )
    ).rows[0];
    const accountApproval = (
      await db.query(
        "select * from kxra.request_account_lifecycle_approval($1,'SUSPENDED',$2)",
        [users.partner, "AT-24 bounded lifecycle fixture"],
      )
    ).rows[0];
    const idea = await createIdea(db, p2, `AT-24 share ${marker}`);
    const shareApproval = (
      await db.query(
        "select * from kxra.request_idea_share_approval($1,$2,true)",
        [idea.record_id, users.partner],
      )
    ).rows[0];
    const project = (
      await db.query("select * from kxra.projects where id=$1", [p2])
    ).rows[0];
    const governanceApproval = (
      await db.query(
        "select * from kxra.request_project_governance_approval($1,$2,$3)",
        [
          p2,
          project.governance_version,
          {
            lifecycle_stage: project.lifecycle_stage,
            disposition: project.disposition,
            next_gate: project.next_gate,
            next_action: `${project.next_action} · ${marker}`,
            current_recommendation: project.current_recommendation,
            owner_user_id: project.owner_user_id,
          },
        ],
      )
    ).rows[0];

    const source = (
      await db.query(
        "select id,version from kxra.records where source_code='PROJECT-002-BRIEF'",
      )
    ).rows[0];
    const gateEvidence = (
      await db.query(
        "select kxra.create_gate_evidence_packet($1,'P002_LISTING',$2,$3,$4,$5) as id",
        [
          p2,
          `AT-24 gate ${marker}`,
          "Synthetic exact SKU packet",
          {
            exact_sku: "AT24-SKU",
            fitment_verified: true,
            safety_evidence_verified: true,
          },
          JSON.stringify([{ record_id: source.id, version: source.version }]),
        ],
      )
    ).rows[0].id;
    const gateRecord = (
      await db.query("select version from kxra.records where id=$1", [
        gateEvidence,
      ])
    ).rows[0];
    const gateEvidenceApproval = (
      await db.query(
        "select * from kxra.request_approval('record.accept',$1,$2)",
        [p2, { record_id: gateEvidence, version: gateRecord.version }],
      )
    ).rows[0];
    await db.query("select kxra.decide_approval($1,$2,true)", [
      gateEvidenceApproval.id,
      gateEvidenceApproval.payload_hash,
    ]);
    await db.query("select kxra.accept_record($1)", [gateEvidenceApproval.id]);
    const acceptedGate = (
      await db.query("select version from kxra.records where id=$1", [
        gateEvidence,
      ])
    ).rows[0];
    const gateApproval = (
      await db.query(
        "select * from kxra.request_project_gate_approval($1,$2)",
        [
          p2,
          {
            gate: "P002_LISTING",
            evidence_id: gateEvidence,
            evidence_version: acceptedGate.version,
          },
        ],
      )
    ).rows[0];

    await db.query("reset role");
    for (const approval of [
      recordApproval,
      membershipApproval,
      accountApproval,
      shareApproval,
      governanceApproval,
      gateApproval,
    ]) {
      assert.equal(approval.state, "REQUESTED");
      assert.equal(approval.payload.envelope_version, 2);
      for (const key of [
        "action_summary",
        "before",
        "after",
        "recipient",
        "estimated_cost",
        "cost_currency",
        "risk_summary",
      ])
        assert.ok(
          Object.hasOwn(approval.payload, key),
          `${approval.action}:${key}`,
        );
      const digest = (
        await db.query(
          `select kxra_private.approval_digest(
             action,org_id,project_id,payload,environment,requested_by,expires_at
           ) as value
           from kxra.approvals where id=$1`,
          [approval.id],
        )
      ).rows[0].value;
      assert.equal(digest, approval.payload_hash, `${approval.action} digest`);
    }

    await as(db, "owner", "aal1");
    await denied(db, "select kxra.decide_approval($1,$2,true)", [
      governanceApproval.id,
      governanceApproval.payload_hash,
    ]);
    await as(db, "owner");
    await db.query("select kxra.decide_approval($1,$2,true)", [
      governanceApproval.id,
      governanceApproval.payload_hash,
    ]);
    await db.query("select kxra.change_project_governance($1)", [
      governanceApproval.id,
    ]);
    await denied(db, "select kxra.change_project_governance($1)", [
      governanceApproval.id,
    ]);
    const changed = (
      await db.query(
        "select governance_version,next_action from kxra.projects where id=$1",
        [p2],
      )
    ).rows[0];
    assert.equal(changed.governance_version, project.governance_version + 1);
    assert.match(changed.next_action, new RegExp(marker));
    assert.equal(
      (
        await db.query(
          "select count(*)::int as n from kxra.project_governance_versions where project_id=$1 and version=$2",
          [p2, changed.governance_version],
        )
      ).rows[0].n,
      1,
    );

    const staleApproval = (
      await db.query(
        "select * from kxra.request_project_governance_approval($1,$2,$3)",
        [
          p2,
          changed.governance_version,
          {
            lifecycle_stage: project.lifecycle_stage,
            disposition: project.disposition,
            next_gate: project.next_gate,
            next_action: `${changed.next_action} stale`,
            current_recommendation: null,
            owner_user_id: null,
          },
        ],
      )
    ).rows[0];
    await db.query("select kxra.decide_approval($1,$2,true)", [
      staleApproval.id,
      staleApproval.payload_hash,
    ]);
    await db.query("reset role");
    await db.query(
      "update kxra.projects set next_action=next_action||' changed' where id=$1",
      [p2],
    );
    await as(db, "owner");
    await denied(db, "select kxra.change_project_governance($1)", [
      staleApproval.id,
    ]);

    await db.query("reset role");
    await db.query(
      `insert into kxra.approvals(
        org_id,action,payload,payload_hash,environment,requested_by,state,expires_at
       ) values($1,'publish','{}',$2,'local',$3,'RECONCILIATION_REQUIRED',now()+interval '1 day')`,
      [org, crypto.randomBytes(32).toString("hex"), users.owner],
    );
  } finally {
    await db.query("rollback");
    db.release();
  }
});

test("AT-24 Work Log contains only real linked events and remains owner-only", async () => {
  const db = await admin.connect();
  try {
    await db.query("begin");
    await as(db, "owner");
    const idea = await createIdea(db, p2, `AT-24 log ${crypto.randomUUID()}`);
    const entries = (
      await db.query(
        `select entry_type,status,project_id,artifact_type,artifact_id,source_kind
         from kxra.work_log_entries where artifact_id=$1 order by occurred_at`,
        [idea.record_id],
      )
    ).rows;
    assert.ok(entries.length >= 1);
    assert.ok(
      entries.some(
        (entry) =>
          entry.entry_type === "AUDIT_EVENT" &&
          entry.status === "RECORDED" &&
          entry.project_id === p2 &&
          entry.artifact_type === "record" &&
          entry.artifact_id === idea.record_id &&
          entry.source_kind === "AUDIT_EVENT",
      ),
    );
    await as(db, "partner");
    assert.equal(
      (
        await db.query(
          "select count(*)::int as n from kxra.work_log_entries where artifact_id=$1",
          [idea.record_id],
        )
      ).rows[0].n,
      0,
    );
  } finally {
    await db.query("rollback");
    db.release();
  }
});
