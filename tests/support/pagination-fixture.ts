import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import pg from "pg";
import { localModeConfiguration } from "../../packages/authz/local-guard";
import { knowledgeFixture, knowledgeOk } from "./team-knowledge";
import { runtimeFile } from "./runtime";

export async function paginationFixture() {
  assert.ok(
    localModeConfiguration(process.env) && !process.env.VERCEL_ENV,
    "Pagination fixtures require the guarded local fixture runtime",
  );
  const cfg = JSON.parse(fs.readFileSync(runtimeFile("database.json"), "utf8"));
  assert.equal(
    cfg.host,
    path.join(path.resolve(process.env.KXRA_RUNTIME!), "socket"),
    "Pagination fixtures require the fixture Unix socket",
  );
  const fixture = await knowledgeFixture(false),
    scheduleId = crypto.randomUUID();
  const proposed = await knowledgeOk(
    `/${fixture.room}/schedules`,
    fixture.cookie,
    {
      request_id: scheduleId,
      agent_id: fixture.agent,
      message_id: fixture.message,
      context: "THREAD",
      chunk_ids: [],
      use_memory: false,
      name: "Older active control",
      timezone: "UTC",
      wall_time: "00:00",
      starts_on: new Date().toISOString().slice(0, 10),
      expires_at: new Date(Date.now() + 86400000 * 2).toISOString(),
      max_occurrences: 2,
    },
  );
  const schedule = proposed.schedules.find(
    (row: { id: string; version: number }) => row.id === scheduleId,
  );
  assert.ok(schedule);
  await knowledgeOk(`/${fixture.room}/schedules/review`, fixture.cookie, {
    schedule_id: scheduleId,
    version: schedule.version,
    action: "ACTIVATE",
  });
  const pending = await knowledgeOk(`/${fixture.room}/jobs`, fixture.cookie, {
    request_id: crypto.randomUUID(),
    agent_id: fixture.agent,
    message_id: fixture.message,
    context: "MESSAGE_ONLY",
    chunk_ids: [],
    use_memory: false,
  });

  // Mirror the service pagination fixture with current timestamps and an audit actor.
  // Only terminal historical metadata is inserted; no team worker or schedule tick runs.
  const db = new pg.Client({ ...cfg, user: os.userInfo().username });
  await db.connect();
  try {
    await db.query("begin");
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [
      "20000000-0000-4000-8000-000000000002",
    ]);
    const history = `insert into kxra.team_jobs(id,org_id,room_id,agent_id,message_id,request_sha256,requested_by,request_session_version,context_mode,context_ids,context_sha256,chunk_ids,chunk_hashes,skill_ids,skill_hashes,memory_ids,memory_hashes,requested_due_at,due_at,available_at,state,finished_at)
  select gen_random_uuid(),org_id,room_id,agent_id,message_id,request_sha256,requested_by,request_session_version,context_mode,context_ids,context_sha256,chunk_ids,chunk_hashes,skill_ids,skill_hashes,memory_ids,memory_hashes,null,now(),now(),'CANCELLED',now() from kxra.team_jobs cross join generate_series(1,101) where id=$1 and room_id=$2`;
    const jobs = await db.query(history, [pending.id, fixture.room]);
    assert.equal(jobs.rowCount, 101);
    const schedules = await db.query(
      `with archived as (${history} returning id)
  insert into kxra.team_schedules(id,org_id,room_id,created_by,name,timezone,wall_time,starts_on,expires_at,max_occurrences,state)
  select archived.id,s.org_id,s.room_id,s.created_by,'Archived control',s.timezone,s.wall_time,s.starts_on,s.expires_at,s.max_occurrences,'REVOKED'
  from archived cross join kxra.team_schedules s where s.id=$3 and s.room_id=$2`,
      [scheduleId, fixture.room, scheduleId],
    );
    assert.equal(schedules.rowCount, 101);
    const counts = (
      await db.query(
        `select
          (select count(*)::int from kxra.team_jobs j where j.room_id=$1
           and not exists(select 1 from kxra.team_schedules s
             where s.id=j.id and s.room_id=$1)) as jobs,
          (select count(*)::int from kxra.team_schedules where room_id=$1) as schedules`,
        [fixture.room],
      )
    ).rows[0];
    assert.deepEqual(counts, { jobs: 102, schedules: 102 });
    await db.query("commit");
  } catch (error) {
    await db.query("rollback");
    throw error;
  } finally {
    await db.end();
  }
  return fixture;
}
