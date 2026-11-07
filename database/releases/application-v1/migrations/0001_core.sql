-- KXRA core schema. Apply as database administrator; never as a browser client.
begin;
create schema if not exists kxra;
create schema if not exists kxra_private;
revoke all on schema kxra_private from public;
grant usage on schema kxra to authenticated, anon;
grant usage on schema kxra_private to authenticated, anon;
create type kxra.classification as enum ('FACT','USER-SUPPLIED INFORMATION','EXTERNAL RESEARCH','ASSUMPTION','HYPOTHESIS','ESTIMATE','AI INFERENCE','DECISION','UNRESOLVED QUESTION');
create type kxra.record_kind as enum ('idea','assumption','experiment','decision','risk','source','partner','task','approval','finance','knowledge','agent','skill','routine','run','work_log','blocker','note');
create table kxra.organisations(id uuid primary key, name text not null);
create table kxra.members(id uuid primary key, org_id uuid not null references kxra.organisations, display_name text not null, role text not null check(role in ('owner','partner')), active boolean not null default true, access_version integer not null default 1, unique(org_id,id));
create table kxra.projects(id uuid primary key, org_id uuid not null references kxra.organisations, code text not null, name text not null, stage text not null, status text not null, next_action text not null, venture_score numeric check(venture_score between 0 and 100), confidence_score numeric check(confidence_score between 0 and 100), live_execution_enabled boolean not null default false check(live_execution_enabled=false), product_creation_enabled boolean not null default false, created_at timestamptz not null default now(), unique(org_id,id),unique(org_id,code));
create table kxra.project_memberships(org_id uuid not null, project_id uuid not null, user_id uuid not null, role text not null check(role in ('viewer','contributor')),active boolean not null default true,expires_at timestamptz,primary key(project_id,user_id),foreign key(org_id,project_id) references kxra.projects(org_id,id),foreign key(org_id,user_id) references kxra.members(org_id,id));
create table kxra.records(id uuid primary key default gen_random_uuid(),org_id uuid not null references kxra.organisations,project_id uuid,kind kxra.record_kind not null,title text not null check(length(title) between 1 and 240),body text not null default '' check(length(body)<=50000),data jsonb not null default '{}'::jsonb,classification kxra.classification not null,visibility text not null default 'owner_only' check(visibility in ('owner_only','project_shared')),status text not null default 'draft' check(status in ('draft','submitted','accepted','rejected','completed','archived')),created_by uuid default auth.uid(),version integer not null default 1,source_code text unique,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(org_id,project_id,id),foreign key(org_id,project_id) references kxra.projects(org_id,id),check(project_id is not null or visibility='owner_only'),check(kind not in ('finance','partner','approval','agent','skill','routine','run','work_log') or visibility='owner_only'));
create table kxra.record_versions(record_id uuid not null references kxra.records,id uuid not null default gen_random_uuid(),version integer not null,title text not null,body text not null,data jsonb not null,created_at timestamptz not null default now(),primary key(record_id,version));
create table kxra.files(id uuid primary key default gen_random_uuid(),org_id uuid not null,project_id uuid not null,record_id uuid not null,filename text not null,object_key text unique not null,mime_type text not null,size_bytes integer not null check(size_bytes between 0 and 20971520),sha256 text not null,scan_status text not null default 'quarantine' check(scan_status in ('quarantine','clean','rejected')),created_by uuid default auth.uid(),created_at timestamptz not null default now(),foreign key(org_id,project_id,record_id) references kxra.records(org_id,project_id,id));
create table kxra.approvals(id uuid primary key default gen_random_uuid(),org_id uuid not null references kxra.organisations,project_id uuid,action text not null check(action in ('record.accept','membership.change','publish','spend','deploy')),payload jsonb not null,payload_hash text not null,requested_by uuid not null default auth.uid(),state text not null default 'requested' check(state in ('requested','approved','rejected','expired','executed')),approved_by uuid,expires_at timestamptz not null,consumed_at timestamptz,created_at timestamptz not null default now(),foreign key(org_id,project_id) references kxra.projects(org_id,id));
create table kxra.audit_events(id bigint generated always as identity primary key,org_id uuid not null,actor_id uuid,action text not null,resource_id uuid,metadata jsonb not null default '{}',created_at timestamptz not null default now());
create table kxra.whatsapp_pairings(id uuid primary key default gen_random_uuid(),org_id uuid not null references kxra.organisations,user_id uuid not null references kxra.members,phone_digest text not null unique,verified_at timestamptz,revoked_at timestamptz);
create table kxra.inbound_events(id uuid primary key default gen_random_uuid(),provider text not null,event_id text not null,payload_hash text not null,status text not null default 'held',created_at timestamptz not null default now(),unique(provider,event_id));
create index records_scope on kxra.records(org_id,project_id,kind);
create index records_search on kxra.records using gin(to_tsvector('english',title || ' ' || body));
create index memberships_user on kxra.project_memberships(user_id,project_id) where active;

