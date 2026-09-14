import { query, scoped } from "../../../packages/db";
import { uuid, recordInput, kinds } from "../../../packages/domain";
import { type Actor, HttpError, owner } from "./auth";
export type Project = {
  id: string;
  code: string;
  name: string;
  status: string;
  stage: string;
  next_action: string;
  venture_score: number | null;
  confidence_score: number | null;
  live_execution_enabled: boolean;
  product_creation_enabled: boolean;
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
  supersedes_id: string | null;
  created_at: string;
  updated_at: string;
};
export type RecordLink = {
  id: string;
  from_record_id: string;
  from_version: number;
  relation: string;
  to_record_id: string;
  to_version: number;
};
export type ExperimentResult = {
  id: string;
  experiment_id: string;
  experiment_version: number;
  outcome: "success" | "failure" | "inconclusive" | "stopped";
  observations: string;
  metric_value: string;
  recorded_by: string;
  created_at: string;
};
export type WorkflowTask = {
  id: string;
  project_id: string;
  context_record_id: string;
  context_version: number;
  title: string;
  acceptance_criteria: string;
  assignee_id: string;
  state: "assigned" | "completed";
  completion_note: string | null;
  version: number;
};
export type WorkflowMember = {
  id: string;
  display_name: string;
  role: string;
};
export type OperatingLoop = {
  records: RecordRow[];
  links: RecordLink[];
  results: ExperimentResult[];
  result_evidence: {
    result_id: string;
    evidence_id: string;
    evidence_version: number;
  }[];
  tasks: WorkflowTask[];
  members: WorkflowMember[];
};
export const listProjects = (a: Actor) =>
  query<Project>(
    a,
    "select id,code,name,status,stage,next_action,venture_score,confidence_score,live_execution_enabled,product_creation_enabled from kxra.projects order by code",
  );
export async function project(a: Actor, id: string) {
  if (!uuid.safeParse(id).success) throw new HttpError(404, "Not found");
  const rows = await query<Project>(
    a,
    "select id,code,name,status,stage,next_action,venture_score,confidence_score,live_execution_enabled,product_creation_enabled from kxra.projects where id=$1",
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
  if (["experiment", "decision", "task", "run"].includes(v.kind))
    throw new HttpError(400, "Use the typed operating workflow");
  if (v.project_id) await project(a, v.project_id);
  if (
    a.role !== "owner" &&
    (!v.project_id ||
      v.visibility !== "project_shared" ||
      !["idea", "note"].includes(v.kind))
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
export async function operatingLoop(
  a: Actor,
  pid: string,
): Promise<OperatingLoop> {
  await project(a, pid);
  return scoped(a, async (db) => {
    const records = await db.query<RecordRow>(
      `select * from kxra.records
       where project_id=$1 and (kind in ('idea','experiment','decision') or status='accepted')
       order by created_at,id`,
      [pid],
    );
    const links = await db.query<RecordLink>(
      `select l.id,l.from_record_id,l.from_version,l.relation,l.to_record_id,l.to_version
       from kxra.record_links l
       join kxra.records r on r.id=l.from_record_id and r.version=l.from_version
       where l.project_id=$1 order by l.created_at,l.id`,
      [pid],
    );
    const results = await db.query<ExperimentResult>(
      `select er.id,er.experiment_id,er.experiment_version,er.outcome,
              er.observations,er.metric_value,er.recorded_by,er.created_at
       from kxra.experiment_results er
       join kxra.records r on r.id=er.experiment_id and r.version=er.experiment_version
       where er.project_id=$1 order by er.created_at,er.id`,
      [pid],
    );
    const evidence = await db.query<OperatingLoop["result_evidence"][number]>(
      `select re.result_id,re.evidence_id,re.evidence_version
       from kxra.result_evidence re
       join kxra.experiment_results er on er.id=re.result_id
       where er.project_id=$1 order by re.result_id,re.evidence_id`,
      [pid],
    );
    const tasks = await db.query<WorkflowTask>(
      `select id,project_id,context_record_id,context_version,title,acceptance_criteria,
              assignee_id,state,completion_note,version
       from kxra.workflow_tasks where project_id=$1 order by assigned_at,id`,
      [pid],
    );
    const members =
      a.role === "owner"
        ? await db.query<WorkflowMember>(
            `select m.id,m.display_name,pm.role
             from kxra.members m join kxra.project_memberships pm on pm.user_id=m.id and pm.org_id=m.org_id
             where pm.project_id=$1 and m.active and pm.active
               and (pm.expires_at is null or pm.expires_at>now())
             order by m.display_name,m.id`,
            [pid],
          )
        : { rows: [] as WorkflowMember[] };
    return {
      records: records.rows,
      links: links.rows,
      results: results.rows,
      result_evidence: evidence.rows,
      tasks: tasks.rows,
      members: members.rows,
    };
  });
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
      "project.gate",
      "publish",
      "spend",
      "deploy",
    ].includes(input.action)
  )
    throw new HttpError(400, "Invalid approval action");
  if (input.action === "project.gate") {
    if (!input.project_id) throw new HttpError(400, "Project required");
    return (
      await query(
        a,
        "select * from kxra.request_project_gate_approval($1,$2)",
        [input.project_id, input.payload],
      )
    )[0];
  }
  return (
    await query(a, "select * from kxra.request_approval($1,$2,$3)", [
      input.action,
      input.project_id,
      input.payload,
    ])
  )[0];
}
export async function totals(a: Actor) {
  return query<{ currency: string; total: string; entries: string }>(
    a,
    "select currency,total::numeric(30,4)::text,entries::text from kxra.finance_totals()",
  );
}
export async function counts(a: Actor) {
  return (
    await query<{ records: string; open_risks: string }>(
      a,
      "select records::text,open_risks::text from kxra.dashboard_counts()",
    )
  )[0];
}
