-- Generated fixture credentials only; no hosted identity, provider or installation.
create table kxra.paired_agents(
 id uuid primary key,org_id uuid not null,room_id uuid not null,owner_id uuid not null references kxra.account_identities(account_id),
 name text not null check(length(trim(name)) between 1 and 80),created_at timestamptz not null default now(),
 foreign key(room_id,org_id) references kxra.team_rooms(id,org_id)
);
create table kxra_private.paired_invitations(
 id uuid primary key,agent_id uuid not null references kxra.paired_agents(id),secret_hash text not null unique check(secret_hash~'^[a-f0-9]{64}$'),
 session_version integer not null,expires_at timestamptz not null,consumed boolean not null default false
);
create table kxra_private.paired_sessions(
 id uuid primary key,agent_id uuid not null references kxra.paired_agents(id),secret_hash text not null unique check(secret_hash~'^[a-f0-9]{64}$'),
 session_version integer not null,expires_at timestamptz not null,revoked boolean not null default false,last_seen timestamptz not null default clock_timestamp()
);
create table kxra.paired_tasks(
 id uuid primary key,agent_id uuid not null references kxra.paired_agents(id),room_id uuid not null,org_id uuid not null,
 owner_id uuid not null references kxra.account_identities(account_id),session_version integer not null,
 objective text not null check(length(trim(objective)) between 1 and 2000),thread_id uuid not null,
 sources jsonb not null,content_hash text not null,expires_at timestamptz not null,
 state text not null default 'PROPOSED' check(state in ('PROPOSED','APPROVED','LEASED','RUNNING','DONE','CANCELLED','UNCERTAIN')),
 reviewed_hash text,session_id uuid references kxra_private.paired_sessions(id),poll_id uuid,fence uuid,lease_until timestamptz,
 result_hash text,result_message_id uuid,created_at timestamptz not null default clock_timestamp(),
 foreign key(room_id,org_id) references kxra.team_rooms(id,org_id),foreign key(thread_id,room_id) references kxra.team_messages(id,room_id),
 foreign key(result_message_id,room_id) references kxra.team_messages(id,room_id),unique(session_id,poll_id)
);
create index paired_tasks_agent on kxra.paired_tasks(agent_id,created_at,id);
alter table kxra.paired_agents enable row level security;
alter table kxra.paired_tasks enable row level security;
alter table kxra_private.paired_invitations enable row level security;
alter table kxra_private.paired_sessions enable row level security;
create policy paired_agents_read on kxra.paired_agents for select to authenticated using(owner_id=auth.uid() and org_id=kxra_private.member_org() and kxra_private.can_team_room(room_id));
create policy paired_tasks_read on kxra.paired_tasks for select to authenticated using(owner_id=auth.uid() and org_id=kxra_private.member_org() and kxra_private.can_team_room(room_id));
create policy paired_invitation_deny on kxra_private.paired_invitations for select to authenticated using(false);
create policy paired_session_deny on kxra_private.paired_sessions for select to authenticated using(false);
revoke all on kxra.paired_agents,kxra.paired_tasks,kxra_private.paired_invitations,kxra_private.paired_sessions from public,anon,authenticated;
grant select on kxra.paired_agents to authenticated;
grant select(id,agent_id,room_id,org_id,owner_id,objective,thread_id,content_hash,expires_at,state,result_message_id,created_at) on kxra.paired_tasks to authenticated;

create function kxra_private.paired_actor(r uuid) returns integer language plpgsql security definer set search_path='' as $$
declare sv integer;
begin
 if current_setting('request.kxra.execution_mode',true) is distinct from 'fixture' then raise insufficient_privilege;end if;
 sv=kxra_private.bridge_actor(r);
 if not kxra_private.is_owner(kxra_private.member_org()) then raise insufficient_privilege;end if;
 return sv;