create function kxra_private.is_owner(o uuid) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from kxra.members where id=auth.uid() and org_id=o and active and role='owner') $$;
create function kxra_private.member_org() returns uuid language sql stable security definer set search_path='' as $$ select org_id from kxra.members where id=auth.uid() and active $$;
create function kxra_private.can_project(p uuid,write_access boolean default false) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from kxra.projects pr join kxra.members m on m.org_id=pr.org_id and m.id=auth.uid() and m.active where pr.id=p and (m.role='owner' or exists(select 1 from kxra.project_memberships pm where pm.project_id=p and pm.user_id=m.id and pm.active and (pm.expires_at is null or pm.expires_at>now()) and (not write_access or pm.role='contributor')))) $$;
create function kxra_private.can_record(r uuid) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from kxra.records rec where rec.id=r and (kxra_private.is_owner(rec.org_id) or (rec.visibility='project_shared' and kxra_private.can_project(rec.project_id)))) $$;
create function kxra_private.mfa_owner(o uuid) returns boolean language sql stable security definer set search_path='' as $$ select kxra_private.is_owner(o) and coalesce(auth.jwt()->>'aal','')='aal2' $$;
revoke all on all functions in schema kxra_private from public;
grant execute on all functions in schema kxra_private to authenticated,anon;

alter table kxra.organisations enable row level security;
alter table kxra.members enable row level security;
alter table kxra.projects enable row level security;
alter table kxra.project_memberships enable row level security;
alter table kxra.records enable row level security;
alter table kxra.record_versions enable row level security;
alter table kxra.files enable row level security;
alter table kxra.approvals enable row level security;
alter table kxra.audit_events enable row level security;
alter table kxra.whatsapp_pairings enable row level security;
alter table kxra.inbound_events enable row level security;

grant select on all tables in schema kxra to authenticated,anon;
grant insert,update on kxra.records to authenticated;
grant insert on kxra.files,kxra.approvals to authenticated;
-- Membership changes, approval execution and scan promotion use narrow functions only.
create policy org_read on kxra.organisations for select using(id=kxra_private.member_org());
create policy member_read on kxra.members for select using((id=auth.uid() and active) or kxra_private.is_owner(org_id));
create policy project_read on kxra.projects for select using(kxra_private.can_project(id));
create policy membership_read on kxra.project_memberships for select using((user_id=auth.uid() and org_id=kxra_private.member_org()) or kxra_private.is_owner(org_id));
create policy record_read on kxra.records for select using(kxra_private.is_owner(org_id) or (visibility='project_shared' and kxra_private.can_project(project_id)));
create policy record_insert on kxra.records for insert with check(org_id=kxra_private.member_org() and created_by=auth.uid() and status in ('draft','submitted') and (kxra_private.is_owner(org_id) or (visibility='project_shared' and kxra_private.can_project(project_id,true) and kind in ('idea','note','task','experiment'))));
create policy record_update on kxra.records for update using(status in ('draft','submitted') and (kxra_private.is_owner(org_id) or (created_by=auth.uid() and kxra_private.can_project(project_id,true) and kind in ('idea','note','task','experiment')))) with check(status in ('draft','submitted') and (kxra_private.is_owner(org_id) or (created_by=auth.uid() and visibility='project_shared' and kxra_private.can_project(project_id,true) and kind in ('idea','note','task','experiment'))));
create policy versions_read on kxra.record_versions for select using(kxra_private.can_record(record_id));
create policy files_read on kxra.files for select using(kxra_private.can_record(record_id));
create policy files_insert on kxra.files for insert with check(kxra_private.can_project(project_id,true) and kxra_private.can_record(record_id) and created_by=auth.uid() and scan_status='quarantine');
create policy approvals_read on kxra.approvals for select using(kxra_private.is_owner(org_id));
create policy approvals_insert on kxra.approvals for insert with check(kxra_private.is_owner(org_id) and requested_by=auth.uid() and state='requested' and approved_by is null and consumed_at is null and expires_at>now() and expires_at<=now()+interval '7 days');
create policy audit_read on kxra.audit_events for select using(kxra_private.is_owner(org_id));
create policy pair_read on kxra.whatsapp_pairings for select using(kxra_private.is_owner(org_id) or (user_id=auth.uid() and org_id=kxra_private.member_org()));
-- No inbound_events policy: gateway is disabled and browser cannot access it.

