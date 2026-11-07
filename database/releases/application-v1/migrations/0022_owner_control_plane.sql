begin;

-- Milestone 2 adds a typed owner control plane without changing the immutable
-- Genesis source envelope. The original stage/status fields remain available
-- as source material; these nullable governance fields hold reviewed updates.
alter table kxra.projects
 add column lifecycle_stage text,
 add column disposition text,
 add column next_gate text,
 add column current_recommendation text,
 add column owner_user_id uuid,
 add column score_coverage numeric,
 add column score_lower_bound numeric,
 add column score_upper_bound numeric,
 add column governance_version integer not null default 1,
 add column governance_updated_at timestamptz not null default now(),
 add constraint projects_lifecycle_stage_check check(lifecycle_stage is null or lifecycle_stage in (
  'IDEA_INBOX','PROBLEM_DISCOVERY','VALIDATION','MARKET_ANALYSIS','FEASIBILITY',
  'BUSINESS_CASE','MVP','PILOT','REVIEW','LAUNCH','SCALE'
 )),
 add constraint projects_disposition_check check(disposition is null or disposition in (
  'ACTIVE','MONITOR','PAUSED','REJECTED','ARCHIVED'
 )),
 add constraint projects_recommendation_check check(current_recommendation is null or current_recommendation in (
  'GO','ITERATE','PAUSE','KILL'
 )),
 add constraint projects_score_coverage_check check(score_coverage is null or score_coverage between 0 and 100),
 add constraint projects_score_bounds_check check(
  (score_lower_bound is null and score_upper_bound is null) or
  (score_lower_bound between 0 and 100 and score_upper_bound between 0 and 100 and score_lower_bound<=score_upper_bound)
 ),
 add constraint projects_governance_version_check check(governance_version>0),
 add constraint projects_owner_fkey foreign key(org_id,owner_user_id) references kxra.members(org_id,id);

update kxra.projects set
 lifecycle_stage=case stage
  when 'DISCOVERY' then 'PROBLEM_DISCOVERY'
  when 'VALIDATION' then 'VALIDATION'
  when 'FEASIBILITY' then 'FEASIBILITY'
  else null end,
 disposition=case
  when status='MONITOR' then 'MONITOR'
  when status='INTERNAL R&D / PAPER ONLY' then 'MONITOR'
  when status in ('VALIDATION','VALIDATION / LAUNCH PREPARATION','VALIDATION / PROOF OF CONCEPT') then 'ACTIVE'
  else null end,
 next_gate=(select gp.gate_code from kxra.project_gate_policies gp
  where gp.project_id=kxra.projects.id order by gp.gate_code limit 1);

create table kxra.ideas(
 record_id uuid primary key references kxra.records(id),
 org_id uuid not null references kxra.organisations(id),
 project_id uuid,
 submitted_by uuid,
 source_type text not null check(source_type in ('OWNER_PORTAL','PARTNER_PORTAL','WHATSAPP','IMPORT')),
 source_note text check(source_note is null or length(source_note)<=1000),
 raw_idea text not null check(length(trim(raw_idea)) between 1 and 50000),
 structured_summary text check(structured_summary is null or length(structured_summary)<=50000),
 problem_statement text check(problem_statement is null or length(problem_statement)<=50000),
 target_customer text check(target_customer is null or length(target_customer)<=50000),
 validation_plan text check(validation_plan is null or length(validation_plan)<=50000),
 next_experiment text check(next_experiment is null or length(next_experiment)<=50000),
 state text not null default 'NEW' check(state in (
  'NEW','TRIAGE','VALIDATING','PROMISING','BUILDING','PAUSED','REJECTED','ARCHIVED'
 )),
 duplicate_of uuid references kxra.ideas(record_id),
 merge_reason text check(merge_reason is null or length(trim(merge_reason)) between 1 and 2000),
 venture_score numeric check(venture_score is null or venture_score between 0 and 100),
 confidence_score numeric check(confidence_score is null or confidence_score between 0 and 100),
 score_coverage numeric check(score_coverage is null or score_coverage between 0 and 100),
 version integer not null default 1 check(version>0),
 submitted_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 foreign key(org_id,project_id,record_id) references kxra.records(org_id,project_id,id),
 foreign key(org_id,submitted_by) references kxra.members(org_id,id),
 check(duplicate_of is null or duplicate_of<>record_id),
 check((duplicate_of is null and merge_reason is null) or (duplicate_of is not null and merge_reason is not null and state='ARCHIVED'))
);

create table kxra.idea_versions(
 record_id uuid not null,
 version integer not null,
 org_id uuid not null,
 project_id uuid,
 submitted_by uuid,
 source_type text not null,
 source_note text,
 raw_idea text not null,
 structured_summary text,
 problem_statement text,
 target_customer text,
 validation_plan text,
 next_experiment text,
 state text not null,
 duplicate_of uuid,
 merge_reason text,
 venture_score numeric,
 confidence_score numeric,
 score_coverage numeric,
 editor_id uuid,
 created_at timestamptz not null default now(),
 primary key(record_id,version),
 foreign key(record_id,version) references kxra.record_versions(record_id,version)
);

