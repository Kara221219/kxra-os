-- LOCAL REVIEW PROPOSAL. Apply only through the approved migration pipeline.
-- No roles, credentials, triggers, scheduler registration or provider activation.
create table kxra.team_execution_grants(
 id uuid primary key default gen_random_uuid(), target_id uuid not null references kxra.team_jobs(id),
 org_id uuid not null, room_id uuid not null, requested_by uuid not null,
 connection_id uuid not null references kxra.team_connections(id),
 connection_sha256 text not null,
 session_version integer not null, membership_version integer not null,
 auth_time bigint not null, expires_at timestamptz not null,
 revoked_at timestamptz, last_delivered_at timestamptz,
 created_at timestamptz not null default now(), unique(target_id),
 foreign key(room_id,org_id) references kxra.team_rooms(id,org_id)
);
create index team_execution_grants_fair on kxra.team_execution_grants(last_delivered_at nulls first,id) where revoked_at is null;
alter table kxra.team_execution_grants enable row level security;
create policy team_execution_grants_read on kxra.team_execution_grants for select to authenticated
 using(requested_by=auth.uid() and org_id=kxra_private.member_org() and kxra_private.can_team_room(room_id));
revoke all on kxra.team_execution_grants from public,anon,authenticated;
grant select(id,target_id,expires_at,revoked_at) on kxra.team_execution_grants to authenticated;
create table kxra.team_worker_deliveries(
 id uuid primary key, grant_id uuid references kxra.team_execution_grants(id), created_at timestamptz not null default now()
);
alter table kxra.team_worker_deliveries enable row level security;
create policy team_worker_deliveries_deny on kxra.team_worker_deliveries for all to authenticated using(false) with check(false);
revoke all on kxra.team_worker_deliveries from public,anon,authenticated;

