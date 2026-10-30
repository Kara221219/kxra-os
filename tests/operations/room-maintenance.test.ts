import { test, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import pg from "pg";
import { runtimeFile, testOrigin } from "../support/runtime";
import {
  knowledgeFixture,
  knowledgeLogin,
  knowledgeOk as ok,
} from "../support/team-knowledge";
import { ensureRoomOperationsSchema } from "../support/room-operations-schema";
import { localModeConfiguration } from "../../packages/authz/local-guard";
assert.ok(
  localModeConfiguration(process.env) && !process.env.VERCEL_ENV,
  "Maintenance tests require the guarded generated fixture runtime",
);
const cfg = JSON.parse(fs.readFileSync(runtimeFile("database.json"), "utf8"));
assert.ok(
  typeof cfg.host === "string" && cfg.host.startsWith("/") && !cfg.password,
  "Maintenance tests require a private Unix socket without provider credentials",
);
const app = new pg.Pool(cfg),
  admin = new pg.Pool({ ...cfg, user: os.userInfo().username });
after(async () => {
  await app.end();
  await admin.end();
});
const owner = "20000000-0000-4000-8000-000000000001",
  partner = "20000000-0000-4000-8000-000000000002",
  org = "10000000-0000-4000-8000-000000000001";
async function as(
  actor: string,
  sql: string,
  values: unknown[] = [],
  tenant = org,
  grant = "",
  mode = "fixture",
) {
  const db = await app.connect();
  try {
    await db.query("begin");
    await db.query("set local role authenticated");
    await db.query(
      "select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true),set_config('request.kxra.org_id',$3,true),set_config('request.kxra.execution_mode',$5,true),set_config('request.kxra.hosted_room_jobs','on',true),set_config('request.kxra.team_grant',$4,true)",
      [
        actor,
        JSON.stringify({
          sub: actor,
          aal: "aal2",
          auth_time: Math.floor(Date.now() / 1000),
        }),
        tenant,
        grant,
        mode,
      ],
    );
    const r = await db.query(sql, values);
    await db.query("commit");
    return r.rows;
  } catch (e) {
    await db.query("rollback");
    throw e;
  } finally {
    db.release();
  }
}
async function raw(sql: string, values: unknown[] = []) {
  const db = await app.connect();
  try {
    await db.query("begin");
    await db.query("set local statement_timeout='5s'");
    await db.query(
      "select set_config('request.kxra.execution_mode','fixture',true)",
    );
    const r = await db.query(sql, values);
    await db.query("commit");
    return r.rows;
  } catch (e) {
    await db.query("rollback");
    throw e;
  } finally {
    db.release();
  }
}
async function adminWork(sql: string, values: unknown[] = []) {
  const db = await admin.connect();
  try {
    await db.query("begin");
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [
      owner,
    ]);
    const result = await db.query(sql, values);
    await db.query("commit");
    return result;
  } catch (error) {
    await db.query("rollback");
    throw error;
  } finally {
    db.release();
  }
}
const maintain = (id = crypto.randomUUID()) =>
  raw("select kxra_room_worker.maintain($1) result", [id]).then(
    (r) => r[0].result,
  );
