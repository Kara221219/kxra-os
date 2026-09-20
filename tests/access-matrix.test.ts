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
const actors = {
  owner: "20000000-0000-4000-8000-000000000001",
  partner: "20000000-0000-4000-8000-000000000002",
  viewer: "20000000-0000-4000-8000-000000000003",
  revoked: "20000000-0000-4000-8000-000000000004",
};
const p1 = "30000000-0000-4000-8000-000000000001";
const p2 = "30000000-0000-4000-8000-000000000002";
const p3 = "30000000-0000-4000-8000-000000000003";
const p5 = "30000000-0000-4000-8000-000000000005";

type Actor = keyof typeof actors | "other";
type Expected = Record<Actor, string[]>;

async function as(db: pg.PoolClient, id: string, organisationId = org) {
  await db.query("reset role");
  await db.query("set local role authenticated");
  await db.query(
    "select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true),set_config('request.kxra.org_id',$3,true)",
    [
      id,
      JSON.stringify({
        sub: id,
        aal: "aal2",
        auth_time: Math.floor(Date.now() / 1000),
      }),
      organisationId,
    ],
  );
}

async function addRecord(
  db: pg.PoolClient,
  id: string,
  ownerId: string,
  orgId: string,
  projectId: string | null,
  kind: "knowledge" | "experiment" | "note" | "idea",
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
        "localAgreement",
        "otherAgreement",
        "partnerAcceptance",
        "viewerAcceptance",
        "revokedAcceptance",
        "otherAcceptance",
        "partnerRevocation",
        "viewerRevocation",
        "revokedRevocation",
        "otherRevocation",
        "localOutbox",
        "otherOutbox",
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
        "p2OwnIdea",
        "p2SharedIdea",
        "p3Idea",
        "otherIdea",
        "p2IdeaShare",
        "p3IdeaShare",
        "otherIdeaShare",
        "p2ShareApproval",
        "p3ShareApproval",
        "otherShareApproval",
        "p2WorkspaceEntry",
        "p3WorkspaceEntry",
        "otherWorkspaceEntry",
        "p2Vehicle",
        "p3Vehicle",
        "otherVehicle",
        "p2PropertyAsset",
        "p3PropertyAsset",
        "otherPropertyAsset",
        "p1ClprReview",
        "otherClprReview",
        "p5DigitalOpportunity",
        "otherDigitalOpportunity",
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
      `insert into kxra.profiles(
        user_id,org_id,first_name,last_name,account_state,email_verified_at,
        onboarding_completed_at,mfa_state
       ) values($1,$2,'AT-01','Other owner','ACTIVE',now(),now(),'ENROLLED')`,
      [otherOwner, otherOrg],
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
      "knowledge" | "experiment" | "note" | "idea",
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
      [
        ids.p2OwnIdea,
        actors.partner,
        org,
        p2,
        "idea",
        "project_shared",
        "p2 partner idea",
      ],
      [
        ids.p2SharedIdea,
        actors.owner,
        org,
        p2,
        "idea",
        "project_shared",
        "p2 explicitly shared idea",
      ],
      [
        ids.p3Idea,
        actors.owner,
        org,
        p3,
        "idea",
        "project_shared",
        "p3 explicitly shared idea",
      ],
      [
        ids.otherIdea,
        otherOwner,
        otherOrg,
        otherProject,
        "idea",
        "project_shared",
        "other organisation idea",
      ],
    ];
    for (const row of recordRows) await addRecord(db, ...row);

    for (const row of [
      [ids.p2OwnIdea, org, p2, actors.partner, "PARTNER_PORTAL"],
      [ids.p2SharedIdea, org, p2, actors.owner, "OWNER_PORTAL"],
      [ids.p3Idea, org, p3, actors.owner, "OWNER_PORTAL"],
      [ids.otherIdea, otherOrg, otherProject, otherOwner, "OWNER_PORTAL"],
    ] as const)
      await db.query(
        `insert into kxra.ideas(
          record_id,org_id,project_id,submitted_by,source_type,raw_idea,state
         ) values($1,$2,$3,$4,$5,'AT-01 typed idea','PROMISING')`,
        [...row],
      );

    for (const row of [
      [ids.p2OwnIdea, org, p2, ids.p2Evidence, actors.partner],
      [ids.p2SharedIdea, org, p2, ids.p2Evidence, actors.owner],
      [ids.p3Idea, org, p3, ids.p3Evidence, actors.owner],
      [ids.otherIdea, otherOrg, otherProject, ids.otherEvidence, otherOwner],
    ] as const)
      await db.query(
        `insert into kxra.idea_evidence(
          idea_record_id,idea_version,evidence_id,evidence_version,org_id,project_id,added_by
         ) values($1,1,$4,1,$2,$3,$5)`,
        [...row],
      );

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
         ) values($1,$2,$3,'project.gate',$4,$5,$6,'EXECUTED',$6,now()+interval '1 day',now())`,
        [row[0], row[1], row[2], row[3], digest(row[0]), row[4]],
      );
    for (const row of [
      [
        ids.p2ShareApproval,
        org,
        p2,
        ids.p2SharedIdea,
        actors.partner,
        actors.owner,
      ],
      [ids.p3ShareApproval, org, p3, ids.p3Idea, actors.viewer, actors.owner],
      [
        ids.otherShareApproval,
        otherOrg,
        otherProject,
        ids.otherIdea,
        otherOwner,
        otherOwner,
      ],
    ] as const) {
      const payload = {
        idea_id: row[3],
        idea_version: 1,
        user_id: row[4],
        expected_share_version: 0,
        active: true,
        before: { active: false, share_version: 0 },
        after: { active: true, share_version: 1 },
      };
      await db.query(
        `insert into kxra.approvals(
          id,org_id,project_id,action,payload,payload_hash,requested_by,state,
          approved_by,expires_at,consumed_at
         ) values($1,$2,$3,'idea.share',$4,$5,$6,'EXECUTED',$6,
          now()+interval '1 day',now())`,
        [row[0], row[1], row[2], payload, digest(row[0]), row[5]],
      );
    }
    for (const row of [
      [
        ids.p2IdeaShare,
        org,
        p2,
        ids.p2SharedIdea,
        actors.partner,
        actors.owner,
        ids.p2ShareApproval,
      ],
      [
        ids.p3IdeaShare,
        org,
        p3,
        ids.p3Idea,
        actors.viewer,
        actors.owner,
        ids.p3ShareApproval,
      ],
      [
        ids.otherIdeaShare,
        otherOrg,
        otherProject,
        ids.otherIdea,
        otherOwner,
        otherOwner,
        ids.otherShareApproval,
      ],
    ] as const)
      await db.query(
        `insert into kxra.idea_shares(
          id,org_id,project_id,idea_record_id,user_id,approved_by,approval_id
         ) values($1,$2,$3,$4,$5,$6,$7)`,
        [...row],
      );
    await db.query(
      `insert into kxra.project_gate_policies(
        org_id,project_id,gate_code,requirements
       ) values($1,$2,'P002_LISTING','[]'::jsonb)`,
      [otherOrg, otherProject],
    );
    assert.equal(
      (
        await db.query(
          `select count(*)::int as n from kxra.project_governance_versions
           where project_id=$1 and version=1 and org_id=$2
            and next_action='remain isolated'`,
          [otherProject, otherOrg],
        )
      ).rows[0].n,
      1,
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

    await db.query(
      `insert into kxra.project_workspace_modules(
        org_id,project_id,module_key,label,module_group,source_kind,entry_type,
        position,description,write_policy
       ) values($1,$2,'property-inputs','Property Inputs','SPECIALIST','PROPERTY_ASSETS',null,2,
         'AT-01 other property module','CONTRIBUTOR')`,
      [otherOrg, otherProject],
    );
    for (const row of [
      [ids.p2WorkspaceEntry, org, p2, actors.owner, "p2 workspace"],
      [ids.p3WorkspaceEntry, org, p3, actors.owner, "p3 workspace"],
      [
        ids.otherWorkspaceEntry,
        otherOrg,
        otherProject,
        otherOwner,
        "other workspace",
      ],
    ] as const)
      await db.query(
        `insert into kxra.workspace_entries(
          id,org_id,project_id,module_key,record_type,title,summary,payload,
          classification,visibility,created_by
         ) values($1,$2,$3,'problem','NARRATIVE',$5::text,'AT-01 typed entry',
          jsonb_build_object('statement',$5::text),'USER-SUPPLIED INFORMATION','project_shared',$4)`,
        [...row],
      );
    for (const row of [
      [ids.p2WorkspaceEntry, org, p2, ids.p2Evidence],
      [ids.p3WorkspaceEntry, org, p3, ids.p3Evidence],
      [ids.otherWorkspaceEntry, otherOrg, otherProject, ids.otherEvidence],
    ] as const)
      await db.query(
        `insert into kxra.workspace_entry_evidence(
          entry_id,entry_version,org_id,project_id,evidence_id,evidence_version
         ) values($1,1,$2,$3,$4,1)`,
        [...row],
      );
    await db.query(
      `insert into kxra.vehicle_compatibility(
        id,org_id,project_id,vehicle_family
       ) values
        ($1,$2,$3,'Ford F-150'),
        ($4,$5,$6,'Ford F-150')`,
      [ids.p3Vehicle, org, p3, ids.otherVehicle, otherOrg, otherProject],
    );
    await db.query(
      `insert into kxra.property_assets(
        id,org_id,project_id,module_key,title,asset_kind,origin,created_by
       ) values
        ($1,$2,$3,'property-inputs','AT-01 P003 real input','PROPERTY_INPUT','REAL_INPUT',$4),
        ($5,$6,$7,'property-inputs','AT-01 other real input','PROPERTY_INPUT','REAL_INPUT',$8)`,
      [
        ids.p3PropertyAsset,
        org,
        p3,
        actors.owner,
        ids.otherPropertyAsset,
        otherOrg,
        otherProject,
        otherOwner,
      ],
    );
    const p1Evidence = (
      await db.query(
        "select id,version from kxra.records where source_code='PROJECT-001-BRIEF'",
      )
    ).rows[0];
    await db.query(
      `insert into kxra.clpr_revisit_reviews(
        id,org_id,project_id,recommendation,rationale,
        route_evidence_id,route_evidence_version,
        liquidity_evidence_id,liquidity_evidence_version,
        recovery_evidence_id,recovery_evidence_version,
        buyer_evidence_id,buyer_evidence_version,
        regulatory_evidence_id,regulatory_evidence_version,created_by
       ) values
        ($1,$2,$3,'MONITOR','AT-01 local review',$4,$5,$4,$5,$4,$5,$4,$5,$4,$5,$6),
        ($7,$8,$9,'MONITOR','AT-01 other review',$10,1,$10,1,$10,1,$10,1,$10,1,$11)`,
      [
        ids.p1ClprReview,
        org,
        p1,
        p1Evidence.id,
        p1Evidence.version,
        actors.owner,
        ids.otherClprReview,
        otherOrg,
        otherProject,
        ids.otherEvidence,
        otherOwner,
      ],
    );
    await db.query(
      `insert into kxra.digital_opportunities(
        id,org_id,project_id,title,buyer_problem,created_by
       ) values
        ($1,$2,$3,'AT-01 local opportunity','AT-01 local buyer problem',$4),
        ($5,$6,$7,'AT-01 other opportunity','AT-01 other buyer problem',$8)`,
      [
        ids.p5DigitalOpportunity,
        org,
        p5,
        actors.owner,
        ids.otherDigitalOpportunity,
        otherOrg,
        otherProject,
        otherOwner,
      ],
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

    await db.query(
      `insert into kxra.invitation_project_grants(
        invitation_id,org_id,project_id,role
       ) values($1,$2,$3,'viewer'),($4,$5,$6,'viewer')`,
      [
        ids.localInvitation,
        org,
        p2,
        ids.otherInvitation,
        otherOrg,
        otherProject,
      ],
    );
    await db.query(
      `insert into kxra.onboarding_progress(
        user_id,org_id,current_step,completed_steps,whatsapp_choice,completed_at
       ) values($1,$2,9,array[1,2,3,4,5,6,7,8,9],'SKIP',now())`,
      [otherOwner, otherOrg],
    );
    await db.query(
      "insert into kxra.user_preferences(user_id,org_id) values($1,$2)",
      [otherOwner, otherOrg],
    );
    await db.query(
      `insert into kxra.agreement_documents(
        id,org_id,document_key,version,title,body,status,required
       ) values
        ($1,$2,'required_agreement',9001,'AT-01 local agreement','Synthetic local placeholder','UNAPPROVED_PLACEHOLDER',true),
        ($3,$4,'required_agreement',9001,'AT-01 other agreement','Synthetic other placeholder','UNAPPROVED_PLACEHOLDER',true)`,
      [ids.localAgreement, org, ids.otherAgreement, otherOrg],
    );
    for (const [userId, orgId, agreementId, requestId] of [
      [actors.partner, org, ids.localAgreement, ids.partnerAcceptance],
      [actors.viewer, org, ids.localAgreement, ids.viewerAcceptance],
      [actors.revoked, org, ids.localAgreement, ids.revokedAcceptance],
      [otherOwner, otherOrg, ids.otherAgreement, ids.otherAcceptance],
    ])
      await db.query(
        `insert into kxra.agreement_acceptances(
          user_id,org_id,agreement_id,agreement_version,request_id
         ) values($1,$2,$3,9001,$4)`,
        [userId, orgId, agreementId, requestId],
      );
    for (const [id, orgId, userId, requestedBy] of [
      [ids.partnerRevocation, org, actors.partner, actors.owner],
      [ids.viewerRevocation, org, actors.viewer, actors.owner],
      [ids.revokedRevocation, org, actors.revoked, actors.owner],
      [ids.otherRevocation, otherOrg, otherOwner, otherOwner],
    ])
      await db.query(
        `insert into kxra.session_revocations(
          id,org_id,user_id,requested_by,reason,provider_state
         ) values($1,$2,$3,$4,'AT-01 synthetic revocation','LOCAL_APPLIED')`,
        [id, orgId, userId, requestedBy],
      );
    for (const [id, orgId, invitationId, userId, label] of [
      [ids.localOutbox, org, ids.localInvitation, actors.partner, "local"],
      [ids.otherOutbox, otherOrg, ids.otherInvitation, otherOwner, "other"],
    ])
      await db.query(
        `insert into kxra.transactional_email_outbox(
          id,org_id,invitation_id,user_id,template_key,recipient_digest,
          recipient_hint,payload,operation_key
         ) values($1,$2,$3,$4,'PARTNER_INVITATION',$5,$6,$7,$8)`,
        [
          id,
          orgId,
          invitationId,
          userId,
          digest(`recipient-${id}`),
          `${label[0]}***@fixture.invalid`,
          { marker },
          `at01-email-${id}`,
        ],
      );
    for (const [orgId, userId] of [
      [org, actors.partner],
      [org, actors.viewer],
      [org, actors.revoked],
      [otherOrg, otherOwner],
    ])
      await db.query(
        `insert into kxra.account_security_events(
          org_id,user_id,actor_id,event_type,metadata
         ) values($1,$2,$2,'PROFILE_UPDATED',$3)`,
        [orgId, userId, { marker }],
      );
    await db.query(
      `insert into kxra.request_rate_limits(
        scope,subject_digest,bucket_started_at,request_count
       ) values('at01-matrix',$1,date_trunc('hour',now()),1)`,
      [digest(marker)],
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
          revoked: [],
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
          revoked: [],
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
          revoked: [],
          other: [otherOwner],
        },
      },
      {
        table: "project_governance_versions",
        sql: "select project_id::text as key from kxra.project_governance_versions where project_id=any($1::uuid[])",
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
            ids.p2OwnIdea,
            ids.p2SharedIdea,
            ids.p3Idea,
            ids.otherIdea,
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
            ids.p2OwnIdea,
            ids.p2SharedIdea,
            ids.p3Idea,
          ],
          partner: [
            ids.p2Evidence,
            ids.p2Experiment,
            ids.p2OwnIdea,
            ids.p2SharedIdea,
          ],
          viewer: [ids.p3Evidence, ids.p3Experiment, ids.p3Idea],
          revoked: [],
          other: [
            ids.otherEvidence,
            ids.otherExperiment,
            ids.otherPrivate,
            ids.otherGroup,
            ids.otherIdea,
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
            ids.p2OwnIdea,
            ids.p2SharedIdea,
            ids.p3Idea,
            ids.otherIdea,
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
            ids.p2OwnIdea,
            ids.p2SharedIdea,
            ids.p3Idea,
          ],
          partner: [
            ids.p2Evidence,
            ids.p2Experiment,
            ids.p2OwnIdea,
            ids.p2SharedIdea,
          ],
          viewer: [ids.p3Evidence, ids.p3Experiment, ids.p3Idea],
          revoked: [],
          other: [
            ids.otherEvidence,
            ids.otherExperiment,
            ids.otherPrivate,
            ids.otherGroup,
            ids.otherIdea,
          ],
        },
      },
      {
        table: "ideas",
        sql: "select record_id::text as key from kxra.ideas where record_id=any($1::uuid[])",
        values: [[ids.p2OwnIdea, ids.p2SharedIdea, ids.p3Idea, ids.otherIdea]],
        expected: {
          owner: [ids.p2OwnIdea, ids.p2SharedIdea, ids.p3Idea],
          partner: [ids.p2OwnIdea, ids.p2SharedIdea],
          viewer: [ids.p3Idea],
          revoked: [],
          other: [ids.otherIdea],
        },
      },
      {
        table: "idea_versions",
        sql: "select record_id::text as key from kxra.idea_versions where record_id=any($1::uuid[])",
        values: [[ids.p2OwnIdea, ids.p2SharedIdea, ids.p3Idea, ids.otherIdea]],
        expected: {
          owner: [ids.p2OwnIdea, ids.p2SharedIdea, ids.p3Idea],
          partner: [ids.p2OwnIdea, ids.p2SharedIdea],
          viewer: [ids.p3Idea],
          revoked: [],
          other: [ids.otherIdea],
        },
      },
      {
        table: "idea_shares",
        sql: "select id::text as key from kxra.idea_shares where id=any($1::uuid[])",
        values: [[ids.p2IdeaShare, ids.p3IdeaShare, ids.otherIdeaShare]],
        expected: {
          owner: [ids.p2IdeaShare, ids.p3IdeaShare],
          partner: [ids.p2IdeaShare],
          viewer: [ids.p3IdeaShare],
          revoked: [],
          other: [ids.otherIdeaShare],
        },
      },
      {
        table: "idea_evidence",
        sql: "select idea_record_id::text as key from kxra.idea_evidence where idea_record_id=any($1::uuid[])",
        values: [[ids.p2OwnIdea, ids.p2SharedIdea, ids.p3Idea, ids.otherIdea]],
        expected: {
          owner: [ids.p2OwnIdea, ids.p2SharedIdea, ids.p3Idea],
          partner: [ids.p2OwnIdea, ids.p2SharedIdea],
          viewer: [ids.p3Idea],
          revoked: [],
          other: [ids.otherIdea],
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
        values: [
          [
            ids.localApproval,
            ids.otherApproval,
            ids.p2ShareApproval,
            ids.p3ShareApproval,
            ids.otherShareApproval,
          ],
        ],
        expected: {
          owner: [ids.localApproval, ids.p2ShareApproval, ids.p3ShareApproval],
          partner: [],
          viewer: [],
          revoked: [],
          other: [ids.otherApproval, ids.otherShareApproval],
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
        table: "work_log_entries",
        sql: "select org_id::text as key from kxra.work_log_entries where source_kind='AUDIT_EVENT' and metadata->>'marker'=$1",
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
          revoked: [],
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
        table: "profiles",
        sql: "select user_id::text as key from kxra.profiles where user_id=any($1::uuid[])",
        values: [[...Object.values(actors), otherOwner]],
        expected: {
          owner: Object.values(actors),
          partner: [actors.partner],
          viewer: [actors.viewer],
          revoked: [],
          other: [otherOwner],
        },
      },
      {
        table: "invitation_project_grants",
        sql: "select project_id::text as key from kxra.invitation_project_grants where invitation_id=any($1::uuid[])",
        values: [[ids.localInvitation, ids.otherInvitation]],
        expected: {
          owner: [p2],
          partner: [],
          viewer: [],
          revoked: [],
          other: [otherProject],
        },
      },
      {
        table: "onboarding_progress",
        sql: "select user_id::text as key from kxra.onboarding_progress where user_id=any($1::uuid[])",
        values: [[...Object.values(actors), otherOwner]],
        expected: {
          owner: Object.values(actors),
          partner: [actors.partner],
          viewer: [actors.viewer],
          revoked: [],
          other: [otherOwner],
        },
      },
      {
        table: "user_preferences",
        sql: "select user_id::text as key from kxra.user_preferences where user_id=any($1::uuid[])",
        values: [[...Object.values(actors), otherOwner]],
        expected: {
          owner: Object.values(actors),
          partner: [actors.partner],
          viewer: [actors.viewer],
          revoked: [],
          other: [otherOwner],
        },
      },
      {
        table: "agreement_documents",
        sql: "select id::text as key from kxra.agreement_documents where id=any($1::uuid[])",
        values: [[ids.localAgreement, ids.otherAgreement]],
        expected: {
          owner: [ids.localAgreement],
          partner: [ids.localAgreement],
          viewer: [ids.localAgreement],
          revoked: [],
          other: [ids.otherAgreement],
        },
      },
      {
        table: "agreement_acceptances",
        sql: "select request_id::text as key from kxra.agreement_acceptances where request_id=any($1::uuid[])",
        values: [
          [
            ids.partnerAcceptance,
            ids.viewerAcceptance,
            ids.revokedAcceptance,
            ids.otherAcceptance,
          ],
        ],
        expected: {
          owner: [
            ids.partnerAcceptance,
            ids.viewerAcceptance,
            ids.revokedAcceptance,
          ],
          partner: [ids.partnerAcceptance],
          viewer: [ids.viewerAcceptance],
          revoked: [],
          other: [ids.otherAcceptance],
        },
      },
      {
        table: "session_revocations",
        sql: "select id::text as key from kxra.session_revocations where id=any($1::uuid[])",
        values: [
          [
            ids.partnerRevocation,
            ids.viewerRevocation,
            ids.revokedRevocation,
            ids.otherRevocation,
          ],
        ],
        expected: {
          owner: [
            ids.partnerRevocation,
            ids.viewerRevocation,
            ids.revokedRevocation,
          ],
          partner: [ids.partnerRevocation],
          viewer: [ids.viewerRevocation],
          revoked: [],
          other: [ids.otherRevocation],
        },
      },
      {
        table: "transactional_email_outbox",
        sql: "select id::text as key from kxra.transactional_email_outbox where id=any($1::uuid[])",
        values: [[ids.localOutbox, ids.otherOutbox]],
        expected: {
          owner: [ids.localOutbox],
          partner: [],
          viewer: [],
          revoked: [],
          other: [ids.otherOutbox],
        },
      },
      {
        table: "account_security_events",
        sql: "select user_id::text as key from kxra.account_security_events where metadata->>'marker'=$1",
        values: [marker],
        expected: {
          owner: [actors.partner, actors.viewer, actors.revoked],
          partner: [actors.partner],
          viewer: [actors.viewer],
          revoked: [],
          other: [otherOwner],
        },
      },
      {
        table: "request_rate_limits",
        sql: "select subject_digest as key from kxra.request_rate_limits where subject_digest=$1",
        values: [digest(marker)],
        expected: {
          owner: [],
          partner: [],
          viewer: [],
          revoked: [],
          other: [],
        },
      },
      {
        table: "project_workspace_modules",
        sql: `select project_id::text as key from kxra.project_workspace_modules
              where module_key='problem' and project_id=any($1::uuid[])`,
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
        table: "workspace_entries",
        sql: "select id::text as key from kxra.workspace_entries where id=any($1::uuid[])",
        values: [
          [ids.p2WorkspaceEntry, ids.p3WorkspaceEntry, ids.otherWorkspaceEntry],
        ],
        expected: {
          owner: [ids.p2WorkspaceEntry, ids.p3WorkspaceEntry],
          partner: [ids.p2WorkspaceEntry],
          viewer: [ids.p3WorkspaceEntry],
          revoked: [],
          other: [ids.otherWorkspaceEntry],
        },
      },
      {
        table: "workspace_entry_versions",
        sql: "select entry_id::text as key from kxra.workspace_entry_versions where entry_id=any($1::uuid[])",
        values: [
          [ids.p2WorkspaceEntry, ids.p3WorkspaceEntry, ids.otherWorkspaceEntry],
        ],
        expected: {
          owner: [ids.p2WorkspaceEntry, ids.p3WorkspaceEntry],
          partner: [ids.p2WorkspaceEntry],
          viewer: [ids.p3WorkspaceEntry],
          revoked: [],
          other: [ids.otherWorkspaceEntry],
        },
      },
      {
        table: "workspace_entry_evidence",
        sql: "select entry_id::text as key from kxra.workspace_entry_evidence where entry_id=any($1::uuid[])",
        values: [
          [ids.p2WorkspaceEntry, ids.p3WorkspaceEntry, ids.otherWorkspaceEntry],
        ],
        expected: {
          owner: [ids.p2WorkspaceEntry, ids.p3WorkspaceEntry],
          partner: [ids.p2WorkspaceEntry],
          viewer: [ids.p3WorkspaceEntry],
          revoked: [],
          other: [ids.otherWorkspaceEntry],
        },
      },
      {
        table: "vehicle_compatibility",
        sql: "select id::text as key from kxra.vehicle_compatibility where id=any($1::uuid[])",
        values: [
          [
            "62000000-0000-4000-8000-000000000001",
            ids.p3Vehicle,
            ids.otherVehicle,
          ],
        ],
        expected: {
          owner: ["62000000-0000-4000-8000-000000000001", ids.p3Vehicle],
          partner: ["62000000-0000-4000-8000-000000000001"],
          viewer: [ids.p3Vehicle],
          revoked: [],
          other: [ids.otherVehicle],
        },
      },
      {
        table: "property_assets",
        sql: "select id::text as key from kxra.property_assets where id=any($1::uuid[])",
        values: [[ids.p3PropertyAsset, ids.otherPropertyAsset]],
        expected: {
          owner: [ids.p3PropertyAsset],
          partner: [],
          viewer: [ids.p3PropertyAsset],
          revoked: [],
          other: [ids.otherPropertyAsset],
        },
      },
      {
        table: "clpr_revisit_reviews",
        sql: "select id::text as key from kxra.clpr_revisit_reviews where id=any($1::uuid[])",
        values: [[ids.p1ClprReview, ids.otherClprReview]],
        expected: {
          owner: [ids.p1ClprReview],
          partner: [],
          viewer: [],
          revoked: [],
          other: [ids.otherClprReview],
        },
      },
      {
        table: "digital_opportunities",
        sql: "select id::text as key from kxra.digital_opportunities where id=any($1::uuid[])",
        values: [[ids.p5DigitalOpportunity, ids.otherDigitalOpportunity]],
        expected: {
          owner: [ids.p5DigitalOpportunity],
          partner: [],
          viewer: [],
          revoked: [],
          other: [ids.otherDigitalOpportunity],
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
    const tableNames = (
      await db.query(
        "select tablename from pg_tables where schemaname='kxra' order by tablename",
      )
    ).rows.map((row) => String(row.tablename));
    const sliceOneTables = [
      "account_identities",
      "active_context_events",
      "billing_customers",
      "billing_events",
      "billing_subscription_items",
      "billing_subscriptions",
      "capability_grants",
      "commercial_offers",
      "custom_project_change_requests",
      "custom_project_milestone_acceptances",
      "custom_project_payments",
      "custom_project_requests",
      "custom_project_triage",
      "entitlement_effective_periods",
      "entitlement_grants",
      "file_delivery_events",
      "file_extractions",
      "file_processing_jobs",
      "file_scan_runs",
      "file_state_events",
      "file_versions",
      "knowledge_chunks",
      "knowledge_query_runs",
      "legal_acceptances",
      "legal_document_requirements",
      "legal_documents",
      "legal_presentations",
      "legal_reacknowledgements",
      "organisation_memberships",
      "object_reconciliation_items",
      "object_reconciliation_runs",
      "plan_features",
      "plan_versions",
      "plans",
      "price_references",
      "project_proposal_acceptances",
      "project_proposals",
      "release_manifests",
      "tax_contexts",
      "tool_catalogue",
      "tool_versions",
      "usage_adjustments",
      "usage_aggregates",
      "usage_events",
      "usage_reservations",
    ];
    assert.deepEqual(
      [...expectations.map((entry) => entry.table), ...sliceOneTables].sort(),
      tableNames,
    );

    for (const actor of [
      "owner",
      "partner",
      "viewer",
      "revoked",
      "other",
    ] as const) {
      await as(
        db,
        actor === "other" ? otherOwner : actors[actor],
        actor === "other" ? otherOrg : org,
      );
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