create function kxra_private.guard_record() returns trigger language plpgsql set search_path='' as $$ begin
 if tg_op='UPDATE' then
  if (new.org_id,new.project_id,new.created_by,new.kind,new.created_at,new.source_code) is distinct from (old.org_id,old.project_id,old.created_by,old.kind,old.created_at,old.source_code) then raise exception 'Immutable scope'; end if;
  if old.status not in ('draft','submitted') then raise exception 'Immutable accepted record'; end if;
  new.version=old.version+1;new.updated_at=now();
 end if;
 return new;
end $$;
create trigger records_guard before update on kxra.records for each row execute function kxra_private.guard_record();
create function kxra_private.log_record() returns trigger language plpgsql security definer set search_path='' as $$ begin
 insert into kxra.record_versions(record_id,version,title,body,data) values(new.id,new.version,new.title,new.body,new.data);
 insert into kxra.audit_events(org_id,actor_id,action,resource_id,metadata) values(new.org_id,auth.uid(),lower(tg_op)||'.'||new.kind,new.id,jsonb_build_object('version',new.version));
 return new;
end $$;
create trigger records_audit after insert or update on kxra.records for each row execute function kxra_private.log_record();

create function kxra.decide_approval(a uuid,expected_hash text,approve boolean) returns void language plpgsql security definer set search_path='' as $$ declare v kxra.approvals; begin
 select * into v from kxra.approvals where id=a for update;
 if not found or not kxra_private.mfa_owner(v.org_id) or v.state<>'requested' or v.payload_hash<>expected_hash or v.expires_at<=now() then raise exception 'Approval unavailable'; end if;
 update kxra.approvals set state=case when approve then 'approved' else 'rejected' end,approved_by=auth.uid() where id=a;
 insert into kxra.audit_events(org_id,actor_id,action,resource_id) values(v.org_id,auth.uid(),'approval.decided',a);
end $$;
create function kxra.accept_record(a uuid) returns void language plpgsql security definer set search_path='' as $$ declare v kxra.approvals;r kxra.records;begin
 select * into v from kxra.approvals where id=a for update;
 if not found or not kxra_private.mfa_owner(v.org_id) or v.state<>'approved' or v.action<>'record.accept' or v.expires_at<=now() or v.consumed_at is not null then raise exception 'Approval unavailable';end if;
 select * into r from kxra.records where id=(v.payload->>'record_id')::uuid for update;
 if not found or r.org_id<>v.org_id or r.project_id is distinct from v.project_id or r.version<>(v.payload->>'version')::int then raise exception 'Stale approval';end if;
 update kxra.records set status='accepted' where id=r.id;
 update kxra.approvals set state='executed',consumed_at=now() where id=a;
end $$;
create function kxra.change_membership(a uuid) returns void language plpgsql security definer set search_path='' as $$ declare v kxra.approvals;begin
 select * into v from kxra.approvals where id=a for update;
 if not found or not kxra_private.mfa_owner(v.org_id) or v.state<>'approved' or v.action<>'membership.change' or v.expires_at<=now() or v.consumed_at is not null then raise exception 'Approval unavailable';end if;
 if not exists(select 1 from kxra.members where id=(v.payload->>'user_id')::uuid and org_id=v.org_id and role='partner') or not exists(select 1 from kxra.projects where id=v.project_id and org_id=v.org_id) then raise exception 'Invalid membership';end if;
 insert into kxra.project_memberships(org_id,project_id,user_id,role,active) values(v.org_id,v.project_id,(v.payload->>'user_id')::uuid,v.payload->>'role',(v.payload->>'active')::boolean) on conflict(project_id,user_id) do update set role=excluded.role,active=excluded.active,expires_at=null;
 update kxra.members set access_version=access_version+1 where id=(v.payload->>'user_id')::uuid;
 update kxra.approvals set state='executed',consumed_at=now() where id=a;
 insert into kxra.audit_events(org_id,actor_id,action,resource_id) values(v.org_id,auth.uid(),'membership.changed',v.project_id);
end $$;
revoke all on all functions in schema kxra from public;
grant execute on function kxra.decide_approval(uuid,text,boolean),kxra.accept_record(uuid),kxra.change_membership(uuid) to authenticated;
revoke all on function kxra_private.guard_record(),kxra_private.log_record() from public,authenticated,anon;
commit;
