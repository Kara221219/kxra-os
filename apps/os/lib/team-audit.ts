import { z } from "zod";
import { query } from "../../../packages/db";
import { HttpError, type Actor } from "./auth";
import { teamRoom } from "./team-room";
export function csvCell(value: unknown) {
  const text = String(value ?? "").slice(0, 200),
    safe = /^[\s\u0000-\u001f]*[=+\-@]/.test(text) ? "'" + text : text;
  return '"' + safe.replaceAll('"', '""') + '"';
}
export async function teamAuditExport(
  a: Actor,
  r: string,
  params: URLSearchParams,
) {
  await teamRoom(a, r);
  if ([...params.keys()].some((k) => params.getAll(k).length !== 1))
    throw new HttpError(400, "Invalid export query");
  const v = z
    .object({
      before: z
        .string()
        .regex(/^[1-9]\d{0,18}$/)
        .refine((s) => BigInt(s) <= 9223372036854775807n)
        .optional(),
    })
    .strict()
    .parse(Object.fromEntries(params));
  // All creator checks and rows are read together under current authenticated RLS.
  const rows = await query<{
    id: string;
    created_at: string;
    action: string;
    state: string | null;
    status: string | null;
    active: boolean | null;
    enabled: boolean | null;
  }>(
    a,
    `select id::text,created_at,action,details->>'state' state,details->>'status' status,
 case when jsonb_typeof(details->'active')='boolean' then (details->>'active')::boolean end active,
 case when jsonb_typeof(details->'enabled')='boolean' then (details->>'enabled')::boolean end enabled
 from kxra.team_events where room_id=$1 and kxra_private.manages_team_room($1)
 and ($2::bigint is null or id<$2::bigint) order by team_events.id desc limit 501`,
    [r, v.before ?? null],
  );
  // A creator check is necessary even when the requested page has no rows.
  const allowed = await query<{ allowed: boolean }>(
    a,
    "select kxra_private.manages_team_room($1) allowed",
    [r],
  );
  if (!allowed[0]?.allowed)
    throw new HttpError(
      403,
      "Only the current room creator can export audit metadata",
    );
  const page = rows.slice(0, 500),
    token = (s: string | null) => (s && /^[A-Z_]{1,80}$/.test(s) ? s : "");
  const csv =
    [
      "event_id,created_at,event,state,status,active,enabled",
      ...page.map((e) =>
        [
          e.id,
          new Date(e.created_at).toISOString(),
          /^team_[a-z_]+:(INSERT|UPDATE)$/.test(e.action)
            ? e.action
            : "REDACTED",
          token(e.state),
          token(e.status),
          e.active ?? "",
          e.enabled ?? "",
        ]
          .map(csvCell)
          .join(","),
      ),
    ].join("\r\n") + "\r\n";
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="room-${r}-audit.csv"`,
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      "X-KXRA-Next-Cursor": rows.length > 500 ? page.at(-1)!.id : "",
    },
  });
}