async function job(
  f: Awaited<ReturnType<typeof knowledgeFixture>>,
  actor = owner,
) {
  const j = await ok(`/${f.room}/jobs`, f.cookie, {
    request_id: crypto.randomUUID(),
    agent_id: f.agent,
    message_id: f.message,
    context: "THREAD",
    chunk_ids: [],
    use_memory: false,
  });
  const g = (
    await as(
      actor,
      "select kxra.team_execution_authorize($1,now()+interval '1 hour') id",
      [j.id],
    )
  )[0].id;
  return { j, g };
}
async function row(id: string) {
  return (await admin.query("select * from kxra.team_jobs where id=$1", [id]))
    .rows[0];
}
test("maintenance proposal installs into a fresh local fixture with no new roles or triggers", async () => {
  const before = (
    await admin.query(
      "select (select count(*) from pg_roles) roles,(select count(*) from pg_trigger where not tgisinternal) triggers",
    )
  ).rows[0];
  await ensureRoomOperationsSchema(admin, cfg);
  const after = (
    await admin.query(
      "select (select count(*) from pg_roles) roles,(select count(*) from pg_trigger where not tgisinternal) triggers",
    )
  ).rows[0];
  assert.deepEqual(after, before);
  await assert.rejects(
    as(owner, "select kxra_room_worker.maintain($1)", [crypto.randomUUID()]),
    { code: "42501" },
  );
});
test("expired queued and leased grants reduce automatically; lost dispatched outcomes quarantine without replay", async () => {
  const f = await knowledgeFixture(false, "owner"),
    queued = await job(f),
    peer = await knowledgeFixture(false, "partner"),
    leased = await job(peer, partner),
    dispatched = await job(f);
  const c = (
    await as(
      partner,
      "select kxra.team_job_claim($1,$2,45) claim",
      [crypto.randomUUID(), peer.room],
      org,
      leased.g,
    )
  )[0].claim;
  assert.equal(c.job_id, leased.j.id);
  assert.equal(
    (await as(owner, "select kxra_private.is_owner($1) owner", [org]))[0].owner,
    true,
  );
  assert.equal(
    (
      await as(
        owner,
        "select count(*) n from kxra.audit_events where action='team.execution_authorized' and resource_id=$1",
        [leased.j.id],
      )
    )[0].n,
    "0",
    "org owner cannot discover another requester's private room through new audit rows",
  );

  const d = (
    await as(
      owner,
      "select kxra.team_job_claim($1,$2,45) claim",
      [crypto.randomUUID(), f.room],
      org,
      dispatched.g,
    )
  )[0].claim;
  assert.equal(d.job_id, dispatched.j.id);
  assert.ok(
    (
      await as(
        owner,
        "select kxra.team_job_dispatch($1,$2,$3) connection",
        [d.job_id, d.lease_token, (await row(d.job_id)).context_sha256],
        org,
        dispatched.g,
      )
    )[0].connection,
  );
  await admin.query(
    "update kxra.team_execution_grants set expires_at=now()-interval '1 second' where id=any($1::uuid[])",
    [[queued.g, leased.g, dispatched.g]],
  );
  const request = crypto.randomUUID(),
    result = await maintain(request);
  assert.equal(result.cancelled, 2);
  assert.equal(result.quarantined, 1);
  assert.equal(result.opened_cases, 1);
  assert.equal((await row(queued.j.id)).state, "CANCELLED");
  assert.equal((await row(leased.j.id)).state, "CANCELLED");
  assert.equal((await row(dispatched.j.id)).state, "UNCERTAIN");
  assert.equal((await maintain(request)).replayed, true);
  assert.equal(
    (
      await as(
        owner,
        "select kxra.team_job_finish($1,$2,$3,null,0,0) done",
        [d.job_id, d.lease_token, "Late unpublishable output"],
        org,
        dispatched.g,
      )
    )[0].done,
    false,
  );
  assert.equal(
    (
      await admin.query("select output from kxra.team_runs where id=$1", [
        (await row(d.job_id)).run_id,
      ])
    ).rows[0].output,
    "",
  );
  const cases = await as(
    owner,
    "select * from kxra.team_uncertainty_cases where job_id=$1",
    [d.job_id],
  );
  assert.equal(cases.length, 1);
  assert.equal(
    (
      await as(
        partner,
        "select * from kxra.team_uncertainty_cases where job_id=$1",
        [d.job_id],
      )
    ).length,
    0,
  );
  await assert.rejects(
    as(partner, "select kxra.team_uncertainty_acknowledge($1,$2,$3)", [
      f.room,
      cases[0].id,
      1,
    ]),
    { code: "42501" },
  );
  await as(owner, "select kxra.team_uncertainty_acknowledge($1,$2,$3)", [
    f.room,
    cases[0].id,
    1,
  ]);
  assert.equal((await row(d.job_id)).state, "UNCERTAIN");
  assert.ok((await row(d.job_id)).uncertainty_acknowledged_at);
  const health = (await raw("select kxra_room_worker.health() result"))[0]
    .result;
  assert.equal(health.open_uncertain, 0);
  assert.equal(health.status, "OK");
  assert.ok(
    (
      await admin.query(
        "select metadata from kxra.audit_events where action='team.system_maintenance' and actor_id is null",
      )
    ).rows.length,
  );
});

