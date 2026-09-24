begin;

create function kxra_private.valid_routine_action_graph(p_graph jsonb,p_capabilities text[])
returns boolean language sql immutable set search_path='' as $$
 select jsonb_typeof(p_graph)='array' and jsonb_array_length(p_graph) between 1 and 50
  and not exists(
   select 1 from jsonb_array_elements(p_graph) step
   where jsonb_typeof(step)<>'object'
    or not step ?& array['code','capability','side_effect']
    or step-array['code','capability','side_effect']<>'{}'::jsonb
    or length(step->>'code') not between 3 and 120
    or not ((step->>'capability')=any(p_capabilities))
    or step->>'side_effect' not in ('NONE','INTERNAL_WRITE')
  )
$$;

create function kxra_private.valid_routine_trigger(p_type text,p_config jsonb)
returns boolean language sql immutable set search_path='' as $$
 select case p_type
  when 'MANUAL' then p_config='{}'::jsonb
  when 'EVENT' then p_config ?& array['event_code']
   and p_config-array['event_code']='{}'::jsonb
   and (p_config->>'event_code')~'^[a-z][a-z0-9._-]{2,119}$'
  else p_config ?& array['hour','minute']
   and jsonb_typeof(p_config->'hour')='number'
   and jsonb_typeof(p_config->'minute')='number'
   and (p_config->>'hour')::integer between 0 and 23
   and (p_config->>'minute')::integer between 0 and 59
   and (not p_config ? 'weekdays' or (
    jsonb_typeof(p_config->'weekdays')='array'
    and jsonb_array_length(p_config->'weekdays') between 1 and 7
    and not exists(select 1 from jsonb_array_elements_text(p_config->'weekdays') day
     where day not in ('MON','TUE','WED','THU','FRI','SAT','SUN'))
   ))
   and (not p_config ? 'day_rule' or p_config->>'day_rule' in ('ANY_OPEN_DAY','FIRST_OPEN_DAY'))
 end
$$;

create function kxra_private.guard_routine_append_only() returns trigger
language plpgsql set search_path='' as $$
begin
 raise exception 'Routine evidence is append-only';
end $$;

create trigger routine_checkpoints_append_only before update or delete on kxra.routine_run_checkpoints
 for each row execute function kxra_private.guard_routine_append_only();
create trigger routine_notifications_append_only before update or delete on kxra.routine_notification_intents
 for each row execute function kxra_private.guard_routine_append_only();

create function kxra.approve_routine_version(
 p_version uuid,p_expected_sha256 text,p_note text,p_request uuid
) returns kxra.routine_manifest_versions
language plpgsql security definer set search_path='' as $$
declare o uuid=kxra_private.member_org();v kxra.routine_manifest_versions;
 service kxra.routine_service_identities;existing uuid;
begin
 select * into v from kxra.routine_manifest_versions value where value.id=p_version for update;
 if o is null or v.id is null or v.org_id<>o or not kxra_private.is_owner(o)
  or v.status<>'DRAFT' or v.version_sha256<>p_expected_sha256
  or p_request is null or length(trim(coalesce(p_note,''))) not between 3 and 3000
  or not kxra_private.valid_routine_trigger(v.trigger_type,v.trigger_config)
 then raise exception 'Routine version approval unavailable';end if;
 select * into service from kxra.routine_service_identities value where value.id=v.service_identity_id;
 if service.state<>'ACTIVE' or not kxra_private.valid_routine_action_graph(v.action_graph,service.allowed_capabilities)
  or v.approval_requirements->>'owner_approval'<>'true'
  or v.notification_policy->>'adapter'<>'DISABLED'
 then raise exception 'Routine version contract is not approvable';end if;
 select id into existing from kxra.audit_events where org_id=o
  and action='routine.version.approved' and metadata->>'request_id'=p_request::text;
 if existing is not null then return v;end if;
 update kxra.routine_manifest_versions set status='APPROVED',approved_by=auth.uid(),approved_at=now()
  where id=v.id returning * into v;
 insert into kxra.audit_events(org_id,actor_id,action,resource_id,metadata)
 values(o,auth.uid(),'routine.version.approved',v.routine_id,
  jsonb_build_object('status','APPROVED','version_id',v.id,'version',v.version,
   'version_sha256',v.version_sha256,'request_id',p_request,'note',trim(p_note)));
 return v;
