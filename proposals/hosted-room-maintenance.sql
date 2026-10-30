-- Follow-on LOCAL proposal after the exact reviewed hosted-room-operations.sql.
-- No roles, keys, credentials, triggers, provider calls or hosted changes.
-- Rollout rows are empty: only an exact later operator-approved setup may add one.
create table kxra.team_room_rollouts(
 room_id uuid primary key,org_id uuid not null,connection_id uuid not null references kxra.team_connections(id),
 starts_at timestamptz not null default now(),expires_at timestamptz not null,max_daily_dispatches integer not null check(max_daily_dispatches between 1 and 20),
 created_at timestamptz not null default now(),revoked_at timestamptz,
 check(expires_at>starts_at and expires_at<=starts_at+interval '30 days'),
 foreign key(room_id,org_id) references kxra.team_rooms(id,org_id)
);
alter table kxra.team_room_rollouts enable row level security;
create policy team_room_rollouts_read on kxra.team_room_rollouts for select to authenticated
 using(org_id=kxra_private.member_org() and kxra_private.can_team_room(room_id));
revoke all on kxra.team_room_rollouts from public,anon,authenticated;
grant select(room_id,connection_id,starts_at,expires_at,max_daily_dispatches,revoked_at) on kxra.team_room_rollouts to authenticated;
create table kxra.team_byok_consents(
 room_id uuid primary key references kxra.team_rooms(id),org_id uuid not null,connection_id uuid not null,
 granted_by uuid not null,connection_sha256 text not null,expires_at timestamptz not null,
 revoked_at timestamptz,created_at timestamptz not null default now()
);
alter table kxra.team_byok_consents enable row level security;
create policy team_byok_consents_read on kxra.team_byok_consents for select to authenticated
 using(org_id=kxra_private.member_org() and kxra_private.can_team_room(room_id));
revoke all on kxra.team_byok_consents from public,anon,authenticated;
grant select(room_id,connection_id,expires_at,revoked_at) on kxra.team_byok_consents to authenticated;

create function kxra_private.team_room_byok_allowed(r uuid,c uuid) returns boolean
language sql stable security definer set search_path='' as $$
 -- Read predicates preserve authorized RLS inspection; mutations still require kxra_app.
 select ((session_user='kxra_app' and current_setting('role')='none') or exists(select 1 from kxra.team_rooms room where room.id=r and room.org_id=kxra_private.member_org() and kxra_private.can_team_room(r)))
 and exists(select 1 from kxra.team_connections connection where connection.id=c and connection.enabled and connection.org_id=(select org_id from kxra.team_rooms where id=r)
 and ((connection.provider='FIXTURE' and current_setting('request.kxra.execution_mode',true)='fixture') or
 (connection.provider<>'FIXTURE' and exists(
 select 1 from kxra.team_room_rollouts rollout join kxra.team_byok_consents consent on consent.room_id=rollout.room_id
 join kxra.organisations org on org.id=rollout.org_id and org.organisation_kind='CUSTOMER' and org.state='ACTIVE'
 join kxra.organisation_memberships membership on membership.org_id=org.id and membership.account_id=consent.granted_by
 join kxra.account_identities identity on identity.account_id=consent.granted_by and identity.state='ACTIVE'
 where rollout.room_id=r and rollout.connection_id=c and rollout.org_id=connection.org_id
 and rollout.revoked_at is null and rollout.starts_at<=now() and rollout.expires_at>now() and consent.revoked_at is null and consent.expires_at>now()
 and consent.org_id=rollout.org_id and consent.connection_id=c and consent.granted_by=connection.created_by
 and membership.state='ACTIVE' and membership.revoked_at is null and membership.starts_at<=now()
 and (membership.expires_at is null or membership.expires_at>now())
 and consent.connection_sha256=encode(sha256(convert_to(jsonb_build_array(connection.provider,connection.model,connection.endpoint_id,connection.encrypted_key)::text,'UTF8')),'hex')))))
