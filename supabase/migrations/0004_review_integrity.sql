begin;
-- Preserve legacy history as unknown rather than inventing the old classification/editor.
alter table kxra.record_versions add column classification kxra.classification;
alter table kxra.record_versions add column status text;
alter table kxra.record_versions add column editor_id uuid;
alter table kxra.record_versions add column provenance jsonb not null default '{}';
alter table kxra.records add column provenance jsonb not null default '{}';
alter table kxra.records add column supersedes_id uuid references kxra.records(id);
create table kxra.verifications(
 id uuid primary key default gen_random_uuid(),record_id uuid not null references kxra.records,
 record_version integer not null,evidence_id uuid not null,evidence_version integer not null,
 reviewer_id uuid not null,method text not null check(length(trim(method))>=10),created_at timestamptz not null default now(),
 foreign key(evidence_id,evidence_version) references kxra.record_versions(record_id,version),unique(record_id,record_version)
);
alter table kxra.verifications enable row level security;
grant select on kxra.verifications to authenticated,anon;
create policy verifications_read on kxra.verifications for select using(kxra_private.can_record(record_id) and kxra_private.can_record(evidence_id));
create or replace function kxra_private.guard_record() returns trigger language plpgsql set search_path='' as $$ begin
 if tg_op='INSERT' then
  new.version=1;new.created_at=now();new.updated_at=now();
  if current_user in ('authenticated','anon') and (new.classification='FACT' or new.kind='run' or new.provenance<>'{}'::jsonb or new.source_code is not null) then raise exception 'Verified system transition required';end if;
  if new.supersedes_id is not null and not exists(select 1 from kxra.records r where r.id=new.supersedes_id and r.org_id=new.org_id and r.project_id is not distinct from new.project_id and r.kind=new.kind and r.visibility=new.visibility and r.status='accepted' and kxra_private.is_owner(r.org_id)) then raise exception 'Supersession unavailable';end if;
 else
  if (new.id,new.org_id,new.project_id,new.created_by,new.kind,new.created_at,new.source_code,new.visibility,new.provenance,new.supersedes_id) is distinct from (old.id,old.org_id,old.project_id,old.created_by,old.kind,old.created_at,old.source_code,old.visibility,old.provenance,old.supersedes_id) then raise exception 'Immutable scope';end if;
  if old.status not in ('draft','submitted') then raise exception 'Immutable accepted record';end if;
  if new.classification is distinct from old.classification and (new.classification<>'FACT' or not exists(select 1 from kxra.verifications v where v.record_id=old.id and v.record_version=old.version+1 and v.reviewer_id=auth.uid())) then raise exception 'Verification required';end if;
  new.version=old.version+1;new.updated_at=now();
 end if;return new;
end $$;
create or replace function kxra_private.log_record() returns trigger language plpgsql security definer set search_path='' as $$ begin
 insert into kxra.record_versions(record_id,version,title,body,data,classification,status,editor_id,provenance)
 values(new.id,new.version,new.title,new.body,new.data,new.classification,new.status,auth.uid(),new.provenance);
 insert into kxra.audit_events(org_id,actor_id,action,resource_id,metadata) values(new.org_id,auth.uid(),lower(tg_op)||'.'||new.kind,new.id,jsonb_build_object('version',new.version,'classification',new.classification,'status',new.status));
 return new;
end $$;
-- No false income when JSON values are null or of the wrong type.
alter table kxra.records drop constraint financial_data_valid;
alter table kxra.records add constraint financial_data_valid check(kind<>'finance' or ((
 jsonb_typeof(data)='object' and data ?& array['amount','currency','entry_type','direction'] and
 jsonb_typeof(data->'amount')='string' and data->>'amount' ~ '^\d{1,12}(\.\d{1,4})?$' and
 jsonb_typeof(data->'currency')='string' and data->>'currency' in ('GBP','USD','EUR') and
 jsonb_typeof(data->'entry_type')='string' and data->>'entry_type' in ('actual','commitment','estimate','paper') and
 jsonb_typeof(data->'direction')='string' and data->>'direction' in ('income','expense')
) is true));
-- Aggregates use the invoker's RLS scope, never the paginated list.
create function kxra.finance_totals() returns table(currency text,total numeric,entries bigint) language sql stable security invoker set search_path='' as $$
 select data->>'currency',sum((data->>'amount')::numeric * case data->>'direction' when 'expense' then -1 else 1 end),count(*)
 from kxra.records where kind='finance' and data->>'entry_type'='actual' group by data->>'currency' $$;
create function kxra.dashboard_counts() returns table(records bigint,open_risks bigint) language sql stable security invoker set search_path='' as $$
 select count(*),count(*) filter(where kind='risk' and status in ('draft','submitted','accepted')) from kxra.records $$;