end $$;

create function kxra.set_routine_enabled(
 p_version uuid,p_expected_sha256 text,p_enabled boolean,p_request uuid
) returns kxra.routine_manifests
language plpgsql security definer set search_path='' as $$
declare o uuid=kxra_private.member_org();v kxra.routine_manifest_versions;
 manifest kxra.routine_manifests;service kxra.routine_service_identities;
begin
 select * into v from kxra.routine_manifest_versions value where value.id=p_version;
 select * into manifest from kxra.routine_manifests value where value.id=v.routine_id for update;
 select * into service from kxra.routine_service_identities value where value.id=v.service_identity_id;
 if o is null or manifest.id is null or manifest.org_id<>o or not kxra_private.is_owner(o)
  or manifest.current_version<>v.version or v.status<>'APPROVED'
  or v.version_sha256<>p_expected_sha256 or service.state<>'ACTIVE' or p_request is null
 then raise exception 'Routine state change unavailable';end if;
 update kxra.routine_manifests set enabled=p_enabled,updated_at=now() where id=manifest.id returning * into manifest;
 insert into kxra.audit_events(org_id,actor_id,action,resource_id,metadata)
 values(o,auth.uid(),case when p_enabled then 'routine.enabled' else 'routine.disabled' end,manifest.id,
  jsonb_build_object('status',case when p_enabled then 'ENABLED' else 'DISABLED' end,
   'version_id',v.id,'version_sha256',v.version_sha256,'request_id',p_request));
 return manifest;
end $$;

create function kxra.set_routine_service_state(
 p_service uuid,p_expected_version integer,p_state text,p_reason text,p_request uuid
) returns kxra.routine_service_identities
language plpgsql security definer set search_path='' as $$
declare o uuid=kxra_private.member_org();service kxra.routine_service_identities;
begin
 select * into service from kxra.routine_service_identities value where value.id=p_service for update;
 if o is null or service.id is null or service.org_id<>o or not kxra_private.is_owner(o)
  or service.version<>p_expected_version or p_state not in ('ACTIVE','SUSPENDED','REVOKED')
  or length(trim(coalesce(p_reason,''))) not between 3 and 1000 or p_request is null
 then raise exception 'Routine service state change unavailable';end if;
 update kxra.routine_service_identities set state=p_state,version=version+1,updated_at=now()
  where id=service.id returning * into service;
 insert into kxra.audit_events(org_id,actor_id,action,resource_id,metadata)
 values(o,auth.uid(),'routine.service.'||lower(p_state),service.id,
  jsonb_build_object('status',p_state,'reason',trim(p_reason),'request_id',p_request,'version',service.version));
 return service;
end $$;

create function kxra.record_routine_calendar_day(
 p_calendar text,p_date date,p_open boolean,p_label text,p_source text,
 p_source_sha256 text,p_request uuid
) returns kxra.routine_calendar_days
language plpgsql security definer set search_path='' as $$
declare o uuid=kxra_private.member_org();existing kxra.routine_calendar_days;
 created kxra.routine_calendar_days;
begin
 select * into existing from kxra.routine_calendar_days value
  where value.org_id=o and value.calendar_code=p_calendar and value.local_date=p_date;
 if found then
  if (existing.is_open,existing.session_label,existing.source_reference,existing.source_sha256)
   is distinct from (p_open,trim(p_label),trim(p_source),p_source_sha256)
  then raise exception 'Calendar date evidence conflict';end if;
  return existing;
 end if;
 if o is null or not kxra_private.is_owner(o) or p_calendar!~'^[A-Z0-9_-]{2,40}$'
  or p_date is null or length(trim(coalesce(p_label,''))) not between 1 and 80
  or length(trim(coalesce(p_source,''))) not between 3 and 500
  or p_source_sha256!~'^[a-f0-9]{64}$' or p_request is null
 then raise exception 'Calendar date evidence unavailable';end if;
 insert into kxra.routine_calendar_days(
  org_id,calendar_code,local_date,is_open,session_label,source_reference,source_sha256,recorded_by
 ) values(o,p_calendar,p_date,p_open,trim(p_label),trim(p_source),p_source_sha256,auth.uid())
 returning * into created;
 insert into kxra.audit_events(org_id,actor_id,action,resource_id,metadata)
 values(o,auth.uid(),'routine.calendar.recorded',created.id,
  jsonb_build_object('status','RECORDED','calendar_code',p_calendar,'local_date',p_date,'request_id',p_request));
 return created;
