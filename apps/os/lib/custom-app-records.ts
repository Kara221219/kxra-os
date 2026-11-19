import { z } from "zod";
import { query } from "../../../packages/db";
import {
  validAppValues,
  type AppRecordPage,
  type AppRecordReceipt,
} from "../../../packages/custom-apps/records";
import { customAppSchema } from "../../../packages/custom-apps/contract";
import { HttpError, type Actor } from "./auth";
import { requireCustomApps } from "./custom-apps";
import { teamRoom } from "./team-room";
export async function customAppRecords(
  a: Actor,
  room: string,
  app: string,
  before?: string,
) {
  requireCustomApps(a);
  await teamRoom(a, room);
  z.uuid().parse(app);
  if (before !== undefined) {
    z.uuid().parse(before);
    if (
      !(
        await query(
          a,
          "select id from kxra.custom_app_records where id=$1 and app_id=$2 and room_id=$3",
          [before, app, room],
        )
      )[0]
    )
      throw new HttpError(404, "Record cursor unavailable");
  }
  const [data] = await query<AppRecordPage>(
    a,
    `with selected as (
    select r.id,r.schema_version,v.version,v.data,s.artifact->'schema' schema
    from kxra.custom_app_records r
    join lateral (select version,data from kxra.custom_app_record_versions where record_id=r.id order by version desc limit 1) v on true
    join kxra.custom_app_versions s on s.app_id=r.app_id and s.version=r.schema_version
    where r.app_id=$1 and r.room_id=$2 and ($3::uuid is null or r.id<$3) order by r.id desc limit 51
  ), page as (select * from selected order by id desc limit 50)
  select jsonb_build_object('id',a.id,'revision',a.revision,'active_version',a.active_version) app,
    s.artifact->'schema' active_schema,kxra_private.can_team_room(a.room_id,true) can_write,
    coalesce((select jsonb_agg(to_jsonb(page) order by id desc) from page),'[]'::jsonb) records,
    case when (select count(*) from selected)>50 then (select id from page order by id asc limit 1) else null end next_cursor
  from kxra.custom_apps a left join kxra.custom_app_versions s on s.app_id=a.id and s.version=a.active_version
  where a.id=$1 and a.room_id=$2`,
    [app, room, before ?? null],
  );
  if (!data) throw new HttpError(404, "Custom app unavailable");
  if (a.source === "supabase") {
    const [review] = await query<{
      reviews: { version: number; current: boolean }[];
    }>(a, "select kxra.custom_app_review_status($1) reviews", [app]);
    data.can_write =
      data.can_write &&
      review.reviews.some(
        (r) => r.version === data.app.active_version && r.current,
      );
  }
  return data;
}
export async function saveCustomAppRecord(
  a: Actor,
  room: string,
  app: string,
  input: unknown,
) {
  requireCustomApps(a);
  await teamRoom(a, room);
  z.uuid().parse(app);
  const v = z
    .object({
      operation_id: z.uuid(),
      record_id: z.uuid(),
      expected_app_revision: z.number().int().positive().max(2147483646),
      schema_version: z.number().int().min(1).max(100),
      expected_record_revision: z.number().int().min(0).max(99),
      data: z.unknown(),
    })
    .strict()
    .parse(input);
  const [version] = await query<{ schema: unknown }>(
    a,
    "select v.artifact->'schema' schema from kxra.custom_app_versions v join kxra.custom_apps a on a.id=v.app_id where a.id=$1 and a.room_id=$2 and v.version=$3",
    [app, room, v.schema_version],
  );
  if (!version) throw new HttpError(404, "Custom app version unavailable");
  const parsed = customAppSchema.safeParse(version.schema);
  if (!parsed.success || !validAppValues(parsed.data, v.data))
    throw new HttpError(400, "Invalid typed record fields");
  return (
    await query<{ receipt: AppRecordReceipt }>(
      a,
      "select kxra.custom_app_record_save($1,$2,$3,$4,$5,$6,$7,$8) receipt",
      [
        v.operation_id,
        v.record_id,
        app,
        room,
        v.expected_app_revision,
        v.schema_version,
        v.expected_record_revision,
        JSON.stringify(v.data),
      ],
    )
  )[0].receipt;
}
export async function customAppRecordReceipt(
  a: Actor,
  room: string,
  app: string,
  operation: string,
) {
  requireCustomApps(a);
  await teamRoom(a, room);
  z.uuid().parse(app);
  z.uuid().parse(operation);
  const [receipt] = await query<AppRecordReceipt>(
    a,
    `select v.record_id,v.version,v.schema_version,v.operation_id from kxra.custom_app_record_versions v join kxra.custom_app_records r on r.id=v.record_id where v.operation_id=$1 and v.app_id=$2 and r.room_id=$3 and v.created_by=$4`,
    [operation, app, room, a.id],
  );
  if (!receipt) throw new HttpError(404, "Save not confirmed");
  return receipt;
}
