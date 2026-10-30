import { test, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import pg from "pg";
import { runtimeFile } from "../support/runtime";
import { knowledgeFixture, knowledgeOk as ok } from "../support/team-knowledge";
import { roomWorkerAuthorized } from "../../packages/workspace/room-worker-auth";
import { hostedRoomOperations } from "../../packages/workspace/hosted-operations";
const config = JSON.parse(
  fs.readFileSync(runtimeFile("database.json"), "utf8"),
);
const app = new pg.Pool(config),
  admin = new pg.Pool({ ...config, user: os.userInfo().username });
after(async () => {
  await app.end();
  await admin.end();
});
const org = "10000000-0000-4000-8000-000000000001",
  owner = "20000000-0000-4000-8000-000000000001",
  partner = "20000000-0000-4000-8000-000000000002";
async function as(
  actor: string,
  sql: string,
  values: unknown[] = [],
  grant = "",
  tenant = org,
  aal = "aal2",
  age = 0,
) {
  const db = await app.connect();
  try {
    await db.query("begin");
    await db.query("set local role authenticated");
    await db.query(
      "select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true),set_config('request.kxra.org_id',$3,true),set_config('request.kxra.hosted_room_jobs','on',true),set_config('request.kxra.team_grant',$4,true)",
      [
        actor,
        JSON.stringify({
          sub: actor,
          aal,
          auth_time: Math.floor(Date.now() / 1000) - age,
        }),
        tenant,
        grant,
      ],
    );
    const result = await db.query(sql, values);
    await db.query("commit");
    return result.rows;
  } catch (e) {
    await db.query("rollback");
    throw e;
  } finally {
    db.release();
  }
}
test("hosted delivery authentication is explicit, default off and independent from browser sessions", () => {
  const key = "a".repeat(64),
    env = {
      KXRA_HOSTED_ROOM_JOBS: "true",
      KXRA_AUTH_MODE: "supabase",
      KXRA_ROOM_WORKER_SECRET: key,
    };
  assert.equal(hostedRoomOperations({}), false);
  assert.equal(roomWorkerAuthorized("Bearer " + key, env), true);
  for (const header of [
    null,
    "",
    key,
    "Bearer " + key + "x",
    "Bearer " + "b".repeat(64),
    "Cookie: session=secret",
  ])
    assert.equal(roomWorkerAuthorized(header, env), false);
  for (const bad of [
    {},
    { ...env, KXRA_HOSTED_ROOM_JOBS: "false" },
    { ...env, KXRA_AUTH_MODE: "fixture" },
    { ...env, KXRA_ROOM_WORKER_SECRET: "short" },
  ])
    assert.equal(roomWorkerAuthorized("Bearer " + key, bad), false);
});
test("native hosted grant scope, authority withdrawal, replay and concurrent delivery use actual app login", async () => {
  await admin.query(
    fs.readFileSync("proposals/hosted-room-operations.sql", "utf8"),
  );
  const f = await knowledgeFixture(false, "owner");
  const input = () => ({
    request_id: crypto.randomUUID(),
    agent_id: f.agent,
    message_id: f.message,
    context: "THREAD",
    chunk_ids: [],
    use_memory: false,
  });
  const one = await ok(`/${f.room}/jobs`, f.cookie, input()),
    two = await ok(`/${f.room}/jobs`, f.cookie, input());
  for (const [assurance, age] of [
    ["aal1", 0],
    ["aal2", 700],
  ] as const)
    await assert.rejects(
      as(
        owner,
        "select kxra.team_execution_authorize($1,now()+interval '1 hour')",
        [one.id],
        "",
        org,
        assurance,
        age,
      ),
      { code: "42501" },
    );
  const grant = (
    await as(
      owner,
      "select kxra.team_execution_authorize($1,now()+interval '1 hour') id",
      [one.id],
    )
  )[0].id;
  assert.equal(
    (
      await as(
        owner,
        "select kxra_private.team_execution_grant_active($1) active",
        [grant],
      )
    )[0].active,
    true,
  );
  assert.equal(
    (
      await as(
        owner,
        "select kxra_private.team_execution_grant_validate($1) active",
        [grant],
      )
    )[0].active,
    true,
  );
  assert.equal(
    (
      await as(
        partner,
        "select kxra_private.team_execution_grant_validate($1) active",
        [grant],
      )
    )[0].active,
    false,
  );
  assert.equal(
    (
      await as(
        partner,
        "select kxra_private.team_execution_grant_active($1) active",
        [grant],
      )
    )[0].active,
    false,
  );
  assert.equal(
    (
      await as(
        owner,
        "select kxra_private.team_execution_grant_active($1) active",
        [grant],
        "",
        crypto.randomUUID(),
      )
    )[0].active,
    false,
  );
  await assert.rejects(
    as(
      partner,
      "select kxra.team_execution_authorize($1,now()+interval '1 hour')",
      [one.id],
    ),
    { code: "42501" },
  );
  await assert.rejects(
    as(owner, "select kxra_room_worker.next($1)", [crypto.randomUUID()]),
    { code: "42501" },
  );
  await assert.rejects(
    as(owner, "update kxra.team_execution_grants set requested_by=$1", [
      partner,
    ]),
    { code: "42501" },
  );
  const peer = await knowledgeFixture(false, "partner");
  const peerJob = await ok(`/${peer.room}/jobs`, peer.cookie, {
    request_id: crypto.randomUUID(),
    agent_id: peer.agent,
    message_id: peer.message,
    context: "THREAD",
    chunk_ids: [],
    use_memory: false,
  });
  const peerGrant = (
    await as(
      partner,
      "select kxra.team_execution_authorize($1,now()+interval '1 hour') id",
      [peerJob.id],
    )
  )[0].id;
  const scopes = (
    await Promise.all(
      Array.from({ length: 12 }, () =>
        app.query("select kxra_room_worker.next($1) scope", [
          crypto.randomUUID(),
        ]),
      ),
    )
  )
    .flatMap((r) => r.rows.map((r) => r.scope))
    .filter(Boolean);
  assert.equal(scopes.filter((s) => s.grant_id === grant).length, 1);
  assert.equal(scopes.filter((s) => s.grant_id === peerGrant).length, 1);
  const selected = scopes.find((s) => s.grant_id === grant);
  assert.equal(selected.actor.id, owner);
  assert.equal(selected.actor.organisation_id, org);
  assert.equal(selected.actor.room_worker_grant, grant);
  const replay = crypto.randomUUID();
  await app.query("select kxra_room_worker.next($1)", [replay]);
  assert.equal(
    (await app.query("select kxra_room_worker.next($1) scope", [replay]))
      .rows[0].scope,
    null,
  );
  assert.equal(
    (
      await as(
        owner,
        "select kxra_private.team_worker_target($1) allowed",
        [two.id],
        grant,
      )
    )[0].allowed,
    false,
  );
  const claims = await Promise.all(
    Array.from({ length: 8 }, () =>
      as(
        owner,
        "select kxra.team_job_claim($1,$2,5) claim",
        [crypto.randomUUID(), f.room],
        grant,
      ),
    ),
  );
  const claimed = claims
    .flat()
    .map((r) => r.claim)
    .filter(Boolean);
  assert.equal(claimed.length, 1);
  assert.equal(claimed[0].job_id, one.id);
  // A revoked grant cannot dispatch or publish; the ordinary stop endpoint remains available.
  await as(owner, "select kxra.team_execution_revoke($1)", [one.id]);
  assert.equal(
    (
      await as(
        owner,
        "select kxra_private.team_execution_grant_active($1) active",
        [grant],
      )
    )[0].active,
    false,
  );
  const c = claimed[0];
  assert.equal(
    (
      await as(
        owner,
        "select kxra.team_job_dispatch($1,$2,$3) connection",
        [one.id, c.lease_token, "0".repeat(64)],
        grant,
      )
    )[0].connection,
    null,
  );
  assert.equal(
    (
      await admin.query("select state from kxra.team_jobs where id=$1", [
        one.id,
      ])
    ).rows[0].state,
    "CANCELLED",
  );
  const j = (await ok(`/${f.room}/jobs`, f.cookie)).jobs.find(
    (j: { id: string }) => j.id === two.id,
  );
  await ok(`/${f.room}/jobs/cancel`, f.cookie, {
    job_id: two.id,
    version: j.version,
  });
  // Expiry and session-version changes are independent fences.
  const third = await ok(`/${f.room}/jobs`, f.cookie, input());
  const g = (
    await as(
      owner,
      "select kxra.team_execution_authorize($1,now()+interval '1 hour') id",
      [third.id],
    )
  )[0].id;
  await admin.query(
    "update kxra.team_execution_grants set expires_at=now()-interval '1 second' where id=$1",
    [g],
  );
  assert.equal(
    (
      await as(
        owner,
        "select kxra_private.team_execution_grant_active($1) active",
        [g],
      )
    )[0].active,
    false,
  );
  await admin.query(
    "update kxra.team_execution_grants set expires_at=now()+interval '1 hour',session_version=session_version+1 where id=$1",
    [g],
  );
  assert.equal(
    (
      await as(
        owner,
        "select kxra_private.team_execution_grant_active($1) active",
        [g],
      )
    )[0].active,
    false,
  ); // A reviewed schedule can spawn only its exact pinned child under its grant.
  const definition = crypto.randomUUID();
  await ok(`/${f.room}/schedules`, f.cookie, {
    request_id: definition,
    agent_id: f.agent,
    message_id: f.message,
    context: "THREAD",
    chunk_ids: [],
    use_memory: false,
    name: "Scoped hosted schedule fixture",
    timezone: "UTC",
    wall_time: "00:00",
    starts_on: new Date().toISOString().slice(0, 10),
    expires_at: new Date(Date.now() + 2 * 86400000).toISOString(),
    max_occurrences: 2,
  });
  const schedule = (await ok(`/${f.room}/schedules`, f.cookie)).schedules.find(
    (s: { id: string }) => s.id === definition,
  );
  await ok(`/${f.room}/schedules/review`, f.cookie, {
    schedule_id: definition,
    version: schedule.version,
    action: "ACTIVATE",
  });
  const scheduleGrant = (
    await as(
      owner,
      "select kxra.team_execution_authorize($1,now()+interval '1 day') id",
      [definition],
    )
  )[0].id;
  const tick = crypto.randomUUID();
  assert.equal(
    (
      await as(
        owner,
        "select kxra.team_schedule_tick($1,$2) fresh",
        [tick, f.room],
        scheduleGrant,
      )
    )[0].fresh,
    true,
  );
  assert.equal(
    (
      await as(
        owner,
        "select kxra.team_schedule_tick($1,$2) fresh",
        [tick, f.room],
        scheduleGrant,
      )
    )[0].fresh,
    false,
  );
  const child = (
    await as(
      owner,
      "select kxra.team_job_claim($1,$2,45) claim",
      [crypto.randomUUID(), f.room],
      scheduleGrant,
    )
  )[0].claim;
  assert.ok(child);
  const digest = (
    await admin.query("select context_sha256 from kxra.team_jobs where id=$1", [
      child.job_id,
    ])
  ).rows[0].context_sha256;
  assert.ok(
    (
      await as(
        owner,
        "select kxra.team_job_dispatch($1,$2,$3) connection",
        [child.job_id, child.lease_token, digest],
        scheduleGrant,
      )
    )[0].connection,
  );
  assert.equal(
    (
      await as(
        owner,
        "select kxra.team_job_finish($1,$2,$3,null,0,0) done",
        [child.job_id, child.lease_token, "Synthetic scoped result"],
        scheduleGrant,
      )
    )[0].done,
    true,
  );
  assert.equal(
    (
      await as(
        owner,
        "select kxra.team_job_finish($1,$2,$3,null,0,0) done",
        [child.job_id, child.lease_token, "Duplicate result"],
        scheduleGrant,
      )
    )[0].done,
    false,
  );
  // Leave no eligible native work for the existing global fixture-worker tests.
  for (const fixture of [f, peer]) {
    const catalog = await ok(`/${fixture.room}/jobs`, fixture.cookie);
    for (const job of catalog.jobs.filter((job: { state: string }) =>
      ["QUEUED", "LEASED", "DISPATCHED"].includes(job.state),
    ))
      await ok(`/${fixture.room}/jobs/cancel`, fixture.cookie, {
        job_id: job.id,
        version: job.version,
      });
  }
  const latest = (await ok(`/${f.room}/schedules`, f.cookie)).schedules.find(
    (schedule: { id: string }) => schedule.id === definition,
  );
  await ok(`/${f.room}/schedules/review`, f.cookie, {
    schedule_id: definition,
    version: latest.version,
    action: "PAUSE",
  });
});