test("pre-dispatch expiry retries at most three times, while replay and stale health cannot claim success", async () => {
  const f = await knowledgeFixture(false, "owner"),
    entry = await job(f);
  for (let n = 1; n <= 3; n++) {
    const c = (
      await as(
        owner,
        "select kxra.team_job_claim($1,$2,5) claim",
        [crypto.randomUUID(), f.room],
        org,
        entry.g,
      )
    )[0].claim;
    assert.equal(c.job_id, entry.j.id);
    await adminWork(
      "update kxra.team_jobs set lease_expires_at=now()-interval '1 second' where id=$1",
      [entry.j.id],
    );
    await admin.query(
      "update kxra.team_execution_grants set last_maintained_at=null where id=$1",
      [entry.g],
    );
    await maintain();
    const state = await row(entry.j.id);
    assert.equal(state.attempt_count, n);
    assert.equal(state.state, n === 3 ? "FAILED" : "QUEUED");
  }
  assert.equal(
    (
      await raw("select kxra_room_worker.next($1) scope", [crypto.randomUUID()])
    )[0].scope,
    null,
  );
  assert.equal(
    (
      await admin.query("select count(*) n from kxra.team_runs where id=$1", [
        (await row(entry.j.id)).run_id,
      ])
    ).rows[0].n,
    "0",
  );
  await admin.query(
    "update kxra.team_maintenance_receipts set created_at=now()-interval '181 seconds'",
  );
  assert.equal(
    (await raw("select kxra_room_worker.health() result"))[0].result.status,
    "STALE",
  );
});

test("private health reports old due work as backlog without pretending it completed", async (t) => {
  const f = await knowledgeFixture(false, "owner"),
    entry = await job(f);
  t.after(async () => {
    const current = await row(entry.j.id);
    if (["QUEUED", "LEASED", "DISPATCHED"].includes(current.state))
      await as(owner, "select kxra.team_job_cancel($1,$2,$3)", [
        f.room,
        entry.j.id,
        current.version,
      ]);
  });
  await adminWork(
    "update kxra.team_jobs set available_at=now()-interval '11 minutes' where id=$1",
    [entry.j.id],
  );
  await maintain();
  const health = (await raw("select kxra_room_worker.health() result"))[0]
    .result;
  assert.equal(health.status, "BACKLOG");
  assert.ok(health.oldest_due_seconds >= 660);
  assert.equal((await row(entry.j.id)).state, "QUEUED");
  assert.ok(!JSON.stringify(health).includes(entry.j.id));
});