$$;
revoke all on function kxra_private.team_room_byok_allowed(uuid,uuid) from public,anon;
grant execute on function kxra_private.team_room_byok_allowed(uuid,uuid) to authenticated;

create function kxra.team_room_byok_review(r uuid,c uuid,action text) returns void
language plpgsql security definer set search_path='' as $$
declare connection kxra.team_connections;rollout kxra.team_room_rollouts;at bigint;
begin
 if session_user<>'kxra_app' or action is null or action not in ('APPROVE','REVOKE') or not kxra_private.can_team_room(r,true)
 or not kxra_private.manages_team_room(r) then raise insufficient_privilege;end if;
 select * into connection from kxra.team_connections where id=c and org_id=kxra_private.member_org() and created_by=auth.uid();
 if not found then raise insufficient_privilege;end if;
 if action='REVOKE' then
  -- Grant-before-consent lock order fences a late worker publication atomically.
  perform 1 from kxra.team_execution_grants where room_id=r and org_id=connection.org_id and connection_id=c order by id for update;
  update kxra.team_execution_grants set revoked_at=coalesce(revoked_at,now()) where room_id=r and org_id=connection.org_id and connection_id=c;
  update kxra.team_byok_consents set revoked_at=coalesce(revoked_at,now()) where room_id=r and granted_by=auth.uid() and connection_id=c;
 else
  at=(coalesce(current_setting('request.jwt.claims',true),'{}')::jsonb->>'auth_time')::bigint;
  if coalesce(auth.jwt()->>'aal','')<>'aal2' or at is null or at<extract(epoch from now())-600 or at>extract(epoch from now())+30
   or connection.provider='FIXTURE' or not exists(select 1 from kxra.organisations where id=connection.org_id and organisation_kind='CUSTOMER')
   then raise insufficient_privilege;end if;
  select * into rollout from kxra.team_room_rollouts where room_id=r and org_id=connection.org_id and connection_id=c and revoked_at is null and starts_at<=now() and expires_at>now() for share;
  if not found then raise insufficient_privilege;end if;
  insert into kxra.team_byok_consents(room_id,org_id,connection_id,granted_by,connection_sha256,expires_at)
  values(r,connection.org_id,c,auth.uid(),encode(sha256(convert_to(jsonb_build_array(connection.provider,connection.model,connection.endpoint_id,connection.encrypted_key)::text,'UTF8')),'hex'),least(rollout.expires_at,now()+interval '30 days'))
  on conflict(room_id) do update set connection_id=excluded.connection_id,granted_by=excluded.granted_by,
   connection_sha256=excluded.connection_sha256,expires_at=excluded.expires_at,revoked_at=null;
 end if;
 insert into kxra.audit_events(org_id,actor_id,action,resource_id,metadata) values(connection.org_id,auth.uid(),
 case when action='APPROVE' then 'team.customer_byok_consented' else 'team.customer_byok_revoked' end,r,jsonb_build_object('connection',c,'consent_version','CUSTOMER-BYOK-ROOM-V1'));
end $$;
revoke all on function kxra.team_room_byok_review(uuid,uuid,text) from public,anon;
grant execute on function kxra.team_room_byok_review(uuid,uuid,text) to authenticated;

-- Preserve the original complete target fence and add customer-funded room admission.
create or replace function kxra_private.team_worker_target(i uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from kxra.team_jobs target join kxra.team_agents agent on agent.id=target.agent_id
 where target.id=i and kxra_private.team_room_byok_allowed(target.room_id,agent.connection_id))
 and case when nullif(current_setting('request.kxra.team_grant',true),'') is null then
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

