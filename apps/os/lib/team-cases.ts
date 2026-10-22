import { z } from "zod";
import { query } from "../../../packages/db";
import { HttpError, type Actor } from "./auth";
import { teamRoom } from "./team-room";
import type { CatalogCursor } from "./team-catalog";
import type {
  CaseKind,
  CaseRecord,
  CaseAction,
} from "../../../packages/workspace/case-contract";
const detailsSchemas = {
  REMODEL: z
    .object({
      property: z.string().trim().min(1).max(240),
      scope: z.string().trim().min(1).max(4000),
      exclusions: z.string().max(2000),
      estimate_amount: z.string().regex(/^\d{1,9}(?:\.\d{1,2})?$/),
      milestone: z.string().trim().min(1).max(500),
    })
    .strict()
    .transform((v) => {
      const { estimate_amount, ...rest } = v;
      const [whole, fraction = ""] = estimate_amount.split(".");
      return {
        ...rest,
        estimate_pence: Number(
          BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0")),
        ),
        currency: "GBP",
      };
    }),
  ROLE: z
    .object({
      role_brief: z.string().trim().min(1).max(4000),
      criteria: z.string().trim().min(1).max(2000),
    })
    .strict(),
  APPLICATION: z
    .object({
      application_reference: z.string().trim().min(1).max(160),
      evidence: z.string().trim().min(1).max(4000),
      review_note: z.string().trim().min(1).max(2000),
    })
    .strict(),
  TRAVEL: z
    .object({
      traveller_reference: z.string().trim().min(1).max(160),
      destination: z.string().trim().min(1).max(240),
      starts_on: z.iso.date(),
      ends_on: z.iso.date(),
      proposal: z.string().trim().min(1).max(4000),
      exclusions: z.string().max(2000),
    })
    .strict()
    .refine((v) => v.ends_on >= v.starts_on, {
      message: "End date precedes start date",
    }),
};
const id = z.uuid(),
  short = z.string().trim().min(1).max(160);
export async function caseCatalog(
  a: Actor,
  r: string,
  kind: CaseKind,
  collection: "records" | "actions",
  cursor?: CatalogCursor,
) {
  await teamRoom(a, r);
  const table =
    collection === "records" ? "team_case_records" : "team_case_actions";
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
      ? "id,kind,title,body,responsible,next_step,due_on,parent_id,stage,version,details,(select c.title from kxra.team_case_records c where c.id=team_case_records.parent_id and c.room_id=team_case_records.room_id) parent_title"
      : "id,kind,source_id,source_version,source_snapshot,target_stage,note,state,version,expires_at,result";
  const rows = await query<CaseRecord | CaseAction>(
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
export async function caseMutation(
  a: Actor,
  r: string,
  kind: CaseKind,
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
        parent_id: id.nullable().default(null),
        details: z.unknown(),
      })
      .strict()
      .parse(input);
    if (
      (kind !== "APPLICATION" && v.parent_id !== null) ||
      (kind === "APPLICATION" && v.parent_id === null)
    )
      throw new HttpError(400, "Select an open role for the application");
    return (
      await query<{ record_id: string }>(
        a,
        "select kxra.team_case_save($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) record_id",
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
          v.parent_id,
          JSON.stringify(detailsSchemas[kind].parse(v.details)),
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
        "select kxra.team_case_propose($1,$2,$3,$4,$5,$6,$7) action_id",
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
    await query(a, "select kxra.team_case_review($1,$2,$3,$4,$5)", [
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
      "select kxra.team_case_execute($1,$2,$3,$4) result",
      [r, kind, v.action_id, v.version],
    )
  )[0].result;
}
