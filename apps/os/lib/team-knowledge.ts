import crypto from "node:crypto";
import { z } from "zod";
import { query, localMode } from "../../../packages/db";
import { privateObjectStore, sha256 } from "../../../packages/storage";
import { HttpError, type Actor } from "./auth";
import { teamRoom } from "./team-room";
import { teamMemories } from "./team-memory";

const id = z.string().uuid();
export type RoomFile = {
  file_version_id: string;
  file_id: string;
  filename: string;
  version: number;
  active: boolean;
};
export type RoomSkill = {
  id: string;
  name: string;
  version: number;
  instructions: string;
  content_sha256: string;
  state: "DRAFT" | "APPROVED" | "REJECTED" | "REVOKED";
};
export type RoomChunk = {
  id: string;
  file_version_id: string;
  filename: string;
  source_version: number;
  content: string;
  content_sha256: string;
};
export async function teamKnowledge(a: Actor, r: string) {
  const room = await teamRoom(a, r);
  const [files, available_files, skills, bindings, memory] = await Promise.all([
    query<RoomFile>(
      a,
      `select attachment.file_version_id,version.file_id,version.filename,version.version,attachment.active
       from kxra.team_room_files attachment join kxra.file_versions version on version.id=attachment.file_version_id
       where attachment.room_id=$1 order by attachment.created_at desc limit 100`,
      [r],
    ),
    query<RoomFile>(
      a,
      `select version.id file_version_id,version.file_id,version.filename,version.version,true active
       from kxra.file_versions version where version.project_id=$2
        and kxra_private.team_source_eligible($1,version.id)
       order by version.created_at desc,version.id desc limit 100`,
      [r, room.project_id],
    ),
    query<RoomSkill>(
      a,
      "select id,name,version,instructions,content_sha256,state from kxra.team_skill_versions where room_id=$1 order by name,version desc limit 100",
      [r],
    ),
    query<{ agent_id: string; skill_id: string; enabled: boolean }>(
      a,
      "select agent_id,skill_id,enabled from kxra.team_agent_skills where room_id=$1 order by created_at limit 300",
      [r],
    ),
    teamMemories(a, r),
  ]);
  return { files, available_files, skills, bindings, memory };
}
export async function teamKnowledgeSearch(a: Actor, r: string, value: unknown) {
  const v = z
    .object({ q: z.string().trim().max(200) })
    .strict()
    .parse(value);
  await teamRoom(a, r);
  if (!v.q) return [];
  return query<RoomChunk>(
    a,
    `with requested as (select plainto_tsquery('english',$2) term)
     select chunk.id,chunk.file_version_id,version.filename,chunk.source_version,
       chunk.content,chunk.content_sha256
     from kxra.knowledge_chunks chunk join kxra.file_versions version on version.id=chunk.file_version_id
     join kxra.team_room_files attachment on attachment.file_version_id=chunk.file_version_id and attachment.room_id=$1 and attachment.active
     cross join requested where kxra_private.team_chunk_allowed($1,chunk.id) and chunk.search_document @@ requested.term
     order by ts_rank(chunk.search_document,requested.term) desc,chunk.id limit 10`,
    [r, v.q],
  );
}
export async function teamKnowledgeMutation(
  a: Actor,
  r: string,
  action: string,
  value: unknown,
) {
  await teamRoom(a, r);
  if (action === "files") {
    const v = z
      .object({ file_version_id: id, active: z.boolean() })
      .strict()
      .parse(value);
    await query(a, "select kxra.team_file_attach($1,$2,$3)", [
      r,
      v.file_version_id,
      v.active,
    ]);
  } else if (action === "skills") {
    const v = z
      .object({
        request_id: id,
        name: z.string().trim().min(1).max(100),
        instructions: z.string().trim().min(1).max(4000),
      })
      .strict()
      .parse(value);
    return (
      await query<{ id: string }>(
        a,
        "select kxra.team_skill_propose($1,$2,$3,$4) id",
        [v.request_id, r, v.name, v.instructions],
      )
    )[0];
  } else if (action === "skill-review") {
    const v = z
      .object({
        skill_id: id,
        state: z.enum(["APPROVED", "REJECTED", "REVOKED"]),
      })
      .strict()
      .parse(value);
    if (
      !(
        await query(
          a,
          "select id from kxra.team_skill_versions where room_id=$1 and id=$2",
          [r, v.skill_id],
        )
      ).length
    )
      throw new HttpError(404, "Skill unavailable");
    await query(a, "select kxra.team_skill_review($1,$2)", [
      v.skill_id,
      v.state,
    ]);
  } else if (action === "agent-skill") {
    const v = z
      .object({ agent_id: id, skill_id: id, enabled: z.boolean() })
      .strict()
      .parse(value);
    if (
      !(
        await query(
          a,
          "select id from kxra.team_agents where room_id=$1 and id=$2",
          [r, v.agent_id],
        )
      ).length
    )
      throw new HttpError(404, "Agent unavailable");
    await query(a, "select kxra.team_agent_skill($1,$2,$3)", [
      v.agent_id,
      v.skill_id,
      v.enabled,
    ]);
  } else throw new HttpError(404, "Action unavailable");
  return { saved: true };
}
export async function teamFileDownload(a: Actor, r: string, versionId: string) {
  await teamRoom(a, r);
  const v = id.parse(versionId);
  const file = (
    await query<{ file_id: string }>(
      a,
      `select version.file_id from kxra.team_room_files attachment join kxra.file_versions version on version.id=attachment.file_version_id
     where attachment.room_id=$1 and version.id=$2 and attachment.active and kxra_private.team_source_eligible($1,$2)`,
      [r, v],
    )
  )[0];
  if (!file) throw new HttpError(404, "File unavailable");
  const delivery = (
    await query<{
      delivery_id: string;
      file_version_id: string;
      object_key: string;
      filename: string;
      mime_type: string;
    }>(a, "select * from kxra.authorize_file_delivery($1,$2)", [
      file.file_id,
      crypto.randomUUID(),
    ])
  )[0];
  if (!delivery) throw new HttpError(404, "File unavailable");
  let bytes: Buffer;
  try {
    if (delivery.file_version_id !== v) throw Error("Version changed");
    bytes = await privateObjectStore(localMode()).get(delivery.object_key);
  } catch {
    await query(a, "select kxra.complete_file_delivery($1,$2,0)", [
      delivery.delivery_id,
      sha256(Buffer.alloc(0)),
    ]);
    throw new HttpError(409, "File is temporarily unavailable");
  }
  const allowed = (
    await query<{ allowed: boolean }>(
      a,
      `select kxra.complete_file_delivery($3,case when exists(select 1 from kxra.team_room_files
      where room_id=$1 and file_version_id=$2 and active and kxra_private.team_source_eligible($1,$2)) then $4 else '' end,$5) allowed`,
      [r, v, delivery.delivery_id, sha256(bytes), bytes.length],
    )
  )[0]?.allowed;
  if (!allowed) throw new HttpError(404, "File unavailable");
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": delivery.mime_type,
      "Content-Length": String(bytes.length),
      "Content-Disposition": `attachment; filename="download"; filename*=UTF-8''${encodeURIComponent(delivery.filename)}`,
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
