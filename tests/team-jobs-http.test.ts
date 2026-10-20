import { test, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import pg from "pg";
import { execFileSync } from "node:child_process";
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
after(async () => {
  await admin.end();
  await app.end();
});
const org = "10000000-0000-4000-8000-000000000001",
  owner = "20000000-0000-4000-8000-000000000001",
  partner = "20000000-0000-4000-8000-000000000002";
async function as(
  pool: pg.Pool,
  actor: string,
  sql: string,
  values: unknown[] = [],
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
    const result = await db.query(sql, values);
    await db.query("commit");
    return result;
  } catch (e) {
    await db.query("rollback");
    throw e;
  } finally {
    db.release();
  }
}
type Fixture = Awaited<ReturnType<typeof knowledgeFixture>>;
const input = (f: Fixture) => ({
  request_id: crypto.randomUUID(),
  agent_id: f.agent,
  message_id: f.message,
  context: "THREAD",
  chunk_ids: [],
  use_memory: false,
});
const enqueue = (f: Fixture, extra: Record<string, unknown> = {}) =>
  ok(`/${f.room}/jobs`, f.cookie, { ...input(f), ...extra });
const drain = (f: Fixture, request = crypto.randomUUID()) =>
  ok("/jobs/drain", f.cookie, { request_id: request, room_id: f.room });
const jobs = async (f: Fixture) => (await ok(`/${f.room}/jobs`, f.cookie)).jobs;
const state = async (f: Fixture, i: string) =>
  (await jobs(f)).find((j: { id: string }) => j.id === i);
const claim = async (
  actor: string,
  r: string,
  request = crypto.randomUUID(),
  tenant = org,
) =>
  (
    await as(
      app,
      actor,
      "select kxra.team_job_claim($1,$2,5) claim",
      [request, r],
      tenant,
    )
  ).rows[0].claim;
const digest = async (i: string) =>
  (
    await admin.query("select context_sha256 from kxra.team_jobs where id=$1", [
      i,
    ])
  ).rows[0].context_sha256;