alter table kxra.team_execution_grants add column last_maintained_at timestamptz;
create index team_jobs_maintenance_due on kxra.team_jobs(available_at,id) where state='QUEUED';
create index team_jobs_maintenance_leases on kxra.team_jobs(lease_expires_at,id) where state in ('LEASED','DISPATCHED');
create index team_grants_maintenance on kxra.team_execution_grants(last_maintained_at nulls first,id);
alter table kxra.team_jobs add column uncertainty_acknowledged_at timestamptz;
alter table kxra.team_jobs add column uncertainty_acknowledged_by uuid;
create table kxra.team_uncertainty_cases(
 id uuid primary key default gen_random_uuid(),job_id uuid not null unique references kxra.team_jobs(id),
 org_id uuid not null,room_id uuid not null,requested_by uuid not null,
 cause text not null check(cause~'^[A-Z_]{1,80}$'),state text not null default 'OPEN' check(state in ('OPEN','ACKNOWLEDGED')),
 version integer not null default 1,created_at timestamptz not null default now(),acknowledged_at timestamptz,acknowledged_by uuid,
 foreign key(room_id,org_id) references kxra.team_rooms(id,org_id)
);
create index team_uncertainty_retention on kxra.team_uncertainty_cases(acknowledged_at,id) where state='ACKNOWLEDGED';
create index team_uncertainty_room on kxra.team_uncertainty_cases(room_id,state,created_at,id);
alter table kxra.team_uncertainty_cases enable row level security;
create policy team_uncertainty_cases_read on kxra.team_uncertainty_cases for select to authenticated
 using(org_id=kxra_private.member_org() and kxra_private.can_team_room(room_id) and (requested_by=auth.uid() or kxra_private.manages_team_room(room_id)));
revoke all on kxra.team_uncertainty_cases from public,anon,authenticated;
grant select on kxra.team_uncertainty_cases to authenticated;
create table kxra.team_maintenance_receipts(id uuid primary key,result jsonb not null default '{}'::jsonb,created_at timestamptz not null default now());
create index team_maintenance_receipts_age on kxra.team_maintenance_receipts(created_at,id);
create index team_worker_deliveries_age on kxra.team_worker_deliveries(created_at,id);
alter table kxra.team_maintenance_receipts enable row level security;
create policy team_maintenance_receipts_deny on kxra.team_maintenance_receipts for all to authenticated using(false) with check(false);
revoke all on kxra.team_maintenance_receipts from public,anon,authenticated;

create function kxra.team_uncertainty_acknowledge(r uuid,i uuid,expected integer) returns void
language plpgsql security definer set search_path='' as $$
declare item kxra.team_uncertainty_cases;at bigint;
begin
 if session_user<>'kxra_app' or not kxra_private.can_team_room(r,true) then raise insufficient_privilege;end if;
 at=(coalesce(current_setting('request.jwt.claims',true),'{}')::jsonb->>'auth_time')::bigint;
 if coalesce(auth.jwt()->>'aal','')<>'aal2' or at is null or at<extract(epoch from now())-600 or at>extract(epoch from now())+30 then raise insufficient_privilege;end if;
 select * into item from kxra.team_uncertainty_cases where id=i and room_id=r and org_id=kxra_private.member_org()
 and (requested_by=auth.uid() or kxra_private.manages_team_room(r));
 if not found then raise insufficient_privilege;end if;
 -- Match the reducer's job-before-case order. Never acquire an execution grant.
 perform 1 from kxra.team_jobs where id=item.job_id for update;
 select * into item from kxra.team_uncertainty_cases where id=i and room_id=r for update;
 if not found then raise insufficient_privilege;end if;
 if item.state='ACKNOWLEDGED' then return;end if;
 if item.version is distinct from expected then raise exception 'Recovery review changed';end if;
 -- Acknowledgment never changes the uncertain job/run state or starts another call.
 update kxra.team_uncertainty_cases set state='ACKNOWLEDGED',version=version+1,acknowledged_at=now(),acknowledged_by=auth.uid() where id=i;
 update kxra.team_jobs set uncertainty_acknowledged_at=now(),uncertainty_acknowledged_by=auth.uid() where id=item.job_id and state='UNCERTAIN';
 insert into kxra.audit_events(org_id,actor_id,action,resource_id,metadata) values(item.org_id,auth.uid(),'team.uncertainty_reviewed_no_retry',item.job_id,jsonb_build_object('case',i));
