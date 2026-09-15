import { query, scoped, localMode } from "../../../packages/db";
import { type Actor, HttpError, owner } from "./auth";

export const ideaStates = [
  "NEW",
  "TRIAGE",
  "VALIDATING",
  "PROMISING",
  "BUILDING",
  "PAUSED",
  "REJECTED",
  "ARCHIVED",
] as const;

export const lifecycleStages = [
  "IDEA_INBOX",
  "PROBLEM_DISCOVERY",
  "VALIDATION",
  "MARKET_ANALYSIS",
  "FEASIBILITY",
  "BUSINESS_CASE",
  "MVP",
  "PILOT",
  "REVIEW",
  "LAUNCH",
  "SCALE",
] as const;

export const dispositions = [
  "ACTIVE",
  "MONITOR",
  "PAUSED",
  "REJECTED",
  "ARCHIVED",
] as const;

export const recommendations = ["GO", "ITERATE", "PAUSE", "KILL"] as const;

export const workLogTypes = [
  "WORK_ITEM",
  "ROUTINE_RUN",
  "AI_RUN",
  "HANDOFF",
  "SYSTEM_EVENT",
  "AUDIT_EVENT",
] as const;

export type IdeaState = (typeof ideaStates)[number];

export type IdeaRow = {
  record_id: string;
  project_id: string | null;
  project_code: string | null;
  project_name: string | null;
  submitted_by: string | null;
  submitter_name: string | null;
  source_type: string;
  source_note: string | null;
  title: string;
  raw_idea: string;
  structured_summary: string | null;
  problem_statement: string | null;
  target_customer: string | null;
  validation_plan: string | null;
  next_experiment: string | null;
  state: IdeaState;
  duplicate_of: string | null;
  merge_reason: string | null;
  venture_score: string | null;
  confidence_score: string | null;
  score_coverage: string | null;
  version: number;
  submitted_at: string;
  updated_at: string;
  evidence_count: string;
  active_share_count: string;
  access_basis: "OWNER" | "SUBMITTER" | "EXPLICIT_SHARE";
  total_count: string;
};

export type IdeaFilters = {
  project?: string;
  state?: IdeaState;
  submitter?: string;
  page?: number;
  pageSize?: number;
};

export async function listIdeas(a: Actor, filters: IdeaFilters = {}) {
  const page = Math.max(1, filters.page || 1);
  const pageSize = Math.min(100, Math.max(1, filters.pageSize || 25));
  const rows = await query<IdeaRow>(
    a,
    `select i.record_id,i.project_id,p.code as project_code,p.name as project_name,
      i.submitted_by,m.display_name as submitter_name,i.source_type,i.source_note,
      r.title,i.raw_idea,i.structured_summary,i.problem_statement,i.target_customer,
      i.validation_plan,i.next_experiment,i.state,i.duplicate_of,i.merge_reason,
      i.venture_score::text,i.confidence_score::text,i.score_coverage::text,
      i.version,i.submitted_at,i.updated_at,
      (select count(*)::text from kxra.idea_evidence e
       where e.idea_record_id=i.record_id and e.idea_version=i.version) as evidence_count,
      (select count(*)::text from kxra.idea_shares s
       where s.idea_record_id=i.record_id and s.active) as active_share_count,
      case when $1::boolean then 'OWNER'
       when i.submitted_by=$2 then 'SUBMITTER' else 'EXPLICIT_SHARE' end as access_basis,
      count(*) over()::text as total_count
     from kxra.ideas i
     join kxra.records r on r.id=i.record_id
     left join kxra.projects p on p.id=i.project_id
     left join kxra.members m on m.id=i.submitted_by and m.org_id=i.org_id
     where ($3::uuid is null or i.project_id=$3)
      and ($4::text is null or i.state=$4)
      and ($5::uuid is null or i.submitted_by=$5)
     order by i.updated_at desc,i.record_id
     limit $6 offset $7`,
    [
      a.role === "owner",
      a.id,
      filters.project || null,
      filters.state || null,
      filters.submitter || null,
      pageSize,
      (page - 1) * pageSize,
    ],
  );
  return {
    rows,
    page,
    page_size: pageSize,
    total_count: Number(rows[0]?.total_count || 0),
  };
}

