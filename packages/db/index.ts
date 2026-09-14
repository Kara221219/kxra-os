import pg from "pg";
import fs from "node:fs";
import path from "node:path";
export type Principal = {
  id: string;
  aal: "aal1" | "aal2";
  auth_time?: number;
  email?: string;
  email_verified?: boolean;
};
let pool: pg.Pool | undefined;
export function localMode(environment: NodeJS.ProcessEnv = process.env) {
  return (
    environment.KXRA_AUTH_MODE === "fixture" &&
    environment.NODE_ENV !== "production" &&
    !environment.VERCEL &&
    environment.KXRA_ORIGIN === "http://127.0.0.1:3210" &&
    !environment.NEXT_PUBLIC_SUPABASE_URL &&
    !environment.DATABASE_URL &&
    !!environment.KXRA_RUNTIME &&
    typeof environment.KXRA_LOCAL_SECRET === "string" &&
    environment.KXRA_LOCAL_SECRET.length >= 64
  );
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
        connectionString: process.env.DATABASE_URL,
        max: 10,
        ssl:
          process.env.NODE_ENV === "production"
            ? { rejectUnauthorized: true }
            : undefined,
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
      "select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",
      [
        actor?.id || "",
        JSON.stringify({
          sub: actor?.id,
          aal: actor?.aal,
          auth_time: actor?.auth_time,
          email: actor?.email,
          email_verified: actor?.email_verified,
          role: actor ? "authenticated" : "anon",
        }),
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
