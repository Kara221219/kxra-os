import { z } from "zod";
import { getPool, localMode } from "../../../packages/db";
import { hostedRoomOperations } from "../../../packages/workspace/hosted-operations";
import { drainTeamJobs } from "./team-jobs";
import type { Actor } from "./auth";
const request = z.object({ request_id: z.string().uuid() }).strict();
/** A delivery can select one persisted grant; callers cannot supply identity or scope. */
export async function runHostedRoomDelivery(value: unknown) {
  const v = request.parse(value);
  if (!hostedRoomOperations() || localMode())
    throw Error("ROOM_WORKER_DISABLED");
  const db = await getPool().connect();
  let scope: { grant_id: string; room_id: string; actor: Actor } | null;
  try {
    await db.query("begin");
    await db.query("set local statement_timeout='5s'");
    // This private function is callable only by the existing NOINHERIT app login,
    // outside SET ROLE authenticated; it returns no provider key or job payload.
    scope = (
      await db.query("select kxra_room_worker.next($1) scope", [v.request_id])
    ).rows[0]?.scope;
    await db.query("commit");
  } catch (error) {
    await db.query("rollback");
    throw error;
  } finally {
    db.release();
  }
  if (!scope) return { processed: false };
  const result = await drainTeamJobs(scope.actor, {
    request_id: v.request_id,
    room_id: scope.room_id,
  });
  return {
    processed: result.processed,
    state: result.job?.state ?? null,
  };
}
