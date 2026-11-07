begin;

-- Workflow records are created only by the typed RPCs. This prevents a browser
-- client from bypassing evidence links with a generic records insert/update.
create or replace function kxra_private.guard_record() returns trigger
language plpgsql set search_path='' as $$ begin
 if tg_op='INSERT' then
  new.version=1;new.created_at=now();new.updated_at=now();
  if current_user in ('authenticated','anon') and (
   new.classification='FACT' or new.kind in ('experiment','decision','task','run') or
   new.provenance<>'{}'::jsonb or new.source_code is not null
  ) then raise exception 'Verified system transition required';end if;
  if new.supersedes_id is not null and not exists(
   select 1 from kxra.records r where r.id=new.supersedes_id and r.org_id=new.org_id
   and r.project_id is not distinct from new.project_id and r.kind=new.kind
   and r.visibility=new.visibility and r.status='accepted' and kxra_private.is_owner(r.org_id)
  ) then raise exception 'Supersession unavailable';end if;
 else
  if (new.id,new.org_id,new.project_id,new.created_by,new.kind,new.created_at,new.source_code,new.visibility,new.provenance,new.supersedes_id)
   is distinct from
   (old.id,old.org_id,old.project_id,old.created_by,old.kind,old.created_at,old.source_code,old.visibility,old.provenance,old.supersedes_id)
  then raise exception 'Immutable scope';end if;
  if current_user in ('authenticated','anon') and old.kind in ('experiment','decision','task','run')
  then raise exception 'Typed workflow transition required';end if;
  if old.status not in ('draft','submitted') then raise exception 'Immutable accepted record';end if;
  if new.classification is distinct from old.classification and (
   new.classification<>'FACT' or not exists(
    select 1 from kxra.verifications v where v.record_id=old.id
    and v.record_version=old.version+1 and v.reviewer_id=auth.uid()
   )
  ) then raise exception 'Verification required';end if;
  new.version=old.version+1;new.updated_at=now();
 end if;return new;
end $$;

drop policy record_insert on kxra.records;
create policy record_insert on kxra.records for insert with check(
 org_id=kxra_private.member_org() and created_by=auth.uid() and status in ('draft','submitted') and
 (kxra_private.is_owner(org_id) or (
  visibility='project_shared' and kxra_private.can_project(project_id,true) and kind in ('idea','note')
 ))
);
drop policy record_update on kxra.records;
create policy record_update on kxra.records for update using(
 status in ('draft','submitted') and (
  kxra_private.is_owner(org_id) or (
   created_by=auth.uid() and kxra_private.can_project(project_id,true) and kind in ('idea','note')
  )
 )
) with check(
 status in ('draft','submitted') and (
  kxra_private.is_owner(org_id) or (
   created_by=auth.uid() and visibility='project_shared' and
   kxra_private.can_project(project_id,true) and kind in ('idea','note')
  )
 )
);

drop policy tasks_read on kxra.workflow_tasks;
create policy tasks_read on kxra.workflow_tasks for select using(
 kxra_private.is_owner(org_id) or
 (assignee_id=auth.uid() and kxra_private.can_record(context_record_id))
);

create table kxra.workflow_task_versions(
 task_id uuid not null references kxra.workflow_tasks,
 version integer not null,
 state text not null,
 completion_note text,
 editor_id uuid,
 created_at timestamptz not null default now(),
 primary key(task_id,version)
);
alter table kxra.workflow_task_versions enable row level security;
grant select on kxra.workflow_task_versions to authenticated,anon;
create policy task_versions_read on kxra.workflow_task_versions for select using(
 exists(select 1 from kxra.workflow_tasks t where t.id=task_id and (
  kxra_private.is_owner(t.org_id) or
  (t.assignee_id=auth.uid() and kxra_private.can_record(t.context_record_id))
 ))
);
create function kxra_private.log_workflow_task() returns trigger
language plpgsql security definer set search_path='' as $$ begin
 insert into kxra.workflow_task_versions(task_id,version,state,completion_note,editor_id)
 values(new.id,new.version,new.state,new.completion_note,auth.uid());
 if tg_op='INSERT' then
  insert into kxra.audit_events(org_id,actor_id,action,resource_id,metadata)
  values(new.org_id,auth.uid(),'task.assigned',new.id,jsonb_build_object('version',new.version,'context_record_id',new.context_record_id,'context_version',new.context_version));
 end if;
 return new;