const dispatch = async (
  actor: string,
  c: { job_id: string; lease_token: string },
) =>
  (
    await as(app, actor, "select kxra.team_job_dispatch($1,$2,$3) connection", [
      c.job_id,
      c.lease_token,
      await digest(c.job_id),
    ])
  ).rows[0].connection;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test("queued drafts are idempotent, due-scoped, pinned and hidden from private outsiders", async () => {
  const f = await knowledgeFixture(false, "owner"),
    peer = await knowledgeLogin("partner"),
    v = {
      ...input(f),
      use_memory: true,
      due_at: new Date(Date.now() + 8000).toISOString(),
    };
  const j = await ok(`/${f.room}/jobs`, f.cookie, v);
  assert.equal(j.state, "QUEUED");
  assert.equal(j.run_id, null);
  assert.equal(j.attempt_count, 0);
  assert.equal((await ok(`/${f.room}/jobs`, f.cookie, v)).id, j.id);
  assert.equal(
    (await req(`/${f.room}/jobs`, f.cookie, { ...v, context: "MESSAGE_ONLY" }))
      .status,
    409,
  );
  for (const bad of [
    { requested_by: partner },
    { lease_token: crypto.randomUUID() },
    { role: "owner" },
  ])
    assert.equal(
      (await req(`/${f.room}/jobs`, f.cookie, { ...v, ...bad })).status,
      400,
    );
  for (const cookie of [undefined, peer, await knowledgeLogin("viewer")])
    assert.equal(
      (await req(`/${f.room}/jobs`, cookie)).status,
      cookie ? 404 : 401,
    );
  assert.equal(
    (
      await as(admin, partner, "select id from kxra.team_jobs where id=$1", [
        j.id,
      ])
    ).rowCount,
    0,
  );
  for (const column of [
    "lease_token",
    "run_id",
    "context_ids",
    "request_sha256",
  ])
    await assert.rejects(
      as(admin, owner, `select ${column} from kxra.team_jobs where id=$1`, [
        j.id,
      ]),
      { code: "42501" },
    );
  await assert.rejects(
    as(admin, owner, "select kxra.team_job_claim($1,$2,5)", [
      crypto.randomUUID(),
      f.room,
    ]),
    { code: "42501" },
  );
  await assert.rejects(
    as(admin, owner, "delete from kxra.team_jobs where id=$1", [j.id]),
    { code: "42501" },
  );
  await assert.rejects(
    admin.query("update kxra.team_jobs set context_sha256=$1 where id=$2", [
      "0".repeat(64),
      j.id,
    ]),
    /immutable/i,
  );
  assert.equal(
    (await drain(f)).processed,
    false,
    "future work cannot be claimed early",
  );
  const marker = "newmemoryafterqueue" + crypto.randomUUID(),
    memory = await ok(`/${f.room}/memories`, f.cookie, {
      request_id: crypto.randomUUID(),
      agent_id: f.agent,
      kind: "CONTEXT",
      title: "Later context",
      body: marker,
    });
  await ok(`/${f.room}/memory-review`, f.cookie, {
    memory_id: memory.id,
    state: "APPROVED",
  });
  assert.equal(
    (await ok(`/${f.room}/jobs`, f.cookie, v)).id,
    j.id,
    "retry retains the original snapshot despite later approved context",
  );
  await ok(`/${f.room}/members`, f.cookie, {
    account_id: partner,
    active: true,
  });
  assert.equal((await ok(`/${f.room}/jobs`, peer)).jobs[0].id, j.id);
  assert.equal(
    (
      await req(`/${f.room}/jobs/cancel`, peer, {
        job_id: j.id,
        version: j.version,
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await ok("/jobs/drain", peer, {
        request_id: crypto.randomUUID(),
        room_id: f.room,
      })
    ).processed,
    false,
    "member cannot drain another requester's job",
  );
  await ok(`/${f.room}/members`, f.cookie, {
    account_id: partner,
    active: false,
  });
  await wait(Math.max(0, Date.parse(j.due_at) - Date.now() + 100));
  const ids = [crypto.randomUUID(), crypto.randomUUID()],
    results = await Promise.all(ids.map((id) => drain(f, id)));
  assert.equal(results.filter((result) => result.processed).length, 1);
  const completed = await state(f, j.id);
  assert.equal(completed.state, "SUCCEEDED");
  assert.equal(completed.attempt_count, 1);
  assert.ok(completed.run_id);
  const used = ids[results.findIndex((result) => result.processed)];
  assert.equal((await drain(f, used)).replayed, true);
  const run = (
    await admin.query(
      "select output,memory_ids,context_ids from kxra.team_runs where id=$1",
      [completed.run_id],
    )
  ).rows[0];
  assert.deepEqual(run.memory_ids, []);
  assert.deepEqual(run.context_ids, [f.message]);
  assert.ok(!run.output.includes(marker));
  const result = await ok(`/${f.room}/jobs`, f.cookie);
  assert.equal(result.attempts.length, 1);
  assert.equal(result.attempts[0].phase, "SUCCEEDED");
  assert.ok(!JSON.stringify(result).includes("lease_token"));
  assert.ok(!JSON.stringify(result).includes("encrypted_key"));
  assert.throws(
    () =>
      execFileSync(
        process.execPath,
        [
          path.resolve("node_modules/tsx/dist/cli.mjs"),
          "scripts/team-job-worker.ts",
          "--once",
          "--identity",
          "owner",
        ],
        {
          env: { ...process.env, NODE_ENV: "production" },
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
        },
      ),
    (error) =>
      /guarded local fixture runtime/.test(
        String((error as { stderr: unknown }).stderr),
      ),
  );
});

test("ephemeral worker processes persisted retries; expired leases recover with bounded attempts", async () => {
  const f = await knowledgeFixture(false),
    j = await enqueue(f),
    request = crypto.randomUUID(),
    c = await claim(partner, f.room, request);
  assert.equal(c.job_id, j.id);
  assert.equal(await claim(partner, f.room), null);
  assert.deepEqual(await claim(partner, f.room, request), { duplicate: true });
  assert.equal(
    (
      await as(app, partner, "select kxra.team_job_dispatch($1,$2,$3) value", [
        j.id,
        crypto.randomUUID(),
        await digest(j.id),
      ])
    ).rows[0].value,
    null,
  );
  await as(
    app,
    partner,
    "select kxra.team_job_release($1,$2,'WORKER_TEMPORARY')",
    [j.id, c.lease_token],
  );
  let released = await state(f, j.id);
  assert.equal(released.state, "QUEUED");
  assert.equal((await drain(f)).processed, false);
  await wait(Math.max(0, Date.parse(released.available_at) - Date.now() + 100));
  const output = execFileSync(
    process.execPath,
    [
      path.resolve("node_modules/tsx/dist/cli.mjs"),
      "scripts/team-job-worker.ts",
      "--once",
      "--identity",
      "partner",
    ],
    { env: process.env, encoding: "utf8", timeout: 60000 },
  );
  assert.equal(JSON.parse(output.trim()).state, "SUCCEEDED");
  released = await state(f, j.id);
  assert.equal(released.attempt_count, 2);
  const outsider = await knowledgeLogin("owner");
  assert.equal(
    (await req(`/${f.room}/jobs`, outsider)).status,
    404,
    "organisation owner has no private-room job bypass",
  );
  assert.equal(
    (
      await as(
        admin,
        owner,
        "select id from kxra.team_job_attempts where job_id=$1",
        [j.id],
      )
    ).rowCount,
    0,
  );
  assert.equal(
    (
      await as(
        admin,
        partner,
        "select id from kxra.team_job_attempts where job_id=$1",
        [j.id],
      )
    ).rowCount,
    2,
  );
  const next = await enqueue(f),
    old = await claim(partner, f.room);
  assert.equal(old.job_id, next.id);
  await wait(5100);
  const recovered = await claim(partner, f.room);
  assert.equal(recovered.job_id, next.id);
  assert.notEqual(recovered.lease_token, old.lease_token);
  assert.equal(
    (
      await as(app, partner, "select kxra.team_job_dispatch($1,$2,$3) value", [
        next.id,
        old.lease_token,
        await digest(next.id),
      ])
    ).rows[0].value,
    null,
  );
  await as(
    app,
    partner,
    "select kxra.team_job_release($1,$2,'WORKER_TEMPORARY')",
    [next.id, recovered.lease_token],
  );
  const retry = await state(f, next.id);
  await wait(Math.max(0, Date.parse(retry.available_at) - Date.now() + 100));
  const last = await claim(partner, f.room);
  await as(
    app,
    partner,
    "select kxra.team_job_release($1,$2,'WORKER_TEMPORARY')",
    [next.id, last.lease_token],
  );
  const failed = await state(f, next.id);
  assert.equal(failed.state, "FAILED");
  assert.equal(failed.attempt_count, 3);
  assert.equal(failed.run_id, null);
  const phases = (await ok(`/${f.room}/jobs`, f.cookie)).attempts
    .filter((a: { job_id: string }) => a.job_id === next.id)
    .map((a: { phase: string }) => a.phase);
  assert.deepEqual(phases, ["EXPIRED", "RELEASED", "FAILED"]);
  assert.equal(await claim(partner, f.room), null);
});

test("cancelled and expired dispatched jobs fence late completion and never replay uncertain outcomes", async () => {
  const f = await knowledgeFixture(false, "owner"),
    j = await enqueue(f),
    c = await claim(owner, f.room);
  assert.ok(await dispatch(owner, c));
  const running = await state(f, j.id);
  assert.equal(running.state, "DISPATCHED");
  await ok(`/${f.room}/jobs/cancel`, f.cookie, {
    job_id: j.id,
    version: running.version,
  });
  assert.equal(
    (
      await as(
        app,
        owner,
        "select kxra.team_job_finish($1,$2,'late output',null,0,0) published",
        [j.id, c.lease_token],
      )
    ).rows[0].published,
    false,
  );
  assert.equal(
    (
      await ok(`/${f.room}/jobs/cancel`, f.cookie, {
        job_id: j.id,
        version: running.version,
      })
    ).state,
    "CANCELLED",
  );
  const next = await enqueue(f),
    unknown = await claim(owner, f.room);
  assert.ok(await dispatch(owner, unknown));
  await wait(5100);
  assert.equal(
    (
      await as(
        app,
        owner,
        "select kxra.team_job_finish($1,$2,'must withhold',null,0,0) published",
        [next.id, unknown.lease_token],
      )
    ).rows[0].published,
    false,
  );
  const uncertain = await state(f, next.id);
  assert.equal(uncertain.state, "UNCERTAIN");
  assert.equal(uncertain.last_error, "WORKER_OUTCOME_UNKNOWN");
  assert.equal(await claim(owner, f.room), null);
  assert.equal((await drain(f)).processed, false);
  const rows = (
    await admin.query(
      "select status,output,error_code from kxra.team_runs where id=any($1::uuid[])",
      [[c.run_id, unknown.run_id]],
    )
  ).rows;
  assert.ok(
    rows.every((row) => row.status === "CANCELLED" && row.output === ""),
  );
  assert.equal(rows.length, 2);
  const leased = await enqueue(f),
    leasedClaim = await claim(owner, f.room),
    leasedState = await state(f, leased.id);
  await ok(`/${f.room}/jobs/cancel`, f.cookie, {
    job_id: leased.id,
    version: leasedState.version,
  });
  assert.equal(await dispatch(owner, leasedClaim), null);
  assert.equal((await state(f, leased.id)).run_id, null);
  const evidence = await knowledgeFixture(true),
    protectedJob = await enqueue(evidence, {
      chunk_ids: [evidence.chunks[0].id],
    }),
    protectedClaim = await claim(partner, evidence.room);
  assert.ok(await dispatch(partner, protectedClaim));
  await ok(`/${evidence.room}/files`, evidence.cookie, {
    file_version_id: evidence.version,
    active: false,
  });
  assert.equal(
    (
      await as(
        app,
        partner,
        "select kxra.team_job_finish($1,$2,'revoked evidence must not publish',null,0,0) published",
        [protectedJob.id, protectedClaim.lease_token],
      )
    ).rows[0].published,
    false,
  );
  assert.equal((await state(evidence, protectedJob.id)).state, "CANCELLED");
  assert.equal(
    (
      await as(admin, partner, "select id from kxra.team_runs where id=$1", [
        protectedClaim.run_id,
      ])
    ).rowCount,
    0,
  );
  assert.ok(
    !(await ok("/overview", evidence.cookie)).runs.some(
      (r: { id: string }) => r.id === protectedClaim.run_id,
    ),
  );
});

test("queued context, membership and tenant withdrawal fail closed without exposing payloads", async (t) => {
  const f = await knowledgeFixture(true),
    source = await enqueue(f, { chunk_ids: [f.chunks[0].id] });
  await ok(`/${f.room}/files`, f.cookie, {
    file_version_id: f.version,
    active: false,
  });
  assert.equal((await drain(f)).processed, false);
  assert.equal((await state(f, source.id)).state, "CANCELLED");
  const bad = await enqueue(f),
    badClaim = await claim(partner, f.room);
  assert.equal(
    (
      await as(app, partner, "select kxra.team_job_dispatch($1,$2,$3) value", [
        bad.id,
        badClaim.lease_token,
        "f".repeat(64),
      ])
    ).rows[0].value,
    null,
  );
  assert.equal((await state(f, bad.id)).last_error, "CONTEXT_CHANGED");
  const memory = await ok(`/${f.room}/memories`, f.cookie, {
    request_id: crypto.randomUUID(),
    agent_id: f.agent,
    kind: "REFERENCE",
    title: "Queue reference",
    body: "Scoped queued memory",
  });
  await ok(`/${f.room}/memory-review`, f.cookie, {
    memory_id: memory.id,
    state: "APPROVED",
  });
  const remembered = await enqueue(f, { use_memory: true });
  await ok(`/${f.room}/memory-review`, f.cookie, {
    memory_id: memory.id,
    state: "REVOKED",
  });
  assert.equal((await drain(f)).processed, false);
  assert.equal((await state(f, remembered.id)).state, "CANCELLED");
  const skill = await ok(`/${f.room}/skills`, f.cookie, {
    request_id: crypto.randomUUID(),
    name: "Queued instruction",
    instructions: "State missing evidence.",
  });
  await ok(`/${f.room}/skill-review`, f.cookie, {
    skill_id: skill.id,
    state: "APPROVED",
  });
  await ok(`/${f.room}/agent-skill`, f.cookie, {
    agent_id: f.agent,
    skill_id: skill.id,
    enabled: true,
  });
  const instructed = await enqueue(f);
  await ok(`/${f.room}/skill-review`, f.cookie, {
    skill_id: skill.id,
    state: "REVOKED",
  });
  assert.equal((await drain(f)).processed, false);
  assert.equal((await state(f, instructed.id)).state, "CANCELLED");
  const paused = await enqueue(f);
  await ok(`/${f.room}/agent-state`, f.cookie, {
    agent_id: f.agent,
    enabled: false,
  });
  assert.equal((await drain(f)).processed, false);
  assert.equal((await state(f, paused.id)).state, "CANCELLED");
  await ok(`/${f.room}/agent-state`, f.cookie, {
    agent_id: f.agent,
    enabled: true,
  });
  const connection = (await ok(`/${f.room}`, f.cookie)).agents.find(
    (a: { id: string }) => a.id === f.agent,
  ).connection_id;
  const disconnected = await enqueue(f);
  await ok(`/connections/${connection}`, f.cookie, { enabled: false });
  assert.equal((await drain(f)).processed, false);
  assert.equal((await state(f, disconnected.id)).state, "CANCELLED");
  await ok(`/connections/${connection}`, f.cookie, { enabled: true });
  const current = await enqueue(f),
    db = await admin.connect();
  assert.equal(
    (
      await as(
        admin,
        partner,
        "select kxra_private.team_job_context_active($1) active",
        [current.id],
      )
    ).rows[0].active,
    true,
  );
  try {
    await db.query("begin");
    await db.query(
      "update kxra.account_identities set session_version=session_version+1 where account_id=$1",
      [partner],
    );
    await db.query("set local role authenticated");
    await db.query(
      "select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true),set_config('request.kxra.org_id',$3,true)",
      [
        partner,
        JSON.stringify({
          sub: partner,
          aal: "aal2",
          auth_time: Math.floor(Date.now() / 1000),
        }),
        org,
      ],
    );
    assert.equal(
      (
        await db.query(
          "select kxra_private.team_job_context_active($1) active",
          [current.id],
        )
      ).rows[0].active,
      false,
    );
  } finally {
    await db.query("rollback");
    db.release();
  }
  assert.equal(
    (
      await as(
        admin,
        partner,
        "select kxra_private.team_job_context_active($1) active",
        [current.id],
      )
    ).rows[0].active,
    true,
    "fixture identity change was rolled back without changing the queued snapshot",
  );
  const other = crypto.randomUUID();
  await admin.query(
    "insert into kxra.organisations(id,name,slug) values($1,'Synthetic queued tenant',$2)",
    [other, "queue-" + crypto.randomUUID()],
  );
  const membership = (
    await admin.query(
      "insert into kxra.organisation_memberships(org_id,account_id,security_role,relationship_type,state,display_name,grant_source) values($1,$2,'ORG_ADMIN','CUSTOMER','ACTIVE','Queue fixture','AT_QUEUE') returning id",
      [other, partner],
    )
  ).rows[0].id;
  t.after(() =>
    admin.query(
      "update kxra.organisation_memberships set state='REVOKED',revoked_at=now() where id=$1",
      [membership],
    ),
  );
  const session = await knowledgeLogin(),
    selected = await fetch(base + "/api/context", {
      method: "POST",
      headers: {
        origin: base,
        cookie: session,
        "content-type": "application/json",
      },
      body: JSON.stringify({ organisation_id: other }),
    });
  assert.equal(selected.status, 200);
  const jar = new Map(
    session.split("; ").map((pair) => {
      const n = pair.indexOf("=");
      return [pair.slice(0, n), pair.slice(n + 1)];
    }),
  );
  for (const raw of selected.headers.getSetCookie()) {
    const pair = raw.split(";", 1)[0],
      n = pair.indexOf("=");
    jar.set(pair.slice(0, n), pair.slice(n + 1));
  }
  const cookie = [...jar].map(([k, v]) => k + "=" + v).join("; ");
  assert.equal((await req(`/${f.room}/jobs`, cookie)).status, 404);
  assert.equal(
    (
      await req("/jobs/drain", cookie, {
        request_id: crypto.randomUUID(),
        room_id: f.room,
      })
    ).status,
    404,
  );
  await assert.rejects(claim(partner, f.room, crypto.randomUUID(), other), {
    code: "42501",
  });
  assert.equal(
    (
      await as(
        app,
        partner,
        "select kxra.team_job_claim($1,null,5) claim",
        [crypto.randomUUID()],
        other,
      )
    ).rows[0].claim,
    null,
  );
  assert.equal(
    (
      await as(
        admin,
        partner,
        "select id from kxra.team_jobs where id=$1",
        [current.id],
        other,
      )
    ).rowCount,
    0,
  );
  // Close this synthetic second membership before reusing a cookie that was
  // issued while only one organisation existed. The 428 guard stays intact.
  await admin.query(
    "update kxra.organisation_memberships set state='REVOKED',revoked_at=now() where id=$1",
    [membership],
  );
  await ok(`/${f.room}/jobs/cancel`, f.cookie, {
    job_id: current.id,
    version: current.version,
  });
  const shared = await knowledgeFixture(false, "owner"),
    peer = await knowledgeLogin();
  await ok(`/${shared.room}/members`, shared.cookie, {
    account_id: partner,
    active: true,
  });
  const memberJob = await ok(`/${shared.room}/jobs`, peer, input(shared));
  await ok(`/${shared.room}/members`, shared.cookie, {
    account_id: partner,
    active: false,
  });
  assert.equal((await req(`/${shared.room}/jobs`, peer)).status, 404);
  assert.equal(
    (
      await as(admin, partner, "select id from kxra.team_jobs where id=$1", [
        memberJob.id,
      ])
    ).rowCount,
    0,
  );
  assert.equal(
    (await ok("/jobs/drain", peer, { request_id: crypto.randomUUID() }))
      .processed,
    false,
  );
  assert.equal(
    (
      await admin.query("select state from kxra.team_jobs where id=$1", [
        memberJob.id,
      ])
    ).rows[0].state,
    "CANCELLED",
  );
});

test("concurrent cancellation preserves version fences and bounded queue admission", async () => {
  const f = await knowledgeFixture(false),
    queued = await enqueue(f);
  await assert.rejects(
    as(app, partner, "select kxra.team_job_cancel($1,$2,null)", [
      f.room,
      queued.id,
    ]),
    { code: "P0001" },
  );
  await assert.rejects(
    as(app, partner, "select kxra.team_job_claim(null,$1,5)", [f.room]),
    { code: "42501" },
  );
  await assert.rejects(
    as(app, partner, "select kxra.team_job_claim($1,$2,null)", [
      crypto.randomUUID(),
      f.room,
    ]),
    { code: "42501" },
  );
  assert.equal((await state(f, queued.id)).state, "QUEUED");
  const [claimed, cancelled] = await Promise.all([
    claim(partner, f.room),
    req(`/${f.room}/jobs/cancel`, f.cookie, {
      job_id: queued.id,
      version: queued.version,
    }),
  ]);
  if (cancelled.status === 200) {
    assert.equal(claimed, null);
    assert.equal((await state(f, queued.id)).state, "CANCELLED");
  } else {
    assert.equal(cancelled.status, 409);
    assert.equal(claimed.job_id, queued.id);
    const leased = await state(f, queued.id);
    assert.equal(leased.state, "LEASED");
    assert.ok(leased.version > queued.version);
    await ok(`/${f.room}/jobs/cancel`, f.cookie, {
      job_id: queued.id,
      version: leased.version,
    });
    assert.equal(await dispatch(partner, claimed), null);
  }
  const job = await enqueue(f),
    active = await claim(partner, f.room);
  assert.ok(await dispatch(partner, active));
  const dispatched = await state(f, job.id);
  const [cancelResponse, finished] = await Promise.all([
    req(`/${f.room}/jobs/cancel`, f.cookie, {
      job_id: job.id,
      version: dispatched.version,
    }),
    as(
      app,
      partner,
      "select kxra.team_job_finish($1,$2,'completed before accepted cancellation',null,0,0) published",
      [job.id, active.lease_token],
    ),
  ]);
  const final = await state(f, job.id),
    run = (
      await admin.query(
        "select status,output from kxra.team_runs where id=$1",
        [active.run_id],
      )
    ).rows[0];
  if (cancelResponse.status === 200) {
    assert.equal(finished.rows[0].published, false);
    assert.equal(final.state, "CANCELLED");
    assert.equal(run.output, "");
  } else {
    assert.equal(cancelResponse.status, 409);
    assert.equal(finished.rows[0].published, true);
    assert.equal(final.state, "SUCCEEDED");
    assert.equal(run.output, "completed before accepted cancellation");
  }
  assert.equal(
    (
      await as(
        app,
        partner,
        "select kxra.team_job_finish($1,$2,'duplicate must not replace output',null,0,0) published",
        [job.id, active.lease_token],
      )
    ).rows[0].published,
    false,
  );
  const pending = [];
  for (let n = 0; n < 20; n++)
    pending.push(
      await enqueue(f, {
        due_at: new Date(Date.now() + 3600000).toISOString(),
      }),
    );
  assert.equal(
    (
      await req(`/${f.room}/jobs`, f.cookie, {
        ...input(f),
        due_at: new Date(Date.now() + 3600000).toISOString(),
      })
    ).status,
    409,
  );
  for (const entry of pending)
    await ok(`/${f.room}/jobs/cancel`, f.cookie, {
      job_id: entry.id,
      version: entry.version,
    });
  assert.ok(
    (await jobs(f)).every(
      (j: { state: string }) =>
        !["QUEUED", "LEASED", "DISPATCHED"].includes(j.state),
    ),
  );
});
