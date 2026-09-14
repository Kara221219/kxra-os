begin;

create table kxra.record_links(
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null,
 project_id uuid not null,
 from_record_id uuid not null,
 from_version integer not null,
 relation text not null check(relation in ('tests_idea','uses_evidence','result_evidence','decides_experiment','supersedes')),
 to_record_id uuid not null,
 to_version integer not null,
 created_by uuid not null default auth.uid(),
 created_at timestamptz not null default now(),
 foreign key(org_id,project_id,from_record_id) references kxra.records(org_id,project_id,id),
 foreign key(org_id,project_id,to_record_id) references kxra.records(org_id,project_id,id),
 foreign key(from_record_id,from_version) references kxra.record_versions(record_id,version),
 foreign key(to_record_id,to_version) references kxra.record_versions(record_id,version),
 unique(from_record_id,from_version,relation,to_record_id,to_version)
);

create table kxra.experiment_results(
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null,
 project_id uuid not null,
 experiment_id uuid not null,
 experiment_version integer not null,
 outcome text not null check(outcome in ('success','failure','inconclusive','stopped')),
 observations text not null check(length(trim(observations)) between 1 and 50000),
 metric_value text not null check(length(trim(metric_value)) between 1 and 500),
 recorded_by uuid not null default auth.uid(),
 created_at timestamptz not null default now(),
 foreign key(org_id,project_id,experiment_id) references kxra.records(org_id,project_id,id),
 foreign key(experiment_id,experiment_version) references kxra.record_versions(record_id,version),
 unique(experiment_id,experiment_version)
);

create table kxra.result_evidence(
 result_id uuid not null references kxra.experiment_results,
 evidence_id uuid not null,
 evidence_version integer not null,
 primary key(result_id,evidence_id,evidence_version),
 foreign key(evidence_id,evidence_version) references kxra.record_versions(record_id,version)
);

create table kxra.workflow_tasks(
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null,
 project_id uuid not null,
 context_record_id uuid not null,
 context_version integer not null,
 title text not null check(length(trim(title)) between 1 and 240),
 acceptance_criteria text not null check(length(trim(acceptance_criteria)) between 1 and 5000),
 assignee_id uuid not null,
 state text not null default 'assigned' check(state in ('assigned','completed')),
 completion_note text,
 assigned_by uuid not null default auth.uid(),
 completed_by uuid,
 version integer not null default 1,
 assigned_at timestamptz not null default now(),
 completed_at timestamptz,
 updated_at timestamptz not null default now(),
 foreign key(org_id,project_id,context_record_id) references kxra.records(org_id,project_id,id),
 foreign key(context_record_id,context_version) references kxra.record_versions(record_id,version),
 foreign key(org_id,assignee_id) references kxra.members(org_id,id),
 check((state='assigned' and completion_note is null and completed_by is null and completed_at is null) or
       (state='completed' and length(trim(completion_note))>0 and completed_by is not null and completed_at is not null))
);

alter table kxra.record_links enable row level security;
alter table kxra.experiment_results enable row level security;
alter table kxra.result_evidence enable row level security;
alter table kxra.workflow_tasks enable row level security;
grant select on kxra.record_links,kxra.experiment_results,kxra.result_evidence,kxra.workflow_tasks to authenticated,anon;

create policy links_read on kxra.record_links for select using(kxra_private.can_record(from_record_id) and kxra_private.can_record(to_record_id));
create policy results_read on kxra.experiment_results for select using(kxra_private.can_record(experiment_id));
create policy result_evidence_read on kxra.result_evidence for select using(
 exists(select 1 from kxra.experiment_results er where er.id=result_id and kxra_private.can_record(er.experiment_id))
 and kxra_private.can_record(evidence_id)
);
create policy tasks_read on kxra.workflow_tasks for select using(kxra_private.can_record(context_record_id));

create function kxra_private.require_evidence(o uuid,p uuid,items jsonb) returns void
language plpgsql stable security definer set search_path='' as $$ declare item jsonb;r kxra.records;begin
 if jsonb_typeof(items) is distinct from 'array' or jsonb_array_length(items)=0 then raise exception 'Evidence is required';end if;
 for item in select value from jsonb_array_elements(items) loop
  if not(item ?& array['record_id','version']) or item-array['record_id','version']<>'{}'::jsonb then raise exception 'Invalid evidence reference';end if;
  select * into r from kxra.records where id=(item->>'record_id')::uuid;
  if not found or r.org_id<>o or r.project_id is distinct from p or r.version is distinct from (item->>'version')::integer or r.status<>'accepted' or not kxra_private.can_record(r.id) then raise exception 'Current accepted evidence required';end if;
 end loop;
end $$;

create function kxra_private.add_evidence_links(o uuid,p uuid,from_id uuid,from_version integer,relation_name text,items jsonb) returns void
language plpgsql security definer set search_path='' as $$ declare item jsonb;begin
 perform kxra_private.require_evidence(o,p,items);
 for item in select value from jsonb_array_elements(items) loop
  insert into kxra.record_links(org_id,project_id,from_record_id,from_version,relation,to_record_id,to_version)
  values(o,p,from_id,from_version,relation_name,(item->>'record_id')::uuid,(item->>'version')::integer);
 end loop;