alter table kxra.approvals add column environment text not null default 'local';
-- Pending legacy payloads did not bind membership versions or the complete envelope.
update kxra.approvals set state='expired' where state in ('requested','approved');
create table kxra_private.deployment(id boolean primary key default true check(id),environment text not null);
insert into kxra_private.deployment values(true,'local');
create function kxra_private.approval_digest(action text,org uuid,project uuid,payload jsonb,environment text,requester uuid,expiry timestamptz) returns text language sql immutable set search_path='' as $$
 select encode(sha256(convert_to(jsonb_build_object('action',action,'org',org,'project',project,'payload',payload,'environment',environment,'requester',requester,'expires_epoch',extract(epoch from expiry))::text,'UTF8')),'hex') $$;
create function kxra_private.guard_approval() returns trigger language plpgsql set search_path='' as $$ begin
 if (new.id,new.org_id,new.project_id,new.action,new.payload,new.payload_hash,new.environment,new.requested_by,new.expires_at) is distinct from (old.id,old.org_id,old.project_id,old.action,old.payload,old.payload_hash,old.environment,old.requested_by,old.expires_at) then raise exception 'Immutable approval envelope';end if;return new;
end $$;
create trigger approval_envelope before update on kxra.approvals for each row execute function kxra_private.guard_approval();
revoke insert on kxra.approvals from authenticated;
create function kxra.request_approval(action_name text,project uuid,contents jsonb) returns kxra.approvals language plpgsql security definer set search_path='' as $$
 declare o uuid=kxra_private.member_org();v kxra.approvals;m kxra.members;pm kxra.project_memberships;r kxra.records;env text;expiry timestamptz=now()+interval '24 hours';payload jsonb=contents;
 begin
 if not kxra_private.is_owner(o) or (project is not null and not kxra_private.can_project(project)) or jsonb_typeof(contents) is distinct from 'object' then raise exception 'Approval unavailable';end if;
 if action_name='membership.change' then
  if project is null or not (contents ?& array['user_id','role','active']) or jsonb_typeof(contents->'active') is distinct from 'boolean' or contents->>'role' not in ('viewer','contributor') or contents-array['user_id','role','active','expires_at']<>'{}'::jsonb then raise exception 'Invalid membership payload';end if;
  select * into m from kxra.members where id=(contents->>'user_id')::uuid and org_id=o and role='partner' and active for update;
  if not found then raise exception 'Target unavailable';end if;
  select * into pm from kxra.project_memberships where user_id=m.id and project_id=project;
  payload=contents||jsonb_build_object('expected_access_version',m.access_version,'before',jsonb_build_object('role',pm.role,'active',pm.active,'expires_at',pm.expires_at),'expires_at',case when contents?'expires_at' then (contents->>'expires_at')::timestamptz else pm.expires_at end);
  if (payload->>'active')::boolean and (payload->>'expires_at')::timestamptz<=now() then raise exception 'Expiry must be in the future';end if;
 elsif action_name='record.accept' then
  if not(contents ?& array['record_id','version']) or contents-array['record_id','version']<>'{}'::jsonb then raise exception 'Invalid record payload';end if;
  select * into r from kxra.records where id=(contents->>'record_id')::uuid and org_id=o;
  if not found or r.project_id is distinct from project or r.version is distinct from (contents->>'version')::integer or r.status not in ('draft','submitted') then raise exception 'Record unavailable';end if;
  payload=contents||jsonb_build_object('title',r.title,'classification',r.classification);
 else raise exception 'Action disabled';end if;
 select environment into env from kxra_private.deployment;
 insert into kxra.approvals(org_id,project_id,action,payload,payload_hash,environment,expires_at)
 values(o,project,action_name,payload,kxra_private.approval_digest(action_name,o,project,payload,env,auth.uid(),expiry),env,expiry) returning * into v;
 insert into kxra.audit_events(org_id,actor_id,action,resource_id) values(o,auth.uid(),'approval.requested',v.id);
 return v;
 end $$;
create function kxra_private.check_approval(v kxra.approvals,required_state text) returns void language plpgsql security definer set search_path='' as $$ begin
 if v.id is null or not kxra_private.mfa_owner(v.org_id) or v.state<>required_state or v.expires_at<=now() or v.consumed_at is not null or v.environment is distinct from (select environment from kxra_private.deployment) or v.payload_hash is distinct from kxra_private.approval_digest(v.action,v.org_id,v.project_id,v.payload,v.environment,v.requested_by,v.expires_at) then raise exception 'Approval unavailable';end if;