test("bounded reduction traverses a withdrawn backlog and prunes only old operational receipts and reviewed cases", async () => {
  const f = await knowledgeFixture(false, "owner"),
    entries = [];
  for (let i = 0; i < 12; i++) entries.push(await job(f));
  await admin.query(
    "update kxra.team_execution_grants set expires_at=now()-interval '1 second' where id=any($1::uuid[])",
    [entries.map((e) => e.g)],
  );
  const results = await Promise.all(
    Array.from({ length: 3 }, () => maintain()),
  );
  assert.ok(results.every((r) => r.scopes <= 5));
  for (let i = 0; i < 3; i++) await maintain();
  for (const e of entries) assert.equal((await row(e.j.id)).state, "CANCELLED");
  const receipt = crypto.randomUUID(),
    fresh = crypto.randomUUID();
  await admin.query(
    "insert into kxra.team_worker_deliveries(id,created_at) values($1,now()-interval '31 days'),($2,now())",
    [receipt, fresh],
  );
  await admin.query(
    "update kxra.team_uncertainty_cases set acknowledged_at=now()-interval '31 days' where state='ACKNOWLEDGED'",
  );
  await admin.query(
    "insert into kxra.team_worker_deliveries(id,created_at) select gen_random_uuid(),now()-interval '31 days' from generate_series(1,220)",
  );
  const runsBefore = (
    await admin.query("select count(*) n from kxra.team_runs")
  ).rows[0].n;
  const attemptsBefore = (
    await admin.query("select count(*) n from kxra.team_job_attempts")
  ).rows[0].n;
  const r = await maintain();
  assert.ok(r.pruned >= 2);
  assert.ok(r.pruned <= 300);
  assert.equal(
    (
      await admin.query(
        "select count(*) n from kxra.team_worker_deliveries where created_at<now()-interval '30 days'",
      )
    ).rows[0].n,
    "121",
    "each maintenance tick prunes at most 100 delivery rows",
  );
  assert.equal(
    (
      await admin.query(
        "select count(*) n from kxra.team_worker_deliveries where id=$1",
        [receipt],
      )
    ).rows[0].n,
    "0",
  );
  assert.equal(
    (
      await admin.query(
        "select count(*) n from kxra.team_worker_deliveries where id=$1",
        [fresh],
      )
    ).rows[0].n,
    "1",
  );
  assert.equal(
    (await admin.query("select count(*) n from kxra.team_runs")).rows[0].n,
    runsBefore,
  );
  assert.equal(
    (await admin.query("select count(*) n from kxra.team_job_attempts")).rows[0]
      .n,
    attemptsBefore,
  );
  await maintain();
  assert.equal(
    (await admin.query("select count(*) n from kxra.team_uncertainty_cases"))
      .rows[0].n,
    "0",
    "reviewed uncertainty is not recreated after receipt pruning",
  );
});

