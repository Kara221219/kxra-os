import pg from "pg";
import fs from "node:fs";
import path from "node:path";
import { localModeConfiguration } from "#kxra/local-guard";
import { databaseConnectionString, databaseSsl } from "./ssl";
import { hostedSelfServiceConfiguration } from "../authz/hosted-self-service";
import { hostedRoomOperations } from "../workspace/hosted-operations";
export type Principal = {
  /** Internal server-resolved grant, never accepted from HTTP input. */
  room_worker_grant?: string;
  id: string;
  aal: "aal1" | "aal2";
  /** Server-resolved request context. Never populate this from JWT metadata. */
  organisation_id?: string;
  auth_time?: number;
  email?: string;
  email_verified?: boolean;
  session_version?: number;
  provider_session_version?: number;
  source?: "fixture" | "fake-provider" | "supabase";
};
let pool: pg.Pool | undefined;

export function runtimePoolOptions(
  environment: Record<string, string | undefined> = process.env,
): Pick<
  pg.PoolConfig,
  "max" | "connectionTimeoutMillis" | "idleTimeoutMillis" | "allowExitOnIdle"
> {
  if (environment.VERCEL === "1")
    return {
      max: 1,
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 5_000,
      allowExitOnIdle: true,
    };
  return {
    max: 10,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
    allowExitOnIdle: false,
  };
}

export function localMode() {
  return localModeConfiguration(process.env);
}
export function getPool() {
  if (!pool) {
    if (localMode())
      pool = new pg.Pool(
        JSON.parse(
          fs.readFileSync(
            path.join(process.env.KXRA_RUNTIME!, "database.json"),
            "utf8",
          ),
        ),
      );
    else {
      if (!process.env.DATABASE_URL) throw Error("Database not configured");
      pool = new pg.Pool({
        connectionString: databaseConnectionString(process.env.DATABASE_URL),
        ...runtimePoolOptions(),
        ssl: process.env.NODE_ENV === "production" ? databaseSsl() : undefined,
      });
    }
  }
  return pool;
}
export async function scoped<T>(
  actor: Principal | null,
  work: (db: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const db = await getPool().connect();
  try {
    await db.query("begin");
    await db.query("set local statement_timeout='5s'");
    await db.query(`set local role ${actor ? "authenticated" : "anon"}`);
    await db.query(
      "select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true),set_config('request.kxra.org_id',$3,true)",
      [
        actor?.id || "",
        JSON.stringify({
          sub: actor?.id,
          aal: actor?.aal,
          auth_time: actor?.auth_time,
          email: actor?.email,
          email_verified: actor?.email_verified,
          session_version: actor?.session_version,
          role: actor ? "authenticated" : "anon",
        }),
        actor?.organisation_id || "",
      ],
    );
    await db.query("select set_config('request.kxra.execution_mode',$1,true)", [
      actor?.source === "fixture" && localMode() && !process.env.VERCEL_ENV
        ? "fixture"
        : "hosted",
    ]);
    await db.query(
      "select set_config('request.kxra.hosted_room_jobs',$1,true),set_config('request.kxra.team_grant',$2,true)",
      [hostedRoomOperations() ? "on" : "off", actor?.room_worker_grant || ""],
    );
    if (actor?.room_worker_grant) {
      if (
        !hostedRoomOperations() ||
        !(
          await db.query(
            "select kxra_private.team_execution_grant_validate($1) active",
            [actor.room_worker_grant],
          )
        ).rows[0]?.active
      )
        throw Error("ROOM_EXECUTION_GRANT_UNAVAILABLE");
    }
    // Local-only self-service preparation cannot be enabled by request input/JWT metadata.
    await db.query(
      "select set_config('request.kxra.local_self_service',$1,true)",
      [
        localMode() &&
        !process.env.VERCEL_ENV &&
        actor?.source === "fake-provider"
          ? "on"
          : "off",
      ],
    );
    const hostedAdmission =
      !localMode() && hostedSelfServiceConfiguration() !== null;
    await db.query(
      "select set_config('request.kxra.hosted_self_service',$1,true),set_config('request.kxra.verified_supabase_identity',$2,true)",
      [
        hostedAdmission ? "on" : "off",
        hostedAdmission && actor?.source === "supabase" ? "on" : "off",
      ],
    );
    const result = await work(db);
    await db.query("commit");
    return result;
  } catch (e) {
    await db.query("rollback");
    throw e;
  } finally {
    db.release();
  }
}
export async function query<T = Record<string, unknown>>(
  actor: Principal | null,
  sql: string,
  values: unknown[] = [],
): Promise<T[]> {
  return scoped(actor, async (db) => (await db.query(sql, values)).rows as T[]);
}