end $$;

create function kxra.submit_idea(target uuid,expected_version integer) returns kxra.records
language plpgsql security definer set search_path='' as $$ declare r kxra.records;begin
 select * into r from kxra.records where id=target for update;
 if not found or r.kind<>'idea' or r.status<>'draft' or r.version is distinct from expected_version or not (
  kxra_private.is_owner(r.org_id) or (r.created_by=auth.uid() and r.visibility='project_shared' and kxra_private.can_project(r.project_id,true))
 ) then raise exception 'Idea submission unavailable';end if;
 update kxra.records set status='submitted' where id=r.id returning * into r;
 return r;
end $$;

create function kxra.create_experiment(
 p uuid,idea uuid,idea_version integer,title text,hypothesis text,cost_cap text,currency text,
 success_criteria text,stop_criteria text,evidence jsonb
) returns uuid language plpgsql security definer set search_path='' as $$ declare o uuid=kxra_private.member_org();i kxra.records;new_id uuid;begin
 if not kxra_private.is_owner(o) or not kxra_private.can_project(p) then raise exception 'Experiment unavailable';end if;
 select * into i from kxra.records where id=idea;
 if not found or i.org_id<>o or i.project_id<>p or i.kind<>'idea' or i.visibility<>'project_shared' or i.status not in ('submitted','accepted') or i.version is distinct from idea_version then raise exception 'Current submitted idea required';end if;
 if length(trim(title)) not between 1 and 240 or length(trim(hypothesis))<1 or length(trim(success_criteria))<1 or length(trim(stop_criteria))<1 or cost_cap!~'^\d{1,12}(\.\d{1,4})?$' or currency not in ('GBP','USD','EUR') then raise exception 'Invalid experiment specification';end if;
 perform kxra_private.require_evidence(o,p,evidence);
 insert into kxra.records(org_id,project_id,kind,title,body,data,classification,visibility,created_by)
 values(o,p,'experiment',title,hypothesis,jsonb_build_object('hypothesis',hypothesis,'cost_cap',cost_cap,'currency',currency,'success_criteria',success_criteria,'stop_criteria',stop_criteria),'HYPOTHESIS','project_shared',auth.uid()) returning id into new_id;
 insert into kxra.record_links(org_id,project_id,from_record_id,from_version,relation,to_record_id,to_version)
 values(o,p,new_id,1,'tests_idea',idea,idea_version);
 perform kxra_private.add_evidence_links(o,p,new_id,1,'uses_evidence',evidence);
 return new_id;
end $$;

create function kxra.record_experiment_result(
 experiment uuid,expected_version integer,outcome_name text,observations text,metric_value text,evidence jsonb
) returns uuid language plpgsql security definer set search_path='' as $$ declare e kxra.records;result_id uuid;item jsonb;begin
 select * into e from kxra.records where id=experiment;
 if not found or e.kind<>'experiment' or e.visibility<>'project_shared' or e.version is distinct from expected_version or e.status not in ('draft','submitted','accepted') or not kxra_private.can_project(e.project_id,true) then raise exception 'Experiment result unavailable';end if;
 if outcome_name not in ('success','failure','inconclusive','stopped') or length(trim(observations))<1 or length(trim(metric_value))<1 then raise exception 'Invalid experiment result';end if;
 perform kxra_private.require_evidence(e.org_id,e.project_id,evidence);
 insert into kxra.experiment_results(org_id,project_id,experiment_id,experiment_version,outcome,observations,metric_value,recorded_by)
 values(e.org_id,e.project_id,e.id,e.version,outcome_name,observations,metric_value,auth.uid()) returning id into result_id;
 for item in select value from jsonb_array_elements(evidence) loop
  insert into kxra.result_evidence values(result_id,(item->>'record_id')::uuid,(item->>'version')::integer);
 end loop;
 return result_id;
end $$;

create function kxra.assign_workflow_task(
 context_id uuid,context_version integer,assignee uuid,title text,criteria text
) returns uuid language plpgsql security definer set search_path='' as $$ declare r kxra.records;m kxra.members;task_id uuid;begin
 select * into r from kxra.records where id=context_id;
 if not found or not kxra_private.is_owner(r.org_id) or r.project_id is null or r.version is distinct from context_version or length(trim(title))<1 or length(trim(criteria))<1 then raise exception 'Task assignment unavailable';end if;
 select * into m from kxra.members where id=assignee and org_id=r.org_id and active;
 if not found or (m.role<>'owner' and not exists(select 1 from kxra.project_memberships pm where pm.project_id=r.project_id and pm.user_id=m.id and pm.active and pm.role='contributor' and (pm.expires_at is null or pm.expires_at>now()))) then raise exception 'Assignee unavailable';end if;
 insert into kxra.workflow_tasks(org_id,project_id,context_record_id,context_version,title,acceptance_criteria,assignee_id,assigned_by)
 values(r.org_id,r.project_id,r.id,r.version,title,criteria,m.id,auth.uid()) returning id into task_id;
 return task_id;