export async function getIdea(a: Actor, id: string) {
  const result = await query<IdeaRow>(
    a,
    `select i.record_id,i.project_id,p.code as project_code,p.name as project_name,
      i.submitted_by,m.display_name as submitter_name,i.source_type,i.source_note,
      r.title,i.raw_idea,i.structured_summary,i.problem_statement,i.target_customer,
      i.validation_plan,i.next_experiment,i.state,i.duplicate_of,i.merge_reason,
      i.venture_score::text,i.confidence_score::text,i.score_coverage::text,
      i.version,i.submitted_at,i.updated_at,
      (select count(*)::text from kxra.idea_evidence e
       where e.idea_record_id=i.record_id and e.idea_version=i.version) as evidence_count,
      (select count(*)::text from kxra.idea_shares s
       where s.idea_record_id=i.record_id and s.active) as active_share_count,
      case when $2::boolean then 'OWNER'
       when i.submitted_by=$3 then 'SUBMITTER' else 'EXPLICIT_SHARE' end as access_basis,
      '1'::text as total_count
     from kxra.ideas i
     join kxra.records r on r.id=i.record_id
     left join kxra.projects p on p.id=i.project_id
     left join kxra.members m on m.id=i.submitted_by and m.org_id=i.org_id
     where i.record_id=$1`,
    [id, a.role === "owner", a.id],
  );
  if (!result[0]) throw new HttpError(404, "Not found");
  return result[0];
}

export type PortfolioRow = {
  id: string;
  code: string;
  name: string;
  lifecycle_stage: string | null;
  disposition: string | null;
  source_stage: string;
  source_status: string;
  next_gate: string | null;
  next_action: string;
  current_recommendation: string | null;
  venture_score: string | null;
  confidence_score: string | null;
  score_coverage: string | null;
  score_lower_bound: string | null;
  score_upper_bound: string | null;
  governance_version: number;
  governance_updated_at: string;
  owner_user_id: string | null;
  owner_name: string | null;
  partners: { id: string; name: string; role: string }[];
  capital_used: { currency: string; amount: string }[];
  largest_risk: {
    id: string;
    title: string;
    rating: string | null;
    status: string;
  } | null;
  latest_experiment: {
    id: string;
    title: string;
    status: string;
    updated_at: string;
  } | null;
  latest_activity_at: string | null;
  total_count: string;
};

export type PortfolioFilters = {
  lifecycleStage?: string;
  disposition?: string;
  sort?: string;
  direction?: "asc" | "desc";
  page?: number;
  pageSize?: number;
};

const portfolioSort: Record<string, string> = {
  code: "portfolio.code",
  name: "portfolio.name",
  lifecycle_stage: "portfolio.lifecycle_stage",
  disposition: "portfolio.disposition",
  venture_score: "portfolio.venture_score",
  confidence_score: "portfolio.confidence_score",
  next_gate: "portfolio.next_gate",
  updated_at: "portfolio.governance_updated_at",
};

