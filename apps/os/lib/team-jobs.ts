import crypto from "node:crypto";
import { z } from "zod";
import { localMode, query, scoped } from "../../../packages/db";
import { HttpError, type Actor } from "./auth";
import { teamRoom } from "./team-room";
import {
  teamRunInput,
  prepareTeamAgent,
  executePreparedTeamAgent,
  type PinnedTeamContext,
} from "./team-workspace";
import { catalogAnchor, jobBand, type CatalogCursor } from "./team-catalog";
import { hostedRoomOperations } from "../../../packages/workspace/hosted-operations";
const id = z.string().uuid();
const enqueueInput = teamRunInput
  .extend({
    due_at: z.string().datetime({ offset: true }).nullable().default(null),
  })
  .strict();
export type TeamJob = {
  id: string;
  room_id: string;
  agent_id: string;
  message_id: string;
  requested_by: string;
  due_at: string;
  available_at: string;
  state:
    | "QUEUED"
    | "LEASED"
    | "DISPATCHED"
    | "SUCCEEDED"
    | "FAILED"
    | "CANCELLED"
    | "UNCERTAIN";
  attempt_count: number;
  lease_expires_at: string | null;
  last_error: string | null;
  version: number;
  created_at: string;
  run_id: string | null;
};
export type TeamJobAttempt = {
  id: string;
  job_id: string;
  number: number;
  phase: string;
  error_code: string | null;
  started_at: string;
  finished_at: string | null;
};
const columns =
  "id,room_id,agent_id,message_id,requested_by,due_at,available_at,state,attempt_count,lease_expires_at,last_error,version,created_at,kxra_private.team_job_run(id) run_id";
function localWorkerOnly() {
  if (!(localMode() && !process.env.VERCEL_ENV) && !hostedRoomOperations())
    throw new HttpError(503, "Hosted scheduled execution is not activated");
}
export async function teamJobs(a: Actor, r: string, cursor?: CatalogCursor) {
  await teamRoom(a, r);
  const anchor = await catalogAnchor(a, r, "jobs", cursor);
  const page = await query<TeamJob & { band: number }>(
    a,
    `select ${columns},(${jobBand}) band from kxra.team_jobs where room_id=$1 and not exists(select 1 from kxra.team_schedules s where s.id=team_jobs.id)
 and ($2::integer is null or (${jobBand})>$2 or ((${jobBand})=$2 and (created_at,id)<($3::timestamptz,$4::uuid)))
 order by (${jobBand}),created_at desc,id desc limit 101`,
    [r, anchor?.band ?? null, anchor?.stamp ?? null, anchor?.id ?? null],
  );
  const jobs = page.slice(0, 100),
    last = jobs.at(-1);
  const attempts = jobs.length
    ? await query<TeamJobAttempt>(
        a,
        "select * from kxra.team_job_attempts where job_id=any($1::uuid[]) order by job_id,number",
        [jobs.map((j) => j.id)],
      )
    : [];
  return {
    jobs: jobs.map(({ band, ...job }) => job),
    attempts,
    next_cursor:
      page.length > 100 && last ? { before: last.id, band: last.band } : null,
  };
}
async function jobMetadata(a: Actor, i: string) {
  const rows = await query<TeamJob>(
    a,
    `select ${columns} from kxra.team_jobs where id=$1`,
    [i],
  );
  if (!rows[0]) throw new HttpError(404, "Job unavailable");
  return rows[0];
}
export async function enqueueTeamJob(a: Actor, r: string, value: unknown) {
  localWorkerOnly();
  await teamRoom(a, r);
  const v = enqueueInput.parse(value),
    due = v.due_at ? new Date(v.due_at).toISOString() : null;
  const requestDigest = crypto
    .createHash("sha256")
    .update(
      JSON.stringify({ ...v, chunk_ids: [...v.chunk_ids].sort(), due_at: due }),
    )
    .digest("hex");
  const existing = await query<{ matches: boolean }>(
    a,
    "select kxra_private.team_job_request_matches(id,$2,$3) matches from kxra.team_jobs where id=$1 and room_id=$2",
    [v.request_id, r, requestDigest],
  );
  if (existing.length) {
    if (!existing[0].matches)
      throw new HttpError(409, "Job request already has different inputs");
    return jobMetadata(a, v.request_id);
  }
  const { due_at, ...input } = v;
  const p = await prepareTeamAgent(a, r, input);
  await scoped(a, async (db) => {
    await db.query(
      "select kxra.team_job_enqueue($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)",
      [
        v.request_id,
        r,
        p.agent.id,
        p.target.id,
        v.context,
        p.messages.map((m) => m.id),
        p.digest,
        p.chunks.map((c) => c.id),
        p.chunks.map((c) => c.content_sha256),
        p.skills.map((s) => s.id),
        p.skills.map((s) => s.content_sha256),
        p.memories.map((m) => m.id),
        p.memories.map((m) => m.content_sha256),
        due,
        requestDigest,
      ],
    );
    if (hostedRoomOperations())
      await db.query(
        "select kxra.team_execution_authorize($1,least(coalesce($2::timestamptz,now())+interval '1 hour',now()+interval '8 days'))",
        [v.request_id, due],
      );
  });
  return jobMetadata(a, v.request_id);
}
export async function cancelTeamJob(a: Actor, r: string, value: unknown) {
  await teamRoom(a, r);
  const v = z
    .object({ job_id: id, version: z.number().int().positive() })
    .strict()
    .parse(value);
  await query(a, "select kxra.team_job_cancel($1,$2,$3)", [
    r,
    v.job_id,
    v.version,
  ]);
  return jobMetadata(a, v.job_id);
}
type Claim = {
  job_id: string;
  room_id: string;
  run_id: string;
  lease_token: string;
  input: z.infer<typeof teamRunInput>;
  pinned: PinnedTeamContext;
};
export async function drainTeamJobs(a: Actor, value: unknown) {
  localWorkerOnly();
  const v = z
    .object({ request_id: id, room_id: id.nullable().default(null) })
    .strict()
    .parse(value);
  if (v.room_id) await teamRoom(a, v.room_id);
  const tick = (
    await query<{ fresh: boolean }>(
      a,
      "select kxra.team_schedule_tick($1,$2) fresh",
      [v.request_id, v.room_id],
    )
  )[0]?.fresh;
  if (!tick) return { processed: false, replayed: true };
  const claim = (
    await query<{ claim: Claim | { duplicate: true } | null }>(
      a,
      "select kxra.team_job_claim($1,$2,45) claim",
      [v.request_id, v.room_id],
    )
  )[0]?.claim;
  if (!claim) return { processed: false, replayed: false };
  if ("duplicate" in claim) return { processed: false, replayed: true };
  try {
    const prepared = await prepareTeamAgent(
      a,
      claim.room_id,
      claim.input,
      claim.pinned,
    );
    await executePreparedTeamAgent(a, claim.room_id, prepared, {
      id: claim.job_id,
      token: claim.lease_token,
    });
  } catch (error) {
    const code =
      error instanceof HttpError && [400, 403, 404, 409].includes(error.status)
        ? "ACCESS_CHANGED"
        : "WORKER_TEMPORARY";
    // Release only affects a still-owned pre-dispatch lease. Dispatched uncertainty
    // is reconciled after expiry; it is never silently replayed.
    await query(a, "select kxra.team_job_release($1,$2,$3)", [
      claim.job_id,
      claim.lease_token,
      code,
    ]);
  }
  return { processed: true, job: await jobMetadata(a, claim.job_id) };
}