end $$;

create function kxra.plan_routine_slot(
 p_version uuid,p_local_date date,p_project uuid,p_request uuid
) returns table(run_id uuid,created boolean,disposition text,scheduled_for timestamptz)
language plpgsql security definer set search_path='' as $$
declare o uuid=kxra_private.member_org();v kxra.routine_manifest_versions;
 manifest kxra.routine_manifests;service kxra.routine_service_identities;
 project_code text;hour_value integer;minute_value integer;instant timestamptz;
 slot text;input_hash text;existing kxra.routine_runs;new_run kxra.routine_runs;
 day_code text;day_row kxra.routine_calendar_days;
begin
 select * into v from kxra.routine_manifest_versions value where value.id=p_version;
 select * into manifest from kxra.routine_manifests value where value.id=v.routine_id;
 select * into service from kxra.routine_service_identities value where value.id=v.service_identity_id;
 if o is null or manifest.id is null or manifest.org_id<>o or not kxra_private.is_owner(o)
  or not manifest.enabled or manifest.current_version<>v.version or v.status<>'APPROVED'
  or service.state<>'ACTIVE' or p_local_date is null or p_request is null
  or v.trigger_type not in ('LOCAL_SCHEDULE','BUSINESS_CALENDAR','EXCHANGE_CALENDAR')
  or not kxra_private.valid_routine_trigger(v.trigger_type,v.trigger_config)
 then raise exception 'Routine slot unavailable';end if;
 if v.scope_mode='PROJECT' then
  select code into project_code from kxra.projects p where p.id=p_project and p.org_id=o
   and exists(select 1 from kxra.routine_version_projects s where s.routine_version_id=v.id and s.project_id=p.id);
  if project_code is null then raise exception 'Routine project scope unavailable';end if;
 elsif p_project is not null then raise exception 'Routine organization scope cannot accept project';
 end if;
 day_code=upper(trim(to_char(p_local_date,'DY')));
 if v.trigger_config ? 'weekdays' and not (v.trigger_config->'weekdays' ? day_code) then
  return query select null::uuid,false,'SKIPPED_WEEKDAY'::text,null::timestamptz;return;
 end if;
 if v.trigger_type in ('BUSINESS_CALENDAR','EXCHANGE_CALENDAR') then
  select * into day_row from kxra.routine_calendar_days value
   where value.org_id=o and value.calendar_code=v.calendar_code and value.local_date=p_local_date;
  if day_row.id is null or not day_row.is_open then
   return query select null::uuid,false,'SKIPPED_CALENDAR'::text,null::timestamptz;return;
  end if;
  if v.trigger_config->>'day_rule'='FIRST_OPEN_DAY' and exists(
   select 1 from kxra.routine_calendar_days prior where prior.org_id=o
    and prior.calendar_code=v.calendar_code and prior.is_open
    and date_trunc('month',prior.local_date)=date_trunc('month',p_local_date)
    and prior.local_date<p_local_date
  ) then return query select null::uuid,false,'SKIPPED_NOT_FIRST_OPEN_DAY'::text,null::timestamptz;return;end if;
 end if;
 hour_value=(v.trigger_config->>'hour')::integer;minute_value=(v.trigger_config->>'minute')::integer;
 instant=make_timestamptz(extract(year from p_local_date)::integer,extract(month from p_local_date)::integer,
  extract(day from p_local_date)::integer,hour_value,minute_value,0,v.timezone);
 if (instant at time zone v.timezone)::date<>p_local_date
  or extract(hour from instant at time zone v.timezone)::integer<>hour_value
  or extract(minute from instant at time zone v.timezone)::integer<>minute_value
 then return query select null::uuid,false,'SKIPPED_NONEXISTENT_LOCAL_TIME'::text,null::timestamptz;return;end if;
 slot=format('%s:v%s:%s:%s:%s',manifest.code,v.version,to_char(p_local_date,'YYYY-MM-DD'),
  to_char(instant at time zone v.timezone,'HH24:MI'),coalesce(p_project::text,'ORG'));
 select * into existing from kxra.routine_runs value
  where value.org_id=o and value.routine_version_id=v.id and value.logical_slot_key=slot;
 if found then return query select existing.id,false,'EXISTING'::text,existing.scheduled_for;return;end if;
 input_hash=encode(sha256(convert_to(jsonb_build_object('slot',slot,'version',v.version_sha256,
  'project',p_project,'calendar_source',day_row.source_sha256)::text,'UTF8')),'hex');
 insert into kxra.routine_runs(
  org_id,project_id,routine_id,routine_version_id,routine_version,service_identity_id,
  trigger_type,trigger_reference,logical_slot_key,scheduled_for,input_sha256,action_graph,
  version_sha256,client_request_id,initiated_by
 ) values(o,p_project,manifest.id,v.id,v.version,v.service_identity_id,v.trigger_type,
  p_local_date::text,slot,instant,input_hash,v.action_graph,v.version_sha256,p_request,auth.uid())
 returning * into new_run;
 insert into kxra.audit_events(org_id,actor_id,action,resource_id,metadata)
 values(o,auth.uid(),'routine.run.queued',new_run.id,
  jsonb_build_object('status','QUEUED','project_id',p_project,'routine_id',manifest.id,'slot',slot));
 return query select new_run.id,true,'QUEUED'::text,new_run.scheduled_for;
