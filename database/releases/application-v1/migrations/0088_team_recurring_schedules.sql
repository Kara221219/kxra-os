-- Reviewed daily LOCAL FIXTURE schedules. No hosted scheduler or external action.
create table kxra.team_schedules(
 id uuid primary key references kxra.team_jobs(id), org_id uuid not null, room_id uuid not null,
 created_by uuid not null references kxra.account_identities(account_id),
 name text not null check(length(name) between 1 and 120), timezone text not null, wall_time time not null,
 starts_on date not null, expires_at timestamptz not null, max_occurrences integer not null check(max_occurrences between 1 and 20),
 state text not null default 'DRAFT' check(state in ('DRAFT','ACTIVE','PAUSED','REVOKED','EXHAUSTED','EXPIRED')),
 version integer not null default 1, last_local_day date, last_error text,
 reviewed_at timestamptz, created_at timestamptz not null default now(),
 foreign key(room_id,org_id) references kxra.team_rooms(id,org_id)
);
create index team_schedules_actor on kxra.team_schedules(created_by,org_id,state);
create index team_schedules_room on kxra.team_schedules(room_id,created_at desc,id desc);
create index team_jobs_room on kxra.team_jobs(room_id,created_at desc,id desc);
create index team_events_room_export on kxra.team_events(room_id,id desc);
create table kxra.team_schedule_occurrences(
 id uuid primary key default gen_random_uuid(), schedule_id uuid not null references kxra.team_schedules(id),
 local_day date not null, scheduled_for timestamptz, job_id uuid unique references kxra.team_jobs(id),
 outcome text not null check(outcome in ('ENQUEUED','DST_GAP','OVERLAP','QUEUE_CAPACITY')),
 created_at timestamptz not null default now(), unique(schedule_id,local_day),unique(schedule_id,scheduled_for),
 check((outcome='ENQUEUED')=(job_id is not null))
);
create table kxra.team_schedule_ticks(
 id uuid primary key, requested_by uuid not null references kxra.account_identities(account_id),
 org_id uuid not null, room_id uuid, created_at timestamptz not null default now()
);
alter table kxra.team_schedules enable row level security;
alter table kxra.team_schedule_occurrences enable row level security;
alter table kxra.team_schedule_ticks enable row level security;
create policy team_schedules_read on kxra.team_schedules for select to authenticated using(kxra_private.can_team_room(room_id));
create policy team_schedule_occurrences_read on kxra.team_schedule_occurrences for select to authenticated using(
 exists(select 1 from kxra.team_schedules s where s.id=schedule_id and kxra_private.can_team_room(s.room_id)));
create policy team_schedule_ticks_read on kxra.team_schedule_ticks for select to authenticated using(requested_by=auth.uid() and org_id=kxra_private.member_org());
revoke all on kxra.team_schedules,kxra.team_schedule_occurrences,kxra.team_schedule_ticks from public,anon,authenticated;
grant select on kxra.team_schedules,kxra.team_schedule_occurrences to authenticated;
grant select(id,created_at) on kxra.team_schedule_ticks to authenticated;
-- Resolve wall time explicitly: skip gaps; choose EARLIEST instant for folds.
-- Sampling timezone offsets also covers half-hour DST and whole-day transitions.
create function kxra_private.team_wall_instant(d date,t time,z text) returns timestamptz
language sql stable set search_path='' as $$
 with base as(select (d+t) at time zone z instant), offsets as(
 select distinct (x at time zone z)-(x at time zone 'UTC') offset_value from base,
 generate_series(instant-interval '2 days',instant+interval '2 days',interval '6 hours') x),
 candidates as(select (d+t-offset_value) at time zone 'UTC' instant from offsets)
 select min(instant) from candidates where instant at time zone z=d+t
