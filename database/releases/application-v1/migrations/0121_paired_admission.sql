-- Unnumbered, unwired review proposal. No activation, authority, device or review is seeded.
-- Install atomically after the genuine production baseline, never fixture pairing migrations.
begin;
create schema kxra_paired_admission;
revoke all on schema kxra_paired_admission from public;
create function kxra_paired_admission.canonical(v jsonb) returns text
language plpgsql immutable strict set search_path='' as $$
declare result text;
begin
 case jsonb_typeof(v)
 when 'object' then select '{'||coalesce(string_agg(to_json(k)::text||':'||kxra_paired_admission.canonical(value),',' order by k collate "C"),'')||'}' into result from jsonb_each(v) e(k,value);
 when 'array' then select '['||coalesce(string_agg(kxra_paired_admission.canonical(value),',' order by ord),'')||']' into result from jsonb_array_elements(v) with ordinality e(value,ord);
 else result=v::text;
 end case;
 return result;
end $$;
create function kxra_paired_admission.digest(v jsonb) returns text language sql immutable strict set search_path='' as $$select encode(sha256(convert_to(kxra_paired_admission.canonical(v),'UTF8')),'hex')$$;
create table kxra_paired_admission.agents(
 id uuid primary key,org_id uuid not null references kxra.organisations,
 account_id uuid not null references kxra.account_identities(account_id),
 room_id uuid not null references kxra.team_rooms,enabled boolean not null default false,revoked_at timestamptz
);
create table kxra_paired_admission.devices(
 id uuid primary key,org_id uuid not null references kxra.organisations,
 account_id uuid not null references kxra.account_identities(account_id),
 agent_id uuid not null references kxra_paired_admission.agents,
 session_id uuid not null unique,realm_id uuid not null,continuity_epoch uuid not null,
 enabled boolean not null default false,expires_at timestamptz not null,revoked_at timestamptz
);
create table kxra_paired_admission.reviews(
 id uuid primary key,kind text not null check(kind in('RUNTIME','AUTH','SOURCE')),
 artifact jsonb not null check(jsonb_typeof(artifact)='object'),
 expires_at timestamptz not null,revoked_at timestamptz
);
create table kxra_paired_admission.authorities(
 task_id uuid primary key,org_id uuid not null references kxra.organisations,
 account_id uuid not null references kxra.account_identities(account_id),
 room_id uuid not null references kxra.team_rooms,
 device_id uuid not null references kxra_paired_admission.devices,
 runtime_review_id uuid not null references kxra_paired_admission.reviews,
 auth_review_id uuid not null references kxra_paired_admission.reviews,
 source_review_id uuid not null references kxra_paired_admission.reviews,
 manifest jsonb not null check(jsonb_typeof(manifest)='object' and octet_length(manifest::text)<=40000),
 snapshot_sha256 text generated always as(kxra_paired_admission.digest(manifest))stored,
 enabled boolean not null default false,revoked_at timestamptz,
 check(coalesce(manifest->>'purpose'='PAIRED_TEXT_EXECUTION_V1',false)),
 check(coalesce((manifest->'task'->>'id')::uuid=task_id,false)),
 check(coalesce(jsonb_typeof(manifest->'task'->'fence')='string' and(manifest->'task'->>'fence')::uuid is not null,false)),
 check(coalesce((manifest->'context'->>'organization_id')::uuid=org_id,false)),
 check(coalesce((manifest->'context'->>'account_id')::uuid=account_id,false)),
 check(coalesce((manifest->'task'->>'room_id')::uuid=room_id,false)),
 check(coalesce((manifest->>'device_id')::uuid=device_id,false))
);
create table kxra_paired_admission.consumptions(
 task_id uuid primary key references kxra_paired_admission.authorities,
 attempt_id uuid not null unique,permit_id uuid not null unique,
 snapshot_sha256 text not null check(snapshot_sha256~'^[a-f0-9]{64}$'),
 consumed_at timestamptz not null default clock_timestamp()
);
-- No app schema USAGE on kxra_private is added. The only predicate exposed here
-- returns a boolean, under verified app-role identity, for one exact task.
create function kxra_paired_admission.current_task(t uuid) returns boolean
language plpgsql volatile security definer set search_path='' as $$
declare a kxra_paired_admission.authorities;m jsonb;
begin
 if session_user<>'kxra_app' then return false;end if;
 select * into a from kxra_paired_admission.authorities where task_id=t;
 if not found or not a.enabled or a.revoked_at is not null then return false;end if;
 m=a.manifest;
 if m->>'purpose' is distinct from 'PAIRED_TEXT_EXECUTION_V1' or m->'task'->>'id' is distinct from t::text or (m->'task'->>'fence')::uuid is null then return false;end if;
 return coalesce(auth.uid()=a.account_id and kxra_private.member_org()=a.org_id
 and kxra_private.can_team_room(a.room_id,true)
 and exists(select 1 from kxra.account_identities i join kxra.organisation_memberships om on om.account_id=i.account_id
  join kxra.organisations o on o.id=om.org_id
  where i.account_id=a.account_id and i.state='ACTIVE' and i.email_verified_at is not null
  and i.session_version=(m->'context'->>'session_revision')::bigint
  and i.session_version=(auth.jwt()->>'session_version')::bigint
  and om.org_id=a.org_id and om.state='ACTIVE' and om.revoked_at is null
  and om.starts_at<=clock_timestamp() and(om.expires_at is null or om.expires_at>clock_timestamp())
  and om.version=(m->'membership'->>'revision')::bigint and o.state='ACTIVE')
 -- Explicit room membership is required even for an owner or PROJECT room.
 and exists(select 1 from kxra.team_room_members rm where rm.room_id=a.room_id and rm.account_id=a.account_id and rm.active)
 and m->'membership'->>'state'='ACTIVE'
 and(m->'membership'->>'organization_id')::uuid=a.org_id
 and(m->'membership'->>'account_id')::uuid=a.account_id
 and(m->'membership'->>'room_id')::uuid=a.room_id
 and exists(select 1 from kxra_paired_admission.agents ag where ag.id=(m->'task'->>'agent_id')::uuid and ag.org_id=a.org_id and ag.account_id=a.account_id and ag.room_id=a.room_id and ag.enabled and ag.revoked_at is null)
 and exists(select 1 from kxra_paired_admission.devices d where d.id=a.device_id and d.agent_id=(m->'task'->>'agent_id')::uuid and d.org_id=a.org_id and d.account_id=a.account_id
  and d.enabled and d.revoked_at is null and d.expires_at>clock_timestamp()
  and d.session_id=(m->>'device_session_id')::uuid and d.realm_id=(m->>'realm_id')::uuid and d.continuity_epoch=(m->>'continuity_epoch')::uuid)
 and m->'runtime_review'->>'subject_sha256'=kxra_paired_admission.digest(jsonb_build_object('purpose',m->'purpose','context',m->'context','device_id',m->'device_id','device_session_id',m->'device_session_id','realm_id',m->'realm_id','continuity_epoch',m->'continuity_epoch','runtime',m->'runtime','auth_review',m->'auth_review'))
 and m->'auth_review'->>'binding_sha256'=m->'runtime'->>'auth_binding_sha256'
 and exists(select 1 from kxra_paired_admission.reviews r where r.id=a.runtime_review_id and r.kind='RUNTIME' and r.artifact=m->'runtime_review' and r.artifact->>'id'=r.id::text
  and r.revoked_at is null and r.expires_at>clock_timestamp() and(r.artifact->>'expires_at')::timestamptz>clock_timestamp()
  and r.artifact->>'state'='ACCEPTED' and(r.artifact->>'reviewer_id')::uuid<>a.account_id)
 and exists(select 1 from kxra_paired_admission.reviews r where r.id=a.auth_review_id and r.kind='AUTH' and r.artifact=m->'auth_review' and r.artifact->>'id'=r.id::text
  and r.revoked_at is null and r.expires_at>clock_timestamp() and(r.artifact->>'expires_at')::timestamptz>clock_timestamp()
  and r.artifact->>'state'='ACCEPTED' and r.artifact->>'scope'='CUSTOMER_OWNED_PAIRED_TEXT')
 and exists(select 1 from kxra_paired_admission.reviews r where r.id=a.source_review_id and r.kind='SOURCE'
  and r.artifact=jsonb_build_object('approval',m->'approval','task',m->'task','context',m->'context')
  and r.revoked_at is null and r.expires_at>clock_timestamp())
 and m->'approval'->>'state'='APPROVED' and m->'approval'->>'content_hash'=m->'task'->>'content_hash'
 and(m->'task'->>'lease_until')::timestamptz>clock_timestamp()
 and jsonb_array_length(m->'task'->'sources') between 1 and 10
 and not exists(select 1 from jsonb_array_elements(m->'task'->'sources') s where not exists(
  select 1 from kxra.team_messages msg where msg.id=(s->>'id')::uuid and msg.room_id=a.room_id
   and msg.body=s->>'body' and coalesce(msg.parent_id,msg.id)=(s->>'thread')::uuid
   and coalesce(msg.parent_id,msg.id)=(m->'task'->>'thread_id')::uuid)),false);
