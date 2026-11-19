-- Application queue only. No OS scheduler, worker login, credential or hosted adapter.
create table kxra.team_jobs(
 id uuid primary key,org_id uuid not null,room_id uuid not null,agent_id uuid not null,message_id uuid not null,
 request_sha256 text not null check(request_sha256~'^[a-f0-9]{64}$'),
 requested_by uuid not null references kxra.account_identities(account_id),request_session_version integer not null,
 context_mode text not null check(context_mode in ('THREAD','MESSAGE_ONLY')),
 context_ids uuid[] not null,context_sha256 text not null check(context_sha256~'^[a-f0-9]{64}$'),
 chunk_ids uuid[] not null,chunk_hashes text[] not null,skill_ids uuid[] not null,skill_hashes text[] not null,
 memory_ids uuid[] not null,memory_hashes text[] not null,
 requested_due_at timestamptz,due_at timestamptz not null,available_at timestamptz not null,
 state text not null default 'QUEUED' check(state in ('QUEUED','LEASED','DISPATCHED','SUCCEEDED','FAILED','CANCELLED','UNCERTAIN')),
 attempt_count integer not null default 0 check(attempt_count between 0 and 3),
 run_id uuid not null unique default gen_random_uuid(),active_attempt uuid,lease_token uuid,lease_expires_at timestamptz,
 last_error text check(last_error~'^[A-Z_]{1,80}$'),version integer not null default 1,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),finished_at timestamptz,
 foreign key(room_id,org_id) references kxra.team_rooms(id,org_id),
 foreign key(agent_id,room_id) references kxra.team_agents(id,room_id),
 foreign key(message_id,room_id) references kxra.team_messages(id,room_id),unique(id,room_id),
 check(cardinality(context_ids) between 1 and 40 and array_position(context_ids,null) is null and coalesce(array_ndims(context_ids),1)=1),
 check(cardinality(chunk_ids)<=3 and cardinality(chunk_ids)=cardinality(chunk_hashes) and array_position(chunk_ids,null) is null and coalesce(array_ndims(chunk_ids),1)=1),
 check(cardinality(skill_ids)<=3 and cardinality(skill_ids)=cardinality(skill_hashes) and array_position(skill_ids,null) is null and coalesce(array_ndims(skill_ids),1)=1),
 check(cardinality(memory_ids)<=5 and cardinality(memory_ids)=cardinality(memory_hashes) and array_position(memory_ids,null) is null and coalesce(array_ndims(memory_ids),1)=1),
 check((state in ('LEASED','DISPATCHED') and lease_token is not null and lease_expires_at is not null and active_attempt is not null)
  or (state not in ('LEASED','DISPATCHED') and lease_token is null and lease_expires_at is null)),
 check((state in ('SUCCEEDED','FAILED','CANCELLED','UNCERTAIN'))=(finished_at is not null))
);
create index team_jobs_due on kxra.team_jobs(requested_by,org_id,state,available_at);
create table kxra.team_job_attempts(
 id uuid primary key,job_id uuid not null references kxra.team_jobs(id),number integer not null check(number between 1 and 3),
 phase text not null check(phase in ('LEASED','DISPATCHED','SUCCEEDED','FAILED','CANCELLED','EXPIRED','RELEASED','UNCERTAIN')),
 error_code text check(error_code~'^[A-Z_]{1,80}$'),started_at timestamptz not null default now(),finished_at timestamptz,
 unique(job_id,number),check((phase in ('LEASED','DISPATCHED'))=(finished_at is null))
);
alter table kxra.team_jobs add foreign key(active_attempt) references kxra.team_job_attempts(id);
alter table kxra.team_jobs enable row level security;
alter table kxra.team_job_attempts enable row level security;
create policy team_jobs_read on kxra.team_jobs for select to authenticated using(kxra_private.can_team_room(room_id));
create policy team_job_attempts_read on kxra.team_job_attempts for select to authenticated
 using(exists(select 1 from kxra.team_jobs j where j.id=job_id and kxra_private.can_team_room(j.room_id)));
revoke all on kxra.team_jobs,kxra.team_job_attempts from public,anon,authenticated;
-- No payload text, hidden source IDs, reserved run IDs or fencing tokens are readable.
grant select(id,org_id,room_id,agent_id,message_id,requested_by,due_at,available_at,state,attempt_count,lease_expires_at,
 last_error,version,created_at,updated_at,finished_at) on kxra.team_jobs to authenticated;
grant select on kxra.team_job_attempts to authenticated;

