import { hostedSupabaseConfiguration } from "../authz/hosted-supabase";
import crypto from "node:crypto";
import { z } from "zod";
import { getPool } from "../db";
export function roomMaintenanceAuthorized(
  header: string | null,
  environment: Record<string, string | undefined> = process.env,
) {
  if (
    environment.KXRA_ROOM_MAINTENANCE_ENABLED !== "true" ||
    hostedSupabaseConfiguration(environment) === null
  )
    return false;
  const key = environment.KXRA_ROOM_WORKER_SECRET;
  if (!key || !/^[a-f0-9]{64}$/i.test(key)) return false;
  const expected = Buffer.from(`Bearer ${key}`),
    actual = Buffer.from(header || "");
  return (
    actual.length === expected.length &&
    crypto.timingSafeEqual(actual, expected)
  );
}
export const roomMaintenanceInput = z
  .object({ request_id: z.string().uuid() })
  .strict();
export async function roomMaintenanceCommand(value: unknown, health = false) {
  const request = health ? null : roomMaintenanceInput.parse(value);
  const db = await getPool().connect();
  try {
    await db.query("begin");
    await db.query("set local statement_timeout='5s'");
    const result = await db.query(
      health
        ? "select kxra_room_worker.health() result"
        : "select kxra_room_worker.maintain($1) result",
      request ? [request.request_id] : [],
    );
    await db.query("commit");
    return result.rows[0]?.result;
  } catch (error) {
    await db.query("rollback");
    throw error;
  } finally {
    db.release();
  }
}
