import { query, scoped } from "../../../packages/db";
import { uuid, recordInput, kinds } from "../../../packages/domain";
import { type Actor, HttpError, owner } from "./auth";
import crypto from "node:crypto";
export type Project = {
  id: string;
  code: string;
  name: string;
  status: string;
  stage: string;
  next_action: string;
  venture_score: number | null;
  confidence_score: number | null;
};
export type RecordRow = {
  id: string;
  created_by: string;
  project_id: string | null;
  kind: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  classification: string;
  visibility: string;
  status: string;
  version: number;
  created_at: string;
  updated_at: string;
};
export const listProjects = (a: Actor) =>
  query<Project>(
    a,
    "select id,code,name,status,stage,next_action,venture_score,confidence_score from kxra.projects order by code",
  );
export async function project(a: Actor, id: string) {
  if (!uuid.safeParse(id).success) throw new HttpError(404, "Not found");
  const rows = await query<Project>(
    a,
    "select id,code,name,status,stage,next_action,venture_score,confidence_score from kxra.projects where id=$1",
    [id],
  );
  if (!rows[0]) throw new HttpError(404, "Not found");
  return rows[0];
}
export async function listRecords(a: Actor, kind?: string, pid?: string) {
  if (kind && !kinds.includes(kind as (typeof kinds)[number]))
    throw new HttpError(400, "Invalid register");
  if (pid) await project(a, pid);
  return query<RecordRow>(
    a,
    `select * from kxra.records where ($1::text is null or kind::text=$1) and ($2::uuid is null or project_id=$2) order by updated_at desc,id limit 200`,
    [kind || null, pid || null],
  );
}
export async function getRecord(a: Actor, id: string) {
  if (!uuid.safeParse(id).success) throw new HttpError(404, "Not found");
  const r = await query<RecordRow>(
    a,
    "select * from kxra.records where id=$1",
    [id],
  );
  if (!r[0]) throw new HttpError(404, "Not found");
  return r[0];
}
export async function createRecord(a: Actor, input: unknown) {
  const parsed = recordInput.safeParse(input);
  if (!parsed.success)
    throw new HttpError(
      400,
      parsed.error.issues.map((x) => x.message).join("; "),
    );
  const v = parsed.data;
  if (v.project_id) await project(a, v.project_id);
  if (
    a.role !== "owner" &&
    (!v.project_id ||
      v.visibility !== "project_shared" ||
      !["idea", "note", "task", "experiment"].includes(v.kind))
  )
    throw new HttpError(403, "Access unavailable");
  return (
    await query<RecordRow>(
      a,
      "insert into kxra.records(org_id,project_id,kind,title,body,data,classification,visibility,created_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9) returning *",
      [
        a.org_id,
        v.project_id,
        v.kind,
        v.title,
        v.body,
        v.data,
        v.classification,
        v.visibility,
        a.id,
      ],
    )
  )[0];
}
export async function search(a: Actor, q: string, pid?: string) {
  if (pid) await project(a, pid);
  if (!q.trim()) return [];
  if (q.length > 500) throw new HttpError(400, "Search is too long");
  return query<RecordRow>(
    a,
    `select * from kxra.records where ($2::uuid is null or project_id=$2) and to_tsvector('english',title || ' ' || body) @@ plainto_tsquery('english',$1) order by updated_at desc limit 20`,
    [q, pid || null],
  );
}
export async function approval(
  a: Actor,
  input: {
    action: string;
    project_id: string | null;
    payload: Record<string, unknown>;
  },
) {
  owner(a);
  if (input.project_id) await project(a, input.project_id);
  if (
    ![
      "record.accept",
      "membership.change",
      "publish",
      "spend",
      "deploy",
    ].includes(input.action)
  )
    throw new HttpError(400, "Invalid approval action");
  const hash = crypto
    .createHash("sha256")
    .update(JSON.stringify(input.payload))
    .digest("hex");
  return (
    await query(
      a,
      "insert into kxra.approvals(org_id,project_id,action,payload,payload_hash,expires_at) values($1,$2,$3,$4,$5,now()+interval '24 hours') returning *",
      [a.org_id, input.project_id, input.action, input.payload, hash],
    )
  )[0];
}