exception when invalid_text_representation or invalid_parameter_value or datetime_field_overflow then return false;
end $$;
create function kxra_paired_admission.consume(t uuid,f uuid,a uuid,s text,p uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare row kxra_paired_admission.authorities;
begin
 if session_user<>'kxra_app' or t is null or f is null or a is null or s is null or p is null then raise insufficient_privilege;end if;
 select * into row from kxra_paired_admission.authorities where task_id=t for update;
 if not found then raise insufficient_privilege;end if;
 -- Revocations of these rows serialize with consumption. No lock spans a provider call.
 perform 1 from kxra_paired_admission.agents where id=(row.manifest->'task'->>'agent_id')::uuid for share;
 perform 1 from kxra_paired_admission.devices where id=row.device_id for share;
 perform 1 from kxra_paired_admission.reviews where id in(row.runtime_review_id,row.auth_review_id,row.source_review_id) order by id for share;
 perform 1 from kxra.account_identities where account_id=row.account_id for share;
 perform 1 from kxra.organisation_memberships where org_id=row.org_id and account_id=row.account_id for share;
 perform 1 from kxra.organisations where id=row.org_id for share;
 perform 1 from kxra.team_room_members where room_id=row.room_id and account_id=row.account_id for share;
 perform 1 from kxra.team_rooms where id=row.room_id for share;
 perform 1 from kxra.projects where id=(select project_id from kxra.team_rooms where id=row.room_id) for share;
 perform 1 from kxra.project_memberships where project_id=(select project_id from kxra.team_rooms where id=row.room_id) and org_id=row.org_id and user_id=row.account_id for share;
 perform 1 from kxra.team_messages where room_id=row.room_id and id in(select (v->>'id')::uuid from jsonb_array_elements(row.manifest->'task'->'sources')v) order by id for share;
 if not kxra_paired_admission.current_task(t) or row.snapshot_sha256 is distinct from s or(row.manifest->'task'->>'fence')::uuid is distinct from f or a is null or p is null then raise insufficient_privilege;end if;
 insert into kxra_paired_admission.consumptions(task_id,attempt_id,permit_id,snapshot_sha256) values(t,a,p,s) on conflict do nothing;
 if not found then return jsonb_build_object('state','ALREADY_CONSUMED');end if;
 return jsonb_build_object('state','CONSUMED','permit_id',p,'snapshot_sha256',s,'realm_id',row.manifest->>'realm_id','continuity_epoch',row.manifest->>'continuity_epoch',
  'expires_at',to_char(least((row.manifest->'task'->>'lease_until')::timestamptz,
   (row.manifest->'runtime_review'->>'expires_at')::timestamptz,(row.manifest->'auth_review'->>'expires_at')::timestamptz,
   (select expires_at from kxra_paired_admission.devices where id=row.device_id),
   (select min(expires_at) from kxra_paired_admission.reviews where id in(row.runtime_review_id,row.auth_review_id,row.source_review_id))) at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
end $$;
alter table kxra_paired_admission.authorities enable row level security;
alter table kxra_paired_admission.devices enable row level security;
alter table kxra_paired_admission.agents enable row level security;
alter table kxra_paired_admission.reviews enable row level security;
alter table kxra_paired_admission.consumptions enable row level security;
create policy scoped_authority on kxra_paired_admission.authorities for select to authenticated using(kxra_paired_admission.current_task(task_id));
revoke all on all tables in schema kxra_paired_admission from public,anon,authenticated,kxra_app;
revoke all on all functions in schema kxra_paired_admission from public,anon,authenticated,kxra_app;
grant usage on schema kxra_paired_admission to authenticated;
grant select(task_id,manifest,snapshot_sha256) on kxra_paired_admission.authorities to authenticated;
grant execute on function kxra_paired_admission.current_task(uuid),kxra_paired_admission.consume(uuid,uuid,uuid,text,uuid) to authenticated;
commit;