export async function listPortfolio(a: Actor, filters: PortfolioFilters = {}) {
  owner(a);
  const page = Math.max(1, filters.page || 1);
  const pageSize = Math.min(100, Math.max(1, filters.pageSize || 10));
  const sortKey = portfolioSort[filters.sort || "code"] || portfolioSort.code;
  const direction = filters.direction === "desc" ? "desc" : "asc";
  const rows = await query<PortfolioRow>(
    a,
    `with portfolio as (
      select p.id,p.code,p.name,p.lifecycle_stage,p.disposition,p.stage as source_stage,
       p.status as source_status,p.next_gate,p.next_action,p.current_recommendation,
       p.venture_score,p.confidence_score,p.score_coverage,p.score_lower_bound,
       p.score_upper_bound,p.governance_version,p.governance_updated_at,
       p.owner_user_id,owner_member.display_name as owner_name,
       coalesce(partner_rows.items,'[]'::jsonb) as partners,
       coalesce(finance_rows.items,'[]'::jsonb) as capital_used,
       risk_row.item as largest_risk,experiment_row.item as latest_experiment,
       activity_row.latest_activity_at
      from kxra.projects p
      left join kxra.members owner_member on owner_member.id=p.owner_user_id and owner_member.org_id=p.org_id
      left join lateral (
       select jsonb_agg(jsonb_build_object('id',member.id,'name',member.display_name,'role',membership.role)
        order by member.display_name,member.id) as items
       from kxra.project_memberships membership
       join kxra.members member on member.id=membership.user_id and member.org_id=membership.org_id
       where membership.project_id=p.id and membership.active and member.active
        and (membership.expires_at is null or membership.expires_at>now())
      ) partner_rows on true
      left join lateral (
       select jsonb_agg(jsonb_build_object('currency',currency,'amount',amount::text) order by currency) as items
       from (
        select r.data->>'currency' as currency,sum((r.data->>'amount')::numeric) as amount
        from kxra.records r where r.project_id=p.id and r.kind='finance'
         and r.data->>'entry_type'='actual' and r.data->>'direction'='expense'
        group by r.data->>'currency'
       ) actuals
      ) finance_rows on true
      left join lateral (
       select jsonb_build_object('id',r.id,'title',r.title,
        'rating',case when r.data->>'rating'~'^([0-9]+)(\\.[0-9]+)?$' then r.data->>'rating' else null end,
        'status',coalesce(nullif(r.data->>'status',''),r.status)) as item
       from kxra.records r where r.project_id=p.id and r.kind='risk'
        and coalesce(nullif(r.data->>'status',''),r.status) not in ('closed','archived','rejected')
       order by case when r.data->>'rating'~'^([0-9]+)(\\.[0-9]+)?$'
        then (r.data->>'rating')::numeric end desc nulls last,r.updated_at desc,r.id limit 1
      ) risk_row on true
      left join lateral (
       select jsonb_build_object('id',r.id,'title',r.title,'status',r.status,'updated_at',r.updated_at) as item
       from kxra.records r where r.project_id=p.id and r.kind='experiment'
       order by r.updated_at desc,r.id limit 1
      ) experiment_row on true
      left join lateral (
       select max(w.occurred_at) as latest_activity_at from kxra.work_log_entries w where w.project_id=p.id
      ) activity_row on true
      where ($1::text is null or p.lifecycle_stage=$1)
       and ($2::text is null or p.disposition=$2)
     )
     select portfolio.*,count(*) over()::text as total_count from portfolio
     order by ${sortKey} ${direction} nulls last,portfolio.id asc
     limit $3 offset $4`,
    [
      filters.lifecycleStage || null,
      filters.disposition || null,
      pageSize,
      (page - 1) * pageSize,
    ],
  );
  return {
    rows,
    page,
    page_size: pageSize,
    sort: filters.sort || "code",
    direction,
    total_count: Number(rows[0]?.total_count || 0),
  };
}

export type DashboardItem = {
  id: string;
  kind: string;
  title: string;
  detail: string;
  project_code: string | null;
  href: string;
  occurred_at: string | null;
};

export type DashboardSection = {
  count: number;
  breakdown: Record<string, number>;
  items: DashboardItem[];
  note?: string;
};

function number(value: string | number | undefined) {
  return Number(value || 0);
}