end $$;

create function kxra.enqueue_routine_event(
 p_version uuid,p_event_code text,p_event_id text,p_project uuid,p_payload_sha256 text,p_request uuid
) returns kxra.routine_runs
language plpgsql security definer set search_path='' as $$
declare o uuid=kxra_private.member_org();v kxra.routine_manifest_versions;
 manifest kxra.routine_manifests;service kxra.routine_service_identities;
 existing kxra.routine_runs;created kxra.routine_runs;slot text;
begin
 select * into v from kxra.routine_manifest_versions value where value.id=p_version;
 select * into manifest from kxra.routine_manifests value where value.id=v.routine_id;
 select * into service from kxra.routine_service_identities value where value.id=v.service_identity_id;
 slot=format('%s:v%s:event:%s',manifest.code,v.version,p_event_id);
 select * into existing from kxra.routine_runs value where value.org_id=o and value.routine_version_id=v.id and value.logical_slot_key=slot;
 if found then return existing;end if;
 if o is null or manifest.id is null or manifest.org_id<>o or not kxra_private.is_owner(o)
  or not manifest.enabled or manifest.current_version<>v.version or v.status<>'APPROVED'
  or service.state<>'ACTIVE' or v.trigger_type<>'EVENT'
  or v.trigger_config->>'event_code'<>p_event_code
  or p_event_id!~'^[A-Za-z0-9._:-]{3,240}$' or p_payload_sha256!~'^[a-f0-9]{64}$' or p_request is null
 then raise exception 'Routine event unavailable';end if;
 if v.scope_mode='PROJECT' and not exists(select 1 from kxra.routine_version_projects s where s.routine_version_id=v.id and s.project_id=p_project)
  then raise exception 'Routine event project unavailable';end if;
 if v.scope_mode='ORGANISATION' and p_project is not null then raise exception 'Routine event organization scope unavailable';end if;
 insert into kxra.routine_runs(
  org_id,project_id,routine_id,routine_version_id,routine_version,service_identity_id,
  trigger_type,trigger_reference,logical_slot_key,scheduled_for,input_sha256,action_graph,
  version_sha256,client_request_id,initiated_by
 ) values(o,p_project,manifest.id,v.id,v.version,v.service_identity_id,'EVENT',p_event_id,slot,
  now(),p_payload_sha256,v.action_graph,v.version_sha256,p_request,auth.uid()) returning * into created;
 insert into kxra.audit_events(org_id,actor_id,action,resource_id,metadata)
 values(o,auth.uid(),'routine.run.queued',created.id,
  jsonb_build_object('status','QUEUED','project_id',p_project,'routine_id',manifest.id,'event_code',p_event_code));
 return created;
end $$;

