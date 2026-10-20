import crypto from "node:crypto";
import { z } from "zod";
import { query } from "../../../packages/db";
import { HttpError, type Actor } from "./auth";
import { teamRoom } from "./team-room";
const id = z.string().uuid();
export type AgentMemory = {
  id: string;
  agent_id: string;
  scope: "ROOM";
  kind: "PREFERENCE" | "FEEDBACK" | "REFERENCE" | "CONTEXT";
  title: string;
  version: number;
  body: string;
  origin: "HUMAN" | "RUN";
  source_run_id: string | null;
  state: "DRAFT" | "APPROVED" | "REJECTED" | "REVOKED" | "DELETED";
  expires_at: string;
  created_by: string;
  eligible: boolean;
  content_sha256: string | null;
};
const memoryColumns =
  "id,agent_id,scope,kind,title,version,body,origin,source_run_id,state,expires_at,created_by";
function reviewHash(memory: Omit<AgentMemory, "content_sha256">): AgentMemory {
  return {
    ...memory,
    content_sha256:
      memory.state === "DELETED"
        ? null
        : crypto.createHash("sha256").update(memory.body).digest("hex"),
  };
}
export async function teamMemories(a: Actor, r: string) {
  await teamRoom(a, r);
  const [rows, origins] = await Promise.all([
    query<Omit<AgentMemory, "content_sha256">>(
      a,
      `select ${memoryColumns},kxra_private.team_memory_allowed(id,agent_id) eligible from kxra.team_memory_versions where room_id=$1 order by created_at desc,id desc limit 100`,
      [r],
    ),
    query<{ id: string; agent_id: string; created_at: string }>(
      a,
      "select id,agent_id,created_at from kxra.team_runs where room_id=$1 and status='SUCCEEDED' and cardinality(memory_ids)=0 order by created_at desc,id desc limit 100",
      [r],
    ),
  ]);
  return { entries: rows.map(reviewHash), origins };
}
export async function teamMemoryRecall(a: Actor, r: string, agentId: string) {
  await teamRoom(a, r);
  const agent = id.parse(agentId);
  if (
    !(
      await query(
        a,
        "select id from kxra.team_agents where id=$1 and room_id=$2",
        [agent, r],
      )
    ).length
  )
    throw new HttpError(404, "Agent unavailable");
  const rows = await query<Omit<AgentMemory, "content_sha256">>(
    a,
    `select ${memoryColumns},true eligible from kxra.team_memory_versions where room_id=$1 and agent_id=$2 and kxra_private.team_memory_allowed(id,$2) order by kind,title,version,id limit 5`,
    [r, agent],
  );
  return rows.map(reviewHash);
}
export async function teamMemoryPinned(
  a: Actor,
  r: string,
  agentId: string,
  ids: string[],
) {
  await teamRoom(a, r);
  const selected = z.array(id).max(5).parse(ids);
  if (!selected.length) return [];
  const rows = await query<Omit<AgentMemory, "content_sha256">>(
    a,
    `select ${memoryColumns},true eligible from kxra.team_memory_versions where room_id=$1 and agent_id=$2 and id=any($3::uuid[]) and kxra_private.team_memory_allowed(id,$2) order by kind,title,version,id`,
    [r, agentId, selected],
  );
  if (rows.length !== selected.length)
    throw new HttpError(404, "Memory unavailable");
  return rows.map(reviewHash);
}
export async function teamMemoryMutation(
  a: Actor,
  r: string,
  action: string,
  value: unknown,
) {
  await teamRoom(a, r);
  if (action === "memories") {
    const v = z
      .object({
        request_id: id,
        agent_id: id,
        kind: z.enum(["PREFERENCE", "FEEDBACK", "REFERENCE", "CONTEXT"]),
        title: z.string().trim().min(1).max(100),
        body: z.string().trim().min(1).max(2000),
        source_run_id: id.nullable().default(null),
        expires_at: z
          .string()
          .datetime({ offset: true })
          .nullable()
          .default(null),
      })
      .strict()
      .parse(value);
    return (
      await query<{ id: string }>(
        a,
        "select kxra.team_memory_propose($1,$2,$3,$4,$5,$6,$7,$8) id",
        [
          v.request_id,
          r,
          v.agent_id,
          v.kind,
          v.title,
          v.body,
          v.source_run_id,
          v.expires_at,
        ],
      )
    )[0];
  }
  if (action === "memory-review") {
    const v = z
      .object({
        memory_id: id,
        state: z.enum(["APPROVED", "REJECTED", "REVOKED", "DELETED"]),
      })
      .strict()
      .parse(value);
    // Reduction/removal is allowed by the narrow DB function even if source
    // revocation has hidden the body. It never returns that hidden content.
    await query(a, "select kxra.team_memory_review($1,$2,$3)", [
      r,
      v.memory_id,
      v.state,
    ]);
    return { saved: true };
  }
  throw new HttpError(404, "Memory action unavailable");
}