end $$;
revoke all on function kxra.team_uncertainty_acknowledge(uuid,uuid,integer) from public,anon;
grant execute on function kxra.team_uncertainty_acknowledge(uuid,uuid,integer) to authenticated;

-- Internal reducer: invoked only after the maintenance function locks a persisted grant.
create function kxra_private.team_reduce_grant(gid uuid,receipt uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare g kxra.team_execution_grants;j kxra.team_jobs;s kxra.team_schedules;
 valid boolean;reason text;uncertain boolean=false;cancelled integer=0;quarantined integer=0;reconciled integer=0;paused integer=0;opened integer=0;inserted integer=0;
 old_sub text=current_setting('request.jwt.claim.sub',true);old_claims text=current_setting('request.jwt.claims',true);
 old_org text=current_setting('request.kxra.org_id',true);old_host text=current_setting('request.kxra.hosted_room_jobs',true);old_grant text=current_setting('request.kxra.team_grant',true);
begin
 select * into g from kxra.team_execution_grants where id=gid;
 if not found then return '{}'::jsonb;end if;
 -- Stored scope only. This context exists solely for existing audit/fence functions;
 -- the explicit maintenance audit has actor_id NULL and records SYSTEM_REDUCER.
 perform set_config('request.jwt.claim.sub',g.requested_by::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',g.requested_by,'aal','aal2','auth_time',g.auth_time,'session_version',g.session_version)::text,true);
 perform set_config('request.kxra.org_id',g.org_id::text,true);
 perform set_config('request.kxra.hosted_room_jobs','on',true);
 perform set_config('request.kxra.team_grant',g.id::text,true);
 valid=kxra_private.team_execution_grant_active(g.id) and kxra_private.team_job_base_context_active(g.target_id)
 and kxra_private.team_worker_target(g.target_id);
 reason=case when g.revoked_at is not null then 'GRANT_REVOKED' when g.expires_at<=now() then 'GRANT_EXPIRED' else 'AUTHORITY_CHANGED' end;
 uncertain=exists(select 1 from kxra.team_jobs job where job.org_id=g.org_id and job.room_id=g.room_id and job.requested_by=g.requested_by
 and (job.id=g.target_id or exists(select 1 from kxra.team_schedule_occurrences o where o.schedule_id=g.target_id and o.job_id=job.id))
 and (job.state='UNCERTAIN' or (job.state='DISPATCHED' and job.lease_expires_at<=now())));
 if uncertain then if valid then reason='WORKER_OUTCOME_UNKNOWN';end if;valid=false;end if;

 for j in select job.* from kxra.team_jobs job where job.org_id=g.org_id and job.room_id=g.room_id and job.requested_by=g.requested_by
 and (job.id=g.target_id or exists(select 1 from kxra.team_schedule_occurrences occurrence where occurrence.schedule_id=g.target_id and occurrence.job_id=job.id))
 and job.state in ('QUEUED','LEASED','DISPATCHED','UNCERTAIN') order by job.id limit 21 for update of job skip locked loop
  if j.state='DISPATCHED' and (not valid or j.lease_expires_at<=now()) then
   update kxra.team_runs set status='CANCELLED',output='',error_code='WORKER_OUTCOME_UNKNOWN',finished_at=now() where id=j.run_id and status='RUNNING';
   update kxra.team_job_attempts set phase='UNCERTAIN',error_code='WORKER_OUTCOME_UNKNOWN',finished_at=now() where id=j.active_attempt;
   update kxra.team_jobs set state='UNCERTAIN',last_error='WORKER_OUTCOME_UNKNOWN',lease_token=null,lease_expires_at=null,finished_at=now(),updated_at=now(),version=version+1 where id=j.id;
   j.state='UNCERTAIN';quarantined=quarantined+1;
  elsif j.state in ('QUEUED','LEASED') and not valid then
   update kxra.team_job_attempts set phase='CANCELLED',error_code=reason,finished_at=now() where id=j.active_attempt and phase='LEASED';
   update kxra.team_jobs set state='CANCELLED',last_error=reason,lease_token=null,lease_expires_at=null,finished_at=now(),updated_at=now(),version=version+1 where id=j.id;
   cancelled=cancelled+1;
  elsif j.state='LEASED' and j.lease_expires_at<=now() then
   perform kxra_private.team_job_reconcile(j.id);reconciled=reconciled+1;
  end if;
  if j.state='UNCERTAIN' then
   uncertain=true;
   if j.uncertainty_acknowledged_at is null then
    insert into kxra.team_uncertainty_cases(job_id,org_id,room_id,requested_by,cause)
    values(j.id,j.org_id,j.room_id,j.requested_by,case when not valid then reason else 'WORKER_OUTCOME_UNKNOWN' end) on conflict(job_id) do nothing;
    get diagnostics inserted=row_count;opened=opened+inserted;
   end if;
  end if;
 end loop;
 if not valid or uncertain then
  update kxra.team_execution_grants set revoked_at=coalesce(revoked_at,now()) where id=g.id;
  select * into s from kxra.team_schedules where id=g.target_id for update;
  if found and s.state in ('ACTIVE','EXHAUSTED','DRAFT') then
   update kxra.team_schedules set state=case when s.expires_at<=now() then 'EXPIRED' else 'PAUSED' end,
    last_error=case when uncertain then 'WORKER_OUTCOME_UNKNOWN' else reason end,version=version+1 where id=s.id;
   -- Other pending children cannot run after an uncertain predecessor.
   perform kxra_private.team_schedule_cancel_children(s.id);paused=1;
  end if;
 end if;
 if cancelled+quarantined+reconciled+paused+opened>0 then
  insert into kxra.audit_events(org_id,actor_id,action,resource_id,metadata)
  values(g.org_id,null,'team.system_maintenance',g.target_id,jsonb_build_object('source','SYSTEM_REDUCER','receipt',receipt,'cancelled',cancelled,'quarantined',quarantined,'reconciled',reconciled,'paused',paused,'opened_cases',opened));
 end if;
 perform set_config('request.jwt.claim.sub',coalesce(old_sub,''),true);perform set_config('request.jwt.claims',coalesce(old_claims,''),true);
 perform set_config('request.kxra.org_id',coalesce(old_org,''),true);perform set_config('request.kxra.hosted_room_jobs',coalesce(old_host,''),true);perform set_config('request.kxra.team_grant',coalesce(old_grant,''),true);
 return jsonb_build_object('cancelled',cancelled,'quarantined',quarantined,'reconciled',reconciled,'paused',paused,'opened_cases',opened);
end $$;
revoke all on function kxra_private.team_reduce_grant(uuid,uuid) from public,anon,authenticated,kxra_app;

create function kxra_room_worker.maintain(request uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare g kxra.team_execution_grants;item jsonb;previous jsonb;summary jsonb='{}'::jsonb;scopes integer=0;busy integer=0;pruned integer=0;n integer;
begin
 if session_user<>'kxra_app' or current_setting('role')<>'none' or request is null then raise insufficient_privilege;end if;
 insert into kxra.team_maintenance_receipts(id) values(request) on conflict do nothing;
 if not found then select tick.result into previous from kxra.team_maintenance_receipts tick where id=request;return previous||jsonb_build_object('replayed',true);end if;
 for g in select grant_record.* from kxra.team_execution_grants grant_record
 where (grant_record.last_maintained_at is null or grant_record.last_maintained_at<=now()-interval '60 seconds')
 and (exists(select 1 from kxra.team_jobs job where job.org_id=grant_record.org_id and job.room_id=grant_record.room_id and job.requested_by=grant_record.requested_by
 and (job.id=grant_record.target_id or exists(select 1 from kxra.team_schedule_occurrences o where o.schedule_id=grant_record.target_id and o.job_id=job.id))
 and (job.state in ('QUEUED','LEASED','DISPATCHED') or (job.state='UNCERTAIN' and job.uncertainty_acknowledged_at is null and not exists(select 1 from kxra.team_uncertainty_cases c where c.job_id=job.id))))
 or exists(select 1 from kxra.team_schedules schedule where schedule.id=grant_record.target_id and schedule.state='ACTIVE'))
 order by case when grant_record.revoked_at is not null or grant_record.expires_at<=now()
 or not kxra_private.team_room_byok_allowed(grant_record.room_id,grant_record.connection_id)
 or exists(select 1 from kxra.account_identities identity where identity.account_id=grant_record.requested_by and (identity.state<>'ACTIVE' or identity.session_version<>grant_record.session_version))
 or exists(select 1 from kxra.organisation_memberships membership where membership.account_id=grant_record.requested_by and membership.org_id=grant_record.org_id
 and (membership.state<>'ACTIVE' or membership.revoked_at is not null or membership.version<>grant_record.membership_version))
 or exists(select 1 from kxra.team_jobs job where job.org_id=grant_record.org_id and job.room_id=grant_record.room_id and job.requested_by=grant_record.requested_by
 and (job.id=grant_record.target_id or exists(select 1 from kxra.team_schedule_occurrences o where o.schedule_id=grant_record.target_id and o.job_id=job.id))
 and (job.state='UNCERTAIN' or (job.state in ('LEASED','DISPATCHED') and job.lease_expires_at<=now()))) then 0 else 1 end,
 grant_record.last_maintained_at nulls first,grant_record.id limit 5 for update of grant_record skip locked loop
  if pg_try_advisory_xact_lock(hashtext(g.requested_by::text)) then
   item=kxra_private.team_reduce_grant(g.id,request);scopes=scopes+1;
   summary=jsonb_build_object('cancelled',coalesce((summary->>'cancelled')::integer,0)+coalesce((item->>'cancelled')::integer,0),
    'quarantined',coalesce((summary->>'quarantined')::integer,0)+coalesce((item->>'quarantined')::integer,0),
    'reconciled',coalesce((summary->>'reconciled')::integer,0)+coalesce((item->>'reconciled')::integer,0),
    'paused',coalesce((summary->>'paused')::integer,0)+coalesce((item->>'paused')::integer,0),
    'opened_cases',coalesce((summary->>'opened_cases')::integer,0)+coalesce((item->>'opened_cases')::integer,0));
   update kxra.team_execution_grants set last_maintained_at=now() where id=g.id;
  else
   -- A busy requester cannot monopolize the first five discovery positions.
   busy=busy+1;
   update kxra.team_execution_grants set last_maintained_at=now() where id=g.id;
  end if;
 end loop;
 -- Operational receipts only: never delete jobs, runs, attempts, grants or audit.
 with old as(select id from kxra.team_worker_deliveries where created_at<now()-interval '30 days' order by created_at,id limit 100 for update skip locked)
 delete from kxra.team_worker_deliveries where id in(select id from old);get diagnostics n=row_count;pruned=pruned+n;
 with old as(select id from kxra.team_maintenance_receipts where created_at<now()-interval '30 days' and id<>request order by created_at,id limit 100 for update skip locked)
 delete from kxra.team_maintenance_receipts where id in(select id from old);get diagnostics n=row_count;pruned=pruned+n;
 with old as(select id from kxra.team_uncertainty_cases where state='ACKNOWLEDGED' and acknowledged_at<now()-interval '30 days' order by acknowledged_at,id limit 100 for update skip locked)
 delete from kxra.team_uncertainty_cases where id in(select id from old);get diagnostics n=row_count;pruned=pruned+n;
 summary=summary||jsonb_build_object('replayed',false,'scopes',scopes,'busy_skipped',busy,'pruned',pruned,'completed_at',now());
 update kxra.team_maintenance_receipts set result=summary where id=request;
 return summary;
end $$;
revoke all on function kxra_room_worker.maintain(uuid) from public,anon,authenticated;
grant execute on function kxra_room_worker.maintain(uuid) to kxra_app;

create function kxra_room_worker.health() returns jsonb
language plpgsql security definer set search_path='' as $$
declare last_tick timestamptz;due_count integer;stale_count integer;open_count integer;age integer;oldest_due timestamptz;retention_due integer;
begin
 if session_user<>'kxra_app' or current_setting('role')<>'none' then raise insufficient_privilege;end if;
 select max(created_at) into last_tick from kxra.team_maintenance_receipts where result ? 'completed_at';
 select count(*),min(job.available_at) into due_count,oldest_due from kxra.team_jobs job where job.state='QUEUED' and job.available_at<=now()
 and exists(select 1 from kxra.team_execution_grants g where g.org_id=job.org_id and g.room_id=job.room_id and g.requested_by=job.requested_by
 and (g.target_id=job.id or exists(select 1 from kxra.team_schedule_occurrences o where o.job_id=job.id and o.schedule_id=g.target_id)));
 select count(*) into stale_count from kxra.team_jobs where state in ('LEASED','DISPATCHED') and lease_expires_at<=now();
 select count(*) into open_count from kxra.team_uncertainty_cases where state='OPEN';
 select (select count(*) from kxra.team_worker_deliveries where created_at<now()-interval '30 days')+(select count(*) from kxra.team_maintenance_receipts where created_at<now()-interval '30 days')+(select count(*) from kxra.team_uncertainty_cases where state='ACKNOWLEDGED' and acknowledged_at<now()-interval '30 days') into retention_due;
 age=case when last_tick is null then null else greatest(0,extract(epoch from now()-last_tick)::integer) end;
 return jsonb_build_object('status',case when age is null or age>180 then 'STALE' when open_count>0 or stale_count>0 or retention_due>0 then 'ATTENTION' when oldest_due<now()-interval '10 minutes' then 'BACKLOG' else 'OK' end,
 'maintenance_age_seconds',age,'queued_due',due_count,'oldest_due_seconds',case when oldest_due is null then null else greatest(0,extract(epoch from now()-oldest_due)::integer) end,'retention_due',retention_due,'expired_leases',stale_count,'open_uncertain',open_count,'receipt_retention_days',30);
end $$;
revoke all on function kxra_room_worker.health() from public,anon,authenticated;
grant execute on function kxra_room_worker.health() to kxra_app;

-- Only the latest genuinely due local day enters discovery; future schedules do
-- not consume executable scope selections. DST rules match the existing tick.
create function kxra_private.team_schedule_due(i uuid) returns boolean
language sql stable security definer set search_path='' as $$
 with definition as(select s.*,(now() at time zone s.timezone)::date today from kxra.team_schedules s where s.id=i and s.state='ACTIVE' and s.expires_at>now()),
 current_day as(select definition.*,kxra_private.team_wall_instant(today,wall_time,timezone) instant from definition),
 latest as(select current_day.*,case when instant>now() or (instant is null and (now() at time zone timezone)::time<wall_time) then today-1 else today end due_day from current_day)
 select exists(select 1 from latest where due_day>=starts_on and (last_local_day is null or due_day>last_local_day))
$$;
revoke all on function kxra_private.team_schedule_due(uuid) from public,anon,authenticated,kxra_app;
create or replace function kxra_room_worker.next(request uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare g kxra.team_execution_grants; result jsonb;
begin
 if session_user<>'kxra_app' or current_setting('role')<>'none' or request is null then raise insufficient_privilege;end if;
 perform kxra_room_worker.maintain(request);
 insert into kxra.team_worker_deliveries(id) values(request) on conflict do nothing;
 if not found then return null;end if;
 select grant_record.* into g from kxra.team_execution_grants grant_record
 where grant_record.revoked_at is null and grant_record.expires_at>now()
 and kxra_private.team_room_byok_allowed(grant_record.room_id,grant_record.connection_id)
 and (grant_record.last_delivered_at is null or grant_record.last_delivered_at<now()-interval '60 seconds')
 and (exists(select 1 from kxra.team_jobs j where (j.id=grant_record.target_id or exists(
 select 1 from kxra.team_schedule_occurrences o where o.schedule_id=grant_record.target_id and o.job_id=j.id))
 and j.state in ('QUEUED','LEASED','DISPATCHED') and j.available_at<=now())
 or kxra_private.team_schedule_due(grant_record.target_id))
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
create or replace function kxra.team_job_dispatch(i uuid,token uuid,digest text) returns jsonb language plpgsql security definer set search_path='' as $$
declare j kxra.team_jobs;connection jsonb;rollout kxra.team_room_rollouts;
begin
 if session_user<>'kxra_app' then raise insufficient_privilege;end if;
 select * into j from kxra.team_jobs where id=i and requested_by=auth.uid() and org_id=kxra_private.member_org() for update;
 if not found then raise insufficient_privilege;end if;
 if j.state<>'LEASED' or j.lease_token is distinct from token then return null;end if;
 if j.lease_expires_at<=now() then perform kxra_private.team_job_reconcile(i);return null;end if;
 if not kxra_private.team_job_context_active(i) or digest is distinct from j.context_sha256 then
  perform kxra.team_job_release(i,token,case when digest is distinct from j.context_sha256 then 'CONTEXT_CHANGED' else 'ACCESS_CHANGED' end);return null;
 end if;
 select rollout_row.* into rollout from kxra.team_room_rollouts rollout_row where rollout_row.room_id=j.room_id
 and rollout_row.revoked_at is null and rollout_row.starts_at<=now() and rollout_row.expires_at>now() for update;
 if found and exists(select 1 from kxra.team_agents a join kxra.team_connections c on c.id=a.connection_id where a.id=j.agent_id and c.provider<>'FIXTURE')
 and (select count(*) from kxra.team_runs run where run.room_id=j.room_id and run.created_at>=greatest(rollout.starts_at,now()-interval '24 hours'))>=rollout.max_daily_dispatches then
  perform kxra.team_job_release(i,token,'CAPACITY');return null;
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
grant select(uncertainty_acknowledged_at,uncertainty_acknowledged_by) on kxra.team_jobs to authenticated;

-- The general org audit policy must not become a private-room discovery bypass.
-- This restrictive policy narrows only the six room-operation actions introduced
-- by these proposals; other existing audit visibility remains unchanged.
create function kxra_private.team_operation_audit_visible(kind text,target uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select case when kind in ('team.customer_byok_consented','team.customer_byok_revoked') then kxra_private.can_team_room(target)
 else exists(select 1 from kxra.team_jobs job where job.id=target and job.org_id=kxra_private.member_org() and kxra_private.can_team_room(job.room_id)) end
$$;
revoke all on function kxra_private.team_operation_audit_visible(text,uuid) from public,anon;
grant execute on function kxra_private.team_operation_audit_visible(text,uuid) to authenticated;
create policy team_operation_audit_scope on kxra.audit_events as restrictive for select to authenticated
 using(action not in ('team.execution_authorized','team.execution_revoked','team.customer_byok_consented','team.customer_byok_revoked','team.uncertainty_reviewed_no_retry','team.system_maintenance')
 or kxra_private.team_operation_audit_visible(action,resource_id));