end $$;
create function kxra_private.paired_sources(r uuid,ids uuid[]) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'body',m.body,'thread',coalesce(m.parent_id,m.id)) order by s.n),'[]'::jsonb)
 from unnest(ids) with ordinality s(id,n) join kxra.team_messages m on m.id=s.id and m.room_id=r
$$;
create function kxra_private.paired_current(i uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare t kxra.paired_tasks;ids uuid[];
begin
 select * into t from kxra.paired_tasks where id=i;
 if not found or t.owner_id<>auth.uid() or t.org_id<>kxra_private.member_org() then raise insufficient_privilege;end if;
 if kxra_private.paired_actor(t.room_id)<>t.session_version then return false;end if;
 perform kxra_private.bridge_paid(t.org_id);
 select array_agg((s.value->>'id')::uuid order by s.n) into ids from jsonb_array_elements(t.sources) with ordinality s(value,n);
 perform 1 from kxra.team_messages where room_id=t.room_id and id=any(ids) for share;
 return t.expires_at>clock_timestamp() and t.sources=kxra_private.paired_sources(t.room_id,ids);
end $$;

create function kxra.paired_control(op text,v jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare r uuid=(v->>'room_id')::uuid;sv integer;a kxra.paired_agents;t kxra.paired_tasks;ids uuid[];src jsonb;thread uuid;h text;aid uuid=(v->>'agent_id')::uuid;
begin
 sv=kxra_private.paired_actor(r);
 perform kxra_private.bridge_paid(kxra_private.member_org());
 if not kxra_private.mfa_owner(kxra_private.member_org()) then raise insufficient_privilege;end if;
 perform pg_advisory_xact_lock(hashtext('paired:'||r::text));
 if op='LIST' then
  return jsonb_build_object('agents',coalesce((select jsonb_agg(to_jsonb(p)||jsonb_build_object('presence',case
   when exists(select 1 from kxra_private.paired_sessions s where s.agent_id=p.id and not s.revoked and s.expires_at>clock_timestamp() and s.last_seen>clock_timestamp()-interval '30 seconds') then 'ONLINE'
   when exists(select 1 from kxra_private.paired_sessions s where s.agent_id=p.id and not s.revoked and s.expires_at>clock_timestamp()) then 'OFFLINE'
   when exists(select 1 from kxra_private.paired_sessions s where s.agent_id=p.id) then 'REVOKED_OR_EXPIRED' else 'UNPAIRED' end))
   from kxra.paired_agents p where p.room_id=r and p.owner_id=auth.uid()),'[]'::jsonb),
   'tasks',coalesce((select jsonb_agg(jsonb_build_object('id',q.id,'agent_id',q.agent_id,'objective',q.objective,'content_hash',q.content_hash,'thread_id',q.thread_id,
    'state',case when q.state in ('LEASED','RUNNING') and q.lease_until<=clock_timestamp() then 'UNCERTAIN' else q.state end,'result_message_id',q.result_message_id))
    from(select * from kxra.paired_tasks where room_id=r and owner_id=auth.uid() order by created_at desc limit 100)q),'[]'::jsonb));
 end if;
 if op='CREATE' then
  if (select count(*) from kxra.paired_agents where owner_id=auth.uid())>=10 then raise exception 'Paired agent capacity';end if;
  insert into kxra.paired_agents(id,org_id,room_id,owner_id,name) values(aid,kxra_private.member_org(),r,auth.uid(),v->>'name');return jsonb_build_object('agent_id',aid);
 end if;
 select * into a from kxra.paired_agents where id=aid and room_id=r and owner_id=auth.uid() and org_id=kxra_private.member_org() for update;
 if not found then raise insufficient_privilege;end if;
 if op='INVITE' then
  update kxra_private.paired_invitations set consumed=true where agent_id=aid;
  insert into kxra_private.paired_invitations(id,agent_id,secret_hash,session_version,expires_at) values((v->>'request_id')::uuid,aid,v->>'secret_hash',sv,clock_timestamp()+interval '2 minutes');
  return jsonb_build_object('expires_in_seconds',120);
 elsif op='REVOKE' then
  update kxra_private.paired_invitations set consumed=true where agent_id=aid;
  update kxra_private.paired_sessions set revoked=true where agent_id=aid;
  update kxra.paired_tasks set state='CANCELLED' where agent_id=aid and state in ('PROPOSED','APPROVED','LEASED','RUNNING');
  return jsonb_build_object('revoked',true);
 elsif op='PROPOSE' then
  if (select count(*) from kxra.paired_tasks where agent_id=aid and state in ('PROPOSED','APPROVED','LEASED','RUNNING'))>=20 then raise exception 'Paired task capacity';end if;
  select array_agg(value::uuid) into ids from jsonb_array_elements_text(v->'message_ids');
  if cardinality(ids) is null or cardinality(ids) not between 1 and 10 or cardinality(ids)<>(select count(distinct x) from unnest(ids)x) then raise exception 'Invalid sources';end if;
  perform 1 from kxra.team_messages where room_id=r and id=any(ids) for share;
  src=kxra_private.paired_sources(r,ids);thread=(src->0->>'thread')::uuid;
  if jsonb_array_length(src)<>cardinality(ids) or exists(select 1 from jsonb_array_elements(src)x where (x->>'thread')::uuid<>thread) or octet_length(src::text)>24000 then raise exception 'Source scope unavailable';end if;
  h=encode(sha256(convert_to(jsonb_build_object('agent',aid,'owner',auth.uid(),'org',a.org_id,'room',r,'thread',thread,'objective',v->>'objective','sources',src,'session_version',sv)::text,'UTF8')),'hex');
  insert into kxra.paired_tasks(id,agent_id,room_id,org_id,owner_id,session_version,objective,thread_id,sources,content_hash,expires_at)
   values((v->>'request_id')::uuid,aid,r,a.org_id,auth.uid(),sv,v->>'objective',thread,src,h,clock_timestamp()+interval '10 minutes');
  return jsonb_build_object('content_hash',h);
 elsif op in ('APPROVE','CANCEL','VIEW') then
  select * into t from kxra.paired_tasks where id=(v->>'task_id')::uuid and agent_id=aid for update;
  if not found then raise insufficient_privilege;end if;
  if op='VIEW' then
   if not kxra_private.paired_current(t.id) then raise exception 'Current sources required';end if;
   return jsonb_build_object('objective',t.objective,'sources',t.sources,'content_hash',t.content_hash,'thread_id',t.thread_id);
  end if;
  if op='CANCEL' and t.state in ('PROPOSED','APPROVED','LEASED','RUNNING') then update kxra.paired_tasks set state='CANCELLED' where id=t.id;
  elsif op='APPROVE' and t.state='PROPOSED' and t.content_hash=v->>'content_hash' and kxra_private.paired_current(t.id) then
   update kxra.paired_tasks set state='APPROVED',reviewed_hash=content_hash where id=t.id;
  else raise exception 'Exact current review required';end if;
  return jsonb_build_object('saved',true);
 end if;
 raise exception 'Unknown paired operation';
end $$;

-- Server-only hashed-credential identity lookup; does not mint a cookie or JWT.
create function kxra_private.paired_resolve(h text,kind text) returns table(owner_id uuid,org_id uuid,session_version integer)
language plpgsql security definer set search_path='' as $$
begin
 if session_user<>'kxra_app' or current_setting('request.kxra.execution_mode',true) is distinct from 'fixture' or h is null or h!~'^[a-f0-9]{64}$' then raise insufficient_privilege;end if;
 if kind='INVITATION' then
  return query select a.owner_id,a.org_id,i.session_version from kxra_private.paired_invitations i join kxra.paired_agents a on a.id=i.agent_id
   join kxra.account_identities u on u.account_id=a.owner_id and u.state='ACTIVE' and u.session_version=i.session_version where i.secret_hash=h and not i.consumed and i.expires_at>clock_timestamp();
 elsif kind='SESSION' then
  return query select a.owner_id,a.org_id,s.session_version from kxra_private.paired_sessions s join kxra.paired_agents a on a.id=s.agent_id
   join kxra.account_identities u on u.account_id=a.owner_id and u.state='ACTIVE' and u.session_version=s.session_version where s.secret_hash=h and not s.revoked and s.expires_at>clock_timestamp();
 end if;
end $$;

create function kxra.paired_device(h text,op text,v jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare a kxra.paired_agents;s kxra_private.paired_sessions;i kxra_private.paired_invitations;t kxra.paired_tasks;sv integer;body text;mid uuid;rh text;picked boolean=false;
begin
 if session_user<>'kxra_app' or current_setting('request.kxra.execution_mode',true) is distinct from 'fixture' then raise insufficient_privilege;end if;
 if op='REDEEM' then
  select * into i from kxra_private.paired_invitations where secret_hash=h;
  if not found then raise insufficient_privilege;end if;
  select * into a from kxra.paired_agents where id=i.agent_id;
 else
  select * into s from kxra_private.paired_sessions where secret_hash=h;
  if not found then raise insufficient_privilege;end if;
  select * into a from kxra.paired_agents where id=s.agent_id;
 end if;
 if a.owner_id<>auth.uid() or a.org_id<>kxra_private.member_org() then raise insufficient_privilege;end if;
 sv=kxra_private.paired_actor(a.room_id);perform kxra_private.bridge_paid(a.org_id);
 perform pg_advisory_xact_lock(hashtext('paired:'||a.room_id::text));
 if op='REDEEM' then
  select * into i from kxra_private.paired_invitations where id=i.id for update;
  if i.consumed or i.expires_at<=clock_timestamp() or i.session_version<>sv then raise insufficient_privilege;end if;
  update kxra_private.paired_invitations set consumed=true where id=i.id;
  update kxra_private.paired_sessions set revoked=true where agent_id=a.id;
  update kxra.paired_tasks set state='UNCERTAIN' where agent_id=a.id and state in ('LEASED','RUNNING');
  insert into kxra_private.paired_sessions(id,agent_id,secret_hash,session_version,expires_at) values((v->>'session_id')::uuid,a.id,v->>'session_hash',sv,clock_timestamp()+interval '15 minutes');
  return jsonb_build_object('agent_id',a.id,'room_id',a.room_id,'expires_in_seconds',900,'capability','TEXT_DRAFT_ONLY');
 end if;
 select * into s from kxra_private.paired_sessions where id=s.id for update;
 if s.revoked or s.expires_at<=clock_timestamp() or s.session_version<>sv then raise insufficient_privilege;end if;
 update kxra_private.paired_sessions set last_seen=clock_timestamp() where id=s.id;
 update kxra.paired_tasks set state='UNCERTAIN' where agent_id=a.id and state in ('LEASED','RUNNING') and lease_until<=clock_timestamp();
 if op='HEARTBEAT' then return jsonb_build_object('presence','ONLINE');end if;
 if op='POLL' then
  select * into t from kxra.paired_tasks where session_id=s.id and poll_id=(v->>'request_id')::uuid;
  if not found then
   if exists(select 1 from kxra.paired_tasks where agent_id=a.id and state in ('LEASED','RUNNING')) then return jsonb_build_object('task',null,'presence','ONLINE');end if;
   for t in select * from kxra.paired_tasks where agent_id=a.id and state='APPROVED' and expires_at>clock_timestamp() order by created_at,id for update loop
    if kxra_private.paired_current(t.id) and t.reviewed_hash=t.content_hash then
     update kxra.paired_tasks set state='LEASED',session_id=s.id,poll_id=(v->>'request_id')::uuid,fence=gen_random_uuid(),lease_until=clock_timestamp()+interval '30 seconds' where id=t.id returning * into t;
     picked=true;exit;
    else update kxra.paired_tasks set state='CANCELLED' where id=t.id;end if;
   end loop;
   if not picked then return jsonb_build_object('task',null,'presence','ONLINE');end if;
  end if;
  if t.state<>'LEASED' or not kxra_private.paired_current(t.id) then return jsonb_build_object('task',null,'state',t.state);end if;
  return jsonb_build_object('task',jsonb_build_object('id',t.id,'agent_id',a.id,'room_id',a.room_id,'thread_id',t.thread_id,'content_hash',t.content_hash,'objective',t.objective,'sources',t.sources,'fence',t.fence,'lease_until',t.lease_until),'presence','ONLINE');
 end if;
 select * into t from kxra.paired_tasks where id=(v->>'task_id')::uuid and session_id=s.id for update;
 if not found or t.fence is distinct from (v->>'fence')::uuid then raise insufficient_privilege;end if;
 if t.state='UNCERTAIN' then return jsonb_build_object('state','UNCERTAIN','accepted',false);end if;
 if op='ABANDON' and t.state in ('LEASED','RUNNING') then update kxra.paired_tasks set state='UNCERTAIN' where id=t.id;return jsonb_build_object('state','UNCERTAIN');end if;
 if op='START' and t.state='RUNNING' then return jsonb_build_object('state','RUNNING','dispatched',false);end if;
 if op='START' and t.state='LEASED' and kxra_private.paired_current(t.id) then
  update kxra.paired_tasks set state='RUNNING' where id=t.id;return jsonb_build_object('state','RUNNING','dispatched',true);
 elsif op='RESULT' then
  body=trim(v->>'draft_text');rh=encode(sha256(convert_to(body,'UTF8')),'hex');
  if t.state='DONE' and t.result_hash=rh and kxra_private.paired_current(t.id) then return jsonb_build_object('state','DONE','message_id',t.result_message_id);end if;
  if t.state<>'RUNNING' or not kxra_private.paired_current(t.id) or t.reviewed_hash<>t.content_hash or body is null or length(body) not between 1 and 10000 or octet_length(body)>20000 then raise exception 'Current dispatched draft required';end if;
  mid=gen_random_uuid();
  insert into kxra.team_messages(id,room_id,author_id,parent_id,body) values(mid,t.room_id,t.owner_id,t.thread_id,'[PAIRED SYNTHETIC DRAFT · review required]'||chr(10)||body);
  update kxra.paired_tasks set state='DONE',result_hash=rh,result_message_id=mid where id=t.id;
  return jsonb_build_object('state','DONE','message_id',mid,'provenance','PAIRED_SYNTHETIC_DRAFT');
 end if;
 raise exception 'Paired task unavailable';
end $$;
revoke all on function kxra_private.paired_actor(uuid),kxra_private.paired_sources(uuid,uuid[]),kxra_private.paired_current(uuid),kxra_private.paired_resolve(text,text) from public,anon,authenticated;
grant usage on schema kxra_private to kxra_app;
grant execute on function kxra_private.paired_resolve(text,text) to kxra_app;
revoke all on function kxra.paired_control(text,jsonb),kxra.paired_device(text,text,jsonb) from public,anon;
grant execute on function kxra.paired_control(text,jsonb),kxra.paired_device(text,text,jsonb) to authenticated;

create function kxra_private.paired_task_identity() returns trigger language plpgsql set search_path='' as $$
begin
 if (new.id,new.agent_id,new.room_id,new.org_id,new.owner_id,new.session_version,new.objective,new.thread_id,new.sources,new.content_hash,new.expires_at)
 is distinct from (old.id,old.agent_id,old.room_id,old.org_id,old.owner_id,old.session_version,old.objective,old.thread_id,old.sources,old.content_hash,old.expires_at) then raise exception 'Paired scope is immutable';end if;
 return new;
end $$;
revoke all on function kxra_private.paired_task_identity() from public,anon,authenticated;
create trigger paired_task_identity before update on kxra.paired_tasks for each row execute function kxra_private.paired_task_identity();
