import { test, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import pg from "pg";
import { runtimeFile, testOrigin as base } from "./support/runtime";
import {
  knowledgeFixture,
  knowledgeLogin,
  knowledgeOk as ok,
  knowledgeRequest as req,
} from "./support/team-knowledge";
const cfg = JSON.parse(fs.readFileSync(runtimeFile("database.json"), "utf8")),
  admin = new pg.Pool({ ...cfg, user: os.userInfo().username }),
  app = new pg.Pool(cfg);
const owner = "20000000-0000-4000-8000-000000000001",
  partner = "20000000-0000-4000-8000-000000000002",
  org = "10000000-0000-4000-8000-000000000001";
after(async () => {
  await admin.end();
  await app.end();
});
async function as(
  actor: string,
  sql: string,
  values: unknown[] = [],
  tenant = org,
  pool = app,
  executionMode = "fixture",
) {
  const db = await pool.connect();
  try {
    await db.query("begin");
    await db.query("set local role authenticated");
    await db.query(
      "select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true),set_config('request.kxra.org_id',$3,true)",
      [
        actor,
        JSON.stringify({
          sub: actor,
          aal: "aal2",
          auth_time: Math.floor(Date.now() / 1000),
        }),
        tenant,
      ],
    );
    await db.query("select set_config('request.kxra.execution_mode',$1,true)", [
      executionMode,
    ]);
    const rows = (await db.query(sql, values)).rows;
    await db.query("commit");
    return rows;
  } catch (e) {
    await db.query("rollback");
    throw e;
  } finally {
    db.release();
  }
}
const uuid = () => crypto.randomUUID();
test("scoped CRM conversion requires exact review and produces two durable records exactly once", async () => {
  const f = await knowledgeFixture(false),
    lead = {
      request_id: uuid(),
      title: "Synthetic prospect",
      body: "Private room qualification",
      next_step: "Confirm requirements",
    };
  await ok(`/${f.room}/lead`, f.cookie, lead);
  await ok(`/${f.room}/lead`, f.cookie, lead);
  const proposal = {
    request_id: uuid(),
    source_id: lead.request_id,
    source_version: 1,
    account_name: "Synthetic account",
    opportunity_name: "Scoped opportunity",
    next_step: "Prepare local handover",
  };
  await ok(`/${f.room}/conversion`, f.cookie, proposal);
  await ok(`/${f.room}/conversion`, f.cookie, proposal);
  assert.equal(
    (
      await req(`/${f.room}/conversion`, f.cookie, {
        ...proposal,
        account_name: "Changed",
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await req(`/${f.room}/conversion-execute`, f.cookie, {
        action_id: proposal.request_id,
        version: 1,
      })
    ).status,
    409,
  );
  const peer = await knowledgeLogin("owner");
  assert.equal((await req(`/${f.room}/workflow-records`, peer)).status, 404);
  assert.equal((await req(`/${f.room}/workflow-actions`)).status, 401);
  assert.equal(
    (
      await as(
        owner,
        "select id from kxra.team_workflow_records where room_id=$1",
        [f.room],
      )
    ).length,
    0,
  );
  assert.equal(
    (
      await as(owner, "select id from kxra.team_workflow_actions where id=$1", [
        proposal.request_id,
      ])
    ).length,
    0,
  );
  await assert.rejects(
    as(owner, "select kxra.team_crm_execute($1,$2,2)", [
      f.room,
      proposal.request_id,
    ]),
    { code: "42501" },
  );
  await ok(`/${f.room}/conversion-review`, f.cookie, {
    action_id: proposal.request_id,
    version: 1,
    decision: "APPROVED",
  });
  const results = await Promise.all(
    [1, 2].map(() =>
      ok(`/${f.room}/conversion-execute`, f.cookie, {
        action_id: proposal.request_id,
        version: 2,
      }),
    ),
  );
  assert.equal(results[0].account_id, results[1].account_id);
  assert.equal(results[0].opportunity_id, results[1].opportunity_id);
  assert.equal(results.filter((r) => r.replayed).length, 1);
  const records = (await ok(`/${f.room}/workflow-records`, f.cookie)).records;
  assert.equal(records.length, 3);
  assert.equal(
    records.find((r: { id: string }) => r.id === lead.request_id).state,
    "CONVERTED",
  );
  const action = (await ok(`/${f.room}/workflow-actions`, f.cookie)).actions[0];
  assert.equal(action.state, "EXECUTED");
  assert.equal(action.account_id, results[0].account_id);
  assert.ok(!("source_sha256" in action));
  await assert.rejects(
    as(
      partner,
      "update kxra.team_workflow_records set title='bypass' where id=$1",
      [lead.request_id],
    ),
    { code: "42501" },
  );
  assert.equal(
    (
      await req(`/${f.room}/lead`, f.cookie, {
        ...lead,
        version: 2,
        title: "Rewrite converted lead",
      })
    ).status,
    409,
  );
  for (const extra of [
    { role: "owner" },
    { created_by: owner },
    { org_id: org },
  ])
    assert.equal(
      (
        await req(`/${f.room}/conversion`, f.cookie, {
          ...proposal,
          request_id: uuid(),
          ...extra,
        })
      ).status,
      400,
    );
});
test("source changes, stale review versions and private membership withdrawal prevent conversion", async () => {
  const f = await knowledgeFixture(false),
    id = uuid(),
    a = uuid();
  await ok(`/${f.room}/lead`, f.cookie, {
    request_id: id,
    title: "Mutable lead",
    next_step: "Review",
  });
  await ok(`/${f.room}/conversion`, f.cookie, {
    request_id: a,
    source_id: id,
    source_version: 1,
    account_name: "Exact account",
    opportunity_name: "Exact opportunity",
    next_step: "Handover",
  });
  await ok(`/${f.room}/conversion-review`, f.cookie, {
    action_id: a,
    version: 1,
    decision: "APPROVED",
  });
  await ok(`/${f.room}/lead`, f.cookie, {
    request_id: id,
    version: 1,
    title: "Changed lead",
    next_step: "Re-review",
  });
  assert.equal(
    (
      await req(`/${f.room}/conversion-execute`, f.cookie, {
        action_id: a,
        version: 2,
      })
    ).status,
    409,
  );
  assert.equal(
    (await ok(`/${f.room}/workflow-records`, f.cookie)).records.length,
    1,
  );
  await ok(`/${f.room}/conversion-review`, f.cookie, {
    action_id: a,
    version: 2,
    decision: "CANCELLED",
  });
  assert.equal(
    (
      await req(`/${f.room}/conversion-review`, f.cookie, {
        action_id: a,
        version: 1,
        decision: "APPROVED",
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await as(
        partner,
        "select id from kxra.team_workflow_records where id=$1",
        [id],
        uuid(),
      )
    ).length,
    0,
  );
  const db = await admin.connect();
  try {
    await db.query("begin");
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [
      partner,
    ]);
    await db.query(
      "update kxra.team_room_members set active=false where room_id=$1 and account_id=$2",
      [f.room, partner],
    );
    await db.query("commit");
  } finally {
    db.release();
  }
  assert.equal(
    (await req(`/${f.room}/workflow-records`, f.cookie)).status,
    404,
  );
  await assert.rejects(
    as(partner, "select kxra.team_crm_execute($1,$2,2)", [f.room, a]),
    { code: "42501" },
  );
});
async function selectTenant(cookie: string, target: string) {
  const response = await fetch(base + "/api/context", {
    method: "POST",
    headers: { origin: base, cookie, "content-type": "application/json" },
    body: JSON.stringify({ organisation_id: target }),
  });
  assert.equal(response.status, 200, await response.clone().text());
  const jar = new Map(
    cookie.split("; ").map((v) => {
      const n = v.indexOf("=");
      return [v.slice(0, n), v.slice(n + 1)];
    }),
  );
  for (const raw of response.headers.getSetCookie()) {
    const p = raw.split(";", 1)[0],
      n = p.indexOf("=");
    jar.set(p.slice(0, n), p.slice(n + 1));
  }
  return [...jar].map(([k, v]) => k + "=" + v).join("; ");
}
test("approved five-person pilot enforces real held seats and fixture billing cancellation/reconciliation", async (t) => {
  const fresh = await knowledgeLogin("owner"),
    tenant = uuid();
  await admin.query(
    "insert into kxra.organisations(id,name,slug) values($1,'Synthetic pilot tenant',$2)",
    [tenant, "pilot-" + uuid()],
  );
  const membership = (
    await admin.query(
      "insert into kxra.organisation_memberships(org_id,account_id,security_role,relationship_type,state,display_name,grant_source) values($1,$2,'ORG_ADMIN','CUSTOMER','ACTIVE','Pilot owner','AT_PILOT') returning id",
      [tenant, owner],
    )
  ).rows[0].id;
  t.after(() =>
    admin.query(
      "update kxra.organisation_memberships set state='REVOKED',revoked_at=now() where id=$1",
      [membership],
    ),
  );
  const cookie = await selectTenant(fresh, tenant),
    project = uuid();
  await admin.query(
    "insert into kxra.projects(id,org_id,code,name,stage,status,next_action) values($1,$2,'PILOT','Pilot fixture','TEST','ACTIVE','Review')",
    [project, tenant],
  );
  const status = () => ok("/pilot", cookie),
    event = async (action: string) => {
      const s = await status();
      return ok("/pilot/events", cookie, {
        request_id: uuid(),
        version: s.subscription?.version ?? 0,
        action,
      });
    };
  let s = await status();
  assert.equal(s.assigned, false);
  assert.equal(s.offer.monthly_amount_minor, 4900);
  assert.equal(s.offer.setup_amount_minor, 19900);
  assert.equal(s.offer.tax_behavior, "UNSPECIFIED");
  assert.equal(s.offer.offer_key, "WORKSPACE_PILOT_V1");
  assert.equal(s.offer.version, 1);
  assert.equal(s.proposed_capacity.rooms.approved, false);
  assert.equal(s.proposed_capacity.monthly_drafts.enforced, false);
  const request = { request_id: uuid(), version: 0, action: "ACTIVATE" };
  await ok("/pilot/events", cookie, request);
  await ok("/pilot/events", cookie, request);
  s = await status();
  assert.equal(s.subscription.version, 1);
  assert.equal(s.offer.live_charges, false);
  await assert.rejects(
    as(
      owner,
      "select kxra.workspace_pilot_event($1,1,'PAUSE')",
      [uuid()],
      tenant,
      app,
      "hosted",
    ),
    { code: "42501" },
  );
  assert.equal(
    (
      await req("/pilot/events", cookie, {
        request_id: uuid(),
        version: 1,
        action: "PAUSE",
        execution_mode: "fixture",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await req("/pilot/events", cookie, {
        request_id: uuid(),
        version: 0,
        action: "PAUSE",
      })
    ).status,
    409,
  );
  await assert.rejects(
    admin.query(
      "update kxra.workspace_pilots set offer_version=2 where org_id=$1",
      [tenant],
    ),
    /immutable/,
  );
  await assert.rejects(
    admin.query(
      "update kxra.workspace_pilot_events set action='ACTIVATE' where id=$1",
      [request.request_id],
    ),
    /immutable/,
  );

  assert.equal(s.seats_reserved, 1);
  assert.equal(
    (await req("/pilot/events", cookie, { ...request, seats: 9 })).status,
    400,
  );
  assert.equal(
    (await req("/pilot/events", cookie, { ...request, action: "CANCEL_NOW" }))
      .status,
    409,
  );
  // Actual invitation functions reserve unique emails; no delivery worker/send is started.
  const invites = [];
  for (let n = 0; n < 3; n++) {
    const rows = await as(
      owner,
      "select * from kxra.create_invitation($1,$2,'contributor',$3,now()+interval '1 day')",
      [
        project,
        `pilot-${n}@fixture.invalid`,
        crypto.randomBytes(32).toString("hex"),
      ],
      tenant,
    );
    invites.push(rows[0].id);
  }
  assert.equal(
    (await status()).seats_reserved,
    4,
    "three current-state invitations plus owner",
  );
  const race = await Promise.allSettled(
    [0, 1].map((n) =>
      as(
        owner,
        "select * from kxra.create_invitation($1,$2,'contributor',$3,now()+interval '1 day')",
        [
          project,
          `pilot-race-${n}@fixture.invalid`,
          crypto.randomBytes(32).toString("hex"),
        ],
        tenant,
      ),
    ),
  );
  assert.equal(race.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(race.filter((r) => r.status === "rejected").length, 1);
  assert.equal((await status()).seats_reserved, 5);
  await assert.rejects(
    as(
      owner,
      "select * from kxra.create_invitation($1,'sixth@fixture.invalid','contributor',$2,now()+interval '1 day')",
      [project, crypto.randomBytes(32).toString("hex")],
      tenant,
    ),
    /seat admission/,
  );
  await as(owner, "select kxra.revoke_invitation($1)", [invites[0]], tenant);
  assert.equal((await status()).seats_reserved, 4);
  // Redeeming a held email seat becomes a real membership without a sixth seat.
  const redeemed = uuid();
  await admin.query(
    "insert into kxra.account_identities(account_id,auth_provider,auth_subject,email_digest,state,email_verified_at) values($1::uuid,'FIXTURE',($1::uuid)::text,encode(sha256(convert_to('pilot-1@fixture.invalid','UTF8')),'hex'),'ACTIVE',now())",
    [redeemed],
  );
  await admin.query(
    "insert into kxra.organisation_memberships(org_id,account_id,security_role,relationship_type,state,display_name,grant_source) values($1,$2,'ORG_MEMBER','CUSTOMER','ACTIVE','Synthetic redeemed seat','AT_PILOT')",
    [tenant, redeemed],
  );
  assert.equal((await status()).seats_reserved, 4);

  const room = (
    await ok("", cookie, {
      project_id: project,
      name: "Pilot room",
      access: "PRIVATE",
      guidelines: "",
    })
  ).id;
  await ok(`/${room}/lead`, cookie, {
    request_id: uuid(),
    title: "Before cancellation",
    next_step: "Review",
  });
  const connection = await ok("/connections", cookie, {
    name: "Pilot fixture provider",
    provider: "FIXTURE",
    model: "fixture-draft",
    key: "local-fixture",
  });
  const agent = await ok(`/${room}/agents`, cookie, {
    connection_id: connection.id,
    name: "Pilot agent",
    instructions: "Prepare a local draft only.",
  });
  const message = await ok(`/${room}/messages`, cookie, {
    request_id: uuid(),
    body: "Synthetic pilot task",
  });
  const queued = await ok(`/${room}/jobs`, cookie, {
    request_id: uuid(),
    agent_id: agent.id,
    message_id: message.id,
    context: "MESSAGE_ONLY",
    due_at: new Date(Date.now() + 3600000).toISOString(),
  });
  const scheduleId = uuid();
  await ok(`/${room}/schedules`, cookie, {
    request_id: scheduleId,
    agent_id: agent.id,
    message_id: message.id,
    context: "MESSAGE_ONLY",
    name: "Pilot schedule",
    timezone: "UTC",
    wall_time: "00:00",
    starts_on: new Date().toISOString().slice(0, 10),
    expires_at: new Date(Date.now() + 86400000).toISOString(),
    max_occurrences: 1,
  });
  await ok(`/${room}/schedules/review`, cookie, {
    schedule_id: scheduleId,
    version: 1,
    action: "ACTIVATE",
  });
  s = await event("CANCEL_AT_END");
  assert.equal(s.subscription.cancel_at_period_end, true);
  assert.equal(s.entitled, true);
  await assert.rejects(
    as(
      owner,
      "select kxra.workspace_pilot_event($1,$2,'RENEW')",
      [uuid(), s.subscription.version],
      tenant,
    ),
  );
  s = await event("CANCEL_NOW");
  assert.equal(s.entitled, false);
  assert.equal(
    (
      await req("", cookie, {
        project_id: project,
        name: "Blocked after cancellation",
        access: "PRIVATE",
        guidelines: "",
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await req(`/${room}/messages`, cookie, {
        request_id: uuid(),
        body: "Blocked after cancellation",
      })
    ).status,
    409,
  );
  const blockedMember = uuid();
  await admin.query(
    "insert into kxra.account_identities(account_id,auth_provider,auth_subject,email_digest,state,email_verified_at) values($1::uuid,'FIXTURE',($1::uuid)::text,encode(sha256(convert_to('pilot-2@fixture.invalid','UTF8')),'hex'),'ACTIVE',now())",
    [blockedMember],
  );
  await assert.rejects(
    admin.query(
      "insert into kxra.organisation_memberships(org_id,account_id,security_role,relationship_type,state,display_name,grant_source) values($1,$2,'ORG_MEMBER','CUSTOMER','ACTIVE','Blocked held-seat acceptance','AT_PILOT')",
      [tenant, blockedMember],
    ),
    /seat admission/,
  );

  await ok("/jobs/drain", cookie, { request_id: uuid(), room_id: room });
  assert.equal(
    (await ok(`/${room}/jobs`, cookie)).jobs.find(
      (j: { id: string }) => j.id === queued.id,
    ).state,
    "CANCELLED",
  );
  assert.equal(
    (await ok(`/${room}/schedules`, cookie)).schedules[0].state,
    "PAUSED",
  );
  assert.equal(
    (
      await req(`/${room}/jobs`, cookie, {
        request_id: uuid(),
        agent_id: agent.id,
        message_id: message.id,
        context: "MESSAGE_ONLY",
      })
    ).status,
    409,
  );

  assert.equal(
    (
      await req(`/${room}/lead`, cookie, {
        request_id: uuid(),
        title: "After cancellation",
        next_step: "Must deny",
      })
    ).status,
    409,
  );
  assert.equal(
    (await ok(`/${room}/workflow-records`, cookie)).records.length,
    1,
    "history remains readable",
  );
  assert.equal((await event("RECONCILE")).subscription.state, "CANCELLED");
  await event("ACTIVATE");
  await event("PAST_DUE");
  assert.equal((await status()).entitled, false);
  await event("RECOVER");
  assert.equal((await status()).entitled, true);
  await event("PAUSE");
  await event("RESUME");
  await event("RENEW");
  const at = (
    await as(
      owner,
      "select kxra_private.pilot_access_at('ACTIVE',now()+interval '1 month',now()+interval '2 months') allowed",
      [],
      tenant,
    )
  )[0];
  assert.equal(at.allowed, false);
  await assert.rejects(
    as(
      owner,
      "update kxra.workspace_pilots set state='ACTIVE' where org_id=$1",
      [tenant],
      tenant,
    ),
    { code: "42501" },
  );
  assert.equal(
    (
      await as(
        partner,
        "select org_id from kxra.workspace_pilots where org_id=$1",
        [tenant],
      )
    ).length,
    0,
  );
  await assert.rejects(
    as(
      owner,
      "select kxra.workspace_pilot_event($1,0,'ACTIVATE')",
      [uuid()],
      tenant,
      admin,
    ),
    { code: "42501" },
  );
  await event("CANCEL_NOW");
  const receipts = (
    await admin.query(
      "select action,receipt from kxra.workspace_pilot_events where org_id=$1 order by created_at,id",
      [tenant],
    )
  ).rows;
  assert.ok(
    receipts.every(
      (e) => e.receipt.subscription && e.receipt.offer.live_charges === false,
    ),
  );
  assert.equal(
    receipts.find((e) => e.action === "PAST_DUE").receipt.subscription.state,
    "PAST_DUE",
  );
  await admin.query(
    "update kxra.organisation_memberships set state='REVOKED',revoked_at=now() where id=$1",
    [membership],
  );
});

test("one verified actor cannot read or convert CRM records across two real tenant contexts", async (t) => {
  const f = await knowledgeFixture(false, "owner"),
    tenantB = uuid(),
    projectB = uuid();
  await admin.query(
    "insert into kxra.organisations(id,name,slug) values($1,'Second CRM fixture tenant',$2)",
    [tenantB, "crm-" + uuid()],
  );
  await admin.query(
    "insert into kxra.organisation_memberships(org_id,account_id,security_role,relationship_type,state,display_name,grant_source) values($1,$2,'ORG_ADMIN','CUSTOMER','ACTIVE','Synthetic CRM owner','AT_PILOT')",
    [tenantB, owner],
  );
  await admin.query(
    "insert into kxra.projects(id,org_id,code,name,stage,status,next_action) values($1,$2,'CRM','Second CRM fixture','TEST','ACTIVE','Review')",
    [projectB, tenantB],
  );
  t.after(() =>
    admin.query(
      "update kxra.organisation_memberships set state='REVOKED',revoked_at=now() where org_id=$1 and account_id=$2",
      [tenantB, owner],
    ),
  );
  const cookieA = await selectTenant(f.cookie, org);
  const cookieB = await selectTenant(await knowledgeLogin("owner"), tenantB);
  const roomB = (
    await ok("", cookieB, {
      project_id: projectB,
      name: "Second tenant private CRM",
      guidelines: "Synthetic isolation only",
      access: "PRIVATE",
    })
  ).id;
  const leadA = uuid(),
    leadB = uuid(),
    actionA = uuid();
  await ok(`/${f.room}/lead`, cookieA, {
    request_id: leadA,
    title: "Only tenant A",
    next_step: "Review A",
  });
  await ok(`/${roomB}/lead`, cookieB, {
    request_id: leadB,
    title: "Only tenant B",
    next_step: "Review B",
  });
  await ok(`/${f.room}/conversion`, cookieA, {
    request_id: actionA,
    source_id: leadA,
    source_version: 1,
    account_name: "A account",
    opportunity_name: "A opportunity",
    next_step: "A handover",
  });
  assert.equal((await req(`/${f.room}/workflow-records`, cookieB)).status, 404);
  assert.equal((await req(`/${roomB}/workflow-records`, cookieA)).status, 404);
  assert.equal(
    (
      await req(`/${f.room}/conversion-review`, cookieB, {
        action_id: actionA,
        version: 1,
        decision: "APPROVED",
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await req(`/${roomB}/conversion`, cookieB, {
        request_id: uuid(),
        source_id: leadA,
        source_version: 1,
        account_name: "Cross tenant",
        opportunity_name: "Denied",
        next_step: "Denied",
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await as(
        owner,
        "select id from kxra.team_workflow_records where id=$1",
        [leadA],
        tenantB,
      )
    ).length,
    0,
  );
  assert.equal(
    (
      await as(
        owner,
        "select id from kxra.team_workflow_records where id=$1",
        [leadB],
        org,
      )
    ).length,
    0,
  );
  await assert.rejects(
    as(
      owner,
      "select kxra.team_crm_execute($1,$2,2)",
      [f.room, actionA],
      tenantB,
    ),
    { code: "42501" },
  );
  assert.equal(
    (await ok(`/${roomB}/workflow-records`, cookieB)).records.length,
    1,
  );
  assert.equal(
    (await ok(`/${f.room}/workflow-actions`, cookieA)).actions[0].state,
    "PROPOSED",
  );
});
