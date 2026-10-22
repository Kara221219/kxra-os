import { z } from "zod";
import { query } from "../../../packages/db";
import { HttpError, type Actor } from "./auth";
import { teamRoom } from "./team-room";
import type { CatalogCursor } from "./team-catalog";
import type {
  CollaborationKind,
  CollaborationRecord,
  CollaborationAction,
} from "../../../packages/workspace/collaboration-contract";
const id = z.uuid(),
  short = z.string().trim().min(1).max(160);
export async function collaborationCatalog(
  a: Actor,
  r: string,
  kind: CollaborationKind,
  collection: "records" | "actions",
  cursor?: CatalogCursor,
) {
  await teamRoom(a, r);
  const table =
    collection === "records"
      ? "team_collaboration_records"
      : "team_collaboration_actions";
  let anchor: { stamp: string; id: string } | undefined;
  if (cursor) {
    if (cursor.band !== 0) throw new HttpError(400, "Invalid app cursor");
    anchor = (
      await query<{ stamp: string; id: string }>(
        a,
        `select created_at::text stamp,id from kxra.${table} where id=$1 and room_id=$2 and kind=$3`,
        [cursor.before, r, kind],
      )
    )[0];
    if (!anchor) throw new HttpError(404, "App cursor unavailable");
  }
  const columns =
    collection === "records"
      ? "id,kind,title,body,responsible,next_step,due_on,creator_id,stage,version,(select c.title from kxra.team_collaboration_records c where c.id=team_collaboration_records.creator_id and c.room_id=team_collaboration_records.room_id) creator_title"
      : "id,kind,source_id,source_version,source_snapshot,target_stage,note,state,version,expires_at,result";
  const rows = await query<CollaborationRecord | CollaborationAction>(
    a,
    `select ${columns} from kxra.${table} where room_id=$1 and kind=$2 and ($3::timestamptz is null or (created_at,id)<($3::timestamptz,$4::uuid)) order by created_at desc,id desc limit 101`,
    [r, kind, anchor?.stamp ?? null, anchor?.id ?? null],
  );
  const page = rows.slice(0, 100);
  return {
    [collection]: page,
    next_cursor:
      rows.length > 100 ? { before: page.at(-1)!.id, band: 0 } : null,
  };
}
export async function collaborationMutation(
  a: Actor,
  r: string,
  kind: CollaborationKind,
  operation: string,
  input: unknown,
) {
  await teamRoom(a, r);
  if (operation === "save") {
    const v = z
      .object({
        request_id: id,
        version: z.number().int().min(0).default(0),
        title: short,
        body: z.string().max(4000).default(""),
        responsible: short,
        next_step: z.string().trim().min(1).max(500),
        due_on: z.iso.date().nullable().default(null),
        creator_id: id.nullable().default(null),
      })
      .strict()
      .parse(input);
    if (
      (kind === "CREATOR" && v.creator_id !== null) ||
      (kind === "SAMPLE" && v.creator_id === null)
    )
      throw new HttpError(400, "Select a recorded creator for the sample");
    return (
      await query<{ record_id: string }>(
        a,
        "select kxra.team_collaboration_save($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) record_id",
        [
          v.request_id,
          r,
          kind,
          v.version,
          v.title,
          v.body,
          v.responsible,
          v.next_step,
          v.due_on,
          v.creator_id,
        ],
      )
    )[0];
  }
  if (operation === "propose") {
    const v = z
      .object({
        request_id: id,
        source_id: id,
        source_version: z.number().int().positive(),
        target_stage: z.string().min(1).max(30),
        note: z.string().trim().min(1).max(4000),
      })
      .strict()
      .parse(input);
    return (
      await query<{ action_id: string }>(
        a,
        "select kxra.team_collaboration_propose($1,$2,$3,$4,$5,$6,$7) action_id",
        [
          v.request_id,
          r,
          kind,
          v.source_id,
          v.source_version,
          v.target_stage,
          v.note,
        ],
      )
    )[0];
  }
  if (operation === "review") {
    const v = z
      .object({
        action_id: id,
        version: z.number().int().positive(),
        decision: z.enum(["APPROVED", "REJECTED", "CANCELLED"]),
      })
      .strict()
      .parse(input);
    await query(a, "select kxra.team_collaboration_review($1,$2,$3,$4,$5)", [
      r,
      kind,
      v.action_id,
      v.version,
      v.decision,
    ]);
    return { saved: true };
  }
  if (operation !== "execute")
    throw new HttpError(404, "App action unavailable");
  const v = z
    .object({ action_id: id, version: z.number().int().positive() })
    .strict()
    .parse(input);
  return (
    await query<{ result: unknown }>(
      a,
      "select kxra.team_collaboration_execute($1,$2,$3,$4) result",
      [r, kind, v.action_id, v.version],
    )
  )[0].result;
}