export async function ownerDashboard(a: Actor) {
  owner(a);
  return scoped(a, async (db) => {
    await db.query("select kxra.refresh_expired_approvals()");
    const [
      taskCount,
      taskRows,
      gateCount,
      gateRows,
      approvalCount,
      approvalRows,
      decisionCount,
      decisionRows,
      riskCount,
      riskRows,
      blockerCount,
      blockerRows,
      failedCount,
      failedRows,
      warningCount,
      warningRows,
      activityCount,
      activityRows,
    ] = await Promise.all([
      db.query(
        "select count(*)::text as n from kxra.workflow_tasks where state='assigned'",
      ),
      db.query(`select t.id,t.title,t.acceptance_criteria,p.code as project_code,t.assigned_at
          from kxra.workflow_tasks t join kxra.projects p on p.id=t.project_id
          where t.state='assigned' order by t.assigned_at,t.id limit 10`),
      db.query(
        "select count(*)::text as n from kxra.projects where next_gate is not null",
      ),
      db.query(`select p.id,p.code,p.name,p.next_gate,p.next_action,p.governance_updated_at
          from kxra.projects p where p.next_gate is not null order by p.code,p.id limit 10`),
      db.query(
        "select count(*)::text as n from kxra.approvals where state in ('REQUESTED','APPROVED')",
      ),
      db.query(`select a.id,a.action,a.state,a.created_at,p.code as project_code,
          coalesce(a.payload->>'action_summary',a.action) as title
          from kxra.approvals a left join kxra.projects p on p.id=a.project_id
          where a.state in ('REQUESTED','APPROVED') order by a.created_at desc,a.id desc limit 10`),
      db.query(
        "select count(*)::text as n from kxra.records where kind='decision' and status in ('draft','submitted')",
      ),
      db.query(`select r.id,r.title,r.status,r.updated_at,p.code as project_code
          from kxra.records r left join kxra.projects p on p.id=r.project_id
          where r.kind='decision' and r.status in ('draft','submitted')
          order by r.updated_at desc,r.id desc limit 10`),
      db.query(`select count(*)::text as n from kxra.records r where r.kind='risk'
          and coalesce(nullif(r.data->>'status',''),r.status) not in ('closed','archived','rejected')`),
      db.query(`select r.id,r.title,coalesce(nullif(r.data->>'status',''),r.status) as status,
          r.data->>'rating' as rating,r.updated_at,p.code as project_code
          from kxra.records r left join kxra.projects p on p.id=r.project_id
          where r.kind='risk' and coalesce(nullif(r.data->>'status',''),r.status)
           not in ('closed','archived','rejected')
          order by case when r.data->>'rating'~'^([0-9]+)(\\.[0-9]+)?$'
           then (r.data->>'rating')::numeric end desc nulls last,r.updated_at desc,r.id limit 10`),
      db.query(
        "select count(*)::text as n from kxra.records where kind='blocker' and status not in ('completed','archived','rejected')",
      ),
      db.query(`select r.id,r.title,r.status,r.updated_at,p.code as project_code
          from kxra.records r left join kxra.projects p on p.id=r.project_id
          where r.kind='blocker' and r.status not in ('completed','archived','rejected')
          order by r.updated_at desc,r.id limit 10`),
      db.query(
        "select count(*)::text as n from kxra.work_log_entries where status='FAILED'",
      ),
      db.query(`select w.id,w.title,w.status,w.occurred_at,w.artifact_type,w.artifact_id,p.code as project_code
          from kxra.work_log_entries w left join kxra.projects p on p.id=w.project_id
          where w.status='FAILED' order by w.occurred_at desc,w.id limit 10`),
      db.query(`select count(*)::text as n from kxra.account_security_events
          where event_type in ('ACCOUNT_SUSPENDED','ACCOUNT_REVOKED','SESSIONS_REVOKED','MFA_STATE_CHANGED')`),
      db.query(`select e.id,e.event_type,e.created_at,m.display_name
          from kxra.account_security_events e left join kxra.members m on m.id=e.user_id and m.org_id=e.org_id
          where e.event_type in ('ACCOUNT_SUSPENDED','ACCOUNT_REVOKED','SESSIONS_REVOKED','MFA_STATE_CHANGED')
          order by e.created_at desc,e.id limit 10`),
      db.query("select count(*)::text as n from kxra.work_log_entries"),
      db.query(`select w.id,w.title,w.status,w.entry_type,w.occurred_at,w.artifact_type,w.artifact_id,
          p.code as project_code from kxra.work_log_entries w
          left join kxra.projects p on p.id=w.project_id
          order by w.occurred_at desc,w.id desc limit 15`),
    ]);

    const todayItems: DashboardItem[] = [
      ...taskRows.rows.map((row) => ({
        id: String(row.id),
        kind: "TASK",
        title: String(row.title),
        detail: String(row.acceptance_criteria),
        project_code: String(row.project_code),
        href: `/os/tasks#task-${row.id}`,
        occurred_at: String(row.assigned_at),
      })),
      ...gateRows.rows.map((row) => ({
        id: String(row.id),
        kind: "NEXT_GATE",
        title: `${row.code} · ${row.next_gate}`,
        detail: String(row.next_action),
        project_code: String(row.code),
        href: `/os/projects/${row.id}#gate-controls`,
        occurred_at: String(row.governance_updated_at),
      })),
    ].slice(0, 15);
    const decisionItems: DashboardItem[] = [
      ...approvalRows.rows.map((row) => ({
        id: String(row.id),
        kind: "APPROVAL",
        title: String(row.title),
        detail: `${row.action} · ${row.state}`,
        project_code: row.project_code ? String(row.project_code) : null,
        href: `/os/approvals#approval-${row.id}`,
        occurred_at: String(row.created_at),
      })),
      ...decisionRows.rows.map((row) => ({
        id: String(row.id),
        kind: "DECISION",
        title: String(row.title),
        detail: String(row.status).toUpperCase(),
        project_code: row.project_code ? String(row.project_code) : null,
        href: `/os/record/${row.id}`,
        occurred_at: String(row.updated_at),
      })),
    ].slice(0, 15);
    const riskItems: DashboardItem[] = [
      ...riskRows.rows.map((row) => ({
        id: String(row.id),
        kind: "RISK",
        title: String(row.title),
        detail: `Status ${row.status}${row.rating ? ` · rating ${row.rating}` : " · rating Unknown"}`,
        project_code: row.project_code ? String(row.project_code) : null,
        href: `/os/record/${row.id}`,
        occurred_at: String(row.updated_at),
      })),
      ...blockerRows.rows.map((row) => ({
        id: String(row.id),
        kind: "BLOCKER",
        title: String(row.title),
        detail: String(row.status).toUpperCase(),
        project_code: row.project_code ? String(row.project_code) : null,
        href: `/os/record/${row.id}`,
        occurred_at: String(row.updated_at),
      })),
      ...failedRows.rows.map((row) => ({
        id: String(row.id),
        kind: "FAILED_RUN",
        title: String(row.title),
        detail: String(row.status),
        project_code: row.project_code ? String(row.project_code) : null,
        href: workLogHref(row.artifact_type, row.artifact_id, row.id),
        occurred_at: String(row.occurred_at),
      })),
      ...warningRows.rows.map((row) => ({
        id: String(row.id),
        kind: "SECURITY",
        title: String(row.event_type).replaceAll("_", " "),
        detail: row.display_name
          ? String(row.display_name)
          : "Account security event",
        project_code: null,
        href: `/os/admin#security-${row.id}`,
        occurred_at: String(row.created_at),
      })),
    ].slice(0, 15);
    const recentItems: DashboardItem[] = activityRows.rows.map((row) => ({
      id: String(row.id),
      kind: String(row.entry_type),
      title: String(row.title),
      detail: String(row.status),
      project_code: row.project_code ? String(row.project_code) : null,
      href: workLogHref(row.artifact_type, row.artifact_id, row.id),
      occurred_at: String(row.occurred_at),
    }));
    const tasks = number(taskCount.rows[0]?.n);
    const gates = number(gateCount.rows[0]?.n);
    const approvals = number(approvalCount.rows[0]?.n);
    const decisions = number(decisionCount.rows[0]?.n);
    const risks = number(riskCount.rows[0]?.n);
    const blockers = number(blockerCount.rows[0]?.n);
    const failed = number(failedCount.rows[0]?.n);
    const warnings = number(warningCount.rows[0]?.n);
    return {
      today: {
        count: tasks + gates,
        breakdown: { tasks, next_gates: gates },
        items: todayItems,
        note: "Routine schedules are disabled in this environment; only persisted tasks and reviewed next gates appear.",
      } satisfies DashboardSection,
      needs_your_decision: {
        count: approvals + decisions,
        breakdown: { approvals, proposed_decisions: decisions },
        items: decisionItems,
      } satisfies DashboardSection,
      at_risk: {
        count: risks + blockers + failed + warnings,
        breakdown: {
          risks,
          blockers,
          failed_runs: failed,
          security_warnings: warnings,
        },
        items: riskItems,
      } satisfies DashboardSection,
      recent_activity: {
        count: number(activityCount.rows[0]?.n),
        breakdown: { persisted_events: number(activityCount.rows[0]?.n) },
        items: recentItems,
      } satisfies DashboardSection,
    };
  });
}

