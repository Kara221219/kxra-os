export type OwnerOverviewItem = {
  id: string;
  title: string;
  detail: string;
  occurred_at: string;
  href: string;
};

export type OwnerOverview = {
  captured_at: string;
  organisation: string;
  local: boolean;
  counts: {
    enquiries: number;
    approvals: number;
    assigned_tasks: number;
    activity_seven_days: number;
  };
  enquiries: OwnerOverviewItem[];
  approvals: OwnerOverviewItem[];
  decisions: OwnerOverviewItem[];
  tasks: OwnerOverviewItem[];
  activity: OwnerOverviewItem[];
};

// One statement gives counts and bounded previews the same database snapshot.
// Every read also carries an explicit selected-organisation condition in addition
// to the caller's authenticated RLS. No refresh, audit or provider RPC is called.
export const ownerOverviewSql = `select now() as captured_at,
 (select count(*)::text from kxra.public_enquiry_submissions
  where org_id=$1 and status in ('UNVERIFIED','REVIEWING')) as enquiry_count,
 (select count(*)::text from kxra.approvals
  where org_id=$1 and state='REQUESTED' and expires_at>now() and consumed_at is null) as approval_count,
 (select count(*)::text from kxra.workflow_tasks
  where org_id=$1 and state='assigned') as task_count,
 (select count(*)::text from kxra.work_log_entries
  where org_id=$1 and occurred_at>=now()-interval '7 days' and occurred_at<=now()) as activity_count,
 coalesce((select jsonb_agg(row_to_json(e) order by e.occurred_at desc,e.id desc)
  from (select id,form_kind,status,company,received_at as occurred_at
   from kxra.public_enquiry_submissions
   where org_id=$1 and status in ('UNVERIFIED','REVIEWING')
   order by received_at desc,id desc limit 5) e),'[]'::jsonb) as enquiries,
 coalesce((select jsonb_agg(row_to_json(a) order by a.occurred_at,a.id)
  from (select id,action,coalesce(payload->>'action_summary',action) as title,created_at as occurred_at
   from kxra.approvals
   where org_id=$1 and state='REQUESTED' and expires_at>now() and consumed_at is null
   order by created_at,id limit 4) a),'[]'::jsonb) as approvals,
 coalesce((select jsonb_agg(row_to_json(d) order by d.occurred_at desc,d.id desc)
  from (select id,title,status,updated_at as occurred_at from kxra.records
   where org_id=$1 and kind='decision' and status in ('draft','submitted')
   order by updated_at desc,id desc limit 4) d),'[]'::jsonb) as decisions,
 coalesce((select jsonb_agg(row_to_json(t) order by t.occurred_at,t.id)
  from (select id,title,assigned_at as occurred_at from kxra.workflow_tasks
   where org_id=$1 and state='assigned'
   order by assigned_at,id limit 5) t),'[]'::jsonb) as tasks,
 coalesce((select jsonb_agg(row_to_json(w) order by w.occurred_at desc,w.id desc)
  from (select id,title,status,entry_type,occurred_at from kxra.work_log_entries
   where org_id=$1 and occurred_at>=now()-interval '7 days' and occurred_at<=now()
   order by occurred_at desc,id desc limit 6) w),'[]'::jsonb) as activity`;

type Row = Record<string, unknown>;
function row(value: unknown): Row {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error("Owner overview unavailable");
  return value as Row;
}
function text(value: unknown): string {
  if (typeof value !== "string") throw Error("Owner overview unavailable");
  return value;
}
function uuid(value: unknown): string {
  const result = text(value);
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      result,
    )
  )
    throw Error("Owner overview unavailable");
  return result;
}
function stamp(value: unknown): string {
  const date = value instanceof Date ? value : new Date(text(value));
  if (!Number.isFinite(date.getTime()))
    throw Error("Owner overview unavailable");
  return date.toISOString();
}
function count(value: unknown): number {
  const input = text(value);
  if (!/^(0|[1-9][0-9]*)$/.test(input))
    throw Error("Owner overview unavailable");
  const result = Number(input);
  if (!Number.isSafeInteger(result)) throw Error("Owner overview unavailable");
  return result;
}
function items(
  value: unknown,
  limit: number,
  make: (item: Row) => OwnerOverviewItem,
) {
  if (!Array.isArray(value) || value.length > limit)
    throw Error("Owner overview unavailable");
  return value.map((value) => make(row(value)));
}
function label(value: unknown) {
  return text(value).replaceAll("_", " ").toLowerCase();
}
function base(item: Row) {
  return { id: uuid(item.id), occurred_at: stamp(item.occurred_at) };
}
export function ownerOverviewFromRow(
  value: unknown,
  context: { organisation: string; local: boolean },
): OwnerOverview {
  const data = row(value);
  return {
    captured_at: stamp(data.captured_at),
    organisation: context.organisation,
    local: context.local,
    counts: {
      enquiries: count(data.enquiry_count),
      approvals: count(data.approval_count),
      assigned_tasks: count(data.task_count),
      activity_seven_days: count(data.activity_count),
    },
    enquiries: items(data.enquiries, 5, (item) => {
      const b = base(item);
      return {
        ...b,
        title: text(item.company) || "Website enquiry",
        detail: `${label(item.form_kind)} · ${label(item.status)}`,
        href: `/os/enquiries?enquiry=${b.id}#public-enquiry-${b.id}`,
      };
    }),
    approvals: items(data.approvals, 4, (item) => {
      const b = base(item);
      return {
        ...b,
        title: text(item.title),
        detail: `Approval · ${label(item.action)}`,
        href: `/os/approvals#approval-${b.id}`,
      };
    }),
    decisions: items(data.decisions, 4, (item) => {
      const b = base(item);
      return {
        ...b,
        title: text(item.title),
        detail: `Decision · ${label(item.status)}`,
        href: `/os/record/${b.id}`,
      };
    }),
    tasks: items(data.tasks, 5, (item) => {
      const b = base(item);
      return {
        ...b,
        title: text(item.title),
        detail: "Assigned task",
        href: `/os/tasks#task-${b.id}`,
      };
    }),
    activity: items(data.activity, 6, (item) => {
      const b = base(item);
      return {
        ...b,
        title: text(item.title),
        detail: `${label(item.entry_type)} · ${label(item.status)}`,
        href: `/os/work-log?entry=${b.id}#work-${b.id}`,
      };
    }),
  };
}