create function kxra_private.claim_routine_run(p_worker text,p_now timestamptz default now())
returns kxra.routine_runs language plpgsql security definer set search_path='' as $$
declare run kxra.routine_runs;v kxra.routine_manifest_versions;
begin
 if current_setting('role',true)<>'kxra_routine_worker' or length(coalesce(p_worker,'')) not between 3 and 160
  then raise exception 'Routine worker unavailable';end if;
 select * into run from kxra.routine_runs value where value.state='QUEUED' and value.scheduled_for<=p_now
  order by value.scheduled_for,value.created_at,value.id for update skip locked limit 1;
 if run.id is null then return null;end if;
 select * into v from kxra.routine_manifest_versions value where value.id=run.routine_version_id;
 if not exists(select 1 from kxra.routine_manifests m where m.id=run.routine_id and m.enabled and m.current_version=run.routine_version)
  or v.status<>'APPROVED'
  or not exists(select 1 from kxra.routine_service_identities s where s.id=run.service_identity_id and s.state='ACTIVE')
 then update kxra.routine_runs set state='CANCELLED',outcome_disposition='CANCELLED',summary='Authority revoked before claim',completed_at=p_now where id=run.id returning * into run;return run;end if;
 update kxra.routine_runs set state='RUNNING',attempt_count=attempt_count+1,lease_owner=p_worker,
  lease_expires_at=p_now+make_interval(secs=>v.lease_seconds),started_at=coalesce(started_at,p_now),next_attempt_at=null
  where id=run.id returning * into run;
 return run;
end $$;

create function kxra_private.record_routine_checkpoint(
 p_run uuid,p_worker text,p_attempt integer,p_sequence integer,p_key text,p_payload_sha256 text
) returns kxra.routine_run_checkpoints
language plpgsql security definer set search_path='' as $$
declare run kxra.routine_runs;existing kxra.routine_run_checkpoints;created kxra.routine_run_checkpoints;
begin
 if current_setting('role',true)<>'kxra_routine_worker' then raise exception 'Routine worker unavailable';end if;
 select * into run from kxra.routine_runs value where value.id=p_run for update;
 select * into existing from kxra.routine_run_checkpoints value where value.run_id=p_run and value.checkpoint_key=p_key;
 if found then
  if (existing.attempt,existing.sequence,existing.payload_sha256,existing.worker_id)
   is distinct from (p_attempt,p_sequence,p_payload_sha256,p_worker)
  then raise exception 'Routine checkpoint conflict';end if;return existing;
 end if;
 if run.state<>'RUNNING' or run.lease_owner<>p_worker or run.lease_expires_at<=now()
  or run.attempt_count<>p_attempt or p_sequence<1 or p_key!~'^[a-z][a-z0-9._-]{2,119}$'
  or p_payload_sha256!~'^[a-f0-9]{64}$'
 then raise exception 'Routine checkpoint unavailable';end if;
 insert into kxra.routine_run_checkpoints(org_id,project_id,run_id,attempt,sequence,checkpoint_key,payload_sha256,worker_id)
 values(run.org_id,run.project_id,run.id,p_attempt,p_sequence,p_key,p_payload_sha256,p_worker) returning * into created;
 return created;
end $$;

create function kxra_private.complete_routine_run(
 p_run uuid,p_worker text,p_attempt integer,p_outcome_sha256 text,p_needs_review boolean,p_summary text,p_now timestamptz default now()
) returns kxra.routine_runs
language plpgsql security definer set search_path='' as $$
declare run kxra.routine_runs;prior_hash text;disposition text;updated kxra.routine_runs;
begin
 if current_setting('role',true)<>'kxra_routine_worker' then raise exception 'Routine worker unavailable';end if;
 select * into run from kxra.routine_runs value where value.id=p_run for update;
 if run.state<>'RUNNING' or run.lease_owner<>p_worker or run.lease_expires_at<=p_now
  or run.attempt_count<>p_attempt or p_outcome_sha256!~'^[a-f0-9]{64}$'
  or length(trim(coalesce(p_summary,''))) not between 3 and 5000
 then raise exception 'Routine completion unavailable';end if;
 select value.outcome_sha256 into prior_hash from kxra.routine_runs value
  where value.org_id=run.org_id and value.routine_id=run.routine_id
   and value.project_id is not distinct from run.project_id and value.state='SUCCEEDED'
   and value.id<>run.id order by value.completed_at desc,value.id desc limit 1;
 disposition=case when prior_hash=p_outcome_sha256 then 'UNCHANGED' else 'CHANGED' end;
 update kxra.routine_runs set state='SUCCEEDED',lease_owner=null,lease_expires_at=null,next_attempt_at=null,
  outcome_sha256=p_outcome_sha256,outcome_disposition=disposition,summary=trim(p_summary),completed_at=p_now
  where id=run.id returning * into updated;
 if disposition='CHANGED' and p_needs_review then
  insert into kxra.routine_notification_intents(
   org_id,project_id,run_id,category,subject,body_reference,idempotency_key
  ) values(run.org_id,run.project_id,run.id,'COMPLETION_REVIEW','Routine completion needs review',
   'routine-run:'||run.id::text,run.id::text||':COMPLETION_REVIEW') on conflict(org_id,idempotency_key) do nothing;
 end if;
 insert into kxra.audit_events(org_id,actor_id,action,resource_id,metadata)
 values(run.org_id,null,'routine.run.completed',run.id,
  jsonb_build_object('status','SUCCEEDED','project_id',run.project_id,'disposition',disposition,'attempt',p_attempt));
 return updated;
