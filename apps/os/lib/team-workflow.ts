import { z } from "zod";
import { query } from "../../../packages/db";
import { HttpError, type Actor } from "./auth";
import { teamRoom } from "./team-room";
import type { CatalogCursor } from "./team-catalog";
export type WorkflowRecord = {
  id: string;
  kind: "LEAD" | "ACCOUNT" | "OPPORTUNITY";
  title: string;
  body: string;
  next_step: string;
  state: string;
  version: number;
  source_id: string | null;
  action_id: string | null;
};
export type WorkflowAction = {
  id: string;
  source_id: string;
  source_version: number;
  account_name: string;
  opportunity_name: string;
  next_step: string;
  state: string;
  version: number;
  expires_at: string;
  account_id: string | null;
  opportunity_id: string | null;
};
const id = z.string().uuid(),
  text = z.string().trim().min(1).max(160);
export async function teamWorkflow(
  a: Actor,
  r: string,
  kind: "records" | "actions",
  cursor?: CatalogCursor,
) {
  await teamRoom(a, r);
  const table =
    kind === "records" ? "team_workflow_records" : "team_workflow_actions";
  let anchor: { stamp: string; id: string } | null = null;
  if (cursor) {
    if (cursor.band !== 0) throw new HttpError(400, "Invalid workflow cursor");
    const row = (
      await query<{ stamp: string; id: string }>(
        a,
        `select id,created_at::text stamp from kxra.${table} where id=$1 and room_id=$2`,
        [cursor.before, r],
      )
    )[0];
    if (!row) throw new HttpError(404, "Workflow cursor unavailable");
    anchor = row;
  }
  const cols =
    kind === "records"
      ? "id,kind,title,body,next_step,state,version,source_id,action_id"
      : "id,source_id,source_version,account_name,opportunity_name,next_step,state,version,expires_at,account_id,opportunity_id";
  const rows = await query<WorkflowRecord | WorkflowAction>(
    a,
    `select ${cols} from kxra.${table} where room_id=$1 and ($2::timestamptz is null or (created_at,id)<($2::timestamptz,$3::uuid)) order by created_at desc,id desc limit 101`,
    [r, anchor?.stamp ?? null, anchor?.id ?? null],
  );
  const page = rows.slice(0, 100);
  return {
    [kind]: page,
    next_cursor:
      rows.length > 100 ? { before: page.at(-1)!.id, band: 0 } : null,
  };
}
export async function workflowMutation(
  a: Actor,
  r: string,
  kind: string,
  value: unknown,
) {
  await teamRoom(a, r);
  if (kind === "lead") {
    const v = z
      .object({
        request_id: id,
        version: z.number().int().nonnegative().default(0),
        title: text,
        body: z.string().max(4000).default(""),
        next_step: z.string().trim().min(1).max(500),
      })
      .strict()
      .parse(value);
    await query(a, "select kxra.team_lead_save($1,$2,$3,$4,$5,$6)", [
      v.request_id,
      r,
      v.version,
      v.title,
      v.body,
      v.next_step,
    ]);
    return { saved: true };
  }
  if (kind === "conversion") {
    const v = z
      .object({
        request_id: id,
        source_id: id,
        source_version: z.number().int().positive(),
        account_name: text,
        opportunity_name: text,
        next_step: z.string().trim().min(1).max(500),
      })
      .strict()
      .parse(value);
    await query(a, "select kxra.team_crm_propose($1,$2,$3,$4,$5,$6,$7)", [
      v.request_id,
      r,
      v.source_id,
      v.source_version,
      v.account_name,
      v.opportunity_name,
      v.next_step,
    ]);
    return { saved: true };
  }
  const v = z
    .object({
      action_id: id,
      version: z.number().int().positive(),
      decision: z.enum(["APPROVED", "REJECTED", "CANCELLED"]).optional(),
    })
    .strict()
    .parse(value);
  if (kind === "conversion-review") {
    if (!v.decision) throw new HttpError(400, "Decision required");
    await query(a, "select kxra.team_crm_review($1,$2,$3,$4)", [
      r,
      v.action_id,
      v.version,
      v.decision,
    ]);
    return { saved: true };
  }
  if (kind !== "conversion-execute" || v.decision)
    throw new HttpError(400, "Invalid workflow action");
  return (
    await query<{ result: unknown }>(
      a,
      "select kxra.team_crm_execute($1,$2,$3) result",
      [r, v.action_id, v.version],
    )
  )[0].result;
}
