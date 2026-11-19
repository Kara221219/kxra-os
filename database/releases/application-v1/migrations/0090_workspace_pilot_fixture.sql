-- Opt-in local FIXTURE lifecycle only. No assignment, provider objects or charges.
create function kxra_private.pilot_offer_v1() returns jsonb language sql immutable set search_path='' as $$
 select '{"offer_key":"WORKSPACE_PILOT_V1","version":1,"currency":"GBP","monthly_amount_minor":4900,"people":5,"setup_amount_minor":19900,"tax_behavior":"UNSPECIFIED","provider_costs":"CUSTOMER_PAID","live_charges":false}'::jsonb
$$;
revoke all on function kxra_private.pilot_offer_v1() from public,anon,authenticated;
create table kxra.workspace_pilots(
 org_id uuid primary key references kxra.organisations(id),mode text not null default 'FIXTURE' check(mode='FIXTURE'),
 offer_key text not null default 'WORKSPACE_PILOT_V1' check(offer_key='WORKSPACE_PILOT_V1'),offer_version integer not null default 1 check(offer_version=1),
 state text not null check(state in ('ACTIVE','PAST_DUE','PAUSED','CANCELLED')),
 period_start timestamptz not null,period_end timestamptz not null, cancel_at_period_end boolean not null default false,
 version integer not null default 1,updated_at timestamptz not null default now(),check(period_end>period_start)
);
create table kxra.workspace_pilot_events(
 id uuid primary key,org_id uuid not null references kxra.organisations(id),actor_id uuid not null references kxra.account_identities(account_id),
 action text not null check(action in ('ACTIVATE','RENEW','PAST_DUE','RECOVER','PAUSE','RESUME','CANCEL_AT_END','CANCEL_NOW','RECONCILE')),
 expected_version integer not null,receipt jsonb not null,created_at timestamptz not null default now()
);
alter table kxra.workspace_pilots enable row level security;
alter table kxra.workspace_pilot_events enable row level security;
create policy workspace_pilots_read on kxra.workspace_pilots for select to authenticated using(org_id=kxra_private.member_org() and kxra_private.is_owner(org_id));
create policy workspace_pilot_events_read on kxra.workspace_pilot_events for select to authenticated using(org_id=kxra_private.member_org() and kxra_private.is_owner(org_id));
revoke all on kxra.workspace_pilots,kxra.workspace_pilot_events from public,anon,authenticated;
grant select on kxra.workspace_pilots,kxra.workspace_pilot_events to authenticated;
create index workspace_pilot_events_org on kxra.workspace_pilot_events(org_id,created_at desc,id desc);
create function kxra_private.pilot_access_at(s text,ending timestamptz,at_time timestamptz) returns boolean language sql immutable set search_path='' as $$
 select coalesce(s='ACTIVE' and ending>at_time,false)
$$;
create function kxra_private.pilot_entitled(o uuid) returns boolean language sql volatile security definer set search_path='' as $$
 select not exists(select 1 from kxra.workspace_pilots where org_id=o) or exists(select 1 from kxra.workspace_pilots p where p.org_id=o and kxra_private.pilot_access_at(p.state,p.period_end,now()))
$$;
-- Projected membership/invitation union: acceptance replaces a held email seat,
-- repeated invitations for one email reserve once; existing people never count twice.
create function kxra_private.pilot_seats(o uuid,skip_member uuid default null,extra_account uuid default null,skip_invite uuid default null,extra_email text default null) returns integer
language sql volatile security definer set search_path='' as $$
 with people as(
 select m.account_id,a.email_digest from kxra.organisation_memberships m join kxra.account_identities a on a.account_id=m.account_id
 where m.org_id=o and (skip_member is null or m.id<>skip_member) and m.state in ('ACTIVE','INVITED') and m.revoked_at is null and (m.expires_at is null or m.expires_at>now())
 union select a.account_id,a.email_digest from kxra.account_identities a where a.account_id=extra_account),
 held as(select i.email_digest from kxra.invitations i where i.org_id=o and i.state in ('PENDING','SENT','DELIVERY_FAILED') and i.expires_at>now() and (skip_invite is null or i.id<>skip_invite)
 union select extra_email where extra_email is not null)
 select ((select count(*) from people)+(select count(*) from held where not exists(select 1 from people p where p.email_digest=held.email_digest)))::integer
