import { test, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import pg from "pg";
import {
  OperationsFixtureScope,
  fixtureWorkerQuery,
} from "./fixture-isolation";
import { runtimeFile } from "../support/runtime";
import {
  knowledgeFixture as baseKnowledgeFixture,
  knowledgeOk as ok,
} from "../support/team-knowledge";
import { roomWorkerAuthorized } from "../../packages/workspace/room-worker-auth";
import { hostedRoomOperations } from "../../packages/workspace/hosted-operations";
import { ensureRoomOperationsSchema } from "../support/room-operations-schema";
import { localModeConfiguration } from "../../packages/authz/local-guard";
assert.ok(
  localModeConfiguration(process.env) && !process.env.VERCEL_ENV,
  "Native operations require the guarded generated fixture runtime",
);
const config = JSON.parse(
  fs.readFileSync(runtimeFile("database.json"), "utf8"),
);
assert.ok(
  typeof config.host === "string" &&
    config.host.startsWith("/") &&
    !config.password,
  "Native operations require a private local Unix socket without provider credentials",
);
const app = new pg.Pool(config),
  admin = new pg.Pool({ ...config, user: os.userInfo().username });
const fixtureScope = new OperationsFixtureScope(config);
afterEach(async () => fixtureScope.cleanup(admin));
after(async () => {
  try {
    await fixtureScope.cleanup(admin);
  } finally {
    await app.end();
    await admin.end();
  }
});
async function knowledgeFixture(
  ...args: Parameters<typeof baseKnowledgeFixture>
) {
  const fixture = await baseKnowledgeFixture(...args);
  fixtureScope.room(fixture.room);
  return fixture;
}
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
      "select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true),set_config('request.kxra.org_id',$3,true),set_config('request.kxra.hosted_room_jobs','on',true),set_config('request.kxra.execution_mode','fixture',true),set_config('request.kxra.team_grant',$4,true)",
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
  await ensureRoomOperationsSchema(admin, config);
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
        fixtureWorkerQuery(
          app,
          config,
          "select kxra_room_worker.next($1) scope",
          [crypto.randomUUID()],
        ),
      ),
    )
  )
    .flatMap((r) => r.rows.map((r) => r.scope))
    .filter(Boolean);
  // Maintenance may hold both rows while concurrent deliveries SKIP LOCKED.
  // A burst may therefore emit only one scope, but never duplicate a grant.
  for (const id of [grant, peerGrant])
    assert.ok(scopes.filter((scope) => scope.grant_id === id).length <= 1);
  const serial = await fixtureWorkerQuery(
    app,
    config,
    "select kxra_room_worker.next($1) scope",
    [crypto.randomUUID()],
  );
  if (serial.rows[0].scope) scopes.push(serial.rows[0].scope);
  assert.equal(scopes.filter((s) => s.grant_id === grant).length, 1);
  assert.equal(scopes.filter((s) => s.grant_id === peerGrant).length, 1);
  const selected = scopes.find((s) => s.grant_id === grant);
  assert.equal(selected.actor.id, owner);
  assert.equal(selected.actor.organisation_id, org);
  assert.equal(selected.actor.room_worker_grant, grant);
  const replay = crypto.randomUUID();
  await fixtureWorkerQuery(app, config, "select kxra_room_worker.next($1)", [
    replay,
  ]);
  assert.equal(
    (
      await fixtureWorkerQuery(
        app,
        config,
        "select kxra_room_worker.next($1) scope",
        [replay],
      )
    ).rows[0].scope,
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

test("hosted queued execution cannot omit a grant or outlive its authority; fresh admission and fixture drain remain separate", async () => {
  const f = await knowledgeFixture(false, "owner");
  async function mutate(sql: string, values: unknown[]) {
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
  async function admission(job: string) {
    // The admission helper remains private. Only the generated fixture admin
    // inspects its truth value; application issuance uses its public guarded RPC.
    const db = await admin.connect();
    try {
      await db.query("begin");
      await db.query(
        "select set_config('request.jwt.claim.sub',$1,true),set_config('request.kxra.org_id',$2,true),set_config('request.kxra.execution_mode','fixture',true)",
        [owner, org],
      );
      return (
        await db.query(
          "select kxra_private.team_job_base_context_active($1) active",
          [job],
        )
      ).rows[0].active;
    } finally {
      await db.query("rollback");
      db.release();
    }
  }
  async function make() {
    const job = await ok(`/${f.room}/jobs`, f.cookie, {
      request_id: crypto.randomUUID(),
      agent_id: f.agent,
      message_id: f.message,
      context: "THREAD",
      chunk_ids: [],
      use_memory: false,
    });
    // Admission must succeed before any delegation exists; it does not permit dispatch.
    assert.equal(await admission(job.id), true);
    assert.equal(
      (
        await as(owner, "select kxra_private.team_worker_target($1) active", [
          job.id,
        ])
      )[0].active,
      false,
    );
    const grant = (
      await as(
        owner,
        "select kxra.team_execution_authorize($1,now()+interval '1 hour') id",
        [job.id],
      )
    )[0].id;
    const digest = (
      await admin.query(
        "select context_sha256 from kxra.team_jobs where id=$1",
        [job.id],
      )
    ).rows[0].context_sha256;
    return {
      job: job.id as string,
      grant: grant as string,
      digest: digest as string,
    };
  }
  async function claim(v: Awaited<ReturnType<typeof make>>, grant: string) {
    return (
      await as(
        owner,
        "select kxra.team_job_claim($1,$2,45) claim",
        [crypto.randomUUID(), f.room],
        grant,
      )
    )[0].claim;
  }
  async function stop(job: string) {
    const row = (
      await admin.query(
        "select state,version from kxra.team_jobs where id=$1",
        [job],
      )
    ).rows[0];
    if (["QUEUED", "LEASED", "DISPATCHED"].includes(row.state))
      await as(owner, "select kxra.team_job_cancel($1,$2,$3)", [
        f.room,
        job,
        row.version,
      ]);
  }
  // A current valid grant cannot be omitted from hosted SQL, even with a current
  // ordinary principal. The missing execution-mode GUC must coalesce to denial.
  const omitted = await make();
  assert.equal(await claim(omitted, ""), null);
  const claimed = await claim(omitted, omitted.grant);
  assert.ok(claimed);
  assert.equal(
    (
      await as(owner, "select kxra.team_job_dispatch($1,$2,$3) connection", [
        omitted.job,
        claimed.lease_token,
        omitted.digest,
      ])
    )[0].connection,
    null,
  );
  await stop(omitted.job);
  const omittedFinish = await make();
  const finishing = await claim(omittedFinish, omittedFinish.grant);
  assert.ok(
    (
      await as(
        owner,
        "select kxra.team_job_dispatch($1,$2,$3) connection",
        [omittedFinish.job, finishing.lease_token, omittedFinish.digest],
        omittedFinish.grant,
      )
    )[0].connection,
  );
  assert.equal(
    (
      await as(owner, "select kxra.team_job_finish($1,$2,$3,null,0,0) done", [
        omittedFinish.job,
        finishing.lease_token,
        "Must never publish",
      ])
    )[0].done,
    false,
  );
  assert.equal(
    (
      await admin.query("select output from kxra.team_runs where id=$1", [
        finishing.run_id,
      ])
    ).rows[0].output,
    "",
  );
  await stop(omittedFinish.job);

  for (const reason of [
    "expiry",
    "revocation",
    "connection",
    "membership",
  ] as const) {
    for (const phase of ["claim", "dispatch", "finish"] as const) {
      for (const supplied of [false, true]) {
        const v = await make();
        const lease = phase === "claim" ? null : await claim(v, v.grant);
        if (phase !== "claim") assert.ok(lease);
        if (phase === "finish")
          assert.ok(
            (
              await as(
                owner,
                "select kxra.team_job_dispatch($1,$2,$3) connection",
                [v.job, lease.lease_token, v.digest],
                v.grant,
              )
            )[0].connection,
          );
        if (reason === "expiry")
          await admin.query(
            "update kxra.team_execution_grants set expires_at=now()-interval '1 second' where id=$1",
            [v.grant],
          );
        else if (reason === "revocation")
          await as(owner, "select kxra.team_execution_revoke($1)", [v.job]);
        else if (reason === "connection")
          await mutate(
            "update kxra.team_connections set model=model||'-x' where id=(select connection_id from kxra.team_agents where id=$1)",
            [f.agent],
          );
        else
          await mutate(
            "update kxra.organisation_memberships set version=version+1 where account_id=$1 and org_id=$2",
            [owner, org],
          );
        // These changes leave normal current room/source authority intact. The
        // persisted delegation fingerprint/version/expiry is the failing fence.
        assert.equal(await admission(v.job), true);
        assert.equal(
          (
            await as(
              owner,
              "select kxra_private.team_job_context_active($1) active",
              [v.job],
              v.grant,
            )
          )[0].active,
          false,
        );
        const grant = supplied ? v.grant : "";
        if (phase === "claim") assert.equal(await claim(v, grant), null);
        else if (phase === "dispatch")
          assert.equal(
            (
              await as(
                owner,
                "select kxra.team_job_dispatch($1,$2,$3) connection",
                [v.job, lease.lease_token, v.digest],
                grant,
              )
            )[0].connection,
            null,
          );
        else {
          assert.equal(
            (
              await as(
                owner,
                "select kxra.team_job_finish($1,$2,$3,null,0,0) done",
                [v.job, lease.lease_token, "Must never publish"],
                grant,
              )
            )[0].done,
            false,
          );
          assert.equal(
            (
              await admin.query(
                "select output from kxra.team_runs where id=$1",
                [lease.run_id],
              )
            ).rows[0].output,
            "",
          );
        }
        await stop(v.job);
      }
    }
  }
  // Normal fresh-MFA issuance and a fully grant-bearing runtime still succeed.
  const valid = await make();
  const lease = await claim(valid, valid.grant);
  assert.ok(
    (
      await as(
        owner,
        "select kxra.team_job_dispatch($1,$2,$3) connection",
        [valid.job, lease.lease_token, valid.digest],
        valid.grant,
      )
    )[0].connection,
  );
  assert.equal(
    (
      await as(
        owner,
        "select kxra.team_job_finish($1,$2,$3,null,0,0) done",
        [valid.job, lease.lease_token, "Synthetic scoped success"],
        valid.grant,
      )
    )[0].done,
    true,
  );
});

test("failed MFA rolls admission and activation back; canonical replays never renew delegation", async () => {
  const f = await knowledgeFixture(false, "owner");
  const input = {
    request_id: crypto.randomUUID(),
    agent_id: f.agent,
    message_id: f.message,
    context: "THREAD",
    chunk_ids: [],
    use_memory: false,
  };
  const job = await ok(`/${f.room}/jobs`, f.cookie, input);
  const grant = (
    await as(
      owner,
      "select kxra.team_execution_authorize($1,now()+interval '1 hour') id",
      [job.id],
    )
  )[0].id;
  async function deniedAtomic(
    work: (db: pg.PoolClient, beforeAuthorize: () => void) => Promise<void>,
  ) {
    let reachedAuthorize = false;
    const db = await app.connect();
    try {
      await db.query("begin");
      await db.query("set local role authenticated");
      await db.query(
        "select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true),set_config('request.kxra.org_id',$3,true),set_config('request.kxra.hosted_room_jobs','on',true),set_config('request.kxra.execution_mode','fixture',true),set_config('request.kxra.team_grant','',true)",
        [
          owner,
          JSON.stringify({
            sub: owner,
            aal: "aal1",
            auth_time: Math.floor(Date.now() / 1000),
          }),
          org,
        ],
      );
      await work(db, () => {
        reachedAuthorize = true;
      });
      assert.fail("Fresh MFA must be required before committing a delegation");
    } catch (error) {
      await db.query("rollback");
      assert.equal(
        reachedAuthorize,
        true,
        "The transaction must pass fixture admission/review before testing the MFA issuance guard",
      );
      assert.equal((error as { code?: string }).code, "42501");
    } finally {
      db.release();
    }
  }
  // Snapshot only this owned synthetic row through guarded fixture admin.
  // The authenticated transaction must not SELECT private pinned columns just
  // to construct the enqueue call whose later MFA denial is under test.
  const pinned = (
    await admin.query(
      "select room_id,agent_id,message_id,context_mode,context_ids,context_sha256,chunk_ids,chunk_hashes,skill_ids,skill_hashes,memory_ids,memory_hashes from kxra.team_jobs where id=$1 and requested_by=$2 and org_id=$3",
      [job.id, owner, org],
    )
  ).rows[0];
  assert.ok(pinned);
  const canonical = crypto.randomUUID();
  await deniedAtomic(async (db, beforeAuthorize) => {
    await db.query(
      "select kxra.team_job_enqueue($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,null,$14)",
      [
        canonical,
        pinned.room_id,
        pinned.agent_id,
        pinned.message_id,
        pinned.context_mode,
        pinned.context_ids,
        pinned.context_sha256,
        pinned.chunk_ids,
        pinned.chunk_hashes,
        pinned.skill_ids,
        pinned.skill_hashes,
        pinned.memory_ids,
        pinned.memory_hashes,
        crypto.randomBytes(32).toString("hex"),
      ],
    );
    beforeAuthorize();
    await db.query(
      "select kxra.team_execution_authorize($1,now()+interval '1 hour')",
      [canonical],
    );
  });
  assert.equal(
    (
      await admin.query(
        "select count(*)::integer n from kxra.team_jobs where id=$1",
        [canonical],
      )
    ).rows[0].n,
    0,
  );
  assert.equal(
    (
      await admin.query(
        "select count(*)::integer n from kxra.team_execution_grants where target_id=$1",
        [canonical],
      )
    ).rows[0].n,
    0,
  );
  const definition = crypto.randomUUID();
  await ok(`/${f.room}/schedules`, f.cookie, {
    ...input,
    request_id: definition,
    name: "Atomic reviewed definition",
    timezone: "UTC",
    wall_time: "00:00",
    starts_on: new Date().toISOString().slice(0, 10),
    expires_at: new Date(Date.now() + 86400000).toISOString(),
    max_occurrences: 1,
  });
  const before = (
    await admin.query(
      "select state,version from kxra.team_schedules where id=$1",
      [definition],
    )
  ).rows[0];
  await deniedAtomic(async (db, beforeAuthorize) => {
    await db.query("select kxra.team_schedule_review($1,$2,$3,'ACTIVATE')", [
      f.room,
      definition,
      before.version,
    ]);
    beforeAuthorize();
    await db.query(
      "select kxra.team_execution_authorize($1,expires_at) from kxra.team_schedules where id=$1",
      [definition],
    );
  });
  assert.deepEqual(
    (
      await admin.query(
        "select state,version from kxra.team_schedules where id=$1",
        [definition],
      )
    ).rows[0],
    before,
  );
  assert.equal(
    (
      await admin.query(
        "select count(*)::integer n from kxra.team_execution_grants where target_id=$1",
        [definition],
      )
    ).rows[0].n,
    0,
  );
  await as(owner, "select kxra.team_execution_revoke($1)", [job.id]);
  const snapshot = (
    await admin.query(
      "select id,expires_at,revoked_at,connection_sha256,auth_time from kxra.team_execution_grants where id=$1",
      [grant],
    )
  ).rows[0];
  await ok(`/${f.room}/jobs`, f.cookie, input);
  assert.deepEqual(
    (
      await admin.query(
        "select id,expires_at,revoked_at,connection_sha256,auth_time from kxra.team_execution_grants where id=$1",
        [grant],
      )
    ).rows[0],
    snapshot,
  );
  const db = await admin.connect();
  try {
    await db.query("begin");
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [
      owner,
    ]);
    await db.query(
      "update kxra.team_connections set model=model||'-reconfigured' where id=(select connection_id from kxra.team_agents where id=$1)",
      [f.agent],
    );
    await db.query(
      "update kxra.team_execution_grants set expires_at=now()-interval '1 second' where id=$1",
      [grant],
    );
    await db.query("commit");
  } catch (error) {
    await db.query("rollback");
    throw error;
  } finally {
    db.release();
  }
  const expired = (
    await admin.query(
      "select id,expires_at,revoked_at,connection_sha256,auth_time from kxra.team_execution_grants where id=$1",
      [grant],
    )
  ).rows[0];
  await ok(`/${f.room}/jobs`, f.cookie, input);
  assert.deepEqual(
    (
      await admin.query(
        "select id,expires_at,revoked_at,connection_sha256,auth_time from kxra.team_execution_grants where id=$1",
        [grant],
      )
    ).rows[0],
    expired,
  );
  assert.equal(
    (
      await as(
        owner,
        "select kxra_private.team_job_context_active($1) active",
        [job.id],
        grant,
      )
    )[0].active,
    false,
  );
  const version = (
    await admin.query("select version from kxra.team_jobs where id=$1", [
      job.id,
    ])
  ).rows[0].version;
  await as(owner, "select kxra.team_job_cancel($1,$2,$3)", [
    f.room,
    job.id,
    version,
  ]);
});