end $$;

create function kxra.complete_workflow_task(task uuid,expected_version integer,note text) returns void
language plpgsql security definer set search_path='' as $$ declare t kxra.workflow_tasks;begin
 select * into t from kxra.workflow_tasks where id=task for update;
 if not found or t.state<>'assigned' or t.version is distinct from expected_version or length(trim(note))<1 or not (t.assignee_id=auth.uid() or kxra_private.is_owner(t.org_id)) or not kxra_private.can_project(t.project_id,true) then raise exception 'Task completion unavailable';end if;
 update kxra.workflow_tasks set state='completed',completion_note=note,completed_by=auth.uid(),completed_at=now(),updated_at=now(),version=version+1 where id=t.id;
 insert into kxra.audit_events(org_id,actor_id,action,resource_id,metadata) values(t.org_id,auth.uid(),'task.completed',t.id,jsonb_build_object('version',t.version+1));
end $$;

create function kxra.create_linked_decision(
 p uuid,experiment uuid,experiment_version integer,result uuid,title text,decision_body text,evidence jsonb,supersedes uuid default null
) returns uuid language plpgsql security definer set search_path='' as $$ declare o uuid=kxra_private.member_org();e kxra.records;er kxra.experiment_results;old kxra.records;new_id uuid;begin
 if not kxra_private.is_owner(o) or not kxra_private.can_project(p) then raise exception 'Decision unavailable';end if;
 select * into e from kxra.records where id=experiment;
 select * into er from kxra.experiment_results where id=result;
 if e.id is null or e.org_id<>o or e.project_id<>p or e.kind<>'experiment' or e.version is distinct from experiment_version or er.id is null or er.experiment_id<>e.id or er.experiment_version<>e.version then raise exception 'Current experiment result required';end if;
 if length(trim(title)) not between 1 and 240 or length(trim(decision_body))<1 then raise exception 'Invalid decision';end if;
 perform kxra_private.require_evidence(o,p,evidence);
 if supersedes is not null then
  select * into old from kxra.records where id=supersedes;
  if not found or old.org_id<>o or old.project_id<>p or old.kind<>'decision' or old.status<>'accepted' or old.visibility<>'project_shared' then raise exception 'Accepted decision required for supersession';end if;
 end if;
 insert into kxra.records(org_id,project_id,kind,title,body,data,classification,visibility,created_by,supersedes_id)
 values(o,p,'decision',title,decision_body,jsonb_build_object('experiment_id',e.id,'experiment_version',e.version,'result_id',er.id,'outcome',er.outcome),'DECISION','project_shared',auth.uid(),supersedes) returning id into new_id;
 insert into kxra.record_links(org_id,project_id,from_record_id,from_version,relation,to_record_id,to_version)
 values(o,p,new_id,1,'decides_experiment',e.id,e.version);
 perform kxra_private.add_evidence_links(o,p,new_id,1,'uses_evidence',evidence);
 if supersedes is not null then insert into kxra.record_links(org_id,project_id,from_record_id,from_version,relation,to_record_id,to_version) values(o,p,new_id,1,'supersedes',old.id,old.version);end if;
 return new_id;
end $$;

-- Repair snapshots for source rows upgraded by the prior migration without inventing an editor.
insert into kxra.record_versions(record_id,version,title,body,data,classification,status,editor_id,provenance)
select id,version,title,body,data,classification,status,null,provenance from kxra.records r
where source_code is not null and not exists(select 1 from kxra.record_versions v where v.record_id=r.id and v.version=r.version);
insert into kxra.audit_events(org_id,actor_id,action,resource_id,metadata)
select org_id,null,'seed.provenance.repaired',id,jsonb_build_object('version',version) from kxra.records r
where source_code is not null and provenance<>'{}'::jsonb;

revoke all on all functions in schema kxra_private from public;
revoke all on function kxra_private.require_evidence(uuid,uuid,jsonb),kxra_private.add_evidence_links(uuid,uuid,uuid,integer,text,jsonb) from authenticated,anon;
revoke all on function kxra.submit_idea(uuid,integer),kxra.create_experiment(uuid,uuid,integer,text,text,text,text,text,text,jsonb),kxra.record_experiment_result(uuid,integer,text,text,text,jsonb),kxra.assign_workflow_task(uuid,integer,uuid,text,text),kxra.complete_workflow_task(uuid,integer,text),kxra.create_linked_decision(uuid,uuid,integer,uuid,text,text,jsonb,uuid) from public;
grant execute on function kxra.submit_idea(uuid,integer),kxra.create_experiment(uuid,uuid,integer,text,text,text,text,text,text,jsonb),kxra.record_experiment_result(uuid,integer,text,text,text,jsonb),kxra.assign_workflow_task(uuid,integer,uuid,text,text),kxra.complete_workflow_task(uuid,integer,text),kxra.create_linked_decision(uuid,uuid,integer,uuid,text,text,jsonb,uuid) to authenticated;

commit;
