import pg from "pg";
import fs from "node:fs";
import path from "node:path";
export type Principal = { id: string; aal: "aal1" | "aal2" };
let pool: pg.Pool | undefined;
export function localMode() {
  return (
    process.env.KXRA_AUTH_MODE === "fixture" &&
    process.env.NODE_ENV !== "production" &&
    !process.env.VERCEL &&
    process.env.KXRA_ORIGIN === "http://127.0.0.1:3210" &&
    !process.env.NEXT_PUBLIC_SUPABASE_URL &&
    !process.env.DATABASE_URL &&
    !!process.env.KXRA_RUNTIME
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