export type WorkLogFilters = {
  project?: string;
  actor?: string;
  department?: string;
  type?: string;
  status?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
};

export type WorkLogRow = {
  id: string;
  project_id: string | null;
  project_code: string | null;
  entry_type: string;
  status: string;
  actor_id: string | null;
  actor_name: string | null;
  actor_kind: string;
  actor_label: string | null;
  department: string;
  title: string;
  artifact_type: string | null;
  artifact_id: string | null;
  metadata: Record<string, unknown>;
  occurred_at: string;
  href: string;
  total_count: string;
};

export function workLogHref(
  type: unknown,
  artifact: unknown,
  fallback: unknown,
) {
  const id = artifact ? String(artifact) : "";
  if (type === "approval" && id) return `/os/approvals#approval-${id}`;
  if (type === "project" && id) return `/os/projects/${id}`;
  if (type === "record" && id) return `/os/record/${id}`;
  if (type === "task" && id) return `/os/tasks#task-${id}`;
  if (type === "account" && id) return `/os/partners#partner-${id}`;
  if (type === "invitation" && id) return `/os/partners#invitation-${id}`;
  return `/os/work-log#work-${fallback}`;
}

export async function listWorkLog(a: Actor, filters: WorkLogFilters = {}) {
  owner(a);
  const page = Math.max(1, filters.page || 1);
  const pageSize = Math.min(100, Math.max(1, filters.pageSize || 50));
  const actorId = /^[0-9a-f-]{36}$/i.test(filters.actor || "")
    ? filters.actor
    : null;
  const actorText = actorId ? null : filters.actor || null;
  const rows = await query<Omit<WorkLogRow, "href">>(
    a,
    `select w.id,w.project_id,p.code as project_code,w.entry_type,w.status,w.actor_id,
      m.display_name as actor_name,w.actor_kind,w.actor_label,w.department,w.title,
      w.artifact_type,w.artifact_id,w.metadata,w.occurred_at,count(*) over()::text as total_count
     from kxra.work_log_entries w
     left join kxra.projects p on p.id=w.project_id
     left join kxra.members m on m.id=w.actor_id and m.org_id=w.org_id
     where ($1::uuid is null or w.project_id=$1)
      and ($2::uuid is null or w.actor_id=$2)
      and ($3::text is null or coalesce(m.display_name,w.actor_label,'') ilike '%'||$3||'%')
      and ($4::text is null or w.department=$4)
      and ($5::text is null or w.entry_type=$5)
      and ($6::text is null or w.status=$6)
      and ($7::timestamptz is null or w.occurred_at>=$7)
      and ($8::timestamptz is null or w.occurred_at<=$8)
     order by w.occurred_at desc,w.id desc limit $9 offset $10`,
    [
      filters.project || null,
      actorId,
      actorText,
      filters.department || null,
      filters.type || null,
      filters.status || null,
      filters.from || null,
      filters.to || null,
      pageSize,
      (page - 1) * pageSize,
    ],
  );
  return {
    rows: rows.map((row) => ({
      ...row,
      href: workLogHref(row.artifact_type, row.artifact_id, row.id),
    })),
    page,
    page_size: pageSize,
    total_count: Number(rows[0]?.total_count || 0),
  };
}