end $$;

create function kxra_private.fail_routine_run(
 p_run uuid,p_worker text,p_attempt integer,p_code text,p_retryable boolean,p_summary text,p_now timestamptz default now()
) returns kxra.routine_runs
language plpgsql security definer set search_path='' as $$
declare run kxra.routine_runs;v kxra.routine_manifest_versions;updated kxra.routine_runs;delay integer;
begin
 if current_setting('role',true)<>'kxra_routine_worker' then raise exception 'Routine worker unavailable';end if;
 select * into run from kxra.routine_runs value where value.id=p_run for update;
 select * into v from kxra.routine_manifest_versions value where value.id=run.routine_version_id;
 if run.state<>'RUNNING' or run.lease_owner<>p_worker or run.attempt_count<>p_attempt
  or p_code!~'^[A-Z][A-Z0-9_]{2,79}$' or length(trim(coalesce(p_summary,''))) not between 3 and 5000
 then raise exception 'Routine failure unavailable';end if;
 if p_retryable and run.attempt_count<v.maximum_attempts then
  delay=v.retry_backoff_seconds[run.attempt_count];
  update kxra.routine_runs set state='RETRY_WAIT',lease_owner=null,lease_expires_at=null,
   next_attempt_at=p_now+make_interval(secs=>delay),outcome_disposition='FAILED',summary=trim(p_summary)
   where id=run.id returning * into updated;
 else
  update kxra.routine_runs set state='FAILED',lease_owner=null,lease_expires_at=null,next_attempt_at=null,
   outcome_disposition='FAILED',summary=trim(p_summary),completed_at=p_now
   where id=run.id returning * into updated;
  insert into kxra.routine_notification_intents(org_id,project_id,run_id,category,subject,body_reference,idempotency_key)
  values(run.org_id,run.project_id,run.id,'FAILURE','Routine failed and needs review',
   'routine-run:'||run.id::text,run.id::text||':FAILURE') on conflict(org_id,idempotency_key) do nothing;
 end if;
 insert into kxra.audit_events(org_id,actor_id,action,resource_id,metadata)
 values(run.org_id,null,'routine.run.failed',run.id,
  jsonb_build_object('status',updated.state,'project_id',run.project_id,'failure_code',p_code,'attempt',p_attempt));
 return updated;
end $$;

create function kxra_private.recover_routine_runs(p_now timestamptz default now())
returns table(run_id uuid,state text) language plpgsql security definer set search_path='' as $$
declare run kxra.routine_runs;v kxra.routine_manifest_versions;next_state text;delay integer;
begin
 if current_setting('role',true)<>'kxra_routine_worker' then raise exception 'Routine worker unavailable';end if;
 for run in select * from kxra.routine_runs value
  where value.state='RUNNING' and value.lease_expires_at<=p_now for update skip locked
 loop
  select * into v from kxra.routine_manifest_versions value where value.id=run.routine_version_id;
  if run.attempt_count<v.maximum_attempts then
   delay=v.retry_backoff_seconds[run.attempt_count];next_state='RETRY_WAIT';
   update kxra.routine_runs set state=next_state,lease_owner=null,lease_expires_at=null,
    next_attempt_at=p_now+make_interval(secs=>delay),outcome_disposition='FAILED',summary='Worker lease expired; checkpoint retained'
    where id=run.id;
  else
   next_state='FAILED';
   update kxra.routine_runs set state=next_state,lease_owner=null,lease_expires_at=null,next_attempt_at=null,
    outcome_disposition='FAILED',summary='Worker lease expired after maximum attempts',completed_at=p_now where id=run.id;
   insert into kxra.routine_notification_intents(org_id,project_id,run_id,category,subject,body_reference,idempotency_key)
   values(run.org_id,run.project_id,run.id,'FAILURE','Routine lease recovery failed',
    'routine-run:'||run.id::text,run.id::text||':FAILURE') on conflict(org_id,idempotency_key) do nothing;
  end if;
  run_id=run.id;state=next_state;return next;
 end loop;