test("owner recovery HTTP remains scoped and records review without retrying or reactivating", async () => {
  const f = await knowledgeFixture(false, "owner"),
    entry = await job(f);
  const c = (
    await as(
      owner,
      "select kxra.team_job_claim($1,$2,45) claim",
      [crypto.randomUUID(), f.room],
      org,
      entry.g,
    )
  )[0].claim;
  await as(
    owner,
    "select kxra.team_job_dispatch($1,$2,$3)",
    [c.job_id, c.lease_token, (await row(c.job_id)).context_sha256],
    org,
    entry.g,
  );
  await admin.query(
    "update kxra.team_execution_grants set revoked_at=now() where id=$1",
    [entry.g],
  );
  await maintain();
  const url = testOrigin + `/api/room-operations/${f.room}`;
  assert.equal((await fetch(url)).status, 401);
  const outsider = await knowledgeLogin("partner");
  assert.equal(
    (await fetch(url, { headers: { cookie: outsider } })).status,
    404,
  );
  const initial = await fetch(url, { headers: { cookie: f.cookie } });
  assert.equal(initial.status, 200);
  assert.equal(initial.headers.get("cache-control"), "private, no-store");
  const data = await initial.json();
  assert.equal(data.cases.length, 1);
  const payload = {
    action: "ACKNOWLEDGE_NO_RETRY",
    case_id: data.cases[0].id,
    version: 1,
    reviewed: true,
  };
  assert.equal(
    (
      await fetch(url, {
        method: "POST",
        headers: { cookie: f.cookie, "content-type": "application/json" },
        body: JSON.stringify(payload),
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await fetch(url, {
        method: "POST",
        headers: {
          cookie: f.cookie,
          origin: testOrigin,
          "content-type": "application/json",
        },
        body: JSON.stringify({ ...payload, actor_id: partner }),
      })
    ).status,
    400,
  );
  const reviewed = await fetch(url, {
    method: "POST",
    headers: {
      cookie: f.cookie,
      origin: testOrigin,
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  assert.equal(reviewed.status, 200);
  assert.equal((await row(entry.j.id)).state, "UNCERTAIN");
  const markup = await fetch(testOrigin + `/os/room-operations/${f.room}`, {
    headers: { cookie: f.cookie },
  });
  assert.equal(markup.status, 200);
  const html = await markup.text();
  assert.ok(
    html.includes("never retried automatically"),
    "Recovery explains that uncertainty is never automatically retried",
  );
  assert.ok(
    html.includes("provider outcome remains uncertain"),
    "Review never relabels the outcome successful",
  );
});

test("a lost scheduled dispatch pauses the definition and future schedules do not consume executable selections", async () => {
  const f = await knowledgeFixture(false, "owner");
  async function define(wall: string, start: string) {
    const id = crypto.randomUUID();
    await ok(`/${f.room}/schedules`, f.cookie, {
      request_id: id,
      agent_id: f.agent,
      message_id: f.message,
      context: "THREAD",
      chunk_ids: [],
      use_memory: false,
      name: "Maintenance schedule",
      timezone: "UTC",
      wall_time: wall,
      starts_on: start,
      expires_at: new Date(Date.now() + 2 * 86400000).toISOString(),
      max_occurrences: 2,
    });
    const definition = (
      await ok(`/${f.room}/schedules`, f.cookie)
    ).schedules.find((v: { id: string }) => v.id === id);
    await ok(`/${f.room}/schedules/review`, f.cookie, {
      schedule_id: id,
      version: definition.version,
      action: "ACTIVATE",
    });
    const grant = (
      await as(
        owner,
        "select kxra.team_execution_authorize($1,now()+interval '1 hour') id",
        [id],
      )
    )[0].id;
    return { id, grant };
  }
  const due = await define("00:00", new Date().toISOString().slice(0, 10));
  await as(
    owner,
    "select kxra.team_schedule_tick($1,$2)",
    [crypto.randomUUID(), f.room],
    org,
    due.grant,
  );
  const claim = (
    await as(
      owner,
      "select kxra.team_job_claim($1,$2,45) claim",
      [crypto.randomUUID(), f.room],
      org,
      due.grant,
    )
  )[0].claim;
  await as(
    owner,
    "select kxra.team_job_dispatch($1,$2,$3)",
    [claim.job_id, claim.lease_token, (await row(claim.job_id)).context_sha256],
    org,
    due.grant,
  );
  await adminWork(
    "update kxra.team_jobs set lease_expires_at=now()-interval '1 second' where id=$1",
    [claim.job_id],
  );
  await maintain();
  assert.equal((await row(claim.job_id)).state, "UNCERTAIN");
  assert.equal(
    (
      await admin.query("select state from kxra.team_schedules where id=$1", [
        due.id,
      ])
    ).rows[0].state,
    "PAUSED",
  );
  const later = new Date(Date.now() + 10 * 60 * 1000),
    future = await define(
      later.toISOString().slice(11, 16),
      later.toISOString().slice(0, 10),
    );
  assert.equal(
    (
      await raw("select kxra_room_worker.next($1) scope", [crypto.randomUUID()])
    )[0].scope,
    null,
  );
  const current = (await ok(`/${f.room}/schedules`, f.cookie)).schedules.find(
    (v: { id: string }) => v.id === future.id,
  );
  await ok(`/${f.room}/schedules/review`, f.cookie, {
    schedule_id: future.id,
    version: current.version,
    action: "PAUSE",
  });
});

test("a busy requester cannot monopolize maintenance traversal or block another requester", async () => {
  const one = await knowledgeFixture(false, "owner"),
    two = await knowledgeFixture(false, "partner"),
    a = await job(one),
    b = await job(two, partner);
  await admin.query(
    "update kxra.team_execution_grants set expires_at=now()-interval '1 second' where id=any($1::uuid[])",
    [[a.g, b.g]],
  );
  const lock = await app.connect();
  try {
    await lock.query("begin");
    await lock.query("select pg_advisory_xact_lock(hashtext($1))", [owner]);
    const r = await maintain();
    assert.ok(r.busy_skipped >= 1);
    assert.equal((await row(a.j.id)).state, "QUEUED");
    assert.equal((await row(b.j.id)).state, "CANCELLED");
  } finally {
    await lock.query("rollback");
    lock.release();
  }
  await admin.query(
    "update kxra.team_execution_grants set last_maintained_at=null where id=$1",
    [a.g],
  );
  await maintain();
  assert.equal((await row(a.j.id)).state, "CANCELLED");
});

test("two real-tenant SQL scopes require customer BYOK consent and exact rollout, enforce dispatch budgets and fence withdrawal", async () => {
  async function customer(actor: string) {
    const tenant = crypto.randomUUID(),
      project = crypto.randomUUID(),
      connection = crypto.randomUUID();
    await admin.query(
      "insert into kxra.organisations(id,name,slug) values($1,'Synthetic BYOK customer',$2)",
      [tenant, "byok-" + tenant],
    );
    await admin.query(
      "insert into kxra.organisation_memberships(org_id,account_id,security_role,relationship_type,state,display_name,grant_source) values($1,$2,'ORG_ADMIN','CUSTOMER','ACTIVE','Synthetic customer','AT_ROOM_MAINTENANCE')",
      [tenant, actor],
    );
    await admin.query(
      "insert into kxra.projects(id,org_id,code,name,stage,status,next_action) values($1,$2,'BYOK','Synthetic BYOK project','TEST','ACTIVE','Review')",
      [project, tenant],
    );
    const room = (
      await as(
        actor,
        "select kxra.team_room_create($1,'Customer BYOK room','Only scoped drafts','PRIVATE') id",
        [project],
        tenant,
        "",
        "hosted",
      )
    )[0].id;
    await as(
      actor,
      "select kxra.team_connection_save($1,'Synthetic customer key','OPENAI','synthetic-model','','not-a-real-provider-credential')",
      [connection],
      tenant,
      "",
      "hosted",
    );
    const agent = (
      await as(
        actor,
        "select kxra.team_agent_create($1,$2,'Synthetic drafter','Draft only') id",
        [room, connection],
        tenant,
        "",
        "hosted",
      )
    )[0].id;
    const message = (
      await as(
        actor,
        "select kxra.team_message_send($1,$2,$3,null) id",
        [crypto.randomUUID(), room, "Synthetic customer request"],
        tenant,
        "",
        "hosted",
      )
    )[0].id;
    return { tenant, room, connection, agent, message, actor };
  }
  const a = await customer(owner),
    b = await customer(partner);
  async function session(c: typeof a) {
    const cookie = await knowledgeLogin(
        c.actor === owner ? "owner" : "partner",
      ),
      response = await fetch(testOrigin + "/api/context", {
        method: "POST",
        headers: {
          origin: testOrigin,
          cookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({ organisation_id: c.tenant }),
      });
    assert.equal(response.status, 200);
    const jar = new Map(
      cookie.split("; ").map((pair) => {
        const n = pair.indexOf("=");
        return [pair.slice(0, n), pair.slice(n + 1)];
      }),
    );
    for (const raw of response.headers.getSetCookie()) {
      const pair = raw.split(";", 1)[0],
        n = pair.indexOf("=");
      jar.set(pair.slice(0, n), pair.slice(n + 1));
    }
    return [...jar].map(([name, value]) => name + "=" + value).join("; ");
  }
  const cookieA = await session(a);

  async function allowed(c: typeof a, actor = c.actor, tenant = c.tenant) {
    return (
      await as(
        actor,
        "select kxra_private.team_room_byok_allowed($1,$2) allowed",
        [c.room, c.connection],
        tenant,
        "",
        "hosted",
      )
    )[0].allowed;
  }
  assert.equal(await allowed(a), false);
  await assert.rejects(
    as(
      owner,
      "select kxra.team_room_byok_review($1,$2,'APPROVE')",
      [a.room, a.connection],
      a.tenant,
      "",
      "hosted",
    ),
    { code: "42501" },
  );
  for (const c of [a, b]) {
    await admin.query(
      "insert into kxra.team_room_rollouts(room_id,org_id,connection_id,expires_at,max_daily_dispatches) values($1,$2,$3,now()+interval '1 hour',1)",
      [c.room, c.tenant, c.connection],
    );
    await admin.query(
      "update kxra.team_room_rollouts set starts_at=now()+interval '30 minutes' where room_id=$1",
      [c.room],
    );
    assert.equal(await allowed(c), false);
    if (c === a) {
      const held = await fetch(testOrigin + `/api/room-operations/${c.room}`, {
        headers: { cookie: cookieA },
      });
      assert.equal(held.status, 200);
      assert.equal((await held.json()).rollout.active, false);
      const rejected = await fetch(
        testOrigin + `/api/room-operations/${c.room}`,
        {
          method: "POST",
          headers: {
            origin: testOrigin,
            cookie: cookieA,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            action: "APPROVE_CUSTOMER_BYOK",
            connection_id: c.connection,
            customer_owned: true,
          }),
        },
      );
      assert.equal(rejected.status, 403);
    }
    await assert.rejects(
      as(
        c.actor,
        "select kxra.team_room_byok_review($1,$2,'APPROVE')",
        [c.room, c.connection],
        c.tenant,
        "",
        "hosted",
      ),
      { code: "42501" },
    );
    await admin.query(
      "update kxra.team_room_rollouts set starts_at=now() where room_id=$1",
      [c.room],
    );
    await as(
      c.actor,
      "select kxra.team_room_byok_review($1,$2,'APPROVE')",
      [c.room, c.connection],
      c.tenant,
      "",
      "hosted",
    );
    assert.equal(await allowed(c), true);
  }
  const approved = await fetch(testOrigin + `/api/room-operations/${a.room}`, {
    method: "POST",
    headers: {
      origin: testOrigin,
      cookie: cookieA,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      action: "APPROVE_CUSTOMER_BYOK",
      connection_id: a.connection,
      customer_owned: true,
    }),
  });
  assert.equal(approved.status, 200);
  const approvedData = await approved.json();
  assert.equal(approvedData.rollout.active, true);
  assert.equal(approvedData.connection.allowed, true);
  assert.ok(
    !JSON.stringify(approvedData).includes("not-a-real-provider-credential"),
  );
  const page = await fetch(testOrigin + `/os/room-operations/${a.room}`, {
    headers: { cookie: cookieA },
  });
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.ok(html.includes("Customer-owned provider connection"));
  assert.ok(html.includes("Room rollout starts"));
  assert.ok(!html.includes("not-a-real-provider-credential"));
  assert.equal(
    (
      await fetch(testOrigin + `/api/room-operations/${b.room}`, {
        headers: { cookie: cookieA },
      })
    ).status,
    404,
  );
  assert.equal(await allowed(a, partner, b.tenant), false);
  await assert.rejects(
    as(
      partner,
      "select kxra.team_room_byok_review($1,$2,'APPROVE')",
      [a.room, a.connection],
      b.tenant,
      "",
      "hosted",
    ),
    { code: "42501" },
  );
  async function enqueue(c: typeof a) {
    const id = crypto.randomUUID(),
      digest = "a".repeat(64);
    await as(
      c.actor,
      "select kxra.team_job_enqueue($1,$2,$3,$4,'MESSAGE_ONLY',$5,$6,$7,$8,$7,$8,$7,$8,null,$6)",
      [id, c.room, c.agent, c.message, [c.message], digest, [], []],
      c.tenant,
      "",
      "hosted",
    );
    const grant = (
      await as(
        c.actor,
        "select kxra.team_execution_authorize($1,now()+interval '1 hour') id",
        [id],
        c.tenant,
        "",
        "hosted",
      )
    )[0].id;
    const claim = (
      await as(
        c.actor,
        "select kxra.team_job_claim($1,$2,45) claim",
        [crypto.randomUUID(), c.room],
        c.tenant,
        grant,
        "hosted",
      )
    )[0].claim;
    return { id, grant, claim, digest };
  }
  const first = await enqueue(a);
  assert.ok(
    (
      await as(
        owner,
        "select kxra.team_job_dispatch($1,$2,$3) connection",
        [first.id, first.claim.lease_token, first.digest],
        a.tenant,
        first.grant,
        "hosted",
      )
    )[0].connection,
  );
  assert.equal(
    (
      await as(
        owner,
        "select kxra.team_job_finish($1,$2,'Synthetic native protocol result',null,0,0) done",
        [first.id, first.claim.lease_token],
        a.tenant,
        first.grant,
        "hosted",
      )
    )[0].done,
    true,
  );
  const over = await enqueue(a);
  assert.equal(
    (
      await as(
        owner,
        "select kxra.team_job_dispatch($1,$2,$3) connection",
        [over.id, over.claim.lease_token, over.digest],
        a.tenant,
        over.grant,
        "hosted",
      )
    )[0].connection,
    null,
  );
  assert.equal((await row(over.id)).last_error, "CAPACITY");
  const other = await enqueue(b);
  assert.ok(
    (
      await as(
        partner,
        "select kxra.team_job_dispatch($1,$2,$3) connection",
        [other.id, other.claim.lease_token, other.digest],
        b.tenant,
        other.grant,
        "hosted",
      )
    )[0].connection,
  );
  await as(
    partner,
    "select kxra.team_room_byok_review($1,$2,'REVOKE')",
    [b.room, b.connection],
    b.tenant,
    "",
    "hosted",
  );
  // Run raw reducer in hosted mode: no fixture provider or customer identity is supplied.
  const db = await app.connect();
  try {
    await db.query("begin");
    await db.query(
      "select set_config('request.kxra.execution_mode','hosted',true)",
    );
    await db.query("select kxra_room_worker.maintain($1)", [
      crypto.randomUUID(),
    ]);
    await db.query("commit");
  } finally {
    db.release();
  }
  assert.equal((await row(other.id)).state, "UNCERTAIN");
  assert.equal(
    (
      await as(
        partner,
        "select kxra.team_job_finish($1,$2,'Rejected late result',null,0,0) done",
        [other.id, other.claim.lease_token],
        b.tenant,
        other.grant,
        "hosted",
      )
    )[0].done,
    false,
  );
  assert.equal(
    (await row(first.id)).state,
    "SUCCEEDED",
    "other tenant's withdrawal cannot change the first completed result",
  );
  for (const withdrawal of [
    "ROLLOUT_REVOKED",
    "ROLLOUT_EXPIRED",
    "CONSENT_REVOKED",
    "CONSENT_EXPIRED",
  ] as const) {
    const c = await customer(owner);
    await admin.query(
      "insert into kxra.team_room_rollouts(room_id,org_id,connection_id,expires_at,max_daily_dispatches) values($1,$2,$3,now()+interval '1 hour',2)",
      [c.room, c.tenant, c.connection],
    );
    await as(
      c.actor,
      "select kxra.team_room_byok_review($1,$2,'APPROVE')",
      [c.room, c.connection],
      c.tenant,
      "",
      "hosted",
    );
    const pending = await enqueue(c);
    // Keep this synthetic scope first in the bounded maintenance traversal.
    await admin.query(
      "update kxra.team_execution_grants set last_maintained_at=now() where id<>$1",
      [pending.grant],
    );
    if (withdrawal === "ROLLOUT_REVOKED")
      await admin.query(
        "update kxra.team_room_rollouts set revoked_at=now() where room_id=$1",
        [c.room],
      );
    if (withdrawal === "ROLLOUT_EXPIRED")
      await admin.query(
        "update kxra.team_room_rollouts set starts_at=now()-interval '1 hour',expires_at=now()-interval '1 second' where room_id=$1",
        [c.room],
      );
    if (withdrawal === "CONSENT_REVOKED")
      await admin.query(
        "update kxra.team_byok_consents set revoked_at=now() where room_id=$1",
        [c.room],
      );
    if (withdrawal === "CONSENT_EXPIRED")
      await admin.query(
        "update kxra.team_byok_consents set expires_at=now()-interval '1 second' where room_id=$1",
        [c.room],
      );
    assert.equal(
      (
        await as(
          c.actor,
          "select kxra_private.team_worker_target($1) allowed",
          [pending.id],
          c.tenant,
          pending.grant,
          "hosted",
        )
      )[0].allowed,
      false,
      withdrawal,
    );
    await maintain();
    assert.equal(
      (await row(pending.id)).state,
      "CANCELLED",
      withdrawal + " must reduce pending work without a provider call",
    );
    assert.ok(
      (
        await admin.query(
          "select revoked_at from kxra.team_execution_grants where id=$1",
          [pending.grant],
        )
      ).rows[0].revoked_at,
      withdrawal,
    );
  }
});
