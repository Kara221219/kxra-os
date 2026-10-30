import { z } from "zod";
import { query } from "../../../packages/db";
import type { Actor } from "./auth";
import { teamRoom } from "./team-room";
export async function roomOperationRecovery(actor: Actor, room: string) {
  await teamRoom(actor, room);
  const [cases, reviewed, rollout, connections, authority] = await Promise.all([
    query<{
      id: string;
      job_id: string;
      cause: string;
      state: string;
      version: number;
      created_at: string;
      acknowledged_at: string | null;
    }>(
      actor,
      "select id,job_id,cause,state,version,created_at,acknowledged_at from kxra.team_uncertainty_cases where room_id=$1 order by created_at desc,id desc limit 100",
      [room],
    ),
    query<{ id: string; uncertainty_acknowledged_at: string }>(
      actor,
      "select id,uncertainty_acknowledged_at from kxra.team_jobs where room_id=$1 and state='UNCERTAIN' and uncertainty_acknowledged_at is not null and (requested_by=$2 or kxra_private.manages_team_room($1)) order by uncertainty_acknowledged_at desc,id desc limit 100",
      [room, actor.id],
    ),
    query<{
      connection_id: string;
      starts_at: string;
      active: boolean;
      expires_at: string;
      max_daily_dispatches: number;
      revoked_at: string | null;
    }>(
      actor,
      "select connection_id,starts_at,expires_at,max_daily_dispatches,revoked_at,(revoked_at is null and starts_at<=now() and expires_at>now()) active from kxra.team_room_rollouts where room_id=$1",
      [room],
    ),
    query<{ id: string; name: string; model: string; allowed: boolean }>(
      actor,
      "select id,name,model,kxra_private.team_room_byok_allowed($1,id) allowed from kxra.team_connections where id=(select connection_id from kxra.team_room_rollouts where room_id=$1) and created_by=$2 and enabled",
      [room, actor.id],
    ),
    query<{ can_review: boolean }>(
      actor,
      "select kxra_private.manages_team_room($1) can_review",
      [room],
    ),
  ]);
  return {
    cases,
    reviewed,
    rollout: rollout[0] ?? null,
    connection: connections[0] ?? null,
    can_review: authority[0]?.can_review === true,
  };
}
const action = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("ACKNOWLEDGE_NO_RETRY"),
      case_id: z.string().uuid(),
      version: z.number().int().positive(),
      reviewed: z.literal(true),
    })
    .strict(),
  z
    .object({
      action: z.literal("APPROVE_CUSTOMER_BYOK"),
      connection_id: z.string().uuid(),
      customer_owned: z.literal(true),
    })
    .strict(),
  z
    .object({
      action: z.literal("REVOKE_CUSTOMER_BYOK"),
      connection_id: z.string().uuid(),
    })
    .strict(),
]);
export async function reviewRoomOperationRecovery(
  actor: Actor,
  room: string,
  value: unknown,
) {
  await teamRoom(actor, room);
  const v = action.parse(value);
  if (v.action === "ACKNOWLEDGE_NO_RETRY")
    await query(actor, "select kxra.team_uncertainty_acknowledge($1,$2,$3)", [
      room,
      v.case_id,
      v.version,
    ]);
  else
    await query(actor, "select kxra.team_room_byok_review($1,$2,$3)", [
      room,
      v.connection_id,
      v.action === "APPROVE_CUSTOMER_BYOK" ? "APPROVE" : "REVOKE",
    ]);
  return roomOperationRecovery(actor, room);
}