end $$;

create function kxra_private.requeue_routine_runs(p_now timestamptz default now())
returns table(run_id uuid,state text) language plpgsql security definer set search_path='' as $$
declare run kxra.routine_runs;authorized boolean;
begin
 if current_setting('role',true)<>'kxra_routine_worker' then raise exception 'Routine worker unavailable';end if;
 for run in select * from kxra.routine_runs value
  where value.state='RETRY_WAIT' and value.next_attempt_at<=p_now for update skip locked
 loop
  select exists(
   select 1 from kxra.routine_manifests m
   join kxra.routine_manifest_versions v on v.routine_id=m.id and v.version=m.current_version
   join kxra.routine_service_identities s on s.id=v.service_identity_id
   where m.id=run.routine_id and m.enabled and v.id=run.routine_version_id
    and v.status='APPROVED' and s.state='ACTIVE'
  ) into authorized;
  if authorized then
   update kxra.routine_runs set state='QUEUED',next_attempt_at=null,outcome_disposition=null where id=run.id;
   state='QUEUED';
  else
   update kxra.routine_runs set state='CANCELLED',next_attempt_at=null,outcome_disposition='CANCELLED',
    summary='Authority revoked before retry',completed_at=p_now where id=run.id;
   state='CANCELLED';
  end if;
  run_id=run.id;return next;
 end loop;
end $$;

revoke all on function kxra_private.valid_routine_action_graph(jsonb,text[]),
 kxra_private.valid_routine_trigger(text,jsonb),kxra_private.guard_routine_append_only(),
 kxra_private.claim_routine_run(text,timestamptz),
 kxra_private.record_routine_checkpoint(uuid,text,integer,integer,text,text),
 kxra_private.complete_routine_run(uuid,text,integer,text,boolean,text,timestamptz),
 kxra_private.fail_routine_run(uuid,text,integer,text,boolean,text,timestamptz),
 kxra_private.recover_routine_runs(timestamptz),kxra_private.requeue_routine_runs(timestamptz)
from public,authenticated,anon;

grant execute on function kxra_private.claim_routine_run(text,timestamptz),
 kxra_private.record_routine_checkpoint(uuid,text,integer,integer,text,text),
 kxra_private.complete_routine_run(uuid,text,integer,text,boolean,text,timestamptz),
 kxra_private.fail_routine_run(uuid,text,integer,text,boolean,text,timestamptz),
 kxra_private.recover_routine_runs(timestamptz),kxra_private.requeue_routine_runs(timestamptz)
to kxra_routine_worker;

revoke all on function kxra.approve_routine_version(uuid,text,text,uuid),
 kxra.set_routine_enabled(uuid,text,boolean,uuid),
 kxra.set_routine_service_state(uuid,integer,text,text,uuid),
 kxra.record_routine_calendar_day(text,date,boolean,text,text,text,uuid),
 kxra.plan_routine_slot(uuid,date,uuid,uuid),
 kxra.enqueue_routine_event(uuid,text,text,uuid,text,uuid)
from public,anon;

grant execute on function kxra.approve_routine_version(uuid,text,text,uuid),
 kxra.set_routine_enabled(uuid,text,boolean,uuid),
 kxra.set_routine_service_state(uuid,integer,text,text,uuid),
 kxra.record_routine_calendar_day(text,date,boolean,text,text,text,uuid),
 kxra.plan_routine_slot(uuid,date,uuid,uuid),
 kxra.enqueue_routine_event(uuid,text,text,uuid,text,uuid)
to authenticated;

commit;
