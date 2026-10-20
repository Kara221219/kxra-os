import { z } from "zod";
import { query } from "../../../packages/db";
import { HttpError, type Actor } from "./auth";
export type CatalogCursor = { before: string; band: number };
export const jobBand =
  "case when state in ('QUEUED','LEASED','DISPATCHED') then 0 when state='UNCERTAIN' then 1 else 2 end";
export const scheduleBand =
  "case when state='ACTIVE' or (state='EXHAUSTED' and exists(select 1 from kxra.team_schedule_occurrences o join kxra.team_jobs j on j.id=o.job_id where o.schedule_id=schedule.id and j.state in ('QUEUED','LEASED','DISPATCHED'))) then 0 when state='PAUSED' then 1 when state='DRAFT' then 2 else 3 end";
export function catalogInput(params: URLSearchParams) {
  if ([...params.keys()].some((k) => params.getAll(k).length !== 1))
    throw new HttpError(400, "Invalid catalog query");
  const v = z
    .object({
      before: z.string().uuid().optional(),
      band: z.coerce.number().int().min(0).max(3).optional(),
    })
    .strict()
    .parse(Object.fromEntries(params));
  if (Boolean(v.before) !== (v.band !== undefined))
    throw new HttpError(400, "Incomplete catalog cursor");
  return v.before ? { before: v.before, band: v.band! } : undefined;
}
export async function catalogAnchor(
  a: Actor,
  r: string,
  kind: "jobs" | "schedules",
  cursor?: CatalogCursor,
) {
  if (!cursor) return null;
  const band = kind === "jobs" ? jobBand : scheduleBand,
    table = kind === "jobs" ? "team_jobs" : "team_schedules",
    alias = kind === "jobs" ? "team_jobs" : "schedule";
  const rows = await query<{ stamp: string; band: number }>(
    a,
    `select created_at::text stamp,(${band}) band from kxra.${table} ${alias} where id=$1 and room_id=$2 ${kind === "jobs" ? "and not exists(select 1 from kxra.team_schedules s where s.id=team_jobs.id)" : ""}`,
    [cursor.before, r],
  );
  if (!rows[0]) throw new HttpError(404, "Catalog cursor unavailable");
  if (rows[0].band !== cursor.band)
    throw new HttpError(
      409,
      "Catalog changed. Refresh before loading another page.",
    );
  return { ...rows[0], id: cursor.before };
}
