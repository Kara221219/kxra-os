import { z } from "zod";
import { localMode, query } from "../../../packages/db";
import {
  customAppSchema,
  type CustomApp,
  type CustomAppVersion,
  type CustomAppSchema,
} from "../../../packages/custom-apps/contract";
import { HttpError, type Actor } from "./auth";
import { customAppsIdentityAllowed } from "../../../packages/custom-apps/access";
import { teamRoom } from "./team-room";

export function requireCustomApps(a: Actor) {
  if (
    !customAppsIdentityAllowed(a.source, localMode()) ||
    (a.source === "supabase" &&
      (a.provider_session_version === undefined ||
        a.provider_session_version !== a.session_version))
  )
    throw new HttpError(404, "Custom apps unavailable");
}
export async function customApps(a: Actor, room: string) {
  requireCustomApps(a);
  const r = await teamRoom(a, room);
  const apps = await query<CustomApp>(
    a,
    `select a.id,a.revision,a.latest_version,a.active_version,v.artifact->'schema'->>'title' title from kxra.custom_apps a join kxra.custom_app_versions v on v.app_id=a.id and v.version=a.latest_version where a.room_id=$1 order by a.id limit 20`,
    [room],
  );
  return {
    apps,
    can_manage: r.created_by === a.id,
    production: a.source === "supabase",
    can_review: a.source === "supabase" && a.security_role === "ORG_ADMIN",
  };
}
export async function customAppDetail(a: Actor, room: string, app: string) {
  requireCustomApps(a);
  await teamRoom(a, room);
  // One SQL snapshot keeps revision, immutable versions and release history consistent.
  const [data] = await query<{
    app: CustomApp;
    versions: CustomAppVersion[];
    releases: { revision: number; version: number; action: string }[];
  }>(
    a,
    `select jsonb_build_object('id',a.id,'revision',a.revision,'latest_version',a.latest_version,'active_version',a.active_version,'title',v.artifact->'schema'->>'title') app,
    (select jsonb_agg(jsonb_build_object('version',v2.version,'artifact',v2.artifact,'sha256',v2.sha256,'previously_released',exists(select 1 from kxra.custom_app_releases r where r.app_id=a.id and r.version=v2.version)) order by v2.version desc) from kxra.custom_app_versions v2 where v2.app_id=a.id) versions,
    coalesce((select jsonb_agg(to_jsonb(recent) order by recent.revision desc) from (select revision,version,action from kxra.custom_app_releases where app_id=a.id order by revision desc limit 100) recent),'[]'::jsonb) releases
    from kxra.custom_apps a join kxra.custom_app_versions v on v.app_id=a.id and v.version=a.latest_version where a.id=$1 and a.room_id=$2`,
    [z.uuid().parse(app), room],
  );
  if (!data) throw new HttpError(404, "Custom app unavailable");
  const reviews =
    a.source === "supabase"
      ? (
          await query<{
            reviews: {
              version: number;
              decision: string;
              artifact_sha256: string;
              expires_at: string;
              current: boolean;
            }[];
          }>(a, "select kxra.custom_app_review_status($1) reviews", [app])
        )[0].reviews
      : [];
  return { ...data, reviews };
}
export async function customAppMutation(
  a: Actor,
  room: string,
  input: unknown,
) {
  requireCustomApps(a);
  await teamRoom(a, room);
  const common = {
    app_id: z.uuid(),
    expected_revision: z.number().int().min(0).max(2147483646),
  };
  const v = z
    .discriminatedUnion("operation", [
      z
        .object({
          ...common,
          operation: z.literal("register"),
          schema: z.custom<CustomAppSchema>(
            (input) => customAppSchema.safeParse(input).success,
          ),
        })
        .strict(),
      z
        .object({
          ...common,
          operation: z.enum([
            "PUBLISH_LOCAL",
            "ROLLBACK_LOCAL",
            "PUBLISH",
            "ROLLBACK",
          ]),
          version: z.number().int().min(1).max(100),
        })
        .strict(),
      z
        .object({
          ...common,
          operation: z.enum(["APPROVED", "REJECTED", "WITHDRAWN"]),
          version: z.number().int().min(1).max(100),
          sha256: z.string().regex(/^[a-f0-9]{64}$/),
        })
        .strict(),
    ])
    .parse(input);
  if (v.operation === "register")
    await query(a, "select kxra.custom_app_register($1,$2,$3,$4)", [
      v.app_id,
      room,
      v.expected_revision,
      JSON.stringify(v.schema),
    ]);
  else if ("sha256" in v)
    await query(a, "select kxra.custom_app_review($1,$2,$3,$4,$5,$6)", [
      v.app_id,
      room,
      v.expected_revision,
      v.version,
      v.sha256,
      v.operation,
    ]);
  else {
    if ((a.source === "fixture") !== v.operation.endsWith("_LOCAL"))
      throw new HttpError(400, "Invalid release mode");
    await query(
      a,
      a.source === "fixture"
        ? "select kxra.custom_app_release($1,$2,$3,$4,$5)"
        : "select kxra.custom_app_release_reviewed($1,$2,$3,$4,$5)",
      [v.app_id, room, v.expected_revision, v.version, v.operation],
    );
  }
  return customAppDetail(a, room, v.app_id);
}
