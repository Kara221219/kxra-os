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
const actors = {
  owner: "20000000-0000-4000-8000-000000000001",
  partner: "20000000-0000-4000-8000-000000000002",
  viewer: "20000000-0000-4000-8000-000000000003",
  revoked: "20000000-0000-4000-8000-000000000004",
};
const p2 = "30000000-0000-4000-8000-000000000002";
const p3 = "30000000-0000-4000-8000-000000000003";

type Actor = keyof typeof actors | "other";
type Expected = Record<Actor, string[]>;

async function as(db: pg.PoolClient, id: string) {
  await db.query("reset role");
  await db.query("set local role authenticated");
  await db.query(
    "select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",
    [
      id,
      JSON.stringify({
        sub: id,
        aal: "aal2",
        auth_time: Math.floor(Date.now() / 1000),
      }),
    ],
  );
}

async function addRecord(
  db: pg.PoolClient,
  id: string,
  ownerId: string,
  orgId: string,
  projectId: string | null,
  kind: "knowledge" | "experiment" | "note",
  visibility: "project_shared" | "owner_only",
  marker: string,
) {
  await db.query(
    `insert into kxra.records(
      id,org_id,project_id,kind,title,body,data,classification,visibility,status,created_by
     ) values($1,$2,$3,$4,$5,'AT-01 matrix evidence',$6,'EXTERNAL RESEARCH',$7,'accepted',$8)`,
    [
      id,
      orgId,
      projectId,
      kind,
      `AT-01 ${marker}`,
      { marker },
      visibility,
      ownerId,
    ],
  );
}

after(() => admin.end());

