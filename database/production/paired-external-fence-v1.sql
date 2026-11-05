-- Separate restore/admin domain ONLY. Preprovisioned NOINHERIT runtime role.
-- Atomic, empty, HOLD by default. No operator activation/resume endpoint supplied.
begin;
create schema kxra_paired_fence;
revoke all on schema kxra_paired_fence from public;
create table kxra_paired_fence.realms(id uuid primary key,epoch uuid not null,org_id uuid not null,account_id uuid not null,device_id uuid not null,device_session_id uuid not null,enabled boolean not null default false);
create table kxra_paired_fence.burns(
 realm_id uuid not null references kxra_paired_fence.realms,task_id uuid not null unique,
 epoch uuid not null,permit_id uuid not null unique,subject jsonb not null,
 burned_at timestamptz not null default clock_timestamp(),primary key(realm_id,task_id)
);
create function kxra_paired_fence.burn(r uuid,e uuid,t uuid,s jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare p uuid;k text;
begin
 if session_user<>'kxra_pair_fence' or s is null or jsonb_typeof(s)<>'object' or octet_length(s::text)>1500
  or(s-array['purpose','org_id','account_id','device_id','device_session_id','fence','attempt_id','snapshot_sha256'])<>'{}'::jsonb
  or(select count(*) from jsonb_object_keys(s))<>8 or s->>'purpose' is distinct from 'PAIRED_TEXT_EXECUTION_V1' then raise insufficient_privilege;end if;
 foreach k in array array['org_id','account_id','device_id','device_session_id','fence','attempt_id'] loop
  if jsonb_typeof(s->k) is distinct from 'string' or s->>k is distinct from(s->>k)::uuid::text then raise insufficient_privilege;end if;
 end loop;
 if jsonb_typeof(s->'snapshot_sha256') is distinct from 'string' or s->>'snapshot_sha256'!~'^[a-f0-9]{64}$' then raise insufficient_privilege;end if;
 perform 1 from kxra_paired_fence.realms where id=r and epoch=e and enabled and org_id=(s->>'org_id')::uuid and account_id=(s->>'account_id')::uuid and device_id=(s->>'device_id')::uuid and device_session_id=(s->>'device_session_id')::uuid for share;
 if not found then raise insufficient_privilege;end if;
 -- Task identity survives fence/attempt/epoch changes. Conflicts NEVER return a permit.
 insert into kxra_paired_fence.burns values(r,t,e,gen_random_uuid(),s,clock_timestamp()) on conflict do nothing returning permit_id into p;
 if not found then raise exception 'Stable task already burned; no replay' using errcode='42501';end if;
 return p;
end $$;
create function kxra_paired_fence.immutable() returns trigger language plpgsql set search_path='' as $$begin raise exception 'Burn history is immutable';end $$;
create trigger immutable before update or delete on kxra_paired_fence.burns for each row execute function kxra_paired_fence.immutable();
alter table kxra_paired_fence.realms enable row level security;
alter table kxra_paired_fence.burns enable row level security;
revoke all on all tables in schema kxra_paired_fence from public,kxra_pair_fence;
revoke all on all functions in schema kxra_paired_fence from public,kxra_pair_fence;
grant usage on schema kxra_paired_fence to kxra_pair_fence;
grant execute on function kxra_paired_fence.burn(uuid,uuid,uuid,jsonb) to kxra_pair_fence;
commit;
