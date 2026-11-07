-- Additive replacement for the manual workroom experience; historical records stay intact.
create table kxra.team_rooms(
 id uuid primary key default gen_random_uuid(), org_id uuid not null references kxra.organisations(id),
 project_id uuid not null references kxra.projects(id), name text not null check(length(name) between 1 and 120),
 guidelines text not null default '' check(length(guidelines)<=4096),
 access text not null check(access in ('PROJECT','PRIVATE')),
 created_by uuid not null references kxra.account_identities(account_id), created_at timestamptz not null default now(),
 unique(id,org_id)
);
create table kxra.team_room_members(
 room_id uuid not null references kxra.team_rooms(id), account_id uuid not null references kxra.account_identities(account_id),
 active boolean not null default true, primary key(room_id,account_id)
);
create function kxra_private.can_team_room(r uuid,writing boolean default false) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from kxra.team_rooms room where room.id=r
 and room.org_id=kxra_private.member_org() and kxra_private.can_project(room.project_id,writing)
 and (room.access='PROJECT' or exists(select 1 from kxra.team_room_members m where m.room_id=r and m.account_id=auth.uid() and m.active)))
$$;
create function kxra_private.manages_team_room(r uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select kxra_private.can_team_room(r,true) and exists(select 1 from kxra.team_rooms where id=r and created_by=auth.uid())
$$;
create table kxra.team_connections(
 id uuid primary key default gen_random_uuid(), org_id uuid not null references kxra.organisations(id),
 name text not null check(length(name) between 1 and 120),
 provider text not null check(provider in ('OPENAI','ANTHROPIC','GOOGLE','OPENROUTER','COMPATIBLE','FIXTURE')),
 model text not null check(length(model) between 1 and 160),
 endpoint_id text not null default '' check(length(endpoint_id)<=80),
 encrypted_key text not null check(length(encrypted_key)<=16000),
 enabled boolean not null default true, created_by uuid not null references kxra.account_identities(account_id),
 created_at timestamptz not null default now(), unique(id,org_id)
);
create table kxra.team_agents(
 id uuid primary key default gen_random_uuid(), org_id uuid not null,room_id uuid not null,
 connection_id uuid not null, name text not null check(length(name) between 1 and 100),
 instructions text not null check(length(instructions) between 1 and 6000), enabled boolean not null default true,
 created_at timestamptz not null default now(),
 foreign key(room_id,org_id) references kxra.team_rooms(id,org_id),
 foreign key(connection_id,org_id) references kxra.team_connections(id,org_id), unique(id,room_id)
);
create table kxra.team_messages(
 id uuid primary key, room_id uuid not null references kxra.team_rooms(id),
 author_id uuid not null references kxra.account_identities(account_id),
 body text not null check(length(body) between 1 and 12000), parent_id uuid,
 created_at timestamptz not null default now(), unique(id,room_id),
 foreign key(parent_id,room_id) references kxra.team_messages(id,room_id)
);
create table kxra.team_runs(
 id uuid primary key,room_id uuid not null references kxra.team_rooms(id),agent_id uuid not null,
 message_id uuid not null, requested_by uuid not null references kxra.account_identities(account_id),
 status text not null default 'RUNNING' check(status in ('RUNNING','SUCCEEDED','FAILED','CANCELLED')),
 context_ids uuid[] not null, context_sha256 text not null check(length(context_sha256)=64),
 output text not null default '' check(length(output)<=12000), error_code text,
 input_tokens integer not null default 0 check(input_tokens>=0),output_tokens integer not null default 0 check(output_tokens>=0),
 created_at timestamptz not null default now(),finished_at timestamptz,
 foreign key(agent_id,room_id) references kxra.team_agents(id,room_id),
 foreign key(message_id,room_id) references kxra.team_messages(id,room_id)
);
create index team_messages_room on kxra.team_messages(room_id,created_at);
create index team_runs_room on kxra.team_runs(room_id,created_at);
create index team_runs_requester on kxra.team_runs(requested_by,created_at);
create index team_agents_connection on kxra.team_agents(connection_id);
create table kxra.team_items(
 id uuid primary key default gen_random_uuid(),room_id uuid not null references kxra.team_rooms(id),
 title text not null check(length(title) between 1 and 240),
 state text not null default 'PROPOSED' check(state in ('PROPOSED','APPROVED','DONE','REJECTED')),
 created_by uuid not null references kxra.account_identities(account_id),
 decided_by uuid references kxra.account_identities(account_id), version integer not null default 1,
 created_at timestamptz not null default now()
);
-- Only read grants. Mutations enter narrowly validated functions. No owner bypass for private rooms.
alter table kxra.team_rooms enable row level security;
alter table kxra.team_room_members enable row level security;
alter table kxra.team_connections enable row level security;
alter table kxra.team_agents enable row level security;
alter table kxra.team_messages enable row level security;
alter table kxra.team_runs enable row level security;
alter table kxra.team_items enable row level security;
create policy room_read on kxra.team_rooms for select to authenticated using(kxra_private.can_team_room(id));
create policy room_members_read on kxra.team_room_members for select to authenticated using(kxra_private.can_team_room(room_id));
create policy connection_read on kxra.team_connections for select to authenticated using(org_id=kxra_private.member_org() and created_by=auth.uid());
create policy agent_read on kxra.team_agents for select to authenticated using(kxra_private.can_team_room(room_id));
create policy message_read on kxra.team_messages for select to authenticated using(kxra_private.can_team_room(room_id));
create policy run_read on kxra.team_runs for select to authenticated using(kxra_private.can_team_room(room_id));
create policy item_read on kxra.team_items for select to authenticated using(kxra_private.can_team_room(room_id));
revoke all on kxra.team_rooms,kxra.team_room_members,kxra.team_connections,kxra.team_agents,kxra.team_messages,kxra.team_runs,kxra.team_items from public,anon,authenticated;
grant select on kxra.team_rooms,kxra.team_room_members,kxra.team_agents,kxra.team_messages,kxra.team_runs,kxra.team_items to authenticated;
grant select(id,org_id,name,provider,model,endpoint_id,enabled,created_by,created_at) on kxra.team_connections to authenticated;

create function kxra.team_room_create(p uuid,n text,g text,a text) returns uuid
language plpgsql security definer set search_path='' as $$
declare r uuid; o uuid;
begin
 if not kxra_private.can_project(p,true) then raise insufficient_privilege; end if;
 select org_id into o from kxra.projects where id=p;
 insert into kxra.team_rooms(org_id,project_id,name,guidelines,access,created_by) values(o,p,n,g,a,auth.uid()) returning id into r;
 insert into kxra.team_room_members values(r,auth.uid(),true);return r;
end $$;
create function kxra.team_room_member(r uuid,u uuid,enabled boolean) returns void
language plpgsql security definer set search_path='' as $$
declare room kxra.team_rooms;
begin
 if not kxra_private.manages_team_room(r) then raise insufficient_privilege;end if;
 select * into room from kxra.team_rooms where id=r;
 if u=room.created_by and not enabled then raise exception 'Creator cannot be removed';end if;
 if not exists(select 1 from kxra.organisation_memberships m join kxra.account_identities a on a.account_id=m.account_id
 where m.org_id=room.org_id and m.account_id=u and m.state='ACTIVE' and m.starts_at<=now() and m.revoked_at is null
 and (m.expires_at is null or m.expires_at>now()) and a.state='ACTIVE'
 and (m.security_role in ('KXRA_OWNER','ORG_ADMIN') or exists(select 1 from kxra.project_memberships pm where pm.project_id=room.project_id and pm.user_id=u and pm.active and (pm.expires_at is null or pm.expires_at>now())))) then raise insufficient_privilege;end if;
 insert into kxra.team_room_members values(r,u,enabled) on conflict(room_id,account_id) do update set active=excluded.active;
end $$;
create function kxra.team_connection_save(i uuid,n text,p text,m text,e text,k text) returns uuid
language plpgsql security definer set search_path='' as $$
begin
 if session_user <> 'kxra_app' or kxra_private.member_org() is null then raise insufficient_privilege;end if;
 insert into kxra.team_connections(id,org_id,name,provider,model,endpoint_id,encrypted_key,created_by)
 values(i,kxra_private.member_org(),n,p,m,e,k,auth.uid());return i;
end $$;
create function kxra.team_connection_toggle(i uuid,active boolean) returns void
language plpgsql security definer set search_path='' as $$
begin
 update kxra.team_connections set enabled=active where id=i and org_id=kxra_private.member_org() and created_by=auth.uid();
 if not found then raise insufficient_privilege;end if;
end $$;
create function kxra.team_agent_create(r uuid,c uuid,n text,instructions text) returns uuid
language plpgsql security definer set search_path='' as $$
declare i uuid;
begin
 if not kxra_private.manages_team_room(r) or not exists(select 1 from kxra.team_connections where id=c and org_id=kxra_private.member_org() and created_by=auth.uid() and enabled) then raise insufficient_privilege;end if;
 insert into kxra.team_agents(org_id,room_id,connection_id,name,instructions) values(kxra_private.member_org(),r,c,n,instructions) returning id into i;return i;
end $$;
create function kxra.team_message_send(i uuid,r uuid,b text,parent uuid) returns uuid
language plpgsql security definer set search_path='' as $$
begin
 if not kxra_private.can_team_room(r,true) then raise insufficient_privilege;end if;
 if parent is not null and not exists(select 1 from kxra.team_messages where id=parent and room_id=r and parent_id is null) then raise exception 'Thread unavailable';end if;
 insert into kxra.team_messages(id,room_id,author_id,body,parent_id) values(i,r,auth.uid(),b,parent) on conflict(id) do nothing;
 if not exists(select 1 from kxra.team_messages where id=i and room_id=r and author_id=auth.uid() and body=b and parent_id is not distinct from parent) then raise exception 'Idempotency conflict';end if;
 return i;
end $$;
-- Provider dispatch is application-only, including credentials and completion. The authenticated
-- RLS principal remains required; direct PostgREST callers cannot forge a provider completion.
create function kxra.team_run_start(i uuid,r uuid,a uuid,m uuid,ids uuid[],digest text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare ag kxra.team_agents; c kxra.team_connections;
begin
 if session_user <> 'kxra_app' or not kxra_private.can_team_room(r,true) then raise insufficient_privilege;end if;
 perform pg_advisory_xact_lock(hashtext(auth.uid()::text));
 if exists(select 1 from kxra.team_runs where id=i) then raise exception 'Run already requested';end if;
 if (select count(*) from kxra.team_runs where requested_by=auth.uid() and created_at>now()-interval '24 hours')>=20 then raise exception 'Daily run limit reached';end if;
 if exists(select 1 from kxra.team_runs where requested_by=auth.uid() and status='RUNNING' and created_at>now()-interval '60 seconds') then raise exception 'Run already in progress';end if;
 select * into ag from kxra.team_agents where id=a and room_id=r and enabled;
 if not found then raise insufficient_privilege;end if;
 select * into c from kxra.team_connections where id=ag.connection_id and org_id=kxra_private.member_org() and enabled and exists(select 1 from kxra.organisation_memberships m join kxra.account_identities u on u.account_id=m.account_id where m.account_id=team_connections.created_by and m.org_id=team_connections.org_id and m.state='ACTIVE' and m.starts_at<=now() and m.revoked_at is null and (m.expires_at is null or m.expires_at>now()) and u.state='ACTIVE');
 if not found then raise insufficient_privilege;end if;
 if cardinality(ids)>40 or not m=any(ids) or exists(select 1 from unnest(ids) x where not exists(select 1 from kxra.team_messages where id=x and room_id=r)) then raise insufficient_privilege;end if;
 insert into kxra.team_runs(id,room_id,agent_id,message_id,requested_by,context_ids,context_sha256) values(i,r,a,m,auth.uid(),ids,digest);
 return jsonb_build_object('id',c.id,'org_id',c.org_id,'provider',c.provider,'model',c.model,'endpoint_id',c.endpoint_id,'encrypted_key',c.encrypted_key);
end $$;
create function kxra.team_run_finish(i uuid,result text,code text,tin integer,tout integer) returns void
language plpgsql security definer set search_path='' as $$
declare r kxra.team_runs;
begin
 if session_user <> 'kxra_app' then raise insufficient_privilege;end if;
 select * into r from kxra.team_runs where id=i and requested_by=auth.uid() for update;
 if not found or r.status<>'RUNNING' then return;end if;
 if not kxra_private.can_team_room(r.room_id,true) or not exists(select 1 from kxra.team_agents a join kxra.team_connections c on c.id=a.connection_id where a.id=r.agent_id and a.enabled and c.enabled)
 then update kxra.team_runs set status='CANCELLED',error_code='ACCESS_CHANGED',finished_at=now() where id=i;return;end if;
 update kxra.team_runs set status=case when code is null then 'SUCCEEDED' else 'FAILED' end,
 output=case when code is null then result else '' end,error_code=code,input_tokens=tin,output_tokens=tout,finished_at=now() where id=i;
end $$;
create function kxra.team_run_cancel(i uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 update kxra.team_runs set status='CANCELLED',error_code='CANCELLED_BY_USER',finished_at=now()
 where id=i and kxra_private.can_team_room(room_id,true) and (requested_by=auth.uid() or kxra_private.manages_team_room(room_id)) and status='RUNNING';
 if not found then raise exception 'Run cannot be cancelled';end if;
end $$;
create function kxra.team_item_save(r uuid,title text) returns uuid
language plpgsql security definer set search_path='' as $$
declare i uuid;
begin
 if not kxra_private.can_team_room(r,true) then raise insufficient_privilege;end if;
 insert into kxra.team_items(room_id,title,created_by) values(r,title,auth.uid()) returning id into i;return i;
end $$;
create function kxra.team_item_decide(i uuid,v integer,s text) returns void
language plpgsql security definer set search_path='' as $$
begin
 update kxra.team_items set state=s,version=version+1,decided_by=auth.uid()
 where id=i and version=v and kxra_private.manages_team_room(room_id)
 and ((state='PROPOSED' and s in ('APPROVED','REJECTED')) or (state='APPROVED' and s='DONE'));
 if not found then raise exception 'Decision stale or unavailable';end if;
end $$;
revoke all on function kxra_private.can_team_room(uuid,boolean),kxra_private.manages_team_room(uuid) from public;
grant execute on function kxra_private.can_team_room(uuid,boolean),kxra_private.manages_team_room(uuid) to authenticated;
revoke all on function kxra.team_room_create(uuid,text,text,text),kxra.team_room_member(uuid,uuid,boolean),kxra.team_connection_save(uuid,text,text,text,text,text),kxra.team_connection_toggle(uuid,boolean),kxra.team_agent_create(uuid,uuid,text,text),kxra.team_message_send(uuid,uuid,text,uuid),kxra.team_run_start(uuid,uuid,uuid,uuid,uuid[],text),kxra.team_run_finish(uuid,text,text,integer,integer),kxra.team_run_cancel(uuid),kxra.team_item_save(uuid,text),kxra.team_item_decide(uuid,integer,text) from public,anon;
grant execute on function kxra.team_room_create(uuid,text,text,text),kxra.team_room_member(uuid,uuid,boolean),kxra.team_connection_save(uuid,text,text,text,text,text),kxra.team_connection_toggle(uuid,boolean),kxra.team_agent_create(uuid,uuid,text,text),kxra.team_message_send(uuid,uuid,text,uuid),kxra.team_run_start(uuid,uuid,uuid,uuid,uuid[],text),kxra.team_run_finish(uuid,text,text,integer,integer),kxra.team_run_cancel(uuid),kxra.team_item_save(uuid,text),kxra.team_item_decide(uuid,integer,text) to authenticated;
create function kxra.team_room_candidates(r uuid) returns table(account_id uuid,display_name text)
language sql stable security definer set search_path='' as $$
 select m.account_id,m.display_name from kxra.organisation_memberships m
 join kxra.account_identities a on a.account_id=m.account_id
 join kxra.team_rooms room on room.org_id=m.org_id and room.id=r
 where kxra_private.manages_team_room(r) and m.state='ACTIVE' and m.starts_at<=now()
 and m.revoked_at is null and (m.expires_at is null or m.expires_at>now()) and a.state='ACTIVE'
 and (m.security_role in ('KXRA_OWNER','ORG_ADMIN') or exists(select 1 from kxra.project_memberships pm where pm.project_id=room.project_id and pm.user_id=m.account_id and pm.active and (pm.expires_at is null or pm.expires_at>now())))
$$;
revoke all on function kxra.team_room_candidates(uuid) from public,anon;
grant execute on function kxra.team_room_candidates(uuid) to authenticated;
create function kxra.team_agent_toggle(i uuid,active boolean) returns void
language plpgsql security definer set search_path='' as $$
begin
 update kxra.team_agents set enabled=active where id=i and kxra_private.manages_team_room(room_id);
 if not found then raise insufficient_privilege;end if;
end $$;
revoke all on function kxra.team_agent_toggle(uuid,boolean) from public,anon;
grant execute on function kxra.team_agent_toggle(uuid,boolean) to authenticated;
create table kxra.team_events(
 id bigint generated always as identity primary key,org_id uuid not null references kxra.organisations(id),
 room_id uuid references kxra.team_rooms(id),actor_id uuid not null,action text not null,target_id text not null,
 details jsonb not null,created_at timestamptz not null default now()
);
alter table kxra.team_events enable row level security;
create policy team_event_read on kxra.team_events for select to authenticated using(org_id=kxra_private.member_org() and (case when room_id is null then actor_id=auth.uid() else kxra_private.can_team_room(room_id) end));
revoke all on kxra.team_events from public,anon,authenticated;grant select on kxra.team_events to authenticated;
create function kxra_private.audit_team_change() returns trigger language plpgsql security definer set search_path='' as $$
declare value jsonb=to_jsonb(new); room uuid; org uuid;
begin
 if tg_table_name='team_rooms' then room=new.id;
 elsif tg_table_name<>'team_connections' then room=(value->>'room_id')::uuid;end if;
 if room is not null then select org_id into org from kxra.team_rooms where id=room;else org=(value->>'org_id')::uuid;end if;
 insert into kxra.team_events(org_id,room_id,actor_id,action,target_id,details)
 values(org,room,auth.uid(),tg_table_name||':'||tg_op,coalesce(value->>'id',value->>'account_id'),jsonb_strip_nulls(jsonb_build_object('status',value->>'status','state',value->>'state','active',value->'active','enabled',value->'enabled')));
 return new;
end $$;
revoke all on function kxra_private.audit_team_change() from public,anon,authenticated;
create trigger team_room_audit after insert or update on kxra.team_rooms for each row execute function kxra_private.audit_team_change();
create trigger team_member_audit after insert or update on kxra.team_room_members for each row execute function kxra_private.audit_team_change();
create trigger team_connection_audit after insert or update on kxra.team_connections for each row execute function kxra_private.audit_team_change();
create trigger team_agent_audit after insert or update on kxra.team_agents for each row execute function kxra_private.audit_team_change();
create trigger team_run_audit after insert or update on kxra.team_runs for each row execute function kxra_private.audit_team_change();
create trigger team_item_audit after insert or update on kxra.team_items for each row execute function kxra_private.audit_team_change();