create function kxra_private.team_job_context_active(i uuid) returns boolean
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
create function kxra_private.team_job_run(i uuid) returns uuid language sql stable security definer set search_path='' as $$
 select j.run_id from kxra.team_jobs j where j.id=i and kxra_private.can_team_room(j.room_id)
 and exists(select 1 from kxra.team_runs r where r.id=j.run_id and kxra_private.can_team_run(r.id))
$$;
revoke all on function kxra_private.team_job_context_active(uuid),kxra_private.team_job_run(uuid) from public,anon;
grant execute on function kxra_private.team_job_context_active(uuid),kxra_private.team_job_run(uuid) to authenticated;
create function kxra_private.team_job_request_matches(i uuid,r uuid,digest text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from kxra.team_jobs j where j.id=i and j.room_id=r and j.requested_by=auth.uid()
  and kxra_private.can_team_room(r,true) and j.org_id=kxra_private.member_org() and j.request_sha256=digest)
$$;
create function kxra_private.team_job_ready(i uuid,token uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select session_user='kxra_app' and exists(select 1 from kxra.team_jobs j where j.id=i
  and j.requested_by=auth.uid() and j.state='DISPATCHED' and j.lease_token=token and j.lease_expires_at>now()
  and kxra_private.team_job_context_active(i) and kxra.team_run_ready(j.run_id))
$$;
revoke all on function kxra_private.team_job_request_matches(uuid,uuid,text),kxra_private.team_job_ready(uuid,uuid) from public,anon;
grant execute on function kxra_private.team_job_request_matches(uuid,uuid,text),kxra_private.team_job_ready(uuid,uuid) to authenticated;

create function kxra.team_job_enqueue(i uuid,r uuid,a uuid,m uuid,mode text,ids uuid[],digest text,
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
 if not kxra_private.team_job_context_active(i) then raise insufficient_privilege;end if;
 return i;
end $$;

create function kxra_private.team_job_reconcile(i uuid) returns void language plpgsql security definer set search_path='' as $$
declare j kxra.team_jobs;
begin
 select * into j from kxra.team_jobs where id=i for update;
 if not found then return;end if;
 if j.state='QUEUED' and not kxra_private.team_job_context_active(i) then
  update kxra.team_jobs set state='CANCELLED',last_error='ACCESS_CHANGED',finished_at=now(),updated_at=now(),version=version+1 where id=i;
 elsif j.state in ('LEASED','DISPATCHED') and j.lease_expires_at<=now() then
  update kxra.team_job_attempts set phase=case when j.state='DISPATCHED' then 'UNCERTAIN' else 'EXPIRED' end,
   error_code=case when j.state='DISPATCHED' then 'WORKER_OUTCOME_UNKNOWN' else 'LEASE_EXPIRED' end,finished_at=now() where id=j.active_attempt;
  if j.state='DISPATCHED' then
   update kxra.team_runs set status='CANCELLED',output='',error_code='WORKER_OUTCOME_UNKNOWN',finished_at=now() where id=j.run_id and status='RUNNING';
  end if;
  update kxra.team_jobs set state=case when j.state='DISPATCHED' then 'UNCERTAIN'
    when not kxra_private.team_job_context_active(i) then 'CANCELLED' when attempt_count>=3 then 'FAILED' else 'QUEUED' end,
   last_error=case when j.state='DISPATCHED' then 'WORKER_OUTCOME_UNKNOWN' when not kxra_private.team_job_context_active(i) then 'ACCESS_CHANGED'
    when attempt_count>=3 then 'ATTEMPTS_EXHAUSTED' else 'LEASE_EXPIRED' end,
   finished_at=case when j.state='DISPATCHED' or not kxra_private.team_job_context_active(i) or attempt_count>=3 then now() else null end,
   lease_token=null,lease_expires_at=null,available_at=greatest(due_at,now()),updated_at=now(),version=version+1 where id=i;
 end if;
end $$;
revoke all on function kxra_private.team_job_reconcile(uuid) from public,anon,authenticated;

create function kxra.team_job_claim(request uuid,r uuid,seconds integer) returns jsonb
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
  and state in ('QUEUED','LEASED','DISPATCHED') and (r is null or room_id=r) order by created_at,id for update skip locked
 loop perform kxra_private.team_job_reconcile(candidate);end loop;
 if exists(select 1 from kxra.team_jobs where requested_by=auth.uid() and state in ('LEASED','DISPATCHED') and lease_expires_at>now()) then return null;end if;
 select * into j from kxra.team_jobs where requested_by=auth.uid() and org_id=kxra_private.member_org() and state='QUEUED'
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

create function kxra.team_job_release(i uuid,token uuid,code text) returns void language plpgsql security definer set search_path='' as $$
declare j kxra.team_jobs;retry boolean;
begin
 if session_user<>'kxra_app' then raise insufficient_privilege;end if;
 select * into j from kxra.team_jobs where id=i and requested_by=auth.uid() and org_id=kxra_private.member_org() for update;
 if not found then raise insufficient_privilege;end if;
 if j.state<>'LEASED' or j.lease_token is distinct from token then return;end if;
 if j.lease_expires_at<=now() then perform kxra_private.team_job_reconcile(i);return;end if;
 if code is null or code not in ('WORKER_TEMPORARY','CAPACITY','ACCESS_CHANGED','CONTEXT_CHANGED','ADMISSION_CONFLICT') then raise exception 'Unsupported pre-dispatch failure';end if;
 retry=code in ('WORKER_TEMPORARY','CAPACITY') and j.attempt_count<3 and kxra_private.team_job_context_active(i);
 update kxra.team_job_attempts set phase=case when retry then 'RELEASED' when code in ('ACCESS_CHANGED','CONTEXT_CHANGED') then 'CANCELLED' else 'FAILED' end,
  error_code=code,finished_at=now() where id=j.active_attempt;
 update kxra.team_jobs set state=case when retry then 'QUEUED' when code in ('ACCESS_CHANGED','CONTEXT_CHANGED') then 'CANCELLED' else 'FAILED' end,
  available_at=greatest(due_at,now()+make_interval(secs=>power(2,j.attempt_count)::integer)),
  last_error=code,lease_token=null,lease_expires_at=null,finished_at=case when retry then null else now() end,updated_at=now(),version=version+1 where id=i;
end $$;
create function kxra.team_job_dispatch(i uuid,token uuid,digest text) returns jsonb language plpgsql security definer set search_path='' as $$
declare j kxra.team_jobs;connection jsonb;
begin
 if session_user<>'kxra_app' then raise insufficient_privilege;end if;
 select * into j from kxra.team_jobs where id=i and requested_by=auth.uid() and org_id=kxra_private.member_org() for update;
 if not found then raise insufficient_privilege;end if;
 if j.state<>'LEASED' or j.lease_token is distinct from token then return null;end if;
 if j.lease_expires_at<=now() then perform kxra_private.team_job_reconcile(i);return null;end if;
 if not kxra_private.team_job_context_active(i) or digest is distinct from j.context_sha256 then
  perform kxra.team_job_release(i,token,case when digest is distinct from j.context_sha256 then 'CONTEXT_CHANGED' else 'ACCESS_CHANGED' end);return null;
 end if;
 begin
  connection=kxra.team_run_start_memory(j.run_id,j.room_id,j.agent_id,j.message_id,j.context_ids,j.context_sha256,
   j.chunk_ids,j.chunk_hashes,j.skill_ids,j.skill_hashes,j.memory_ids,j.memory_hashes);
 exception when insufficient_privilege then perform kxra.team_job_release(i,token,'ACCESS_CHANGED');return null;
  when raise_exception then
   perform kxra.team_job_release(i,token,case when sqlerrm in ('Run already in progress','Daily run limit reached') then 'CAPACITY' else 'ADMISSION_CONFLICT' end);return null;
 end;
 update kxra.team_jobs set state='DISPATCHED',updated_at=now(),version=version+1 where id=i;
 update kxra.team_job_attempts set phase='DISPATCHED' where id=j.active_attempt;
 return connection;
end $$;
create function kxra.team_job_finish(i uuid,token uuid,result text,code text,tin integer,tout integer) returns boolean
language plpgsql security definer set search_path='' as $$
declare j kxra.team_jobs;run kxra.team_runs;
begin
 if session_user<>'kxra_app' then raise insufficient_privilege;end if;
 select * into j from kxra.team_jobs where id=i and requested_by=auth.uid() and org_id=kxra_private.member_org() for update;
 if not found then raise insufficient_privilege;end if;
 if j.state<>'DISPATCHED' or j.lease_token is distinct from token then return false;end if;
 if j.lease_expires_at<=now() then perform kxra_private.team_job_reconcile(i);return false;end if;
 if not kxra_private.team_job_context_active(i) then
  update kxra.team_runs set status='CANCELLED',output='',error_code='ACCESS_CHANGED',finished_at=now() where id=j.run_id and status='RUNNING';
 else perform kxra.team_run_finish(j.run_id,result,code,tin,tout);end if;
 select * into run from kxra.team_runs where id=j.run_id;
 update kxra.team_job_attempts set phase=run.status,error_code=run.error_code,finished_at=now() where id=j.active_attempt;
 update kxra.team_jobs set state=run.status,last_error=run.error_code,lease_token=null,lease_expires_at=null,
  finished_at=now(),updated_at=now(),version=version+1 where id=i;
 return run.status='SUCCEEDED';
end $$;
create function kxra.team_job_cancel(r uuid,i uuid,expected integer) returns void language plpgsql security definer set search_path='' as $$
declare j kxra.team_jobs;
begin
 select * into j from kxra.team_jobs where id=i and room_id=r for update;
 if not found or not kxra_private.can_team_room(r,true) or not (j.requested_by=auth.uid() or kxra_private.manages_team_room(r)) then raise insufficient_privilege;end if;
 if j.state='CANCELLED' then return;end if;
 if j.version is distinct from expected or j.state not in ('QUEUED','LEASED','DISPATCHED') then raise exception 'Job state changed';end if;
 if exists(select 1 from kxra.team_runs where id=j.run_id and room_id=r and status='RUNNING') then
  perform kxra.team_run_cancel(j.run_id);
 end if;
 update kxra.team_job_attempts set phase='CANCELLED',error_code='CANCELLED_BY_USER',finished_at=now() where id=j.active_attempt;
 update kxra.team_jobs set state='CANCELLED',last_error='CANCELLED_BY_USER',lease_token=null,lease_expires_at=null,
  finished_at=now(),updated_at=now(),version=version+1 where id=i;
end $$;

create function kxra_private.guard_team_job() returns trigger language plpgsql set search_path='' as $$
begin
 if (new.id,new.org_id,new.room_id,new.agent_id,new.message_id,new.request_sha256,new.requested_by,new.request_session_version,new.context_mode,
  new.context_ids,new.context_sha256,new.chunk_ids,new.chunk_hashes,new.skill_ids,new.skill_hashes,new.memory_ids,new.memory_hashes,new.requested_due_at,new.due_at,new.run_id,new.created_at)
  is distinct from (old.id,old.org_id,old.room_id,old.agent_id,old.message_id,old.request_sha256,old.requested_by,old.request_session_version,old.context_mode,
  old.context_ids,old.context_sha256,old.chunk_ids,old.chunk_hashes,old.skill_ids,old.skill_hashes,old.memory_ids,old.memory_hashes,old.requested_due_at,old.due_at,old.run_id,old.created_at)
 then raise exception 'Job admission is immutable';end if;return new;
end $$;
create function kxra_private.guard_team_job_attempt() returns trigger language plpgsql set search_path='' as $$
begin
 if (new.id,new.job_id,new.number,new.started_at) is distinct from (old.id,old.job_id,old.number,old.started_at)
 then raise exception 'Job attempt identity is immutable';end if;return new;
end $$;
revoke all on function kxra_private.guard_team_job(),kxra_private.guard_team_job_attempt() from public,anon,authenticated;
create trigger team_job_immutable before update on kxra.team_jobs for each row execute function kxra_private.guard_team_job();
create trigger team_job_attempt_immutable before update on kxra.team_job_attempts for each row execute function kxra_private.guard_team_job_attempt();
create trigger team_job_audit after insert or update on kxra.team_jobs for each row execute function kxra_private.audit_team_change();
revoke all on function kxra.team_job_enqueue(uuid,uuid,uuid,uuid,text,uuid[],text,uuid[],text[],uuid[],text[],uuid[],text[],timestamptz,text),
 kxra.team_job_claim(uuid,uuid,integer),kxra.team_job_release(uuid,uuid,text),kxra.team_job_dispatch(uuid,uuid,text),
 kxra.team_job_finish(uuid,uuid,text,text,integer,integer),kxra.team_job_cancel(uuid,uuid,integer) from public,anon;
grant execute on function kxra.team_job_enqueue(uuid,uuid,uuid,uuid,text,uuid[],text,uuid[],text[],uuid[],text[],uuid[],text[],timestamptz,text),
 kxra.team_job_claim(uuid,uuid,integer),kxra.team_job_release(uuid,uuid,text),kxra.team_job_dispatch(uuid,uuid,text),
 kxra.team_job_finish(uuid,uuid,text,text,integer,integer),kxra.team_job_cancel(uuid,uuid,integer) to authenticated;