end $$;
create trigger workflow_task_audit after insert or update on kxra.workflow_tasks
for each row execute function kxra_private.log_workflow_task();

create function kxra_private.log_experiment_result() returns trigger
language plpgsql security definer set search_path='' as $$ begin
 insert into kxra.audit_events(org_id,actor_id,action,resource_id,metadata)
 values(new.org_id,auth.uid(),'experiment.result_recorded',new.id,jsonb_build_object('experiment_id',new.experiment_id,'experiment_version',new.experiment_version,'outcome',new.outcome));
 return new;
end $$;
create trigger experiment_result_audit after insert on kxra.experiment_results
for each row execute function kxra_private.log_experiment_result();

-- A contributor may record a result only when the owner assigned that exact
-- experiment version to them. Owners retain the ability to record a result.
create or replace function kxra.record_experiment_result(
 experiment uuid,expected_version integer,outcome_name text,observations text,metric_value text,evidence jsonb
) returns uuid language plpgsql security definer set search_path='' as $$
 declare e kxra.records;result_id uuid;item jsonb;
 begin
 select * into e from kxra.records where id=experiment;
 if not found or e.kind<>'experiment' or e.visibility<>'project_shared'
  or e.version is distinct from expected_version or e.status not in ('draft','submitted','accepted')
  or not kxra_private.can_project(e.project_id,true)
  or not (
   kxra_private.is_owner(e.org_id) or exists(
    select 1 from kxra.workflow_tasks t where t.context_record_id=e.id
    and t.context_version=e.version and t.assignee_id=auth.uid() and t.state='assigned'
   )
  )
 then raise exception 'Experiment result unavailable';end if;
 if outcome_name not in ('success','failure','inconclusive','stopped')
  or length(trim(observations))<1 or length(trim(metric_value))<1
 then raise exception 'Invalid experiment result';end if;
 perform kxra_private.require_evidence(e.org_id,e.project_id,evidence);
 insert into kxra.experiment_results(org_id,project_id,experiment_id,experiment_version,outcome,observations,metric_value,recorded_by)
 values(e.org_id,e.project_id,e.id,e.version,outcome_name,observations,metric_value,auth.uid())
 returning id into result_id;
 for item in select value from jsonb_array_elements(evidence) loop
  insert into kxra.result_evidence values(result_id,(item->>'record_id')::uuid,(item->>'version')::integer);
 end loop;
 return result_id;
end $$;

-- Acceptance creates a new immutable record version. Copy its outgoing exact
-- links so the accepted decision remains linked to the reviewed evidence.
create or replace function kxra.accept_record(a uuid) returns void
language plpgsql security definer set search_path='' as $$
 declare v kxra.approvals;r kxra.records;old_version integer;new_version integer;
 begin
 select * into v from kxra.approvals where id=a for update;
 perform kxra_private.check_approval(v,'approved');
 if v.action<>'record.accept' then raise exception 'Wrong action';end if;
 select * into r from kxra.records where id=(v.payload->>'record_id')::uuid for update;
 if not found or r.org_id is distinct from v.org_id or r.project_id is distinct from v.project_id
  or r.version is distinct from (v.payload->>'version')::integer
 then raise exception 'Stale record approval';end if;
 old_version=r.version;
 update kxra.records set status='accepted' where id=r.id returning version into new_version;
 insert into kxra.record_links(org_id,project_id,from_record_id,from_version,relation,to_record_id,to_version,created_by)
 select org_id,project_id,from_record_id,new_version,relation,to_record_id,to_version,auth.uid()
 from kxra.record_links where from_record_id=r.id and from_version=old_version
 on conflict do nothing;
 update kxra.approvals set state='executed',consumed_at=now() where id=a;
 insert into kxra.audit_events(org_id,actor_id,action,resource_id)
 values(v.org_id,auth.uid(),'approval.executed',a);
end $$;

revoke all on all functions in schema kxra_private from public;
revoke all on function kxra_private.log_workflow_task(),kxra_private.log_experiment_result() from authenticated,anon;

commit;