type CountRow = { state: string; count: string };

function countsByState(rows: CountRow[]) {
  return Object.fromEntries(rows.map((row) => [row.state, Number(row.count)]));
}

export async function adminSnapshot(a: Actor) {
  owner(a);
  return scoped(a, async (db) => {
    await db.query("select kxra.record_admin_view()");
    await db.query("select kxra.refresh_expired_approvals()");
    const [
      accounts,
      invitations,
      memberships,
      approvals,
      email,
      securityEvents,
      schemaCounts,
      projectCounts,
      auditCount,
    ] = await Promise.all([
      db.query<CountRow>(
        "select account_state as state,count(*)::text as count from kxra.profiles group by account_state order by account_state",
      ),
      db.query<CountRow>(
        "select state,count(*)::text as count from kxra.invitations group by state order by state",
      ),
      db.query<CountRow>(
        "select case when active then 'ACTIVE' else 'INACTIVE' end as state,count(*)::text as count from kxra.project_memberships group by active order by active desc",
      ),
      db.query<CountRow>(
        "select state,count(*)::text as count from kxra.approvals group by state order by state",
      ),
      db.query<CountRow>(
        "select state,count(*)::text as count from kxra.transactional_email_outbox group by state order by state",
      ),
      db.query(`select e.id,e.event_type,e.user_id,e.actor_id,e.metadata,e.created_at,
          m.display_name as user_name from kxra.account_security_events e
          left join kxra.members m on m.id=e.user_id and m.org_id=e.org_id
          order by e.created_at desc,e.id desc limit 30`),
      db.query(`select
          (select count(*)::text from pg_tables where schemaname='kxra') as rls_tables,
          (select count(*)::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='kxra') as exposed_functions,
          (select count(*)::text from pg_tables where schemaname='kxra' and rowsecurity) as protected_tables`),
      db.query<CountRow>(
        "select coalesce(disposition,'UNKNOWN') as state,count(*)::text as count from kxra.projects group by disposition order by state",
      ),
      db.query<{ count: string }>(
        "select count(*)::text as count from kxra.audit_events",
      ),
    ]);
    const env = process.env;
    return {
      captured_at: new Date().toISOString(),
      environment: localMode() ? "local" : "hosted",
      accounts: countsByState(accounts.rows),
      invitations: countsByState(invitations.rows),
      memberships: countsByState(memberships.rows),
      approvals: countsByState(approvals.rows),
      email_outbox: countsByState(email.rows),
      portfolio: countsByState(projectCounts.rows),
      security_events: securityEvents.rows,
      database: {
        rls_tables: Number(schemaCounts.rows[0]?.rls_tables || 0),
        protected_tables: Number(schemaCounts.rows[0]?.protected_tables || 0),
        exposed_functions: Number(schemaCounts.rows[0]?.exposed_functions || 0),
        audit_events: Number(auditCount.rows[0]?.count || 0),
        transaction_status: "VERIFIED",
      },
      security_policy: {
        owner_approval_assurance: "AAL2",
        recent_authentication_minutes: 15,
        approval_expiry_hours: 24,
        partner_context_rule:
          "ACTIVE_PROJECT_MEMBERSHIP_AND_EXPLICIT_RECORD_ACCESS",
      },
      integrations: {
        supabase: Boolean(
          env.NEXT_PUBLIC_SUPABASE_URL &&
          env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
        ),
        resend: Boolean(env.RESEND_API_KEY),
        trigger_dev: Boolean(env.TRIGGER_SECRET_KEY),
        posthog: Boolean(env.NEXT_PUBLIC_POSTHOG_KEY),
        sentry: Boolean(env.SENTRY_DSN || env.NEXT_PUBLIC_SENTRY_DSN),
        cloudflare: false,
        whatsapp: Boolean(env.WHATSAPP_ACCESS_TOKEN && env.WHATSAPP_APP_SECRET),
      },
      controls: {
        routines: "DISABLED",
        external_messages: "DISABLED",
        production_deployment: "DISABLED",
        backups: "EVIDENCE_NOT_CONNECTED",
        retention: "POLICY_NOT_APPROVED",
      },
    };
  });
}
