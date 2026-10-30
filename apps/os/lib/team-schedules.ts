import crypto from "node:crypto";
import { z } from "zod";
import { localMode, query, scoped } from "../../../packages/db";
import { HttpError, type Actor } from "./auth";
import { teamRoom } from "./team-room";
import { prepareTeamAgent, teamRunInput } from "./team-workspace";
import {
  catalogAnchor,
  scheduleBand,
  type CatalogCursor,
} from "./team-catalog";
import { hostedRoomOperations } from "../../../packages/workspace/hosted-operations";
const input = teamRunInput
  .extend({
    name: z.string().trim().min(1).max(120),
    timezone: z.string().min(1).max(100),
    wall_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    starts_on: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .refine((v) => {
        const d = new Date(v);
        return !Number.isNaN(d.valueOf()) && d.toISOString().slice(0, 10) === v;
      }),
    expires_at: z.string().datetime({ offset: true }),
    max_occurrences: z.number().int().min(1).max(20),
  })
  .strict();
export type TeamSchedule = {
  id: string;
  room_id: string;
  created_by: string;
  name: string;
  timezone: string;
  wall_time: string;
  starts_on: string;
  expires_at: string;
  max_occurrences: number;
  state: string;
  version: number;
  last_error: string | null;
  reviewed_at: string | null;
  receipt: {
    agent_id: string;
    message_id: string;
    context: string;
    context_sha256: string | null;
    messages: number;
    files: number;
    skills: number;
    memories: number;
    context_active: boolean;
  } | null;
};
export type TeamOccurrence = {
  id: string;
  schedule_id: string;
  local_day: string;
  scheduled_for: string | null;
  job_id: string | null;
  outcome: string;
};
function localOnly() {
  if (!(localMode() && !process.env.VERCEL_ENV) && !hostedRoomOperations())
    throw new HttpError(503, "Hosted scheduled execution is not activated");
}
const columns =
  "id,room_id,created_by,name,timezone,wall_time,starts_on::text,expires_at,max_occurrences,state,version,last_error,reviewed_at,kxra_private.team_schedule_receipt(id) receipt";
export async function teamSchedules(
  a: Actor,
  r: string,
  cursor?: CatalogCursor,
) {
  await teamRoom(a, r);
  const anchor = await catalogAnchor(a, r, "schedules", cursor);
  const page = await query<TeamSchedule & { band: number }>(
    a,
    `select ${columns},(${scheduleBand}) band from kxra.team_schedules schedule where room_id=$1
 and ($2::integer is null or (${scheduleBand})>$2 or ((${scheduleBand})=$2 and (created_at,id)<($3::timestamptz,$4::uuid)))
 order by (${scheduleBand}),created_at desc,id desc limit 101`,
    [r, anchor?.band ?? null, anchor?.stamp ?? null, anchor?.id ?? null],
  );
  const schedules = page.slice(0, 100),
    last = schedules.at(-1);
  const occurrences = schedules.length
    ? await query<TeamOccurrence>(
        a,
        "select id,schedule_id,local_day::text,scheduled_for,job_id,outcome from kxra.team_schedule_occurrences where schedule_id=any($1::uuid[]) order by created_at desc,id desc limit 3100",
        [schedules.map((s) => s.id)],
      )
    : [];
  return {
    schedules: schedules.map(({ band, ...s }) => s),
    occurrences,
    next_cursor:
      page.length > 100 && last ? { before: last.id, band: last.band } : null,
  };
}
export async function proposeTeamSchedule(a: Actor, r: string, value: unknown) {
  localOnly();
  await teamRoom(a, r);
  const v = input.parse(value),
    requestDigest = crypto
      .createHash("sha256")
      .update(
        JSON.stringify({
          ...v,
          chunk_ids: [...v.chunk_ids].sort(),
          expires_at: new Date(v.expires_at).toISOString(),
        }),
      )
      .digest("hex");
  const existing = await query<{ matches: boolean }>(
    a,
    "select kxra_private.team_job_request_matches(s.id,$2,$3) matches from kxra.team_schedules s where s.id=$1 and s.room_id=$2",
    [v.request_id, r, requestDigest],
  );
  if (existing.length) {
    if (!existing[0].matches)
      throw new HttpError(409, "Schedule request already has different inputs");
    return teamSchedules(a, r);
  }
  const p = await prepareTeamAgent(a, r, {
    request_id: v.request_id,
    agent_id: v.agent_id,
    message_id: v.message_id,
    context: v.context,
    chunk_ids: v.chunk_ids,
    use_memory: v.use_memory,
  });
  await scoped(a, async (db) => {
    await db.query(
      "select kxra.team_job_enqueue($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,null,$14)",
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
        requestDigest,
      ],
    );
    await db.query(
      "select kxra.team_schedule_propose($1,$2,$3,$4,$5,$6,$7,$8)",
      [
        v.request_id,
        r,
        v.name,
        v.timezone,
        v.wall_time,
        v.starts_on,
        v.expires_at,
        v.max_occurrences,
      ],
    );
  });
  return teamSchedules(a, r);
}
export async function reviewTeamSchedule(a: Actor, r: string, value: unknown) {
  await teamRoom(a, r);
  const v = z
    .object({
      schedule_id: z.string().uuid(),
      version: z.number().int().positive(),
      action: z.enum(["ACTIVATE", "PAUSE", "REVOKE"]),
    })
    .strict()
    .parse(value);
  if (v.action === "ACTIVATE") localOnly();
  await scoped(a, async (db) => {
    // Match the worker's grant-before-job lock order during an active rollout.
    // A failed schedule authorization rolls this revocation back atomically.
    if (hostedRoomOperations() && v.action !== "ACTIVATE")
      await db.query("select kxra.team_execution_revoke($1)", [v.schedule_id]);
    await db.query("select kxra.team_schedule_review($1,$2,$3,$4)", [
      r,
      v.schedule_id,
      v.version,
      v.action,
    ]);
    if (hostedRoomOperations() && v.action === "ACTIVATE")
      await db.query(
        "select kxra.team_execution_authorize($1,expires_at) from kxra.team_schedules where id=$1",
        [v.schedule_id],
      );
  });
  return teamSchedules(a, r);
}