end $$;
create or replace function kxra.decide_approval(a uuid,expected_hash text,approve boolean) returns void language plpgsql security definer set search_path='' as $$ declare v kxra.approvals; begin
 select * into v from kxra.approvals where id=a for update;perform kxra_private.check_approval(v,'requested');
 if v.payload_hash is distinct from expected_hash or approve is null then raise exception 'Approval unavailable';end if;
 update kxra.approvals set state=case when approve then 'approved' else 'rejected' end,approved_by=auth.uid() where id=a;
 insert into kxra.audit_events(org_id,actor_id,action,resource_id) values(v.org_id,auth.uid(),'approval.decided',a);
end $$;
create function kxra_private.membership_version() returns trigger language plpgsql security definer set search_path='' as $$ begin
 update kxra.members set access_version=access_version+1 where id=coalesce(new.user_id,old.user_id);return coalesce(new,old);end $$;
create trigger membership_version after insert or update or delete on kxra.project_memberships for each row execute function kxra_private.membership_version();
create or replace function kxra.change_membership(a uuid) returns void language plpgsql security definer set search_path='' as $$ declare v kxra.approvals;m kxra.members; begin
 select * into v from kxra.approvals where id=a for update;perform kxra_private.check_approval(v,'approved');
 if v.action<>'membership.change' then raise exception 'Wrong action';end if;
 select * into m from kxra.members where id=(v.payload->>'user_id')::uuid and org_id=v.org_id and role='partner' and active for update;
 if not found or m.access_version is distinct from (v.payload->>'expected_access_version')::integer then raise exception 'Stale membership approval';end if;
 insert into kxra.project_memberships(org_id,project_id,user_id,role,active,expires_at) values(v.org_id,v.project_id,m.id,v.payload->>'role',(v.payload->>'active')::boolean,(v.payload->>'expires_at')::timestamptz)
 on conflict(project_id,user_id) do update set role=excluded.role,active=excluded.active,expires_at=excluded.expires_at;

 update kxra.approvals set state='executed',consumed_at=now() where id=a;
 insert into kxra.audit_events(org_id,actor_id,action,resource_id) values(v.org_id,auth.uid(),'membership.changed',v.project_id);
end $$;
create or replace function kxra.accept_record(a uuid) returns void language plpgsql security definer set search_path='' as $$ declare v kxra.approvals;r kxra.records; begin
 select * into v from kxra.approvals where id=a for update;perform kxra_private.check_approval(v,'approved');
 if v.action<>'record.accept' then raise exception 'Wrong action';end if;
 select * into r from kxra.records where id=(v.payload->>'record_id')::uuid for update;
 if not found or r.org_id is distinct from v.org_id or r.project_id is distinct from v.project_id or r.version is distinct from (v.payload->>'version')::integer then raise exception 'Stale record approval';end if;
 update kxra.records set status='accepted' where id=r.id;
 update kxra.approvals set state='executed',consumed_at=now() where id=a;
 insert into kxra.audit_events(org_id,actor_id,action,resource_id) values(v.org_id,auth.uid(),'approval.executed',a);
end $$;
create function kxra.verify_record(target uuid,expected_version integer,evidence uuid,evidence_version integer,method text) returns void language plpgsql security definer set search_path='' as $$ declare r kxra.records;e kxra.records; begin
 select * into r from kxra.records where id=target for update;
 if not found or not kxra_private.mfa_owner(r.org_id) or r.version is distinct from expected_version or r.status not in ('draft','submitted') then raise exception 'Verification unavailable';end if;
 select * into e from kxra.records where id=evidence;
 if not found or e.id=r.id or e.org_id<>r.org_id or e.project_id is distinct from r.project_id or e.visibility<>r.visibility or e.status<>'accepted' or e.version is distinct from evidence_version or length(trim(method))<10 then raise exception 'Verified evidence required';end if;
 insert into kxra.verifications(record_id,record_version,evidence_id,evidence_version,reviewer_id,method) values(r.id,r.version+1,e.id,e.version,auth.uid(),method);
 update kxra.records set classification='FACT' where id=r.id;
end $$;
revoke all on all functions in schema kxra_private from public;
revoke all on function kxra_private.guard_approval(),kxra_private.approval_digest(text,uuid,uuid,jsonb,text,uuid,timestamptz),kxra_private.check_approval(kxra.approvals,text) from authenticated,anon;
revoke all on function kxra.request_approval(text,uuid,jsonb),kxra.verify_record(uuid,integer,uuid,integer,text),kxra.finance_totals(),kxra.dashboard_counts() from public;
grant execute on function kxra.request_approval(text,uuid,jsonb),kxra.verify_record(uuid,integer,uuid,integer,text),kxra.finance_totals(),kxra.dashboard_counts() to authenticated;
commit;