$$;
revoke all on function kxra_private.team_wall_instant(date,time,text) from public,anon;
grant execute on function kxra_private.team_wall_instant(date,time,text) to authenticated;
create function kxra_private.team_job_base_context_active(i uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from kxra.team_jobs j join kxra.account_identities identity on identity.account_id=j.requested_by
  join kxra.team_agents agent on agent.id=j.agent_id and agent.room_id=j.room_id
  join kxra.team_connections connection on connection.id=agent.connection_id
  where j.id=i and j.requested_by=auth.uid() and j.org_id=kxra_private.member_org()
  and identity.state='ACTIVE' and identity.session_version=j.request_session_version
  and kxra_private.can_team_room(j.room_id,true) and agent.enabled and connection.provider='FIXTURE'
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
revoke all on function kxra_private.team_job_base_context_active(uuid) from public,anon,authenticated;
create or replace function kxra_private.team_job_context_active(i uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select kxra_private.team_job_base_context_active(i) and not exists(
 select 1 from kxra.team_schedule_occurrences o join kxra.team_schedules s on s.id=o.schedule_id
 where o.job_id=i and (s.state not in ('ACTIVE','EXHAUSTED') or s.expires_at<=now()
 or not kxra_private.team_job_base_context_active(s.id)))
$$;
-- Private reduction only: no new admission; revoke pending children even after scope withdrawal.
create function kxra_private.team_schedule_cancel_children(i uuid) returns void
language plpgsql security definer set search_path='' as $$
declare j kxra.team_jobs;
begin
 for j in select job.* from kxra.team_jobs job join kxra.team_schedule_occurrences o on o.job_id=job.id
 where o.schedule_id=i and job.state in ('QUEUED','LEASED','DISPATCHED') for update of job loop
  update kxra.team_runs set status='CANCELLED',output='',error_code='SCHEDULE_STOPPED',finished_at=now() where id=j.run_id and status='RUNNING';
  update kxra.team_job_attempts set phase='CANCELLED',error_code='SCHEDULE_STOPPED',finished_at=now() where id=j.active_attempt;
  update kxra.team_jobs set state='CANCELLED',last_error='SCHEDULE_STOPPED',lease_token=null,lease_expires_at=null,
   finished_at=now(),updated_at=now(),version=version+1 where id=j.id;
 end loop;
end $$;
revoke all on function kxra_private.team_schedule_cancel_children(uuid) from public,anon,authenticated;
create function kxra.team_schedule_propose(i uuid,r uuid,n text,z text,t time,d date,e timestamptz,b integer) returns uuid
language plpgsql security definer set search_path='' as $$
declare j kxra.team_jobs;
begin
 if session_user<>'kxra_app' or not kxra_private.manages_team_room(r) or not kxra_private.can_team_room(r,true) then raise insufficient_privilege;end if;
 perform pg_advisory_xact_lock(hashtext(auth.uid()::text));
 select * into j from kxra.team_jobs where id=i and room_id=r and requested_by=auth.uid() for update;
 if not found or j.state<>'QUEUED' or j.attempt_count<>0 or not kxra_private.team_job_base_context_active(i) then raise insufficient_privilege;end if;
 if z is null or not exists(select 1 from pg_timezone_names where name=z) then raise exception 'Unknown IANA timezone';end if;
 if n is null or length(trim(n)) not between 1 and 120
 or t is null or t>=time '24:00' or extract(second from t)<>0 or d is null or d<(now() at time zone z)::date or d>(now() at time zone z)::date+30
 or e is null or e<=now() or e>now()+interval '30 days' or e<=((d+t) at time zone z)
 or b is null or b not between 1 and 20 then raise exception 'Invalid bounded schedule definition';end if;
 if (select count(*) from kxra.team_schedules where created_by=auth.uid() and state in ('DRAFT','ACTIVE','PAUSED'))>=20 then raise exception 'Active schedule limit reached';end if;
 insert into kxra.team_schedules(id,org_id,room_id,created_by,name,timezone,wall_time,starts_on,expires_at,max_occurrences)
 values(i,j.org_id,r,auth.uid(),trim(n),z,t,d,e,b);
 perform kxra.team_job_cancel(r,i,j.version);
 return i;
end $$;
create function kxra.team_schedule_review(r uuid,i uuid,expected integer,action text) returns void
language plpgsql security definer set search_path='' as $$
declare s kxra.team_schedules;
begin
 if session_user<>'kxra_app' or not kxra_private.manages_team_room(r) or not kxra_private.can_team_room(r,true) then raise insufficient_privilege;end if;
 perform pg_advisory_xact_lock(hashtext(auth.uid()::text));
 select * into s from kxra.team_schedules where id=i and room_id=r and created_by=auth.uid() for update;
 if not found then raise insufficient_privilege;end if;
 if s.version is distinct from expected or action is null or action not in ('ACTIVATE','PAUSE','REVOKE')
 or s.state in ('REVOKED','EXPIRED') then raise exception 'Schedule state changed';end if;
 if action='ACTIVATE' and (s.state not in ('DRAFT','PAUSED') or s.expires_at<=now()
 or not kxra_private.team_job_base_context_active(i)
 or (select count(*) from kxra.team_schedule_occurrences where schedule_id=i and outcome='ENQUEUED')>=s.max_occurrences
 or exists(select 1 from kxra.team_schedule_occurrences o join kxra.team_jobs j on j.id=o.job_id where o.schedule_id=i and j.state='UNCERTAIN'))
 then raise exception 'Schedule context, outcome or budget requires a new reviewed definition';end if;
 update kxra.team_schedules set state=case action when 'ACTIVATE' then 'ACTIVE' when 'PAUSE' then 'PAUSED' else 'REVOKED' end,
 version=version+1,reviewed_at=case when action='ACTIVATE' then now() else reviewed_at end,last_error=null where id=i;
 if action<>'ACTIVATE' then perform kxra_private.team_schedule_cancel_children(i);end if;
end $$;
-- Read-only admission explanation, shared with the tick; no clock override or write surface.
create function kxra_private.team_schedule_decision(i uuid) returns text
language sql stable security definer set search_path='' as $$
 select case
 when (select count(*) from kxra.team_schedule_occurrences where schedule_id=i and outcome='ENQUEUED')>=s.max_occurrences then 'BUDGET'
 when exists(select 1 from kxra.team_schedule_occurrences o join kxra.team_jobs j on j.id=o.job_id where o.schedule_id=i and j.state in ('QUEUED','LEASED','DISPATCHED')) then 'OVERLAP'
 when (select count(*) from kxra.team_jobs where requested_by=auth.uid() and state in ('QUEUED','LEASED','DISPATCHED'))>=20 then 'QUEUE_CAPACITY'
 else 'ENQUEUED' end from kxra.team_schedules s where s.id=i and s.created_by=auth.uid() and kxra_private.can_team_room(s.room_id,true)
$$;
revoke all on function kxra_private.team_schedule_decision(uuid) from public,anon;
grant execute on function kxra_private.team_schedule_decision(uuid) to authenticated;
create function kxra.team_schedule_tick(request uuid,r uuid) returns boolean
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
 and state in ('QUEUED','LEASED','DISPATCHED') and (r is null or room_id=r) for update skip locked
 loop perform kxra_private.team_job_reconcile(candidate);end loop;
 for s in select * from kxra.team_schedules where created_by=auth.uid() and org_id=kxra_private.member_org()
 and state='ACTIVE' and (r is null or room_id=r) order by id for update loop
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
   perform kxra.team_job_enqueue(child,j.room_id,j.agent_id,j.message_id,j.context_mode,j.context_ids,j.context_sha256,
    j.chunk_ids,j.chunk_hashes,j.skill_ids,j.skill_hashes,j.memory_ids,j.memory_hashes,now(),
    encode(sha256(convert_to(s.id::text||':'||d::text,'UTF8')),'hex'));
  end if;
  insert into kxra.team_schedule_occurrences(schedule_id,local_day,scheduled_for,job_id,outcome) values(s.id,d,instant,child,result);
  update kxra.team_schedules set last_local_day=d,version=version+1,
   state=case when result='ENQUEUED' and counted+1>=s.max_occurrences then 'EXHAUSTED' else 'ACTIVE' end where id=s.id;
 end loop;
 return true;
end $$;
create function kxra_private.guard_team_schedule() returns trigger language plpgsql set search_path='' as $$
begin
 if (new.id,new.org_id,new.room_id,new.created_by,new.name,new.timezone,new.wall_time,new.starts_on,new.expires_at,new.max_occurrences,new.created_at)
 is distinct from (old.id,old.org_id,old.room_id,old.created_by,old.name,old.timezone,old.wall_time,old.starts_on,old.expires_at,old.max_occurrences,old.created_at)
 then raise exception 'Schedule definition is immutable; propose and review a new definition';end if;return new;
end $$;
revoke all on function kxra_private.guard_team_schedule() from public,anon,authenticated;
create trigger team_schedule_immutable before update on kxra.team_schedules for each row execute function kxra_private.guard_team_schedule();
create trigger team_schedule_audit after insert or update on kxra.team_schedules for each row execute function kxra_private.audit_team_change();
revoke all on function kxra.team_schedule_propose(uuid,uuid,text,text,time,date,timestamptz,integer),kxra.team_schedule_review(uuid,uuid,integer,text),kxra.team_schedule_tick(uuid,uuid) from public,anon;
grant execute on function kxra.team_schedule_propose(uuid,uuid,text,text,time,date,timestamptz,integer),kxra.team_schedule_review(uuid,uuid,integer,text),kxra.team_schedule_tick(uuid,uuid) to authenticated;
-- Creator-only review receipt; never reveal hidden source IDs or body text.
create function kxra_private.team_schedule_receipt(i uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('agent_id',j.agent_id,'message_id',j.message_id,'context',j.context_mode,
 'context_sha256',case when kxra_private.team_job_base_context_active(i) then j.context_sha256 else null end,'messages',cardinality(j.context_ids),'files',cardinality(j.chunk_ids),
 'skills',cardinality(j.skill_ids),'memories',cardinality(j.memory_ids),'context_active',kxra_private.team_job_base_context_active(i))
 from kxra.team_schedules s join kxra.team_jobs j on j.id=s.id
 where s.id=i and s.created_by=auth.uid() and kxra_private.can_team_room(s.room_id,true)
$$;
revoke all on function kxra_private.team_schedule_receipt(uuid) from public,anon;
grant execute on function kxra_private.team_schedule_receipt(uuid) to authenticated;