create function kxra_private.team_execution_grant_active(g uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select session_user='kxra_app' and exists(
 select 1 from kxra.team_execution_grants grant_record
 join kxra.account_identities identity on identity.account_id=grant_record.requested_by
 join kxra.team_connections connection on connection.id=grant_record.connection_id
 join kxra.organisation_memberships membership on membership.account_id=grant_record.requested_by and membership.org_id=grant_record.org_id
 where grant_record.id=g and grant_record.revoked_at is null and grant_record.expires_at>now()
 and grant_record.requested_by=auth.uid() and grant_record.org_id=kxra_private.member_org()
 and identity.state='ACTIVE' and identity.session_version=grant_record.session_version
 and grant_record.connection_sha256=encode(sha256(convert_to(jsonb_build_array(connection.provider,connection.model,connection.endpoint_id,connection.encrypted_key)::text,'UTF8')),'hex')
 and membership.version=grant_record.membership_version and membership.state='ACTIVE' and membership.revoked_at is null
 and membership.starts_at<=now() and (membership.expires_at is null or membership.expires_at>now())
 and kxra_private.can_team_room(grant_record.room_id,true) and kxra_private.pilot_entitled(grant_record.org_id)
 and kxra_private.team_connection_active(grant_record.connection_id,grant_record.room_id))
$$;
revoke all on function kxra_private.team_execution_grant_active(uuid) from public,anon;
grant execute on function kxra_private.team_execution_grant_active(uuid) to authenticated;

-- Hold this row through each worker transaction so revocation and publication serialize.
create function kxra_private.team_execution_grant_validate(g uuid) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 if session_user<>'kxra_app' then return false;end if;
 perform 1 from kxra.team_execution_grants where id=g and requested_by=auth.uid() and org_id=kxra_private.member_org() for share;
 if not found then return false;end if;
 return kxra_private.team_execution_grant_active(g);
end $$;
revoke all on function kxra_private.team_execution_grant_validate(uuid) from public,anon;
grant execute on function kxra_private.team_execution_grant_validate(uuid) to authenticated;

create function kxra_private.team_worker_target(i uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select case when nullif(current_setting('request.kxra.team_grant',true),'') is null then
 coalesce(current_setting('request.kxra.execution_mode',true)='fixture'
 and current_setting('request.kxra.hosted_room_jobs',true) is distinct from 'on',false)
 else session_user='kxra_app' and exists(
 select 1 from kxra.team_execution_grants g join kxra.team_jobs j on j.id=i
 join kxra.team_agents agent on agent.id=j.agent_id
 where g.id=nullif(current_setting('request.kxra.team_grant',true),'')::uuid
 and kxra_private.team_execution_grant_active(g.id)
 and j.requested_by=g.requested_by and j.org_id=g.org_id and j.room_id=g.room_id and agent.connection_id=g.connection_id
 and (j.id=g.target_id or exists(select 1 from kxra.team_schedule_occurrences occurrence
 where occurrence.job_id=j.id and occurrence.schedule_id=g.target_id)
 or (j.id::text=current_setting('request.kxra.team_child',true) and exists(
 select 1 from kxra.team_jobs template where template.id=g.target_id
 and (j.agent_id,j.message_id,j.context_mode,j.context_ids,j.context_sha256,j.chunk_ids,j.chunk_hashes,j.skill_ids,j.skill_hashes,j.memory_ids,j.memory_hashes)
 is not distinct from (template.agent_id,template.message_id,template.context_mode,template.context_ids,template.context_sha256,template.chunk_ids,template.chunk_hashes,template.skill_ids,template.skill_hashes,template.memory_ids,template.memory_hashes))))) end
$$;
revoke all on function kxra_private.team_worker_target(uuid) from public,anon;
grant execute on function kxra_private.team_worker_target(uuid) to authenticated;

create function kxra.team_execution_authorize(i uuid,e timestamptz) returns uuid
language plpgsql security definer set search_path='' as $$
declare j kxra.team_jobs; g uuid; c uuid; mv integer; at bigint;
begin
 if session_user<>'kxra_app' or current_setting('request.kxra.hosted_room_jobs',true) is distinct from 'on'
 or coalesce(current_setting('request.jwt.claims',true),'{}')::jsonb->>'aal' is distinct from 'aal2'
 then raise insufficient_privilege;end if;
 at=(current_setting('request.jwt.claims',true)::jsonb->>'auth_time')::bigint;
 if at is null or at<extract(epoch from now())-600 or at>extract(epoch from now())+30 then raise insufficient_privilege;end if;
 select * into j from kxra.team_jobs where id=i and requested_by=auth.uid() and org_id=kxra_private.member_org() for update;
 if not found or not kxra_private.team_job_base_context_active(i) or e is null or e<=now() or e>now()+interval '30 days'
 then raise insufficient_privilege;end if;
 select connection_id into c from kxra.team_agents where id=j.agent_id;
 select version into mv from kxra.organisation_memberships where org_id=j.org_id and account_id=auth.uid() and state='ACTIVE';
 insert into kxra.team_execution_grants(target_id,org_id,room_id,requested_by,connection_id,connection_sha256,session_version,membership_version,auth_time,expires_at)
 select i,j.org_id,j.room_id,auth.uid(),c,encode(sha256(convert_to(jsonb_build_array(connection.provider,connection.model,connection.endpoint_id,connection.encrypted_key)::text,'UTF8')),'hex'),j.request_session_version,mv,at,e from kxra.team_connections connection where connection.id=c
 on conflict(target_id) do update set revoked_at=null,expires_at=excluded.expires_at,auth_time=excluded.auth_time,
 connection_id=excluded.connection_id,connection_sha256=excluded.connection_sha256,session_version=excluded.session_version,membership_version=excluded.membership_version
 returning id into g;
 insert into kxra.audit_events(org_id,actor_id,action,resource_id,metadata)
 values(j.org_id,auth.uid(),'team.execution_authorized',i,jsonb_build_object('grant',g,'expires_at',e));
 return g;
end $$;
create function kxra.team_execution_revoke(i uuid) returns void
language plpgsql security definer set search_path='' as $$
declare g kxra.team_execution_grants;
begin
 select * into g from kxra.team_execution_grants where target_id=i and requested_by=auth.uid() and org_id=kxra_private.member_org() for update;
 if not found then return;end if;
 update kxra.team_execution_grants set revoked_at=coalesce(revoked_at,now()) where id=g.id;
 insert into kxra.audit_events(org_id,actor_id,action,resource_id,metadata)
 values(g.org_id,auth.uid(),'team.execution_revoked',i,jsonb_build_object('grant',g.id));
end $$;
revoke all on function kxra.team_execution_authorize(uuid,timestamptz),kxra.team_execution_revoke(uuid) from public,anon;
grant execute on function kxra.team_execution_authorize(uuid,timestamptz),kxra.team_execution_revoke(uuid) to authenticated;

create schema kxra_room_worker;
revoke all on schema kxra_room_worker from public,anon,authenticated;
grant usage on schema kxra_room_worker to kxra_app;
-- Opaque delivery IDs are replay fenced; the wakeup never supplies an actor or tenant.
-- One least-recently-served grant per delivery, including scopes needing reconciliation.
create function kxra_room_worker.next(request uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare g kxra.team_execution_grants; result jsonb;
begin
 if session_user<>'kxra_app' or current_setting('role')<>'none' or request is null then raise insufficient_privilege;end if;
 insert into kxra.team_worker_deliveries(id) values(request) on conflict do nothing;
 if not found then return null;end if;
 select grant_record.* into g from kxra.team_execution_grants grant_record
 where grant_record.revoked_at is null and grant_record.expires_at>now()
 and (grant_record.last_delivered_at is null or grant_record.last_delivered_at<now()-interval '60 seconds')
 and (exists(select 1 from kxra.team_jobs j where (j.id=grant_record.target_id or exists(
 select 1 from kxra.team_schedule_occurrences o where o.schedule_id=grant_record.target_id and o.job_id=j.id))
 and j.state in ('QUEUED','LEASED','DISPATCHED') and j.available_at<=now())
 or exists(select 1 from kxra.team_schedules s where s.id=grant_record.target_id and s.state='ACTIVE'))
 order by grant_record.last_delivered_at nulls first,grant_record.id limit 1 for update skip locked;
 if not found then return null;end if;
 update kxra.team_execution_grants set last_delivered_at=now() where id=g.id;
 update kxra.team_worker_deliveries set grant_id=g.id where id=request;
 select jsonb_build_object('grant_id',g.id,'room_id',g.room_id,'actor',jsonb_build_object(
 'id',g.requested_by,'organisation_id',g.org_id,'org_id',g.org_id,'room_worker_grant',g.id,
 'aal','aal2','auth_time',g.auth_time,'session_version',g.session_version,
 'membership_id',m.id,'organisation_name',o.name,'organisation_slug',o.slug,'organisation_kind',o.organisation_kind,
 'security_role',m.security_role,'relationship_type',m.relationship_type,'role',case when m.security_role='KXRA_OWNER' then 'owner' else 'partner' end,
 'display_name',m.display_name,'access_version',m.version,'account_state','ACTIVE')) into result
 from kxra.organisation_memberships m join kxra.organisations o on o.id=m.org_id
 where m.account_id=g.requested_by and m.org_id=g.org_id;
 return result;
end $$;
revoke all on function kxra_room_worker.next(uuid) from public,anon,authenticated;
grant execute on function kxra_room_worker.next(uuid) to kxra_app;
create or replace function kxra_private.team_job_base_context_active(i uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from kxra.team_jobs j join kxra.account_identities identity on identity.account_id=j.requested_by
  join kxra.team_agents agent on agent.id=j.agent_id and agent.room_id=j.room_id
  join kxra.team_connections connection on connection.id=agent.connection_id
  where j.id=i and j.requested_by=auth.uid() and j.org_id=kxra_private.member_org() and kxra_private.pilot_entitled(j.org_id)
  and identity.state='ACTIVE' and identity.session_version=j.request_session_version
  and kxra_private.can_team_room(j.room_id,true) and agent.enabled and (connection.provider='FIXTURE' or
   (connection.provider<>'FIXTURE' and current_setting('request.kxra.hosted_room_jobs',true)='on'))
  and kxra_private.team_connection_active(connection.id,j.room_id)
  and j.message_id=any(j.context_ids)
  and not exists(select 1 from unnest(j.context_ids) source(id) where not exists(
   select 1 from kxra.team_messages message where message.id=source.id and message.room_id=j.room_id))
  and not exists(select 1 from unnest(j.chunk_ids) with ordinality source(id,n) left join kxra.knowledge_chunks chunk on chunk.id=source.id
   where chunk.id is null or not kxra_private.team_chunk_allowed(j.room_id,source.id) or chunk.content_sha256 is distinct from j.chunk_hashes[source.n])
  and not exists(select 1 from unnest(j.skill_ids) with ordinality source(id,n) left join kxra.team_skill_versions skill on skill.id=source.id
   where skill.id is null or not kxra_private.team_skill_allowed(j.room_id,j.agent_id,source.id) or skill.content_sha256 is distinct from j.skill_hashes[source.n])
  and not exists(select 1 from unnest(j.memory_ids) with ordinality source(id,n) left join kxra.team_memory_versions memory on memory.id=source.id
   where memory.id is null or memory.room_id<>j.room_id or not kxra_private.team_memory_allowed(source.id,j.agent_id) or memory.content_sha256 is distinct from j.memory_hashes[source.n]))
$$;
-- Admission/readiness is checked before a grant exists. Runtime execution
-- additionally requires an active target grant or the verified fixture mode.
create or replace function kxra_private.team_job_context_active(i uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select kxra_private.team_worker_target(i) and kxra_private.team_job_base_context_active(i) and exists(select 1 from kxra.team_jobs j where j.id=i and kxra_private.pilot_entitled(j.org_id)) and not exists(
 select 1 from kxra.team_schedule_occurrences o join kxra.team_schedules s on s.id=o.schedule_id
 where o.job_id=i and (s.state not in ('ACTIVE','EXHAUSTED') or s.expires_at<=now() or not kxra_private.team_job_base_context_active(s.id)))
$$;

-- Preserve the existing enqueue guards; only its final admission predicate
-- is separate from the later grant-bound runtime predicate.
create or replace function kxra.team_job_enqueue(i uuid,r uuid,a uuid,m uuid,mode text,ids uuid[],digest text,
 chunks uuid[],chashes text[],skills uuid[],shashes text[],memories uuid[],mhashes text[],due timestamptz,request_digest text) returns uuid
language plpgsql security definer set search_path='' as $$
declare o uuid;sv integer;
begin
 if session_user<>'kxra_app' or not kxra_private.can_team_room(r,true) then raise insufficient_privilege;end if;
 perform pg_advisory_xact_lock(hashtext(auth.uid()::text));
 if exists(select 1 from kxra.team_jobs where id=i) then
  if not exists(select 1 from kxra.team_jobs where id=i and room_id=r and agent_id=a and message_id=m and requested_by=auth.uid()
   and context_mode=mode and context_ids=ids and context_sha256=digest and chunk_ids=chunks and chunk_hashes=chashes
   and skill_ids=skills and skill_hashes=shashes and memory_ids=memories and memory_hashes=mhashes and requested_due_at is not distinct from due and request_sha256=request_digest)
  then raise exception 'Job idempotency conflict';end if;return i;
 end if;
 if due is not null and (due<now()-interval '1 minute' or due>now()+interval '7 days') then raise exception 'Job due time is outside bounds';end if;
 if (select count(*) from kxra.team_jobs where requested_by=auth.uid() and state in ('QUEUED','LEASED','DISPATCHED'))>=20 then raise exception 'Active job limit reached';end if;
 if ids is null or chunks is null or chashes is null or skills is null or shashes is null or memories is null or mhashes is null
  or cardinality(ids)<>(select count(distinct x) from unnest(ids) x)
  or cardinality(chunks)<>(select count(distinct x) from unnest(chunks) x)
  or cardinality(skills)<>(select count(distinct x) from unnest(skills) x)
  or cardinality(memories)<>(select count(distinct x) from unnest(memories) x)
  or (mode='MESSAGE_ONLY' and (ids<>array[m] or cardinality(chunks)>0 or cardinality(skills)>0 or cardinality(memories)>0))
 then raise insufficient_privilege;end if;
 select org_id into o from kxra.team_rooms where id=r;
 select session_version into sv from kxra.account_identities where account_id=auth.uid() and state='ACTIVE';
 insert into kxra.team_jobs(id,org_id,room_id,agent_id,message_id,request_sha256,requested_by,request_session_version,context_mode,context_ids,context_sha256,
  chunk_ids,chunk_hashes,skill_ids,skill_hashes,memory_ids,memory_hashes,requested_due_at,due_at,available_at)
 values(i,o,r,a,m,request_digest,auth.uid(),sv,mode,ids,digest,chunks,chashes,skills,shashes,memories,mhashes,due,coalesce(due,now()),coalesce(due,now()));
 if not kxra_private.team_job_base_context_active(i) then raise insufficient_privilege;end if;
 return i;
end $$;

create or replace function kxra.team_job_claim(request uuid,r uuid,seconds integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j kxra.team_jobs;candidate uuid;token uuid;
begin
 if session_user<>'kxra_app' or kxra_private.member_org() is null or request is null or seconds is null or seconds not between 5 and 60
  or (r is not null and not kxra_private.can_team_room(r,true)) then raise insufficient_privilege;end if;
 perform pg_advisory_xact_lock(hashtext(auth.uid()::text));
 select job.* into j from kxra.team_job_attempts attempt join kxra.team_jobs job on job.id=attempt.job_id where attempt.id=request;
 if found then
  if j.requested_by<>auth.uid() or j.org_id<>kxra_private.member_org() or (r is not null and j.room_id<>r) then raise insufficient_privilege;end if;
  return jsonb_build_object('duplicate',true);
 end if;
 for candidate in select id from kxra.team_jobs where requested_by=auth.uid() and org_id=kxra_private.member_org()
  and kxra_private.team_worker_target(id) and state in ('QUEUED','LEASED','DISPATCHED') and (r is null or room_id=r) order by created_at,id for update skip locked
 loop perform kxra_private.team_job_reconcile(candidate);end loop;
 if exists(select 1 from kxra.team_jobs where requested_by=auth.uid() and state in ('LEASED','DISPATCHED') and lease_expires_at>now()) then return null;end if;
 select * into j from kxra.team_jobs where requested_by=auth.uid() and org_id=kxra_private.member_org() and kxra_private.team_worker_target(id) and state='QUEUED'
  and attempt_count<3 and available_at<=now() and (r is null or room_id=r) order by available_at,created_at,id limit 1 for update skip locked;
 if not found then return null;end if;
 token=gen_random_uuid();
 insert into kxra.team_job_attempts(id,job_id,number,phase) values(request,j.id,j.attempt_count+1,'LEASED');
 update kxra.team_jobs set state='LEASED',attempt_count=attempt_count+1,active_attempt=request,lease_token=token,
  lease_expires_at=now()+make_interval(secs=>seconds),updated_at=now(),version=version+1 where id=j.id;
 return jsonb_build_object('job_id',j.id,'room_id',j.room_id,'run_id',j.run_id,'lease_token',token,
  'input',jsonb_build_object('request_id',j.run_id,'agent_id',j.agent_id,'message_id',j.message_id,'context',j.context_mode,'chunk_ids',j.chunk_ids,'use_memory',cardinality(j.memory_ids)>0),
  'pinned',jsonb_build_object('context_ids',j.context_ids,'skill_ids',j.skill_ids,'memory_ids',j.memory_ids));
end $$;

create or replace function kxra.team_schedule_tick(request uuid,r uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare s kxra.team_schedules;j kxra.team_jobs;candidate uuid;d date;today date;instant timestamptz;child uuid;result text;counted integer;tick kxra.team_schedule_ticks;
begin
 if session_user<>'kxra_app' or request is null or kxra_private.member_org() is null
 or (r is not null and not kxra_private.can_team_room(r,true)) then raise insufficient_privilege;end if;
 perform pg_advisory_xact_lock(hashtext(auth.uid()::text));
 select * into tick from kxra.team_schedule_ticks where id=request;
 if found then
  if tick.requested_by<>auth.uid() or tick.org_id<>kxra_private.member_org() or tick.room_id is distinct from r then raise insufficient_privilege;end if;
  return false;
 end if;
 if exists(select 1 from kxra.team_job_attempts where id=request) then return false;end if;
 insert into kxra.team_schedule_ticks(id,requested_by,org_id,room_id) values(request,auth.uid(),kxra_private.member_org(),r);
 for candidate in select id from kxra.team_jobs where requested_by=auth.uid() and org_id=kxra_private.member_org()
 and kxra_private.team_worker_target(id) and state in ('QUEUED','LEASED','DISPATCHED') and (r is null or room_id=r) for update skip locked
 loop perform kxra_private.team_job_reconcile(candidate);end loop;
 for s in select * from kxra.team_schedules where created_by=auth.uid() and org_id=kxra_private.member_org()
 and kxra_private.team_worker_target(id) and state='ACTIVE' and (r is null or room_id=r) order by id for update loop
  if s.expires_at<=now() or not kxra_private.team_job_base_context_active(s.id)
   or exists(select 1 from kxra.team_schedule_occurrences o join kxra.team_jobs job on job.id=o.job_id where o.schedule_id=s.id and job.state='UNCERTAIN') then
   update kxra.team_schedules set state=case when s.expires_at<=now() then 'EXPIRED' else 'PAUSED' end,version=version+1,
    last_error=case when s.expires_at<=now() then 'EXPIRED' else 'ACCESS_OR_OUTCOME_CHANGED' end where id=s.id;
   perform kxra_private.team_schedule_cancel_children(s.id);continue;
  end if;
  today=(now() at time zone s.timezone)::date;d=today;
  instant=kxra_private.team_wall_instant(d,s.wall_time,s.timezone);
  if (instant is not null and instant>now()) or (instant is null and (now() at time zone s.timezone)::time<s.wall_time) then
   d=d-1;instant=kxra_private.team_wall_instant(d,s.wall_time,s.timezone);
  end if;
  if d<s.starts_on or (s.last_local_day is not null and d<=s.last_local_day) then continue;end if;
  select count(*) into counted from kxra.team_schedule_occurrences where schedule_id=s.id and outcome='ENQUEUED';
  if counted>=s.max_occurrences then update kxra.team_schedules set state='EXHAUSTED',version=version+1 where id=s.id;continue;end if;
  child=null;result=kxra_private.team_schedule_decision(s.id);
  if instant is null then result='DST_GAP';end if;
  if result='ENQUEUED' then
   select * into j from kxra.team_jobs where id=s.id;
   child=gen_random_uuid();
   perform set_config('request.kxra.team_child',child::text,true);
   perform kxra.team_job_enqueue(child,j.room_id,j.agent_id,j.message_id,j.context_mode,j.context_ids,j.context_sha256,
    j.chunk_ids,j.chunk_hashes,j.skill_ids,j.skill_hashes,j.memory_ids,j.memory_hashes,now(),
    encode(sha256(convert_to(s.id::text||':'||d::text,'UTF8')),'hex'));
   perform set_config('request.kxra.team_child','',true);
  end if;
  insert into kxra.team_schedule_occurrences(schedule_id,local_day,scheduled_for,job_id,outcome) values(s.id,d,instant,child,result);
  update kxra.team_schedules set last_local_day=d,version=version+1,
   state=case when result='ENQUEUED' and counted+1>=s.max_occurrences then 'EXHAUSTED' else 'ACTIVE' end where id=s.id;
 end loop;
 return true;
end $$;
