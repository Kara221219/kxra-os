import { test, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import pg from "pg";
import { runtimeFile } from "./support/runtime";
import {
  knowledgeFixture,
  knowledgeLogin,
  knowledgeOk as ok,
  knowledgeRequest as req,
} from "./support/team-knowledge";
const cfg = JSON.parse(fs.readFileSync(runtimeFile("database.json"), "utf8")),
  admin = new pg.Pool({ ...cfg, user: os.userInfo().username }),
  app = new pg.Pool(cfg);
after(async () => {
  await admin.end();
  await app.end();
});
const partner = "20000000-0000-4000-8000-000000000002",
  owner = "20000000-0000-4000-8000-000000000001",
  org = "10000000-0000-4000-8000-000000000001";
async function as(
  actor: string,
  sql: string,
  values: unknown[] = [],
  pool = app,
  tenant = org,
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
// Fixture administrator simulates an external scope withdrawal; preserve audit actor.
async function fixtureMembership(room: string, active: boolean) {
  const db = await admin.connect();
  try {
    await db.query("begin");
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [
      partner,
    ]);
    await db.query(
      "update kxra.team_room_members set active=$1 where room_id=$2 and account_id=$3",
      [active, room, partner],
    );
    await db.query("commit");
  } catch (e) {
    await db.query("rollback");
    throw e;
  } finally {
    db.release();
  }
}
type F = Awaited<ReturnType<typeof knowledgeFixture>>;
const definition = (f: F, extra: Record<string, unknown> = {}) => ({
  request_id: crypto.randomUUID(),
  agent_id: f.agent,
  message_id: f.message,
  context: "THREAD",
  chunk_ids: [],
  use_memory: false,
  name: "Daily synthetic review",
  timezone: "UTC",
  wall_time: "00:00",
  starts_on: new Date().toISOString().slice(0, 10),
  expires_at: new Date(Date.now() + 86400000 * 2).toISOString(),
  max_occurrences: 2,
  ...extra,
});
const list = (f: F) => ok(`/${f.room}/schedules`, f.cookie);
async function review(f: F, i: string, action: string) {
  const s = (await list(f)).schedules.find((s: { id: string }) => s.id === i);
  return ok(`/${f.room}/schedules/review`, f.cookie, {
    schedule_id: i,
    version: s.version,
    action,
  });
}
const tick = (room: string, request = crypto.randomUUID()) =>
  as(partner, "select kxra.team_schedule_tick($1,$2) fresh", [request, room]);
test("daily wall instants explicitly skip DST gaps and choose early folds including half-hour zones", async () => {
  for (const [d, t, z, expected] of [
    ["2026-03-08", "02:30", "America/New_York", null],
    ["2026-11-01", "01:30", "America/New_York", "2026-11-01T05:30:00.000Z"],
    ["2026-03-29", "01:30", "Europe/London", null],
    ["2026-10-25", "01:30", "Europe/London", "2026-10-25T00:30:00.000Z"],
    ["2026-10-04", "02:15", "Australia/Lord_Howe", null],
    ["2026-04-05", "01:45", "Australia/Lord_Howe", "2026-04-04T14:45:00.000Z"],
    ["2011-12-30", "12:00", "Pacific/Apia", null],
    ["2028-02-29", "12:00", "UTC", "2028-02-29T12:00:00.000Z"],
  ]) {
    const r = await as(
      partner,
      "select kxra_private.team_wall_instant($1,$2,$3) instant",
      [d, t, z],
    );
    assert.equal(r[0].instant?.toISOString() ?? null, expected);
  }
});
test("reviewed recurring admission is deduplicated, pinned, bounded and cancellation fences leases", async () => {
  const f = await knowledgeFixture(false),
    v = definition(f),
    i = v.request_id;
  await ok(`/${f.room}/schedules`, f.cookie, v);
  assert.equal((await list(f)).schedules[0].state, "DRAFT");
  await tick(f.room);
  assert.equal((await list(f)).occurrences.length, 0);
  await ok(`/${f.room}/schedules`, f.cookie, v);
  assert.equal(
    (await req(`/${f.room}/schedules`, f.cookie, { ...v, name: "Changed" }))
      .status,
    409,
  );
  const s = (await list(f)).schedules[0];
  assert.equal(s.receipt.context_active, true);
  assert.equal(s.receipt.messages, 1);
  await review(f, i, "ACTIVATE");
  const request = crypto.randomUUID();
  const ticks = await Promise.all([
    tick(f.room, request),
    tick(f.room, request),
  ]);
  assert.equal(ticks.filter((r) => r[0].fresh).length, 1);
  let data = await list(f);
  assert.equal(data.occurrences.length, 1);
  const child = data.occurrences[0].job_id;
  assert.equal(data.occurrences[0].outcome, "ENQUEUED");
  assert.equal(data.schedules[0].state, "ACTIVE");
  assert.equal(
    (
      await as(
        partner,
        "select kxra_private.team_schedule_decision($1) reason",
        [i],
      )
    )[0].reason,
    "OVERLAP",
  );
  await tick(f.room);
  assert.equal((await list(f)).occurrences.length, 1);
  const jobs = await ok(`/${f.room}/jobs`, f.cookie);
  assert.equal(jobs.jobs.length, 1);
  assert.equal(jobs.jobs[0].id, child, "cancelled template is hidden");
  const [c] = await as(partner, "select kxra.team_job_claim($1,$2,45) claim", [
    crypto.randomUUID(),
    f.room,
  ]);
  assert.equal(c.claim.job_id, child);
  await review(f, i, "PAUSE");
  assert.equal(
    (await ok(`/${f.room}/jobs`, f.cookie)).jobs[0].state,
    "CANCELLED",
  );
  assert.equal(
    (
      await as(
        partner,
        "select kxra.team_job_finish($1,$2,'late',null,1,1) published",
        [child, c.claim.lease_token],
      )
    )[0].published,
    false,
  );
  await review(f, i, "ACTIVATE");
  await tick(f.room);
  assert.equal(
    (await list(f)).occurrences.length,
    1,
    "resume never replays the same local date",
  );
  await review(f, i, "REVOKE");
  await assert.rejects(
    as(partner, "select kxra.team_schedule_review($1,$2,$3,'ACTIVATE')", [
      f.room,
      i,
      (await list(f)).schedules[0].version,
    ]),
  );
});
test("schedule budget exhausts at admission and immutable definitions reject unreviewed or spoofed changes", async () => {
  const f = await knowledgeFixture(false),
    v = definition(f, { max_occurrences: 1 });
  await ok(`/${f.room}/schedules`, f.cookie, v);
  await review(f, v.request_id, "ACTIVATE");
  await tick(f.room);
  const s = (await list(f)).schedules[0];
  assert.equal(s.state, "EXHAUSTED");
  assert.equal(
    (
      await as(
        partner,
        "select kxra_private.team_schedule_decision($1) reason",
        [s.id],
      )
    )[0].reason,
    "BUDGET",
  );
  await tick(f.room);
  assert.equal((await list(f)).occurrences.length, 1);
  for (const extra of [
    { created_by: owner },
    { role: "owner" },
    { max_occurrences: 21 },
    { timezone: "Not/AZone" },
    { wall_time: "25:00" },
    { starts_on: "2026-02-31" },
    { expires_at: new Date(Date.now() + 40 * 86400000).toISOString() },
  ]) {
    const response = await req(`/${f.room}/schedules`, f.cookie, {
      ...definition(f),
      ...extra,
    });
    assert.ok(
      [400, 409].includes(response.status),
      `${Object.keys(extra)}: ${response.status} ${await response.text()}`,
    );
  }
  await assert.rejects(
    admin.query(
      "update kxra.team_schedules set max_occurrences=20 where id=$1",
      [s.id],
    ),
    /immutable/,
  );
  await assert.rejects(
    as(partner, "update kxra.team_schedules set state='ACTIVE' where id=$1", [
      s.id,
    ]),
    { code: "42501" },
  );
  await assert.rejects(
    as(partner, "select kxra.team_schedule_review($1,$2,null,'PAUSE')", [
      f.room,
      s.id,
    ]),
  );
  await review(f, s.id, "PAUSE");
  await assert.rejects(
    as(partner, "select kxra.team_schedule_review($1,$2,$3,'ACTIVATE')", [
      f.room,
      s.id,
      (await list(f)).schedules[0].version,
    ]),
  );
  await review(f, s.id, "REVOKE");
});
test("private room owners, foreign tenants and withdrawn agent context cannot admit recurring work", async () => {
  const f = await knowledgeFixture(false),
    v = definition(f);
  await ok(`/${f.room}/schedules`, f.cookie, v);
  await review(f, v.request_id, "ACTIVATE");
  const outsider = await knowledgeLogin("owner");
  assert.equal((await req(`/${f.room}/schedules`, outsider)).status, 404);
  assert.equal((await req(`/${f.room}/schedules`)).status, 401);
  assert.equal(
    (
      await as(owner, "select id from kxra.team_schedules where id=$1", [
        v.request_id,
      ])
    ).length,
    0,
  );
  assert.equal(
    (
      await as(
        owner,
        "select id from kxra.team_schedule_occurrences where schedule_id=$1",
        [v.request_id],
      )
    ).length,
    0,
  );
  await assert.rejects(
    as(owner, "select kxra.team_schedule_review($1,$2,2,'ACTIVATE')", [
      f.room,
      v.request_id,
    ]),
    { code: "42501" },
  );
  await assert.rejects(
    as(
      partner,
      "select kxra.team_schedule_tick($1,$2)",
      [crypto.randomUUID(), f.room],
      admin,
    ),
    { code: "42501" },
  );
  assert.equal(
    (
      await as(
        partner,
        "select id from kxra.team_schedules where id=$1",
        [v.request_id],
        app,
        crypto.randomUUID(),
      )
    ).length,
    0,
  );
  await tick(f.room);
  await ok(`/${f.room}/agent-state`, f.cookie, {
    agent_id: f.agent,
    enabled: false,
  });
  await tick(f.room);
  const data = await list(f);
  assert.equal(data.schedules[0].state, "PAUSED");
  assert.equal(
    (await ok(`/${f.room}/jobs`, f.cookie)).jobs[0].state,
    "CANCELLED",
  );
  assert.equal(data.occurrences.length, 1);
  await assert.rejects(
    as(partner, "select kxra.team_schedule_review($1,$2,$3,'ACTIVATE')", [
      f.room,
      v.request_id,
      data.schedules[0].version,
    ]),
  );
});

test("global authenticated drain withdraws pending schedule work after private membership loss", async () => {
  const f = await knowledgeFixture(false),
    v = definition(f);
  await ok(`/${f.room}/schedules`, f.cookie, v);
  await review(f, v.request_id, "ACTIVATE");
  await tick(f.room);
  await fixtureMembership(f.room, false);
  try {
    assert.equal((await req(`/${f.room}/schedules`, f.cookie)).status, 404);
    const result = await ok("/jobs/drain", f.cookie, {
      request_id: crypto.randomUUID(),
    });
    assert.equal(result.processed, false);
    assert.equal(
      (
        await admin.query("select state from kxra.team_schedules where id=$1", [
          v.request_id,
        ])
      ).rows[0].state,
      "PAUSED",
    );
    assert.equal(
      (
        await admin.query(
          "select j.state from kxra.team_jobs j join kxra.team_schedule_occurrences o on o.job_id=j.id where o.schedule_id=$1",
          [v.request_id],
        )
      ).rows[0].state,
      "CANCELLED",
    );
  } finally {
    await fixtureMembership(f.room, true);
  }
  await review(f, v.request_id, "REVOKE");
});

test("withdrawn approved memory hides the schedule review fingerprint and blocks future admission", async () => {
  const f = await knowledgeFixture(false),
    memory = await ok(`/${f.room}/memories`, f.cookie, {
      request_id: crypto.randomUUID(),
      agent_id: f.agent,
      kind: "PREFERENCE",
      title: "Reviewed schedule context",
      body: "Synthetic preference retained only while approved.",
    });
  await ok(`/${f.room}/memory-review`, f.cookie, {
    memory_id: memory.id,
    state: "APPROVED",
  });
  const v = definition(f, { use_memory: true });
  await ok(`/${f.room}/schedules`, f.cookie, v);
  await review(f, v.request_id, "ACTIVATE");
  let s = (await list(f)).schedules[0];
  assert.equal(s.receipt.memories, 1);
  assert.match(s.receipt.context_sha256, /^[a-f0-9]{64}$/);
  await ok(`/${f.room}/memory-review`, f.cookie, {
    memory_id: memory.id,
    state: "DELETED",
  });
  s = (await list(f)).schedules[0];
  assert.equal(s.receipt.context_active, false);
  assert.equal(s.receipt.context_sha256, null);
  assert.equal(
    (
      await as(
        partner,
        "select kxra_private.team_schedule_receipt($1) receipt",
        [v.request_id],
      )
    )[0].receipt.context_sha256,
    null,
  );
  await tick(f.room);
  const data = await list(f);
  assert.equal(data.schedules[0].state, "PAUSED");
  assert.equal(data.occurrences.length, 0);
  await review(f, v.request_id, "REVOKE");
});

test("pending jobs and active definitions remain ahead of more than 100 later archived controls", async () => {
  const f = await knowledgeFixture(false),
    v = definition(f, { name: "Older active control" });
  await ok(`/${f.room}/schedules`, f.cookie, v);
  await review(f, v.request_id, "ACTIVATE");
  const pending = await ok(`/${f.room}/jobs`, f.cookie, {
    request_id: crypto.randomUUID(),
    agent_id: f.agent,
    message_id: f.message,
    context: "MESSAGE_ONLY",
    chunk_ids: [],
    use_memory: false,
  });
  // Populate historical metadata only, with accurate current timestamps and an audit actor.
  // No run, quota mutation, deletion, timestamp rewriting or worker is involved.
  const db = await admin.connect();
  try {
    await db.query("begin");
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [
      partner,
    ]);
    const history = `insert into kxra.team_jobs(id,org_id,room_id,agent_id,message_id,request_sha256,requested_by,request_session_version,context_mode,context_ids,context_sha256,chunk_ids,chunk_hashes,skill_ids,skill_hashes,memory_ids,memory_hashes,requested_due_at,due_at,available_at,state,finished_at)
  select gen_random_uuid(),org_id,room_id,agent_id,message_id,request_sha256,requested_by,request_session_version,context_mode,context_ids,context_sha256,chunk_ids,chunk_hashes,skill_ids,skill_hashes,memory_ids,memory_hashes,null,now(),now(),'CANCELLED',now() from kxra.team_jobs cross join generate_series(1,101) where id=$1`;
    await db.query(history, [pending.id]);
    await db.query(
      `with archived as (${history} returning id)
  insert into kxra.team_schedules(id,org_id,room_id,created_by,name,timezone,wall_time,starts_on,expires_at,max_occurrences,state)
  select archived.id,s.org_id,s.room_id,s.created_by,'Archived control',s.timezone,s.wall_time,s.starts_on,s.expires_at,s.max_occurrences,'REVOKED'
  from archived cross join kxra.team_schedules s where s.id=$2`,
      [v.request_id, v.request_id],
    );
    await db.query("commit");
  } catch (e) {
    await db.query("rollback");
    throw e;
  } finally {
    db.release();
  }
  const schedules = (await list(f)).schedules,
    jobs = (await ok(`/${f.room}/jobs`, f.cookie)).jobs;
  assert.equal(schedules.length, 100);
  assert.equal(schedules[0].id, v.request_id);
  assert.equal(schedules[0].state, "ACTIVE");
  assert.equal(jobs.length, 100);
  assert.equal(jobs[0].id, pending.id);
  assert.equal(jobs[0].state, "QUEUED");
  for (const [path, data, key] of [
    ["jobs", jobs, "jobs"],
    ["schedules", schedules, "schedules"],
  ] as const) {
    const first = await ok(`/${f.room}/${path}`, f.cookie),
      cursor = first.next_cursor;
    assert.ok(cursor);
    const second = await ok(
      `/${f.room}/${path}?before=${cursor.before}&band=${cursor.band}`,
      f.cookie,
    );
    const ids = new Set(data.map((r: { id: string }) => r.id));
    assert.ok(second[key].every((r: { id: string }) => !ids.has(r.id)));
    assert.equal(second[key].length, 2);
    assert.equal(second.next_cursor, null);
    assert.equal(
      (
        await req(
          `/${f.room}/${path}?before=${crypto.randomUUID()}&band=0`,
          f.cookie,
        )
      ).status,
      404,
    );
    for (const query of [
      "?band=0",
      "?before=invalid&band=0",
      "?role=owner",
      "?before=" + cursor.before + "&band=0&band=1",
    ])
      assert.equal(
        (await req(`/${f.room}/${path}${query}`, f.cookie)).status,
        400,
      );
  }

  await ok(`/${f.room}/jobs/cancel`, f.cookie, {
    job_id: pending.id,
    version: pending.version,
  });
  await review(f, v.request_id, "REVOKE");
  assert.equal(
    (await req(`/${f.room}/jobs?before=${pending.id}&band=0`, f.cookie)).status,
    409,
  );
  assert.equal(
    (await req(`/${f.room}/schedules?before=${v.request_id}&band=0`, f.cookie))
      .status,
    409,
  );
});