create table kxra.idea_shares(
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null,
 project_id uuid not null,
 idea_record_id uuid not null references kxra.ideas(record_id),
 user_id uuid not null,
 active boolean not null default true,
 version integer not null default 1 check(version>0),
 approved_by uuid not null,
 approval_id uuid not null references kxra.approvals(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(idea_record_id,user_id),
 unique(approval_id),
 foreign key(org_id,project_id) references kxra.projects(org_id,id),
 foreign key(org_id,user_id) references kxra.members(org_id,id),
 foreign key(org_id,approved_by) references kxra.members(org_id,id)
);

create table kxra.idea_evidence(
 idea_record_id uuid not null,
 idea_version integer not null,
 evidence_id uuid not null,
 evidence_version integer not null,
 org_id uuid not null,
 project_id uuid,
 added_by uuid,
 created_at timestamptz not null default now(),
 primary key(idea_record_id,idea_version,evidence_id,evidence_version),
 foreign key(idea_record_id,idea_version) references kxra.idea_versions(record_id,version),
 foreign key(evidence_id,evidence_version) references kxra.record_versions(record_id,version),
 foreign key(org_id,added_by) references kxra.members(org_id,id)
);

create table kxra.project_governance_versions(
 project_id uuid not null references kxra.projects(id),
 version integer not null check(version>0),
 org_id uuid not null,
 lifecycle_stage text,
 disposition text,
 next_gate text,
 next_action text not null,
 current_recommendation text,
 owner_user_id uuid,
 venture_score numeric,
 confidence_score numeric,
 score_coverage numeric,
 score_lower_bound numeric,
 score_upper_bound numeric,
 editor_id uuid,
 created_at timestamptz not null default now(),
 primary key(project_id,version),
 foreign key(org_id,project_id) references kxra.projects(org_id,id),
 foreign key(org_id,owner_user_id) references kxra.members(org_id,id)
);

create table kxra.work_log_entries(
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null references kxra.organisations(id),
 project_id uuid,
 entry_type text not null check(entry_type in (
  'WORK_ITEM','ROUTINE_RUN','AI_RUN','HANDOFF','SYSTEM_EVENT','AUDIT_EVENT'
 )),
 status text not null check(length(trim(status)) between 1 and 80),
 actor_id uuid,
 actor_kind text not null check(actor_kind in ('PERSON','AGENT','SYSTEM','UNKNOWN')),
 actor_label text,
 department text not null check(length(trim(department)) between 1 and 120),
 title text not null check(length(trim(title)) between 1 and 240),
 artifact_type text,
 artifact_id text,
 source_kind text not null check(source_kind in ('AUDIT_EVENT','ACCOUNT_SECURITY_EVENT')),
 source_id text not null,
 metadata jsonb not null default '{}'::jsonb check(jsonb_typeof(metadata)='object'),
 occurred_at timestamptz not null,
 created_at timestamptz not null default now(),
 unique(source_kind,source_id),
 foreign key(org_id,project_id) references kxra.projects(org_id,id),
 foreign key(org_id,actor_id) references kxra.members(org_id,id)
);

create index ideas_scope on kxra.ideas(org_id,project_id,state,updated_at desc);
create index ideas_submitter on kxra.ideas(submitted_by,updated_at desc);
create index idea_shares_recipient on kxra.idea_shares(user_id,active,idea_record_id);
create index work_log_scope on kxra.work_log_entries(org_id,occurred_at desc,id);
create index work_log_filters on kxra.work_log_entries(org_id,project_id,entry_type,status,department);
create index project_portfolio_sort on kxra.projects(org_id,lifecycle_stage,disposition,code,id);

alter table kxra.ideas enable row level security;
alter table kxra.idea_versions enable row level security;
alter table kxra.idea_shares enable row level security;
alter table kxra.idea_evidence enable row level security;
alter table kxra.project_governance_versions enable row level security;
alter table kxra.work_log_entries enable row level security;

grant select on kxra.ideas,kxra.idea_versions,kxra.idea_shares,kxra.idea_evidence,
 kxra.project_governance_versions,kxra.work_log_entries to authenticated,anon;

create function kxra_private.can_view_idea(target uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(
  select 1 from kxra.ideas i
  where i.record_id=target and (
   kxra_private.is_owner(i.org_id) or (
    i.project_id is not null and kxra_private.can_project(i.project_id) and (
     i.submitted_by=auth.uid() or exists(
      select 1 from kxra.idea_shares s
      where s.idea_record_id=i.record_id and s.user_id=auth.uid() and s.active
       and s.org_id=i.org_id and s.project_id=i.project_id
     )
    )
   )
  )
 )
$$;

create or replace function kxra_private.can_record(r uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(
  select 1 from kxra.records rec where rec.id=r and (
   case when rec.kind='idea' then kxra_private.can_view_idea(rec.id)
   else kxra_private.is_owner(rec.org_id) or
    (rec.visibility='project_shared' and kxra_private.can_project(rec.project_id)) end
  )
 )
$$;

drop policy record_read on kxra.records;
create policy record_read on kxra.records for select using(kxra_private.can_record(id));
drop policy record_insert on kxra.records;
create policy record_insert on kxra.records for insert with check(
 kind<>'idea' and org_id=kxra_private.member_org() and created_by=auth.uid()
 and status in ('draft','submitted') and (
  kxra_private.is_owner(org_id) or (
   visibility='project_shared' and kxra_private.can_project(project_id,true) and kind='note'
  )
 )
);
drop policy record_update on kxra.records;
create policy record_update on kxra.records for update using(
 kind<>'idea' and status in ('draft','submitted') and (
  kxra_private.is_owner(org_id) or (
   created_by=auth.uid() and kxra_private.can_project(project_id,true) and kind='note'
  )
 )
) with check(
 kind<>'idea' and status in ('draft','submitted') and (
  kxra_private.is_owner(org_id) or (
   created_by=auth.uid() and visibility='project_shared' and
   kxra_private.can_project(project_id,true) and kind='note'
  )
 )
);

create policy ideas_read on kxra.ideas for select using(kxra_private.can_view_idea(record_id));
create policy idea_versions_read on kxra.idea_versions for select using(kxra_private.can_view_idea(record_id));
create policy idea_shares_read on kxra.idea_shares for select using(
 kxra_private.is_owner(org_id) or
 (user_id=auth.uid() and active and kxra_private.can_project(project_id))
);
create policy idea_evidence_read on kxra.idea_evidence for select using(
 kxra_private.can_view_idea(idea_record_id) and kxra_private.can_record(evidence_id)
);
create policy project_governance_versions_read on kxra.project_governance_versions
 for select using(kxra_private.can_project(project_id));
create policy work_log_owner_read on kxra.work_log_entries for select using(kxra_private.is_owner(org_id));

create function kxra_private.log_idea_version() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 insert into kxra.idea_versions(
  record_id,version,org_id,project_id,submitted_by,source_type,source_note,
  raw_idea,structured_summary,problem_statement,target_customer,validation_plan,
  next_experiment,state,duplicate_of,merge_reason,venture_score,confidence_score,
  score_coverage,editor_id
 ) values(
  new.record_id,new.version,new.org_id,new.project_id,new.submitted_by,new.source_type,new.source_note,
  new.raw_idea,new.structured_summary,new.problem_statement,new.target_customer,new.validation_plan,
  new.next_experiment,new.state,new.duplicate_of,new.merge_reason,new.venture_score,new.confidence_score,
  new.score_coverage,auth.uid()
 );
 return new;
end $$;
create trigger ideas_version_log after insert or update on kxra.ideas
 for each row execute function kxra_private.log_idea_version();

insert into kxra.ideas(
 record_id,org_id,project_id,submitted_by,source_type,source_note,raw_idea,state,version,
 submitted_at,updated_at
)
select r.id,r.org_id,r.project_id,r.created_by,
 case coalesce(m.role,'') when 'owner' then 'OWNER_PORTAL' when 'partner' then 'PARTNER_PORTAL' else 'IMPORT' end,
 case when r.source_code is not null then 'Imported from reviewed source record '||r.source_code else null end,
 coalesce(nullif(trim(r.body),''),r.title),
 case r.status when 'draft' then 'NEW' when 'submitted' then 'TRIAGE'
  when 'accepted' then 'PROMISING' when 'rejected' then 'REJECTED' else 'ARCHIVED' end,
 r.version,r.created_at,r.updated_at
from kxra.records r left join kxra.members m on m.id=r.created_by and m.org_id=r.org_id
where r.kind='idea';

create function kxra_private.guard_project_governance() returns trigger
language plpgsql set search_path='' as $$
begin
 if (new.lifecycle_stage,new.disposition,new.next_gate,new.next_action,
  new.current_recommendation,new.owner_user_id,new.venture_score,new.confidence_score,
  new.score_coverage,new.score_lower_bound,new.score_upper_bound)
 is distinct from
 (old.lifecycle_stage,old.disposition,old.next_gate,old.next_action,
  old.current_recommendation,old.owner_user_id,old.venture_score,old.confidence_score,
  old.score_coverage,old.score_lower_bound,old.score_upper_bound) then
  if current_user in ('authenticated','anon') then
   raise exception 'Typed project governance transition required';
  end if;
  new.governance_version=old.governance_version+1;
  new.governance_updated_at=now();
 elsif new.governance_version is distinct from old.governance_version then
  raise exception 'Governance version is managed by KXRA OS';
 end if;
 return new;
end $$;
create trigger projects_governance_guard before update on kxra.projects
 for each row execute function kxra_private.guard_project_governance();

create function kxra_private.log_project_governance() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' or (
  (new.lifecycle_stage,new.disposition,new.next_gate,new.next_action,
   new.current_recommendation,new.owner_user_id,new.venture_score,new.confidence_score,
   new.score_coverage,new.score_lower_bound,new.score_upper_bound)
  is distinct from
  (old.lifecycle_stage,old.disposition,old.next_gate,old.next_action,
   old.current_recommendation,old.owner_user_id,old.venture_score,old.confidence_score,
   old.score_coverage,old.score_lower_bound,old.score_upper_bound)
 ) then
  insert into kxra.project_governance_versions(
   project_id,version,org_id,lifecycle_stage,disposition,next_gate,next_action,
   current_recommendation,owner_user_id,venture_score,confidence_score,score_coverage,
   score_lower_bound,score_upper_bound,editor_id
  ) values(
   new.id,new.governance_version,new.org_id,new.lifecycle_stage,new.disposition,new.next_gate,
   new.next_action,new.current_recommendation,new.owner_user_id,new.venture_score,
   new.confidence_score,new.score_coverage,new.score_lower_bound,new.score_upper_bound,auth.uid()
  );
 end if;
 return new;
end $$;
create trigger projects_governance_log after update on kxra.projects
 for each row execute function kxra_private.log_project_governance();

insert into kxra.project_governance_versions(
 project_id,version,org_id,lifecycle_stage,disposition,next_gate,next_action,
 current_recommendation,owner_user_id,venture_score,confidence_score,score_coverage,
 score_lower_bound,score_upper_bound,editor_id,created_at
)
select id,governance_version,org_id,lifecycle_stage,disposition,next_gate,next_action,
 current_recommendation,owner_user_id,venture_score,confidence_score,score_coverage,
 score_lower_bound,score_upper_bound,null,governance_updated_at from kxra.projects;

create function kxra_private.work_log_department(action_name text) returns text
language sql immutable set search_path='' as $$
 select case
  when action_name like 'account.%' or action_name like 'invitation.%' or action_name like 'membership.%' then 'Partner Operations'
  when action_name like 'security.%' or action_name like 'session.%' or action_name like 'mfa.%' then 'Security'
  when action_name like '%finance%' or action_name like '%spend%' then 'Finance'
  when action_name like 'ai.%' then 'AI Operations'
  when action_name like 'routine.%' then 'Operations'
  else 'Venture Operations' end
$$;

create function kxra_private.audit_project(action_name text,resource uuid,details jsonb) returns uuid
language plpgsql stable security definer set search_path='' as $$
declare candidate text;resolved uuid;
begin
 candidate=details->>'project_id';
 if candidate is not null and candidate~*'^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
  select id into resolved from kxra.projects where id=candidate::uuid;
 end if;
 if resolved is null and resource is not null then
  select project_id into resolved from kxra.records where id=resource;
  if resolved is null then select project_id into resolved from kxra.workflow_tasks where id=resource;end if;
  if resolved is null then select project_id into resolved from kxra.experiment_results where id=resource;end if;
  if resolved is null then select project_id into resolved from kxra.approvals where id=resource;end if;
  if resolved is null and action_name='membership.changed' then
   select id into resolved from kxra.projects where id=resource;
  end if;
 end if;
 return resolved;
end $$;

create function kxra_private.log_audit_work() returns trigger
language plpgsql security definer set search_path='' as $$
declare project uuid;artifact text;
begin
 project=kxra_private.audit_project(new.action,new.resource_id,new.metadata);
 artifact=case
  when new.action like 'approval.%' then 'approval'
  when new.action like 'task.%' then 'task'
  when new.action like 'project.%' or new.action='membership.changed' then 'project'
  when new.action like 'account.%' then 'account'
  when new.action like 'invitation.%' then 'invitation'
  else 'record' end;
 insert into kxra.work_log_entries(
  org_id,project_id,entry_type,status,actor_id,actor_kind,actor_label,department,
  title,artifact_type,artifact_id,source_kind,source_id,metadata,occurred_at
 ) values(
  new.org_id,project,'AUDIT_EVENT',upper(coalesce(nullif(new.metadata->>'status',''),'RECORDED')),
  new.actor_id,case when new.actor_id is null then 'SYSTEM' else 'PERSON' end,null,
  kxra_private.work_log_department(new.action),left(replace(new.action,'.',' '),240),
  artifact,new.resource_id::text,'AUDIT_EVENT',new.id::text,new.metadata,new.created_at
 ) on conflict(source_kind,source_id) do nothing;
 return new;
end $$;
create trigger audit_work_log after insert on kxra.audit_events
 for each row execute function kxra_private.log_audit_work();

create function kxra_private.log_security_work() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 insert into kxra.work_log_entries(
  org_id,entry_type,status,actor_id,actor_kind,department,title,artifact_type,
  artifact_id,source_kind,source_id,metadata,occurred_at
 ) values(
  new.org_id,'SYSTEM_EVENT','RECORDED',new.actor_id,
  case when new.actor_id is null then 'SYSTEM' else 'PERSON' end,'Security',
  left(replace(lower(new.event_type),'_',' '),240),'account',new.user_id::text,
  'ACCOUNT_SECURITY_EVENT',new.id::text,new.metadata,new.created_at
 ) on conflict(source_kind,source_id) do nothing;
 return new;
end $$;
create trigger account_security_work_log after insert on kxra.account_security_events
 for each row execute function kxra_private.log_security_work();

insert into kxra.work_log_entries(
 org_id,project_id,entry_type,status,actor_id,actor_kind,department,title,
 artifact_type,artifact_id,source_kind,source_id,metadata,occurred_at
)
select e.org_id,kxra_private.audit_project(e.action,e.resource_id,e.metadata),'AUDIT_EVENT',
 upper(coalesce(nullif(e.metadata->>'status',''),'RECORDED')),e.actor_id,
 case when e.actor_id is null then 'SYSTEM' else 'PERSON' end,
 kxra_private.work_log_department(e.action),left(replace(e.action,'.',' '),240),
 case when e.action like 'approval.%' then 'approval'
  when e.action like 'task.%' then 'task'
  when e.action like 'project.%' or e.action='membership.changed' then 'project'
  when e.action like 'account.%' then 'account'
  when e.action like 'invitation.%' then 'invitation' else 'record' end,
 e.resource_id::text,'AUDIT_EVENT',e.id::text,e.metadata,e.created_at
from kxra.audit_events e on conflict(source_kind,source_id) do nothing;

insert into kxra.work_log_entries(
 org_id,entry_type,status,actor_id,actor_kind,department,title,artifact_type,
 artifact_id,source_kind,source_id,metadata,occurred_at
)
select e.org_id,'SYSTEM_EVENT','RECORDED',e.actor_id,
 case when e.actor_id is null then 'SYSTEM' else 'PERSON' end,'Security',
 left(replace(lower(e.event_type),'_',' '),240),'account',e.user_id::text,
 'ACCOUNT_SECURITY_EVENT',e.id::text,e.metadata,e.created_at
from kxra.account_security_events e on conflict(source_kind,source_id) do nothing;

-- The approval state values below are the canonical Milestone 2 vocabulary.
alter table kxra.approvals drop constraint approvals_state_check;
update kxra.approvals set state=upper(state);
alter table kxra.approvals alter column state set default 'REQUESTED';
alter table kxra.approvals add constraint approvals_state_check check(state in (
 'DRAFT','REQUESTED','APPROVED','REJECTED','EXPIRED','EXECUTING','EXECUTED','FAILED','RECONCILIATION_REQUIRED'
));
alter table kxra.approvals
 add column executing_at timestamptz,
 add column execution_completed_at timestamptz,
 add column failure_code text check(failure_code is null or length(failure_code)<=120),
 add column reconciliation_reason text check(reconciliation_reason is null or length(reconciliation_reason)<=2000);

alter table kxra.approvals drop constraint approvals_action_check;
alter table kxra.approvals add constraint approvals_action_check check(action in (
 'record.accept','membership.change','project.gate','account.lifecycle','idea.share','project.governance',
 'publish','external.message','spend','deploy','ai.high_cost'
));
alter table kxra.approvals drop constraint approval_payload_shape;
alter table kxra.approvals add constraint approval_payload_shape check(
 (not(payload ? 'envelope_version') or (
  payload->>'envelope_version'='2' and payload ?& array[
   'action_summary','before','after','recipient','estimated_cost','cost_currency','risk_summary'
  ] and jsonb_typeof(payload->'before')='object' and jsonb_typeof(payload->'after')='object'
  and jsonb_typeof(payload->'action_summary')='string'
  and jsonb_typeof(payload->'risk_summary')='string'
  and jsonb_typeof(payload->'recipient') in ('object','null')
  and jsonb_typeof(payload->'estimated_cost') in ('string','null')
  and jsonb_typeof(payload->'cost_currency') in ('string','null')
 )) and case action
 when 'record.accept' then jsonb_typeof(payload->'record_id')='string' and payload ? 'record_id'
  and jsonb_typeof(payload->'version')='number' and (payload->>'version')::numeric>0
 when 'membership.change' then project_id is not null and payload ?& array['user_id','role','active']
  and jsonb_typeof(payload->'user_id')='string' and payload->>'role' in ('viewer','contributor')
  and jsonb_typeof(payload->'active')='boolean'
 when 'project.gate' then project_id is not null and payload ?& array['gate','evidence_id','evidence_version']
  and jsonb_typeof(payload->'gate')='string' and jsonb_typeof(payload->'evidence_id')='string'
  and jsonb_typeof(payload->'evidence_version')='number' and (payload->>'evidence_version')::numeric>0
 when 'account.lifecycle' then project_id is null and payload ?& array[
  'user_id','desired_state','expected_access_version','expected_session_version','before','reason'
 ] and jsonb_typeof(payload->'user_id')='string'
  and payload->>'desired_state' in ('ACTIVE','SUSPENDED','REVOKED')
  and jsonb_typeof(payload->'expected_access_version')='number'
  and jsonb_typeof(payload->'expected_session_version')='number'
  and jsonb_typeof(payload->'before')='object' and jsonb_typeof(payload->'reason')='string'
 when 'idea.share' then project_id is not null and payload ?& array[
  'idea_id','idea_version','user_id','expected_share_version','active','before','after'
 ] and jsonb_typeof(payload->'idea_id')='string' and jsonb_typeof(payload->'idea_version')='number'
  and jsonb_typeof(payload->'user_id')='string' and jsonb_typeof(payload->'expected_share_version')='number'
  and jsonb_typeof(payload->'active')='boolean'
 when 'project.governance' then project_id is not null and payload ?& array[
  'expected_governance_version','before','after'
 ] and jsonb_typeof(payload->'expected_governance_version')='number'
 else true end
);

drop policy approvals_insert on kxra.approvals;
create policy approvals_insert on kxra.approvals for insert with check(
 kxra_private.is_owner(org_id) and requested_by=auth.uid() and state='REQUESTED'
 and approved_by is null and consumed_at is null and expires_at>now()
 and expires_at<=now()+interval '7 days'
);

create function kxra_private.approval_envelope(
 base jsonb,summary text,before_state jsonb,after_state jsonb,recipient jsonb,risk text
) returns jsonb language sql immutable set search_path='' as $$
 select base||jsonb_build_object(
  'envelope_version',2,'action_summary',summary,'before',before_state,'after',after_state,
  'recipient',recipient,'estimated_cost',null,'cost_currency',null,'risk_summary',risk
 )
$$;

create or replace function kxra_private.check_approval(v kxra.approvals,required_state text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if v.id is null or not kxra_private.mfa_owner(v.org_id)
  or v.state<>upper(required_state) or v.expires_at<=now() or v.consumed_at is not null
  or v.environment is distinct from (select environment from kxra_private.deployment)
  or v.payload_hash is distinct from kxra_private.approval_digest(
   v.action,v.org_id,v.project_id,v.payload,v.environment,v.requested_by,v.expires_at
  )
 then raise exception 'Approval unavailable';end if;
end $$;

create or replace function kxra.decide_approval(a uuid,expected_hash text,approve boolean) returns void
language plpgsql security definer set search_path='' as $$
declare v kxra.approvals;
begin
 select * into v from kxra.approvals where id=a for update;
 perform kxra_private.check_approval(v,'REQUESTED');
 if v.payload_hash is distinct from expected_hash or approve is null then
  raise exception 'Approval unavailable';
 end if;
 update kxra.approvals set state=case when approve then 'APPROVED' else 'REJECTED' end,
  approved_by=auth.uid() where id=a;
 insert into kxra.audit_events(org_id,actor_id,action,resource_id,metadata)
 values(v.org_id,auth.uid(),'approval.decided',a,jsonb_build_object('decision',case when approve then 'APPROVED' else 'REJECTED' end));
end $$;

create function kxra.refresh_expired_approvals() returns integer
language plpgsql security definer set search_path='' as $$
declare o uuid=kxra_private.member_org();changed integer;
begin
 if not kxra_private.is_owner(o) then raise exception 'Approval refresh unavailable';end if;
 update kxra.approvals set state='EXPIRED'
 where org_id=o and state in ('DRAFT','REQUESTED','APPROVED') and expires_at<=now();
 get diagnostics changed=row_count;
 return changed;
end $$;

-- Every new request uses an envelope-version 2 payload. Existing signed rows
-- remain untouched and are explicitly rendered as legacy envelopes.
create or replace function kxra.request_approval(action_name text,project uuid,contents jsonb)
returns kxra.approvals language plpgsql security definer set search_path='' as $$
declare o uuid=kxra_private.member_org();v kxra.approvals;m kxra.members;
 pm kxra.project_memberships;r kxra.records;env text;
 expiry timestamptz=now()+interval '24 hours';payload jsonb;before_state jsonb;after_state jsonb;
begin
 if not kxra_private.is_owner(o) or (project is not null and not kxra_private.can_project(project))
  or jsonb_typeof(contents) is distinct from 'object'
 then raise exception 'Approval unavailable';end if;
 if action_name='membership.change' then
  if project is null or not(contents ?& array['user_id','role','active'])
   or jsonb_typeof(contents->'active') is distinct from 'boolean'
   or contents->>'role' not in ('viewer','contributor')
   or contents-array['user_id','role','active','expires_at']<>'{}'::jsonb
  then raise exception 'Invalid membership payload';end if;
  select * into m from kxra.members where id=(contents->>'user_id')::uuid
   and org_id=o and role='partner' and active for update;
  if not found then raise exception 'Target unavailable';end if;
  select * into pm from kxra.project_memberships where user_id=m.id and project_id=project;
  before_state=jsonb_build_object('role',pm.role,'active',coalesce(pm.active,false),'expires_at',pm.expires_at);
  after_state=jsonb_build_object('role',contents->>'role','active',(contents->>'active')::boolean,
   'expires_at',case when contents?'expires_at' then (contents->>'expires_at')::timestamptz else pm.expires_at end);
  payload=kxra_private.approval_envelope(
   contents||jsonb_build_object('expected_access_version',m.access_version,
    'expires_at',after_state->'expires_at'),
   'Change project access for '||m.display_name,before_state,after_state,
   jsonb_build_object('user_id',m.id,'display_name',m.display_name),
   'Incorrect access could expose or remove project information.'
  );
  if (payload->>'active')::boolean and (payload->>'expires_at')::timestamptz<=now()
  then raise exception 'Expiry must be in the future';end if;
 elsif action_name='record.accept' then
  if not(contents ?& array['record_id','version']) or contents-array['record_id','version']<>'{}'::jsonb
  then raise exception 'Invalid record payload';end if;
  select * into r from kxra.records where id=(contents->>'record_id')::uuid and org_id=o;
  if not found or r.project_id is distinct from project
   or r.version is distinct from (contents->>'version')::integer
   or r.status not in ('draft','submitted')
  then raise exception 'Record unavailable';end if;
  before_state=jsonb_build_object('status',r.status,'version',r.version,'classification',r.classification);
  after_state=jsonb_build_object('status','accepted','version',r.version+1,'classification',r.classification);
  payload=kxra_private.approval_envelope(
   contents||jsonb_build_object('title',r.title,'classification',r.classification),
   'Accept '||r.kind::text||' record: '||r.title,before_state,after_state,null,
   'Acceptance makes the reviewed record version immutable and reusable as evidence.'
  );
 else raise exception 'Action disabled';end if;
 select environment into env from kxra_private.deployment;
 insert into kxra.approvals(org_id,project_id,action,payload,payload_hash,environment,expires_at)
 values(o,project,action_name,payload,
  kxra_private.approval_digest(action_name,o,project,payload,env,auth.uid(),expiry),env,expiry)
 returning * into v;
 insert into kxra.audit_events(org_id,actor_id,action,resource_id,metadata)
 values(o,auth.uid(),'approval.requested',v.id,jsonb_build_object('action',action_name,'project_id',project));
 return v;
end $$;

create or replace function kxra.request_project_gate_approval(project uuid,contents jsonb)
returns kxra.approvals language plpgsql security definer set search_path='' as $$
declare o uuid=kxra_private.member_org();v kxra.approvals;e kxra.records;env text;
 expiry timestamptz=now()+interval '24 hours';payload jsonb;policy_version integer;
begin
 if not kxra_private.is_owner(o) or not kxra_private.can_project(project)
  or jsonb_typeof(contents)<>'object' or not(contents ?& array['gate','evidence_id','evidence_version'])
  or contents-array['gate','evidence_id','evidence_version']<>'{}'::jsonb
  or not kxra_private.gate_matches_project(project,contents->>'gate')
 then raise exception 'Gate approval unavailable';end if;
 select * into e from kxra.records where id=(contents->>'evidence_id')::uuid;
 if not found or e.org_id<>o or e.project_id<>project or e.status<>'accepted'
  or e.visibility<>'project_shared' or e.version is distinct from (contents->>'evidence_version')::integer
  or e.data->>'gate'<>contents->>'gate'
  or not kxra_private.gate_claims_valid(contents->>'gate',e.data-'gate')
 then raise exception 'Current accepted gate evidence required';end if;
 select gp.policy_version into policy_version from kxra.project_gate_policies gp
 where gp.project_id=project and gp.gate_code=contents->>'gate';
 payload=kxra_private.approval_envelope(
  contents||jsonb_build_object('evidence_title',e.title,'policy_version',policy_version,'scope','local_only'),
  'Authorize local project gate '||contents->>'gate',
  jsonb_build_object('authorized',false,'gate',contents->>'gate','policy_version',policy_version),
  jsonb_build_object('authorized',true,'gate',contents->>'gate','policy_version',policy_version,
   'evidence_id',e.id,'evidence_version',e.version),null,
  'A gate authorization may advance local work, but does not deploy, publish, spend, trade or message externally.'
 );
 select environment into env from kxra_private.deployment;
 insert into kxra.approvals(org_id,project_id,action,payload,payload_hash,environment,expires_at)
 values(o,project,'project.gate',payload,
  kxra_private.approval_digest('project.gate',o,project,payload,env,auth.uid(),expiry),env,expiry)
 returning * into v;
 insert into kxra.audit_events(org_id,actor_id,action,resource_id,metadata)
 values(o,auth.uid(),'approval.requested',v.id,jsonb_build_object('action','project.gate','project_id',project));
 return v;
end $$;

create or replace function kxra.request_account_lifecycle_approval(
 target uuid,desired_state text,reason text
) returns kxra.approvals language plpgsql security definer set search_path='' as $$
declare o uuid=kxra_private.member_org();m kxra.members;p kxra.profiles;v kxra.approvals;
 env text;expiry timestamptz=now()+interval '24 hours';payload jsonb;before_state jsonb;after_state jsonb;
begin
 if not kxra_private.is_owner(o) or desired_state not in ('ACTIVE','SUSPENDED','REVOKED')
  or length(trim(reason)) not between 1 and 1000
 then raise exception 'Account action unavailable';end if;
 select * into m from kxra.members where id=target and org_id=o and role='partner' for update;
 select * into p from kxra.profiles where user_id=target and org_id=o for update;
 if m.id is null or p.user_id is null or p.account_state='REVOKED'
  or (desired_state='ACTIVE' and p.account_state<>'SUSPENDED')
  or (desired_state in ('SUSPENDED','REVOKED') and p.account_state not in ('ACTIVE','ONBOARDING'))
 then raise exception 'Account action unavailable';end if;
 before_state=jsonb_build_object('account_state',p.account_state,'active',m.active,
  'onboarding_completed_at',p.onboarding_completed_at);
 after_state=jsonb_build_object('account_state',case
  when desired_state='ACTIVE' and p.onboarding_completed_at is null then 'ONBOARDING'
  else desired_state end,'active',desired_state='ACTIVE');
 payload=kxra_private.approval_envelope(
  jsonb_build_object('user_id',target,'desired_state',desired_state,'reason',trim(reason),
   'expected_access_version',m.access_version,'expected_session_version',p.session_version),
  'Change account lifecycle for '||m.display_name,before_state,after_state,
  jsonb_build_object('user_id',m.id,'display_name',m.display_name),
  'Account lifecycle changes immediately alter access and invalidate active sessions.'
 );
 select environment into env from kxra_private.deployment;
 insert into kxra.approvals(org_id,project_id,action,payload,payload_hash,environment,expires_at)
 values(o,null,'account.lifecycle',payload,
  kxra_private.approval_digest('account.lifecycle',o,null,payload,env,auth.uid(),expiry),env,expiry)
 returning * into v;
 insert into kxra.audit_events(org_id,actor_id,action,resource_id,metadata)
 values(o,auth.uid(),'approval.requested',v.id,jsonb_build_object('action','account.lifecycle','account_id',target));
 return v;
end $$;

create function kxra.create_idea(contents jsonb) returns kxra.ideas
language plpgsql security definer set search_path='' as $$
declare o uuid=kxra_private.member_org();member kxra.members;project uuid;new_record kxra.records;
 created kxra.ideas;item jsonb;e kxra.records;source text;evidence jsonb;
begin
 select * into member from kxra.members where id=auth.uid() and org_id=o and active;
 if not found or jsonb_typeof(contents)<>'object'
  or not(contents ?& array['project_id','title','raw_idea'])
  or contents-array['project_id','title','raw_idea','structured_summary','problem_statement',
   'target_customer','validation_plan','next_experiment','source_note','evidence']<>'{}'::jsonb
 then raise exception 'Idea unavailable';end if;
 project=case when jsonb_typeof(contents->'project_id')='null' then null else (contents->>'project_id')::uuid end;
 if (project is null and member.role<>'owner') or
  (project is not null and not kxra_private.can_project(project,true))
 then raise exception 'Idea unavailable';end if;
 if length(trim(contents->>'title')) not between 1 and 240
  or length(trim(contents->>'raw_idea')) not between 1 and 50000
  or length(coalesce(contents->>'structured_summary',''))>50000
  or length(coalesce(contents->>'problem_statement',''))>50000
  or length(coalesce(contents->>'target_customer',''))>50000
  or length(coalesce(contents->>'validation_plan',''))>50000
  or length(coalesce(contents->>'next_experiment',''))>50000
  or length(coalesce(contents->>'source_note',''))>1000
 then raise exception 'Idea unavailable';end if;
 evidence=coalesce(contents->'evidence','[]'::jsonb);
 if jsonb_typeof(evidence)<>'array' or jsonb_array_length(evidence)>20
 then raise exception 'Invalid idea evidence';end if;
 source=case member.role when 'owner' then 'OWNER_PORTAL' else 'PARTNER_PORTAL' end;
 insert into kxra.records(
  org_id,project_id,kind,title,body,data,classification,visibility,status,created_by
 ) values(
  o,project,'idea',trim(contents->>'title'),trim(contents->>'raw_idea'),
  jsonb_build_object('idea_state','NEW'),'USER-SUPPLIED INFORMATION',
  case when project is null then 'owner_only' else 'project_shared' end,'submitted',auth.uid()
 ) returning * into new_record;
 insert into kxra.ideas(
  record_id,org_id,project_id,submitted_by,source_type,source_note,raw_idea,
  structured_summary,problem_statement,target_customer,validation_plan,next_experiment,
  state,version,submitted_at,updated_at
 ) values(
  new_record.id,o,project,auth.uid(),source,nullif(trim(contents->>'source_note'),''),
  trim(contents->>'raw_idea'),nullif(trim(contents->>'structured_summary'),''),
  nullif(trim(contents->>'problem_statement'),''),nullif(trim(contents->>'target_customer'),''),
  nullif(trim(contents->>'validation_plan'),''),nullif(trim(contents->>'next_experiment'),''),
  'NEW',new_record.version,new_record.created_at,new_record.updated_at
 ) returning * into created;
 for item in select value from jsonb_array_elements(evidence) loop
  if jsonb_typeof(item)<>'object' or not(item ?& array['record_id','version'])
   or item-array['record_id','version']<>'{}'::jsonb
  then raise exception 'Invalid idea evidence';end if;
  select * into e from kxra.records where id=(item->>'record_id')::uuid;
  if not found or e.org_id<>o or e.project_id is distinct from project or e.status<>'accepted'
   or e.version is distinct from (item->>'version')::integer or not kxra_private.can_record(e.id)
  then raise exception 'Current accepted idea evidence required';end if;
  insert into kxra.idea_evidence(
   idea_record_id,idea_version,evidence_id,evidence_version,org_id,project_id,added_by
  ) values(created.record_id,created.version,e.id,e.version,o,project,auth.uid());
 end loop;
 insert into kxra.audit_events(org_id,actor_id,action,resource_id,metadata)
 values(o,auth.uid(),'idea.created',created.record_id,jsonb_build_object('project_id',project,'state','NEW','version',created.version));
 return created;
end $$;

create function kxra.update_idea(target uuid,expected_version integer,contents jsonb) returns kxra.ideas
language plpgsql security definer set search_path='' as $$
declare i kxra.ideas;r kxra.records;updated kxra.ideas;item jsonb;e kxra.records;evidence jsonb;
begin
 select * into i from kxra.ideas where record_id=target for update;
 select * into r from kxra.records where id=target for update;
 if i.record_id is null or r.id is null or not kxra_private.can_view_idea(target)
  or i.version is distinct from expected_version or r.version is distinct from expected_version
  or i.state<>'NEW' or not(
   kxra_private.is_owner(i.org_id) or
   (i.submitted_by=auth.uid() and kxra_private.can_project(i.project_id,true))
  ) or jsonb_typeof(contents)<>'object'
  or not(contents ?& array['title','raw_idea'])
  or contents-array['title','raw_idea','structured_summary','problem_statement',
   'target_customer','validation_plan','next_experiment','source_note','evidence']<>'{}'::jsonb
 then raise exception 'Idea update unavailable';end if;
 if length(trim(contents->>'title')) not between 1 and 240
  or length(trim(contents->>'raw_idea')) not between 1 and 50000
  or length(coalesce(contents->>'structured_summary',''))>50000
  or length(coalesce(contents->>'problem_statement',''))>50000
  or length(coalesce(contents->>'target_customer',''))>50000
  or length(coalesce(contents->>'validation_plan',''))>50000
  or length(coalesce(contents->>'next_experiment',''))>50000
  or length(coalesce(contents->>'source_note',''))>1000
 then raise exception 'Idea update unavailable';end if;
 evidence=coalesce(contents->'evidence','[]'::jsonb);
 if jsonb_typeof(evidence)<>'array' or jsonb_array_length(evidence)>20
 then raise exception 'Invalid idea evidence';end if;
 update kxra.records set title=trim(contents->>'title'),body=trim(contents->>'raw_idea')
 where id=target returning * into r;
 update kxra.ideas set source_note=nullif(trim(contents->>'source_note'),''),
  raw_idea=trim(contents->>'raw_idea'),structured_summary=nullif(trim(contents->>'structured_summary'),''),
  problem_statement=nullif(trim(contents->>'problem_statement'),''),
  target_customer=nullif(trim(contents->>'target_customer'),''),
  validation_plan=nullif(trim(contents->>'validation_plan'),''),
  next_experiment=nullif(trim(contents->>'next_experiment'),''),version=r.version,updated_at=now()
 where record_id=target returning * into updated;
 for item in select value from jsonb_array_elements(evidence) loop
  if jsonb_typeof(item)<>'object' or not(item ?& array['record_id','version'])
   or item-array['record_id','version']<>'{}'::jsonb
  then raise exception 'Invalid idea evidence';end if;
  select * into e from kxra.records where id=(item->>'record_id')::uuid;
  if not found or e.org_id<>i.org_id or e.project_id is distinct from i.project_id
   or e.status<>'accepted' or e.version is distinct from (item->>'version')::integer
   or not kxra_private.can_record(e.id)
  then raise exception 'Current accepted idea evidence required';end if;
  insert into kxra.idea_evidence(
   idea_record_id,idea_version,evidence_id,evidence_version,org_id,project_id,added_by
  ) values(updated.record_id,updated.version,e.id,e.version,i.org_id,i.project_id,auth.uid());
 end loop;
 insert into kxra.audit_events(org_id,actor_id,action,resource_id,metadata)
 values(i.org_id,auth.uid(),'idea.updated',target,jsonb_build_object('project_id',i.project_id,'version',updated.version));
 return updated;
end $$;

create function kxra_private.idea_transition_allowed(before_state text,after_state text) returns boolean
language sql immutable set search_path='' as $$
 select case before_state
  when 'NEW' then after_state in ('TRIAGE','REJECTED','ARCHIVED')
  when 'TRIAGE' then after_state in ('VALIDATING','PROMISING','PAUSED','REJECTED','ARCHIVED')
  when 'VALIDATING' then after_state in ('PROMISING','BUILDING','PAUSED','REJECTED','ARCHIVED')
  when 'PROMISING' then after_state in ('VALIDATING','BUILDING','PAUSED','REJECTED','ARCHIVED')
  when 'BUILDING' then after_state in ('PAUSED','ARCHIVED')
  when 'PAUSED' then after_state in ('TRIAGE','VALIDATING','PROMISING','BUILDING','REJECTED','ARCHIVED')
  when 'REJECTED' then after_state in ('TRIAGE','ARCHIVED')
  else false end
$$;

create function kxra.transition_idea(target uuid,expected_version integer,desired_state text,reason text)
returns kxra.ideas language plpgsql security definer set search_path='' as $$
declare i kxra.ideas;r kxra.records;updated kxra.ideas;
begin
 select * into i from kxra.ideas where record_id=target for update;
 select * into r from kxra.records where id=target for update;
 if i.record_id is null or r.id is null or not kxra_private.is_owner(i.org_id)
  or i.version is distinct from expected_version or r.version is distinct from expected_version
  or desired_state not in ('NEW','TRIAGE','VALIDATING','PROMISING','BUILDING','PAUSED','REJECTED','ARCHIVED')
  or not kxra_private.idea_transition_allowed(i.state,desired_state)
  or length(trim(reason)) not between 1 and 2000
 then raise exception 'Idea transition unavailable';end if;
 update kxra.records set data=data||jsonb_build_object('idea_state',desired_state,'state_reason',trim(reason))
 where id=target returning * into r;
 update kxra.ideas set state=desired_state,version=r.version,updated_at=now()
 where record_id=target returning * into updated;
 insert into kxra.audit_events(org_id,actor_id,action,resource_id,metadata)
 values(i.org_id,auth.uid(),'idea.state.changed',target,
  jsonb_build_object('project_id',i.project_id,'before',i.state,'after',desired_state,'reason',trim(reason),'version',updated.version));
 return updated;
end $$;

create function kxra.merge_idea_duplicate(
 target uuid,expected_version integer,canonical uuid,reason text
) returns kxra.ideas language plpgsql security definer set search_path='' as $$
declare i kxra.ideas;c kxra.ideas;r kxra.records;updated kxra.ideas;
begin
 select * into i from kxra.ideas where record_id=target for update;
 select * into c from kxra.ideas where record_id=canonical;
 select * into r from kxra.records where id=target for update;
 if i.record_id is null or c.record_id is null or r.id is null or target=canonical
  or not kxra_private.is_owner(i.org_id) or c.org_id<>i.org_id
  or c.project_id is distinct from i.project_id or c.state='ARCHIVED'
  or i.version is distinct from expected_version or r.version is distinct from expected_version
  or i.state='ARCHIVED' or length(trim(reason)) not between 1 and 2000
 then raise exception 'Idea merge unavailable';end if;
 update kxra.records set data=data||jsonb_build_object(
  'idea_state','ARCHIVED','duplicate_of',canonical,'merge_reason',trim(reason)
 ) where id=target returning * into r;
 update kxra.ideas set state='ARCHIVED',duplicate_of=canonical,merge_reason=trim(reason),
  version=r.version,updated_at=now() where record_id=target returning * into updated;
 insert into kxra.audit_events(org_id,actor_id,action,resource_id,metadata)
 values(i.org_id,auth.uid(),'idea.merged',target,
  jsonb_build_object('project_id',i.project_id,'canonical_id',canonical,'reason',trim(reason),'version',updated.version));
 return updated;
end $$;

create function kxra.request_idea_share_approval(target uuid,recipient uuid,make_active boolean)
returns kxra.approvals language plpgsql security definer set search_path='' as $$
declare o uuid=kxra_private.member_org();i kxra.ideas;m kxra.members;s kxra.idea_shares;
 env text;expiry timestamptz=now()+interval '24 hours';payload jsonb;v kxra.approvals;
begin
 select * into i from kxra.ideas where record_id=target for update;
 if i.record_id is null or i.project_id is null or not kxra_private.is_owner(i.org_id) or i.org_id<>o
  or make_active is null then raise exception 'Idea share unavailable';end if;
 select * into m from kxra.members where id=recipient and org_id=o and role='partner' and active;
 if not found or not exists(
  select 1 from kxra.project_memberships pm where pm.project_id=i.project_id and pm.user_id=m.id
   and pm.active and (pm.expires_at is null or pm.expires_at>now())
 ) then raise exception 'Idea share unavailable';end if;
 select * into s from kxra.idea_shares where idea_record_id=target and user_id=recipient;
 if coalesce(s.active,false)=make_active then raise exception 'Idea share is unchanged';end if;
 payload=kxra_private.approval_envelope(
  jsonb_build_object('idea_id',target,'idea_version',i.version,'user_id',recipient,
   'expected_share_version',coalesce(s.version,0),'active',make_active),
  case when make_active then 'Share idea with ' else 'Remove idea access from ' end||m.display_name,
  jsonb_build_object('active',coalesce(s.active,false),'share_version',coalesce(s.version,0)),
  jsonb_build_object('active',make_active,'share_version',coalesce(s.version,0)+1),
  jsonb_build_object('user_id',m.id,'display_name',m.display_name),
  'Idea sharing changes the project context available to this partner.'
 );
 select environment into env from kxra_private.deployment;
 insert into kxra.approvals(org_id,project_id,action,payload,payload_hash,environment,expires_at)
 values(o,i.project_id,'idea.share',payload,
  kxra_private.approval_digest('idea.share',o,i.project_id,payload,env,auth.uid(),expiry),env,expiry)
 returning * into v;
 insert into kxra.audit_events(org_id,actor_id,action,resource_id,metadata)
 values(o,auth.uid(),'approval.requested',v.id,
  jsonb_build_object('action','idea.share','project_id',i.project_id,'idea_id',target,'recipient_id',recipient));
 return v;
end $$;

create function kxra.change_idea_share(a uuid) returns void
language plpgsql security definer set search_path='' as $$
declare v kxra.approvals;i kxra.ideas;s kxra.idea_shares;m kxra.members;
begin
 select * into v from kxra.approvals where id=a for update;
 perform kxra_private.check_approval(v,'APPROVED');
 if v.action<>'idea.share' then raise exception 'Wrong action';end if;
 select * into i from kxra.ideas where record_id=(v.payload->>'idea_id')::uuid for update;
 select * into m from kxra.members where id=(v.payload->>'user_id')::uuid
  and org_id=v.org_id and role='partner' and active for update;
 select * into s from kxra.idea_shares where idea_record_id=i.record_id and user_id=m.id for update;
 if i.record_id is null or m.id is null or i.org_id<>v.org_id or i.project_id<>v.project_id
  or i.version is distinct from (v.payload->>'idea_version')::integer
  or coalesce(s.version,0) is distinct from (v.payload->>'expected_share_version')::integer
  or not exists(select 1 from kxra.project_memberships pm where pm.project_id=i.project_id
   and pm.user_id=m.id and pm.active and (pm.expires_at is null or pm.expires_at>now()))
 then raise exception 'Stale idea share approval';end if;
 update kxra.approvals set state='EXECUTING',executing_at=now() where id=a;
 insert into kxra.idea_shares(
  org_id,project_id,idea_record_id,user_id,active,version,approved_by,approval_id
 ) values(
  v.org_id,v.project_id,i.record_id,m.id,(v.payload->>'active')::boolean,1,auth.uid(),a
 ) on conflict(idea_record_id,user_id) do update set
  active=excluded.active,version=kxra.idea_shares.version+1,approved_by=excluded.approved_by,
  approval_id=excluded.approval_id,updated_at=now();
 update kxra.members set access_version=access_version+1 where id=m.id;
 update kxra.approvals set state='EXECUTED',consumed_at=now(),execution_completed_at=now() where id=a;
 insert into kxra.audit_events(org_id,actor_id,action,resource_id,metadata)
 values(v.org_id,auth.uid(),'idea.share.changed',i.record_id,
  jsonb_build_object('project_id',i.project_id,'user_id',m.id,'active',(v.payload->>'active')::boolean,'approval_id',a));
end $$;

create function kxra.request_project_governance_approval(
 project uuid,expected_version integer,contents jsonb
) returns kxra.approvals language plpgsql security definer set search_path='' as $$
declare o uuid=kxra_private.member_org();p kxra.projects;m kxra.members;env text;
 expiry timestamptz=now()+interval '24 hours';payload jsonb;v kxra.approvals;owner_id uuid;
 before_state jsonb;after_state jsonb;
begin
 select * into p from kxra.projects where id=project and org_id=o for update;
 if p.id is null or not kxra_private.is_owner(o) or p.governance_version is distinct from expected_version
  or jsonb_typeof(contents)<>'object'
  or not(contents ?& array['lifecycle_stage','disposition','next_gate','next_action','current_recommendation','owner_user_id'])
  or contents-array['lifecycle_stage','disposition','next_gate','next_action','current_recommendation','owner_user_id']<>'{}'::jsonb
  or contents->>'lifecycle_stage' not in ('IDEA_INBOX','PROBLEM_DISCOVERY','VALIDATION','MARKET_ANALYSIS',
   'FEASIBILITY','BUSINESS_CASE','MVP','PILOT','REVIEW','LAUNCH','SCALE')
  or contents->>'disposition' not in ('ACTIVE','MONITOR','PAUSED','REJECTED','ARCHIVED')
  or length(trim(contents->>'next_action')) not between 1 and 5000
  or (jsonb_typeof(contents->'current_recommendation')<>'null'
   and contents->>'current_recommendation' not in ('GO','ITERATE','PAUSE','KILL'))
 then raise exception 'Project governance unavailable';end if;
 owner_id=case when jsonb_typeof(contents->'owner_user_id')='null' then null else (contents->>'owner_user_id')::uuid end;
 if owner_id is not null then
  select * into m from kxra.members where id=owner_id and org_id=o and active;
  if not found or (m.role='partner' and not exists(
   select 1 from kxra.project_memberships pm where pm.project_id=project and pm.user_id=m.id
    and pm.active and (pm.expires_at is null or pm.expires_at>now())
  )) then raise exception 'Project owner unavailable';end if;
 end if;
 before_state=jsonb_build_object(
  'lifecycle_stage',p.lifecycle_stage,'disposition',p.disposition,'next_gate',p.next_gate,
  'next_action',p.next_action,'current_recommendation',p.current_recommendation,'owner_user_id',p.owner_user_id
 );
 after_state=jsonb_build_object(
  'lifecycle_stage',contents->'lifecycle_stage','disposition',contents->'disposition',
  'next_gate',contents->'next_gate','next_action',trim(contents->>'next_action'),
  'current_recommendation',contents->'current_recommendation','owner_user_id',owner_id
 );
 if before_state=after_state then raise exception 'Project governance is unchanged';end if;
 payload=kxra_private.approval_envelope(
  jsonb_build_object('expected_governance_version',p.governance_version),
  'Update governance for '||p.code||' · '||p.name,before_state,after_state,null,
  'Changing lifecycle, disposition or recommendation affects portfolio prioritisation.'
 );
 select environment into env from kxra_private.deployment;
 insert into kxra.approvals(org_id,project_id,action,payload,payload_hash,environment,expires_at)
 values(o,project,'project.governance',payload,
  kxra_private.approval_digest('project.governance',o,project,payload,env,auth.uid(),expiry),env,expiry)
 returning * into v;
 insert into kxra.audit_events(org_id,actor_id,action,resource_id,metadata)
 values(o,auth.uid(),'approval.requested',v.id,jsonb_build_object('action','project.governance','project_id',project));
 return v;
end $$;

create function kxra.change_project_governance(a uuid) returns void
language plpgsql security definer set search_path='' as $$
declare v kxra.approvals;p kxra.projects;after_state jsonb;
begin
 select * into v from kxra.approvals where id=a for update;
 perform kxra_private.check_approval(v,'APPROVED');
 if v.action<>'project.governance' then raise exception 'Wrong action';end if;
 select * into p from kxra.projects where id=v.project_id and org_id=v.org_id for update;
 if p.id is null or p.governance_version is distinct from (v.payload->>'expected_governance_version')::integer
  or jsonb_build_object(
   'lifecycle_stage',p.lifecycle_stage,'disposition',p.disposition,'next_gate',p.next_gate,
   'next_action',p.next_action,'current_recommendation',p.current_recommendation,'owner_user_id',p.owner_user_id
  ) is distinct from v.payload->'before'
 then raise exception 'Stale project governance approval';end if;
 after_state=v.payload->'after';
 update kxra.approvals set state='EXECUTING',executing_at=now() where id=a;
 update kxra.projects set
  lifecycle_stage=after_state->>'lifecycle_stage',disposition=after_state->>'disposition',
  next_gate=nullif(after_state->>'next_gate',''),next_action=after_state->>'next_action',
  current_recommendation=nullif(after_state->>'current_recommendation',''),
  owner_user_id=nullif(after_state->>'owner_user_id','')::uuid
 where id=p.id;
 update kxra.approvals set state='EXECUTED',consumed_at=now(),execution_completed_at=now() where id=a;
 insert into kxra.audit_events(org_id,actor_id,action,resource_id,metadata)
 values(v.org_id,auth.uid(),'project.governance.changed',p.id,
  jsonb_build_object('project_id',p.id,'approval_id',a,'before',v.payload->'before','after',after_state));
end $$;

-- Existing deterministic executors now use the expanded canonical states.
create or replace function kxra.accept_record(a uuid) returns void
language plpgsql security definer set search_path='' as $$
declare v kxra.approvals;r kxra.records;old_version integer;new_version integer;
begin
 select * into v from kxra.approvals where id=a for update;
 perform kxra_private.check_approval(v,'APPROVED');
 if v.action<>'record.accept' then raise exception 'Wrong action';end if;
 select * into r from kxra.records where id=(v.payload->>'record_id')::uuid for update;
 if not found or r.org_id is distinct from v.org_id or r.project_id is distinct from v.project_id
  or r.version is distinct from (v.payload->>'version')::integer
 then raise exception 'Stale record approval';end if;
 update kxra.approvals set state='EXECUTING',executing_at=now() where id=a;
 old_version=r.version;
 update kxra.records set status='accepted' where id=r.id returning version into new_version;
 insert into kxra.record_links(org_id,project_id,from_record_id,from_version,relation,to_record_id,to_version,created_by)
 select org_id,project_id,from_record_id,new_version,relation,to_record_id,to_version,auth.uid()
 from kxra.record_links where from_record_id=r.id and from_version=old_version
 on conflict do nothing;
 update kxra.approvals set state='EXECUTED',consumed_at=now(),execution_completed_at=now() where id=a;
 insert into kxra.audit_events(org_id,actor_id,action,resource_id,metadata)
 values(v.org_id,auth.uid(),'approval.executed',a,jsonb_build_object('action','record.accept','project_id',v.project_id));
end $$;

create or replace function kxra.change_membership(a uuid) returns void
language plpgsql security definer set search_path='' as $$
declare v kxra.approvals;m kxra.members;recipient text;queued uuid;project_name text;
begin
 select * into v from kxra.approvals where id=a for update;
 perform kxra_private.check_approval(v,'APPROVED');
 if v.action<>'membership.change' then raise exception 'Wrong action';end if;
 select * into m from kxra.members where id=(v.payload->>'user_id')::uuid
  and org_id=v.org_id and role='partner' and active for update;
 if not found or m.access_version is distinct from (v.payload->>'expected_access_version')::integer
 then raise exception 'Stale membership approval';end if;
 update kxra.approvals set state='EXECUTING',executing_at=now() where id=a;
 insert into kxra.project_memberships(org_id,project_id,user_id,role,active,expires_at)
 values(v.org_id,v.project_id,m.id,v.payload->>'role',(v.payload->>'active')::boolean,
  (v.payload->>'expires_at')::timestamptz)
 on conflict(project_id,user_id) do update set role=excluded.role,
  active=excluded.active,expires_at=excluded.expires_at;
 update kxra.approvals set state='EXECUTED',consumed_at=now(),execution_completed_at=now() where id=a;
 insert into kxra.audit_events(org_id,actor_id,action,resource_id,metadata)
 values(v.org_id,auth.uid(),'membership.changed',v.project_id,
  jsonb_build_object('project_id',v.project_id,'user_id',m.id,'role',v.payload->>'role',
   'active',(v.payload->>'active')::boolean,'approval_id',a));
 select i.recipient_email into recipient from kxra.invitations i
 where i.redeemed_by=m.id and i.recipient_email is not null order by i.redeemed_at desc limit 1;
 select name into project_name from kxra.projects where id=v.project_id;
 if recipient is not null then
  queued=kxra_private.queue_email(v.org_id,null,m.id,'PROJECT_ASSIGNMENT',recipient,
   jsonb_build_object('project_id',v.project_id,'project_name',project_name,
    'role',v.payload->>'role','active',(v.payload->>'active')::boolean),
   'project-assignment:'||v.id);
 end if;
end $$;

create or replace function kxra.authorize_project_gate(a uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare v kxra.approvals;e kxra.records;authorization_id uuid;policy_version integer;
begin
 select * into v from kxra.approvals where id=a for update;
 perform kxra_private.check_approval(v,'APPROVED');
 if v.action<>'project.gate' or not kxra_private.gate_matches_project(v.project_id,v.payload->>'gate')
 then raise exception 'Gate approval unavailable';end if;
 select * into e from kxra.records where id=(v.payload->>'evidence_id')::uuid for update;
 select gp.policy_version into policy_version from kxra.project_gate_policies gp
 where gp.project_id=v.project_id and gp.gate_code=v.payload->>'gate';
 if e.id is null or e.org_id<>v.org_id or e.project_id<>v.project_id or e.status<>'accepted'
  or e.visibility<>'project_shared' or e.version is distinct from (v.payload->>'evidence_version')::integer
  or e.data->>'gate'<>v.payload->>'gate' or policy_version is distinct from (v.payload->>'policy_version')::integer
  or not kxra_private.gate_claims_valid(v.payload->>'gate',e.data-'gate')
 then raise exception 'Gate evidence changed';end if;
 update kxra.approvals set state='EXECUTING',executing_at=now() where id=a;
 insert into kxra.project_gate_authorizations(
  org_id,project_id,gate_code,evidence_id,evidence_version,approval_id,authorized_by
 ) values(v.org_id,v.project_id,v.payload->>'gate',e.id,e.version,v.id,auth.uid())
 returning id into authorization_id;
 update kxra.approvals set state='EXECUTED',consumed_at=now(),execution_completed_at=now() where id=a;
 insert into kxra.audit_events(org_id,actor_id,action,resource_id,metadata)
 values(v.org_id,auth.uid(),'project.gate.authorized',authorization_id,
  jsonb_build_object('project_id',v.project_id,'gate',v.payload->>'gate','scope','local_only','approval_id',a));
 return authorization_id;
end $$;

create or replace function kxra.change_account_lifecycle(approval_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare v kxra.approvals;m kxra.members;p kxra.profiles;desired text;actual_state text;
 recipient text;queued uuid;event_name text;
begin
 select * into v from kxra.approvals where id=approval_id for update;
 perform kxra_private.check_approval(v,'APPROVED');
 if v.action<>'account.lifecycle' then raise exception 'Wrong action';end if;
 select * into m from kxra.members where id=(v.payload->>'user_id')::uuid
  and org_id=v.org_id and role='partner' for update;
 select * into p from kxra.profiles where user_id=(v.payload->>'user_id')::uuid
  and org_id=v.org_id for update;
 if m.id is null or p.user_id is null
  or m.access_version is distinct from (v.payload->>'expected_access_version')::integer
  or p.session_version is distinct from (v.payload->>'expected_session_version')::integer
  or jsonb_build_object('account_state',p.account_state,'active',m.active,
   'onboarding_completed_at',p.onboarding_completed_at) is distinct from v.payload->'before'
 then raise exception 'Stale account approval';end if;
 desired=v.payload->>'desired_state';
 if desired='ACTIVE' and p.account_state<>'SUSPENDED' then raise exception 'Stale account approval';end if;
 if desired in ('SUSPENDED','REVOKED') and p.account_state not in ('ACTIVE','ONBOARDING')
 then raise exception 'Stale account approval';end if;
 update kxra.approvals set state='EXECUTING',executing_at=now() where id=v.id;
 actual_state=case when desired='ACTIVE' and p.onboarding_completed_at is null then 'ONBOARDING' else desired end;
 update kxra.profiles set account_state=actual_state,
  status_reason=case when desired='ACTIVE' then null else v.payload->>'reason' end,
  session_version=session_version+1,updated_at=now() where user_id=p.user_id;
 update kxra.members set active=desired='ACTIVE',access_version=access_version+1 where id=m.id;
 if desired in ('SUSPENDED','REVOKED') then
  update kxra.whatsapp_pairings set revoked_at=coalesce(revoked_at,now())
   where user_id=m.id and revoked_at is null;
  update kxra.transactional_email_outbox set state='CANCELLED',updated_at=now()
   where user_id=m.id and state in ('PENDING','DELIVERY_FAILED');
 end if;
 insert into kxra.session_revocations(org_id,user_id,requested_by,reason,provider_state,completed_at)
 values(v.org_id,m.id,auth.uid(),v.payload->>'reason','PROVIDER_PENDING',null);
 event_name=case desired when 'ACTIVE' then 'ACCOUNT_REACTIVATED'
  when 'SUSPENDED' then 'ACCOUNT_SUSPENDED' else 'ACCOUNT_REVOKED' end;
 insert into kxra.account_security_events(org_id,user_id,actor_id,event_type,metadata)
 values(v.org_id,m.id,auth.uid(),event_name,jsonb_build_object('approval_id',v.id,'account_state',actual_state));
 insert into kxra.audit_events(org_id,actor_id,action,resource_id,metadata)
 values(v.org_id,auth.uid(),'account.lifecycle.changed',m.id,
  jsonb_build_object('approval_id',v.id,'account_state',actual_state));
 update kxra.approvals set state='EXECUTED',consumed_at=now(),execution_completed_at=now() where id=v.id;
 select i.recipient_email into recipient from kxra.invitations i
 where i.redeemed_by=m.id and i.recipient_email is not null order by i.redeemed_at desc limit 1;
 if recipient is not null and desired in ('SUSPENDED','REVOKED') then
  queued=kxra_private.queue_email(v.org_id,null,m.id,'ACCESS_REMOVED',recipient,
   jsonb_build_object('user_id',m.id,'account_state',actual_state),'access-removed:'||v.id);
 end if;
end $$;

revoke all on all functions in schema kxra_private from public;
revoke all on function
 kxra.create_idea(jsonb),kxra.update_idea(uuid,integer,jsonb),
 kxra.transition_idea(uuid,integer,text,text),kxra.merge_idea_duplicate(uuid,integer,uuid,text),
 kxra.request_idea_share_approval(uuid,uuid,boolean),kxra.change_idea_share(uuid),
 kxra.request_project_governance_approval(uuid,integer,jsonb),
 kxra.change_project_governance(uuid),kxra.refresh_expired_approvals()
from public;
grant execute on function
 kxra.create_idea(jsonb),kxra.update_idea(uuid,integer,jsonb),
 kxra.transition_idea(uuid,integer,text,text),kxra.merge_idea_duplicate(uuid,integer,uuid,text),
 kxra.request_idea_share_approval(uuid,uuid,boolean),kxra.change_idea_share(uuid),
 kxra.request_project_governance_approval(uuid,integer,jsonb),
 kxra.change_project_governance(uuid),kxra.refresh_expired_approvals()
to authenticated;
revoke all on function
 kxra_private.can_view_idea(uuid),kxra_private.log_idea_version(),
 kxra_private.guard_project_governance(),kxra_private.log_project_governance(),
 kxra_private.work_log_department(text),kxra_private.audit_project(text,uuid,jsonb),
 kxra_private.log_audit_work(),kxra_private.log_security_work(),
 kxra_private.approval_envelope(jsonb,text,jsonb,jsonb,jsonb,text),
 kxra_private.idea_transition_allowed(text,text)
from authenticated,anon;

commit;