test("AT-01 every table enforces the complete principal visibility matrix", async () => {
  const db = await admin.connect();
  try {
    await db.query("begin");
    const otherOrg = crypto.randomUUID();
    const otherOwner = crypto.randomUUID();
    const otherProject = crypto.randomUUID();
    const ids = Object.fromEntries(
      [
        "p2Evidence",
        "p2Experiment",
        "p2Private",
        "p3Evidence",
        "p3Experiment",
        "p3Private",
        "groupRecord",
        "otherEvidence",
        "otherExperiment",
        "otherPrivate",
        "otherGroup",
        "p2Link",
        "p3Link",
        "otherLink",
        "p2Result",
        "p3Result",
        "otherResult",
        "p2Task",
        "p3Task",
        "otherTask",
        "p2SharedFile",
        "p2PrivateFile",
        "p3SharedFile",
        "p3PrivateFile",
        "otherSharedFile",
        "otherPrivateFile",
        "localApproval",
        "otherApproval",
        "localInvitation",
        "otherInvitation",
        "partnerPairing",
        "viewerPairing",
        "revokedPairing",
        "otherPairing",
        "inbound",
        "p2Verification",
        "p3Verification",
        "otherVerification",
        "p2GateAuthorization",
        "otherGateAuthorization",
      ].map((name) => [name, crypto.randomUUID()]),
    ) as Record<string, string>;
    const marker = crypto.randomUUID();
    const digest = (value: string) =>
      crypto.createHash("sha256").update(value).digest("hex");

    await db.query("insert into kxra.organisations(id,name) values($1,$2)", [
      otherOrg,
      "AT-01 isolated organisation",
    ]);
    await db.query(
      "insert into kxra.members(id,org_id,display_name,role) values($1,$2,$3,'owner')",
      [otherOwner, otherOrg, "AT-01 other owner"],
    );
    await db.query(
      `insert into kxra.projects(
        id,org_id,code,name,stage,status,next_action
       ) values($1,$2,'AT01-OTHER','AT-01 other project','test','active','remain isolated')`,
      [otherProject, otherOrg],
    );
    await db.query(
      `insert into kxra.project_memberships(
        org_id,project_id,user_id,role,active
       ) values($1,$2,$3,'contributor',true)`,
      [otherOrg, otherProject, otherOwner],
    );

    const recordRows: [
      string,
      string,
      string,
      string | null,
      "knowledge" | "experiment" | "note",
      "project_shared" | "owner_only",
      string,
    ][] = [
      [
        ids.p2Evidence,
        actors.owner,
        org,
        p2,
        "knowledge",
        "project_shared",
        "p2 evidence",
      ],
      [
        ids.p2Experiment,
        actors.owner,
        org,
        p2,
        "experiment",
        "project_shared",
        "p2 experiment",
      ],
      [
        ids.p2Private,
        actors.owner,
        org,
        p2,
        "note",
        "owner_only",
        "p2 private",
      ],
      [
        ids.p3Evidence,
        actors.owner,
        org,
        p3,
        "knowledge",
        "project_shared",
        "p3 evidence",
      ],
      [
        ids.p3Experiment,
        actors.owner,
        org,
        p3,
        "experiment",
        "project_shared",
        "p3 experiment",
      ],
      [
        ids.p3Private,
        actors.owner,
        org,
        p3,
        "note",
        "owner_only",
        "p3 private",
      ],
      [
        ids.groupRecord,
        actors.owner,
        org,
        null,
        "note",
        "owner_only",
        "group private",
      ],
      [
        ids.otherEvidence,
        otherOwner,
        otherOrg,
        otherProject,
        "knowledge",
        "project_shared",
        "other evidence",
      ],
      [
        ids.otherExperiment,
        otherOwner,
        otherOrg,
        otherProject,
        "experiment",
        "project_shared",
        "other experiment",
      ],
      [
        ids.otherPrivate,
        otherOwner,
        otherOrg,
        otherProject,
        "note",
        "owner_only",
        "other private",
      ],
      [
        ids.otherGroup,
        otherOwner,
        otherOrg,
        null,
        "note",
        "owner_only",
        "other group",
      ],
    ];
    for (const row of recordRows) await addRecord(db, ...row);

    for (const row of [
      [ids.p2Link, org, p2, ids.p2Experiment, ids.p2Evidence, actors.owner],
      [ids.p3Link, org, p3, ids.p3Experiment, ids.p3Evidence, actors.owner],
      [
        ids.otherLink,
        otherOrg,
        otherProject,
        ids.otherExperiment,
        ids.otherEvidence,
        otherOwner,
      ],
    ] as const)
      await db.query(
        `insert into kxra.record_links(
          id,org_id,project_id,from_record_id,from_version,relation,to_record_id,to_version,created_by
         ) values($1,$2,$3,$4,1,'uses_evidence',$5,1,$6)`,
        [...row],
      );

    for (const row of [
      [ids.p2Result, org, p2, ids.p2Experiment, actors.partner],
      [ids.p3Result, org, p3, ids.p3Experiment, actors.owner],
      [
        ids.otherResult,
        otherOrg,
        otherProject,
        ids.otherExperiment,
        otherOwner,
      ],
    ] as const)
      await db.query(
        `insert into kxra.experiment_results(
          id,org_id,project_id,experiment_id,experiment_version,outcome,observations,metric_value,recorded_by
         ) values($1,$2,$3,$4,1,'success','AT-01 observation','1 synthetic result',$5)`,
        [...row],
      );
    for (const [resultId, evidenceId] of [
      [ids.p2Result, ids.p2Evidence],
      [ids.p3Result, ids.p3Evidence],
      [ids.otherResult, ids.otherEvidence],
    ])
      await db.query("insert into kxra.result_evidence values($1,$2,1)", [
        resultId,
        evidenceId,
      ]);

    for (const row of [
      [ids.p2Task, org, p2, ids.p2Experiment, actors.partner, actors.owner],
      [ids.p3Task, org, p3, ids.p3Experiment, actors.owner, actors.owner],
      [
        ids.otherTask,
        otherOrg,
        otherProject,
        ids.otherExperiment,
        otherOwner,
        otherOwner,
      ],
    ] as const)
      await db.query(
        `insert into kxra.workflow_tasks(
          id,org_id,project_id,context_record_id,context_version,title,acceptance_criteria,assignee_id,assigned_by
         ) values($1,$2,$3,$4,1,'AT-01 assigned task','Complete only this exact version',$5,$6)`,
        [...row],
      );

    for (const row of [
      [ids.p2SharedFile, org, p2, ids.p2Evidence, "p2-shared", actors.owner],
      [ids.p2PrivateFile, org, p2, ids.p2Private, "p2-private", actors.owner],
      [ids.p3SharedFile, org, p3, ids.p3Evidence, "p3-shared", actors.owner],
      [ids.p3PrivateFile, org, p3, ids.p3Private, "p3-private", actors.owner],
      [
        ids.otherSharedFile,
        otherOrg,
        otherProject,
        ids.otherEvidence,
        "other-shared",
        otherOwner,
      ],
      [
        ids.otherPrivateFile,
        otherOrg,
        otherProject,
        ids.otherPrivate,
        "other-private",
        otherOwner,
      ],
    ] as const)
      await db.query(
        `insert into kxra.files(
          id,org_id,project_id,record_id,filename,object_key,mime_type,size_bytes,sha256,created_by
         ) values($1,$2,$3,$4,$5,$6,'text/plain',1,$7,$8)`,
        [
          row[0],
          row[1],
          row[2],
          row[3],
          `${row[4]}.txt`,
          crypto.randomUUID(),
          digest(row[4]),
          row[5],
        ],
      );

    for (const row of [
      [ids.p2Verification, ids.p2Experiment, ids.p2Evidence, actors.owner],
      [ids.p3Verification, ids.p3Experiment, ids.p3Evidence, actors.owner],
      [
        ids.otherVerification,
        ids.otherExperiment,
        ids.otherEvidence,
        otherOwner,
      ],
    ] as const)
      await db.query(
        `insert into kxra.verifications(
          id,record_id,record_version,evidence_id,evidence_version,reviewer_id,method
         ) values($1,$2,1,$3,1,$4,'AT-01 attributable verification')`,
        [...row],
      );

    const localGatePayload = {
      gate: "P002_LISTING",
      evidence_id: ids.p2Evidence,
      evidence_version: 1,
    };
    const otherGatePayload = {
      gate: "P002_LISTING",
      evidence_id: ids.otherEvidence,
      evidence_version: 1,
    };
    for (const row of [
      [ids.localApproval, org, p2, localGatePayload, actors.owner],
      [ids.otherApproval, otherOrg, otherProject, otherGatePayload, otherOwner],
    ] as const)
      await db.query(
        `insert into kxra.approvals(
          id,org_id,project_id,action,payload,payload_hash,requested_by,state,approved_by,expires_at,consumed_at
         ) values($1,$2,$3,'project.gate',$4,$5,$6,'executed',$6,now()+interval '1 day',now())`,
        [row[0], row[1], row[2], row[3], digest(row[0]), row[4]],
      );
    await db.query(
      `insert into kxra.project_gate_policies(
        org_id,project_id,gate_code,requirements
       ) values($1,$2,'P002_LISTING','[]'::jsonb)`,
      [otherOrg, otherProject],
    );
    for (const row of [
      [
        ids.p2GateAuthorization,
        org,
        p2,
        ids.p2Evidence,
        ids.localApproval,
        actors.owner,
      ],
      [
        ids.otherGateAuthorization,
        otherOrg,
        otherProject,
        ids.otherEvidence,
        ids.otherApproval,
        otherOwner,
      ],
    ] as const)
      await db.query(
        `insert into kxra.project_gate_authorizations(
          id,org_id,project_id,gate_code,evidence_id,evidence_version,approval_id,authorized_by
         ) values($1,$2,$3,'P002_LISTING',$4,1,$5,$6)`,
        [...row],
      );

    for (const [id, orgId, projectId, approvedBy] of [
      [ids.localInvitation, org, p2, actors.owner],
      [ids.otherInvitation, otherOrg, otherProject, otherOwner],
    ])
      await db.query(
        `insert into kxra.invitations(
          id,org_id,project_id,email_digest,token_digest,role,approved_by,expires_at
         ) values($1,$2,$3,$4,$5,'viewer',$6,now()+interval '1 day')`,
        [
          id,
          orgId,
          projectId,
          digest(`email-${id}`),
          digest(`token-${id}`),
          approvedBy,
        ],
      );

    for (const [id, orgId, userId] of [
      [ids.partnerPairing, org, actors.partner],
      [ids.viewerPairing, org, actors.viewer],
      [ids.revokedPairing, org, actors.revoked],
      [ids.otherPairing, otherOrg, otherOwner],
    ])
      await db.query(
        `insert into kxra.whatsapp_pairings(
          id,org_id,user_id,phone_digest,verified_at
         ) values($1,$2,$3,$4,now())`,
        [id, orgId, userId, digest(`phone-${id}`)],
      );
    await db.query(
      "insert into kxra.inbound_events(id,provider,event_id,payload_hash) values($1,'fixture',$2,$3)",
      [ids.inbound, marker, digest(marker)],
    );
    await db.query(
      "insert into kxra.audit_events(org_id,actor_id,action,metadata) values($1,$2,'at01.marker',$3),($4,$5,'at01.marker',$3)",
      [org, actors.owner, { marker }, otherOrg, otherOwner],
    );

    const expectations: {
      table: string;
      sql: string;
      values: unknown[];
      expected: Expected;
    }[] = [
      {
        table: "organisations",
        sql: "select id::text as key from kxra.organisations where id=any($1::uuid[])",
        values: [[org, otherOrg]],
        expected: {
          owner: [org],
          partner: [org],
          viewer: [org],
          revoked: [org],
          other: [otherOrg],
        },
      },
      {
        table: "members",
        sql: "select id::text as key from kxra.members where id=any($1::uuid[])",
        values: [[...Object.values(actors), otherOwner]],
        expected: {
          owner: Object.values(actors),
          partner: [actors.partner],
          viewer: [actors.viewer],
          revoked: [actors.revoked],
          other: [otherOwner],
        },
      },
      {
        table: "projects",
        sql: "select id::text as key from kxra.projects where id=any($1::uuid[])",
        values: [[p2, p3, otherProject]],
        expected: {
          owner: [p2, p3],
          partner: [p2],
          viewer: [p3],
          revoked: [],
          other: [otherProject],
        },
      },
      {
        table: "project_memberships",
        sql: "select user_id::text as key from kxra.project_memberships where user_id=any($1::uuid[])",
        values: [[actors.partner, actors.viewer, actors.revoked, otherOwner]],
        expected: {
          owner: [actors.partner, actors.viewer, actors.revoked],
          partner: [actors.partner],
          viewer: [actors.viewer],
          revoked: [actors.revoked],
          other: [otherOwner],
        },
      },
      {
        table: "records",
        sql: "select id::text as key from kxra.records where id=any($1::uuid[])",
        values: [
          [
            ids.p2Evidence,
            ids.p2Experiment,
            ids.p2Private,
            ids.p3Evidence,
            ids.p3Experiment,
            ids.p3Private,
            ids.groupRecord,
            ids.otherEvidence,
            ids.otherExperiment,
            ids.otherPrivate,
            ids.otherGroup,
          ],
        ],
        expected: {
          owner: [
            ids.p2Evidence,
            ids.p2Experiment,
            ids.p2Private,
            ids.p3Evidence,
            ids.p3Experiment,
            ids.p3Private,
            ids.groupRecord,
          ],
          partner: [ids.p2Evidence, ids.p2Experiment],
          viewer: [ids.p3Evidence, ids.p3Experiment],
          revoked: [],
          other: [
            ids.otherEvidence,
            ids.otherExperiment,
            ids.otherPrivate,
            ids.otherGroup,
          ],
        },
      },
      {
        table: "record_versions",
        sql: "select record_id::text as key from kxra.record_versions where record_id=any($1::uuid[])",
        values: [
          [
            ids.p2Evidence,
            ids.p2Experiment,
            ids.p2Private,
            ids.p3Evidence,
            ids.p3Experiment,
            ids.p3Private,
            ids.groupRecord,
            ids.otherEvidence,
            ids.otherExperiment,
            ids.otherPrivate,
            ids.otherGroup,
          ],
        ],
        expected: {
          owner: [
            ids.p2Evidence,
            ids.p2Experiment,
            ids.p2Private,
            ids.p3Evidence,
            ids.p3Experiment,
            ids.p3Private,
            ids.groupRecord,
          ],
          partner: [ids.p2Evidence, ids.p2Experiment],
          viewer: [ids.p3Evidence, ids.p3Experiment],
          revoked: [],
          other: [
            ids.otherEvidence,
            ids.otherExperiment,
            ids.otherPrivate,
            ids.otherGroup,
          ],
        },
      },
      {
        table: "files",
        sql: "select id::text as key from kxra.files where id=any($1::uuid[])",
        values: [
          [
            ids.p2SharedFile,
            ids.p2PrivateFile,
            ids.p3SharedFile,
            ids.p3PrivateFile,
            ids.otherSharedFile,
            ids.otherPrivateFile,
          ],
        ],
        expected: {
          owner: [
            ids.p2SharedFile,
            ids.p2PrivateFile,
            ids.p3SharedFile,
            ids.p3PrivateFile,
          ],
          partner: [ids.p2SharedFile],
          viewer: [ids.p3SharedFile],
          revoked: [],
          other: [ids.otherSharedFile, ids.otherPrivateFile],
        },
      },
      {
        table: "approvals",
        sql: "select id::text as key from kxra.approvals where id=any($1::uuid[])",
        values: [[ids.localApproval, ids.otherApproval]],
        expected: {
          owner: [ids.localApproval],
          partner: [],
          viewer: [],
          revoked: [],
          other: [ids.otherApproval],
        },
      },
      {
        table: "audit_events",
        sql: "select org_id::text as key from kxra.audit_events where metadata->>'marker'=$1",
        values: [marker],
        expected: {
          owner: [org],
          partner: [],
          viewer: [],
          revoked: [],
          other: [otherOrg],
        },
      },
      {
        table: "whatsapp_pairings",
        sql: "select id::text as key from kxra.whatsapp_pairings where id=any($1::uuid[])",
        values: [
          [
            ids.partnerPairing,
            ids.viewerPairing,
            ids.revokedPairing,
            ids.otherPairing,
          ],
        ],
        expected: {
          owner: [ids.partnerPairing, ids.viewerPairing, ids.revokedPairing],
          partner: [ids.partnerPairing],
          viewer: [ids.viewerPairing],
          revoked: [ids.revokedPairing],
          other: [ids.otherPairing],
        },
      },
      {
        table: "inbound_events",
        sql: "select id::text as key from kxra.inbound_events where id=$1",
        values: [ids.inbound],
        expected: {
          owner: [],
          partner: [],
          viewer: [],
          revoked: [],
          other: [],
        },
      },
      {
        table: "verifications",
        sql: "select id::text as key from kxra.verifications where id=any($1::uuid[])",
        values: [
          [ids.p2Verification, ids.p3Verification, ids.otherVerification],
        ],
        expected: {
          owner: [ids.p2Verification, ids.p3Verification],
          partner: [ids.p2Verification],
          viewer: [ids.p3Verification],
          revoked: [],
          other: [ids.otherVerification],
        },
      },
      {
        table: "record_links",
        sql: "select id::text as key from kxra.record_links where id=any($1::uuid[])",
        values: [[ids.p2Link, ids.p3Link, ids.otherLink]],
        expected: {
          owner: [ids.p2Link, ids.p3Link],
          partner: [ids.p2Link],
          viewer: [ids.p3Link],
          revoked: [],
          other: [ids.otherLink],
        },
      },
      {
        table: "experiment_results",
        sql: "select id::text as key from kxra.experiment_results where id=any($1::uuid[])",
        values: [[ids.p2Result, ids.p3Result, ids.otherResult]],
        expected: {
          owner: [ids.p2Result, ids.p3Result],
          partner: [ids.p2Result],
          viewer: [ids.p3Result],
          revoked: [],
          other: [ids.otherResult],
        },
      },
      {
        table: "result_evidence",
        sql: "select result_id::text as key from kxra.result_evidence where result_id=any($1::uuid[])",
        values: [[ids.p2Result, ids.p3Result, ids.otherResult]],
        expected: {
          owner: [ids.p2Result, ids.p3Result],
          partner: [ids.p2Result],
          viewer: [ids.p3Result],
          revoked: [],
          other: [ids.otherResult],
        },
      },
      {
        table: "workflow_tasks",
        sql: "select id::text as key from kxra.workflow_tasks where id=any($1::uuid[])",
        values: [[ids.p2Task, ids.p3Task, ids.otherTask]],
        expected: {
          owner: [ids.p2Task, ids.p3Task],
          partner: [ids.p2Task],
          viewer: [],
          revoked: [],
          other: [ids.otherTask],
        },
      },
      {
        table: "workflow_task_versions",
        sql: "select task_id::text as key from kxra.workflow_task_versions where task_id=any($1::uuid[])",
        values: [[ids.p2Task, ids.p3Task, ids.otherTask]],
        expected: {
          owner: [ids.p2Task, ids.p3Task],
          partner: [ids.p2Task],
          viewer: [],
          revoked: [],
          other: [ids.otherTask],
        },
      },
      {
        table: "invitations",
        sql: "select id::text as key from kxra.invitations where id=any($1::uuid[])",
        values: [[ids.localInvitation, ids.otherInvitation]],
        expected: {
          owner: [ids.localInvitation],
          partner: [],
          viewer: [],
          revoked: [],
          other: [ids.otherInvitation],
        },
      },
      {
        table: "project_gate_policies",
        sql: "select project_id::text as key from kxra.project_gate_policies where project_id=any($1::uuid[])",
        values: [[p2, p3, otherProject]],
        expected: {
          owner: [p2, p3],
          partner: [p2],
          viewer: [p3],
          revoked: [],
          other: [otherProject],
        },
      },
      {
        table: "project_gate_authorizations",
        sql: "select id::text as key from kxra.project_gate_authorizations where id=any($1::uuid[])",
        values: [[ids.p2GateAuthorization, ids.otherGateAuthorization]],
        expected: {
          owner: [ids.p2GateAuthorization],
          partner: [ids.p2GateAuthorization],
          viewer: [],
          revoked: [],
          other: [ids.otherGateAuthorization],
        },
      },
    ];
    assert.equal(expectations.length, 20);

    for (const actor of [
      "owner",
      "partner",
      "viewer",
      "revoked",
      "other",
    ] as const) {
      await as(db, actor === "other" ? otherOwner : actors[actor]);
      for (const check of expectations) {
        const actual = (await db.query(check.sql, check.values)).rows
          .map((row) => String(row.key))
          .sort();
        assert.deepEqual(
          actual,
          [...check.expected[actor]].sort(),
          `${actor}:${check.table}`,
        );
      }
    }
  } finally {
    await db.query("rollback");
    db.release();
  }
});