$$;
revoke all on function kxra_private.pilot_access_at(text,timestamptz,timestamptz) from public,anon;
grant execute on function kxra_private.pilot_access_at(text,timestamptz,timestamptz) to authenticated;
revoke all on function kxra_private.pilot_seats(uuid,uuid,uuid,uuid,text),kxra_private.pilot_entitled(uuid) from public,anon,authenticated;
create function kxra_private.pilot_status() returns jsonb language sql volatile security definer set search_path='' as $$
 select case when kxra_private.is_owner(kxra_private.member_org()) then jsonb_build_object(
 'offer',kxra_private.pilot_offer_v1(),
 'subscription',(select to_jsonb(p) from kxra.workspace_pilots p where p.org_id=kxra_private.member_org()),
 'seats_reserved',kxra_private.pilot_seats(kxra_private.member_org()),'entitled',kxra_private.pilot_entitled(kxra_private.member_org()),'assigned',exists(select 1 from kxra.workspace_pilots where org_id=kxra_private.member_org())) else null end
$$;
revoke all on function kxra_private.pilot_status() from public,anon;
grant execute on function kxra_private.pilot_status() to authenticated;
create function kxra.workspace_pilot_event(i uuid,expected integer,kind text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare o uuid=kxra_private.member_org();p kxra.workspace_pilots;e kxra.workspace_pilot_events;receipt jsonb;
begin
 if session_user<>'kxra_app' or not kxra_private.mfa_owner(o) or current_setting('request.kxra.execution_mode',true) is distinct from 'fixture' then raise insufficient_privilege;end if;
 perform pg_advisory_xact_lock(hashtext('pilot:'||o::text));
 select * into e from kxra.workspace_pilot_events where id=i;
 if found then
  if e.org_id<>o or e.actor_id<>auth.uid() or e.action is distinct from kind or e.expected_version is distinct from expected then raise exception 'Pilot event replay conflict';end if;return e.receipt;
 end if;
 if i is null or expected is null or kind is null or kind not in ('ACTIVATE','RENEW','PAST_DUE','RECOVER','PAUSE','RESUME','CANCEL_AT_END','CANCEL_NOW','RECONCILE') then raise exception 'Invalid fixture billing event';end if;
 select * into p from kxra.workspace_pilots where org_id=o for update;
 if not found then
  if kind<>'ACTIVATE' or expected<>0 then raise exception 'Pilot unassigned';end if;
  if kxra_private.pilot_seats(o)>5 then raise exception 'Five-person capacity exceeded by existing people or held invitations';end if;
  insert into kxra.workspace_pilots(org_id,state,period_start,period_end) values(o,'ACTIVE',now(),now()+interval '1 month');
 else
  if p.version<>expected then raise exception 'Pilot changed';end if;
  if kind='ACTIVATE' and p.state<>'CANCELLED' or kind='RENEW' and (p.state<>'ACTIVE' or p.cancel_at_period_end)
   or kind='RECOVER' and p.state<>'PAST_DUE' or kind='PAUSE' and p.state<>'ACTIVE' or kind='RESUME' and (p.state<>'PAUSED' or p.period_end<=now())
   or kind in ('PAST_DUE','CANCEL_AT_END') and p.state<>'ACTIVE' then raise exception 'Pilot transition unavailable';end if;
  if kind in ('ACTIVATE','RECOVER','RESUME') and kxra_private.pilot_seats(o)>5 then raise exception 'Five-person capacity exceeded';end if;
  update kxra.workspace_pilots set state=case when kind in ('ACTIVATE','RECOVER','RESUME') then 'ACTIVE' when kind='PAUSE' then 'PAUSED'
   when kind='PAST_DUE' then 'PAST_DUE' when kind='CANCEL_NOW' then 'CANCELLED'
   when kind='RECONCILE' and state='ACTIVE' and period_end<=now() then case when cancel_at_period_end then 'CANCELLED' else 'PAST_DUE' end else state end,
   period_start=case when kind in ('ACTIVATE','RECOVER') then now() else period_start end,
   period_end=case when kind in ('ACTIVATE','RECOVER') then now()+interval '1 month' when kind='RENEW' then greatest(period_end,now())+interval '1 month' else period_end end,
   cancel_at_period_end=case when kind='CANCEL_AT_END' then true when kind in ('ACTIVATE','RECOVER','CANCEL_NOW') then false else cancel_at_period_end end,
   version=version+1,updated_at=now() where org_id=o;
 end if;
 receipt=kxra_private.pilot_status();
 insert into kxra.workspace_pilot_events(id,org_id,actor_id,action,expected_version,receipt) values(i,o,auth.uid(),kind,expected,receipt);
 insert into kxra.audit_events(org_id,actor_id,action,resource_id,metadata) values(o,auth.uid(),'pilot.fixture_event',o,jsonb_build_object('event',i,'kind',kind));
 return receipt;
end $$;
revoke all on function kxra.workspace_pilot_event(uuid,integer,text) from public,anon;
grant execute on function kxra.workspace_pilot_event(uuid,integer,text) to authenticated;
create function kxra_private.guard_pilot_seats() returns trigger language plpgsql security definer set search_path='' as $$
declare before_count integer;after_count integer;account uuid;email text;
begin
 if not exists(select 1 from kxra.workspace_pilots where org_id=new.org_id) then return new;end if;
 perform pg_advisory_xact_lock(hashtext('pilot:'||new.org_id::text));
 before_count=kxra_private.pilot_seats(new.org_id);
 if tg_table_name='organisation_memberships' then
  account=case when new.state in ('ACTIVE','INVITED') and new.revoked_at is null and (new.expires_at is null or new.expires_at>now()) then new.account_id else null end;
  after_count=kxra_private.pilot_seats(new.org_id,new.id,account,null,null);
 else
  email=case when new.state in ('PENDING','SENT','DELIVERY_FAILED') and new.expires_at>now() then new.email_digest else null end;
  after_count=kxra_private.pilot_seats(new.org_id,null,null,new.id,email);
 end if;
 if after_count>5 and after_count>before_count then raise exception 'Pilot seat admission unavailable';end if;
 if not kxra_private.pilot_entitled(new.org_id) then
  if tg_table_name='organisation_memberships' and new.state='ACTIVE' and (tg_op='INSERT' or old.state<>'ACTIVE' or (old.expires_at is not null and old.expires_at<=now())) then raise exception 'Pilot seat admission unavailable';end if;
  if tg_table_name='invitations' and new.state in ('PENDING','SENT','DELIVERY_FAILED') and new.expires_at>now() and (tg_op='INSERT' or old.state not in ('PENDING','SENT','DELIVERY_FAILED') or new.expires_at>old.expires_at) then raise exception 'Pilot seat admission unavailable';end if;
  if after_count>before_count then raise exception 'Pilot seat admission unavailable';end if;
 end if;
 return new;
end $$;
revoke all on function kxra_private.guard_pilot_seats() from public,anon,authenticated;
create trigger pilot_membership_seats before insert or update on kxra.organisation_memberships for each row execute function kxra_private.guard_pilot_seats();
create trigger pilot_invitation_seats before insert or update on kxra.invitations for each row execute function kxra_private.guard_pilot_seats();
create function kxra_private.guard_pilot_work() returns trigger language plpgsql security definer set search_path='' as $$
declare o uuid;
begin
 if tg_table_name in ('team_runs','team_agents','team_messages','team_items') then select org_id into o from kxra.team_rooms where id=new.room_id;else o=new.org_id;end if;
 perform pg_advisory_xact_lock(hashtext('pilot:'||o::text));
 if not kxra_private.pilot_entitled(o) then
  if tg_op='UPDATE' and tg_table_name='team_runs' then new.status='CANCELLED';new.output='';new.error_code='PILOT_INACTIVE';new.finished_at=now();return new;end if;
  raise exception 'Pilot work admission unavailable';
 end if;return new;
end $$;
revoke all on function kxra_private.guard_pilot_work() from public,anon,authenticated;
create trigger pilot_job_admission before insert on kxra.team_jobs for each row execute function kxra_private.guard_pilot_work();
create trigger pilot_run_admission before insert on kxra.team_runs for each row execute function kxra_private.guard_pilot_work();
create trigger pilot_run_publication before update on kxra.team_runs for each row when(old.status='RUNNING' and new.status='SUCCEEDED') execute function kxra_private.guard_pilot_work();
create trigger pilot_workflow_admission before insert on kxra.team_workflow_records for each row execute function kxra_private.guard_pilot_work();
create trigger pilot_conversion_admission before insert on kxra.team_workflow_actions for each row execute function kxra_private.guard_pilot_work();
create or replace function kxra_private.team_job_context_active(i uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select kxra_private.team_job_base_context_active(i) and exists(select 1 from kxra.team_jobs j where j.id=i and kxra_private.pilot_entitled(j.org_id)) and not exists(
 select 1 from kxra.team_schedule_occurrences o join kxra.team_schedules s on s.id=o.schedule_id
 where o.job_id=i and (s.state not in ('ACTIVE','EXHAUSTED') or s.expires_at<=now() or not kxra_private.team_job_base_context_active(s.id)))
$$;

-- Existing schedule review/tick uses this same authoritative admission predicate.
create or replace function kxra_private.team_job_base_context_active(i uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from kxra.team_jobs j join kxra.account_identities identity on identity.account_id=j.requested_by
  join kxra.team_agents agent on agent.id=j.agent_id and agent.room_id=j.room_id
  join kxra.team_connections connection on connection.id=agent.connection_id
  where j.id=i and j.requested_by=auth.uid() and j.org_id=kxra_private.member_org() and kxra_private.pilot_entitled(j.org_id)
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

create trigger pilot_room_admission before insert on kxra.team_rooms for each row execute function kxra_private.guard_pilot_work();
create trigger pilot_agent_admission before insert on kxra.team_agents for each row execute function kxra_private.guard_pilot_work();
create trigger pilot_message_admission before insert on kxra.team_messages for each row execute function kxra_private.guard_pilot_work();
create trigger pilot_task_admission before insert on kxra.team_items for each row execute function kxra_private.guard_pilot_work();
create trigger pilot_lead_edit before update on kxra.team_workflow_records for each row execute function kxra_private.guard_pilot_work();

create index pilot_active_memberships on kxra.organisation_memberships(org_id,account_id) where state in ('ACTIVE','INVITED') and revoked_at is null;
create index pilot_held_invitations on kxra.invitations(org_id,email_digest,expires_at) where state in ('PENDING','SENT','DELIVERY_FAILED');

create function kxra_private.guard_pilot_identity() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_table_name='workspace_pilot_events' then raise exception 'Pilot event receipt is immutable';end if;
 if (new.org_id,new.mode,new.offer_key,new.offer_version) is distinct from (old.org_id,old.mode,old.offer_key,old.offer_version) then raise exception 'Pilot offer identity is immutable';end if;
 return new;
end $$;
revoke all on function kxra_private.guard_pilot_identity() from public,anon,authenticated;
create trigger pilot_identity_guard before update on kxra.workspace_pilots for each row execute function kxra_private.guard_pilot_identity();
create trigger pilot_event_immutable before update or delete on kxra.workspace_pilot_events for each row execute function kxra_private.guard_pilot_identity();

-- Point lookup first: never scan/authorise unrelated runs for a reserved run ID.
-- Retains both current room and original provenance-aware run checks.
create or replace function kxra_private.team_job_run(i uuid) returns uuid
language plpgsql stable security definer set search_path='' as $$
declare candidate uuid;r uuid;
begin
 select run_id,room_id into candidate,r from kxra.team_jobs where id=i;
 if not found or not kxra_private.can_team_room(r) then return null;end if;
 if not exists(select 1 from kxra.team_runs where id=candidate) then return null;end if;
 if not kxra_private.can_team_run(candidate) then return null;end if;
 return candidate;
end $$;
