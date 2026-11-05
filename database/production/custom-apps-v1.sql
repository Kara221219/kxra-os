-- REVIEW ONLY. Fresh canonical117 or reviewed production cohort, without the local custom-app extension.
-- No policy data, feature activation, external publication or hosted executor.
begin;

create function kxra_private.custom_app_schema_valid(s jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare f jsonb;o jsonb;seen text[]='{}';opts text[];
begin
 if s is null or jsonb_typeof(s)<>'object' or octet_length(s::text)>32768
 or s-array['format','title','description','fields']<>'{}'::jsonb or (s->>'format') is distinct from 'kxra.form.v1'
 or jsonb_typeof(s->'title')<>'string' or length(s->>'title') not between 1 and 120
 or jsonb_typeof(s->'description')<>'string' or length(s->>'description')>1000
 or jsonb_typeof(s->'fields')<>'array' or jsonb_array_length(s->'fields') not between 1 and 20
 or not s ?& array['format','title','description','fields'] then return false;end if;
 for f in select value from jsonb_array_elements(s->'fields') loop
  if jsonb_typeof(f)<>'object' or not f ?& array['key','label','required','type']
  or jsonb_typeof(f->'key')<>'string' or (f->>'key')!~'^[a-z][a-z0-9_]{0,39}$'
  or f->>'key' in ('constructor','prototype','__proto__') or f->>'key'=any(seen)
  or jsonb_typeof(f->'label')<>'string' or length(f->>'label') not between 1 and 120
  or jsonb_typeof(f->'required')<>'boolean' or jsonb_typeof(f->'type')<>'string' or f->>'type' not in ('text','textarea','checkbox','select') then return false;end if;
  seen=array_append(seen,f->>'key');
  if f->>'type'='select' then
   if f-array['key','label','required','type','options']<>'{}'::jsonb or not f ? 'options'
   or jsonb_typeof(f->'options')<>'array' or jsonb_array_length(f->'options') not between 1 and 20 then return false;end if;
   opts='{}';
   for o in select value from jsonb_array_elements(f->'options') loop
    if jsonb_typeof(o)<>'string' or length(o#>>'{}') not between 1 and 120 or (o#>>'{}')=any(opts) then return false;end if;
    opts=array_append(opts,o#>>'{}');
   end loop;
  elsif f-array['key','label','required','type']<>'{}'::jsonb then return false;end if;
 end loop;return true;
exception when others then return false;
end $$;
create table kxra.custom_apps(
 id uuid primary key,org_id uuid not null,room_id uuid not null,
 revision integer not null default 1 check(revision>0),latest_version integer not null default 1 check(latest_version between 1 and 100),
 active_version integer,created_by uuid not null references kxra.account_identities(account_id),
 foreign key(room_id,org_id) references kxra.team_rooms(id,org_id),unique(id,room_id)
);
create table kxra.custom_app_versions(
 app_id uuid not null references kxra.custom_apps(id),version integer not null check(version between 1 and 100),
 artifact jsonb not null check(artifact-array['runtime','schema']='{}'::jsonb and (artifact->>'runtime') is not distinct from 'kxra.form.v1' and kxra_private.custom_app_schema_valid(artifact->'schema')),
 sha256 text not null check(sha256=encode(sha256(convert_to(artifact::text,'UTF8')),'hex')),
 created_by uuid not null references kxra.account_identities(account_id),created_at timestamptz not null default now(),primary key(app_id,version)
);
alter table kxra.custom_apps add foreign key(id,active_version) references kxra.custom_app_versions(app_id,version);
create table kxra.custom_app_releases(
 app_id uuid not null,revision integer not null,version integer not null,
 action text not null check(action in ('PUBLISH_LOCAL','ROLLBACK_LOCAL','PUBLISH','ROLLBACK')),created_by uuid not null references kxra.account_identities(account_id),
 created_at timestamptz not null default now(),primary key(app_id,revision),foreign key(app_id,version) references kxra.custom_app_versions(app_id,version)
);
create function kxra_private.custom_apps_local() returns boolean language sql stable set search_path='' as $$
 select coalesce(session_user='kxra_app' and current_setting('request.kxra.execution_mode',true)='fixture' and auth.uid() is not null,false)
$$;

create function kxra_private.custom_apps_access() returns boolean language sql volatile security definer set search_path='' as $$
 select coalesce(kxra_private.custom_apps_local() or (
 session_user='kxra_app' and current_setting('request.kxra.execution_mode',true)='hosted'
 and current_setting('request.kxra.custom_apps_verified',true)='on'
 and kxra_private.member_org() is not null
 and exists(select 1 from kxra.organisations o where o.id=kxra_private.member_org() and o.organisation_kind='CUSTOMER' and o.state='ACTIVE')
 and exists(select 1 from kxra.account_identities a where a.account_id=auth.uid() and a.state='ACTIVE' and a.email_verified_at is not null and a.session_version=(auth.jwt()->>'session_version')::integer and a.session_version=(auth.jwt()->>'provider_session_version')::integer)
 and kxra_private.is_live_billing_lane(kxra_private.member_org()) and kxra_private.live_paid_entitled(kxra_private.member_org())
 ),false)
$$;
create function kxra_private.custom_app_write_fence() returns void language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock_shared(hashtextextended('kxra-custom-app-authority-v1',0));
 -- All listed authority writes take the exclusive statement fence before their row writes.
 perform account_id from kxra.account_identities where account_id=auth.uid() for share;
 perform id from kxra.organisation_memberships where account_id=auth.uid() order by id for share;
 if not kxra_private.custom_apps_access() then raise insufficient_privilege;end if;
end $$;
alter table kxra.custom_apps enable row level security;
alter table kxra.custom_app_versions enable row level security;
alter table kxra.custom_app_releases enable row level security;
create policy custom_apps_read on kxra.custom_apps for select to authenticated using(kxra_private.custom_apps_access() and kxra_private.can_team_room(room_id));
create policy custom_versions_read on kxra.custom_app_versions for select to authenticated using(exists(select 1 from kxra.custom_apps a where a.id=app_id));
create policy custom_releases_read on kxra.custom_app_releases for select to authenticated using(exists(select 1 from kxra.custom_apps a where a.id=app_id));
revoke all on kxra.custom_apps,kxra.custom_app_versions,kxra.custom_app_releases from public,anon,authenticated;
grant select on kxra.custom_apps,kxra.custom_app_versions,kxra.custom_app_releases to authenticated;
create function kxra_private.custom_app_immutable() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'Immutable custom app artifact';end $$;
create trigger immutable_custom_versions before update or delete on kxra.custom_app_versions for each row execute function kxra_private.custom_app_immutable();
create trigger immutable_custom_releases before update or delete on kxra.custom_app_releases for each row execute function kxra_private.custom_app_immutable();
create function kxra.custom_app_register(i uuid,r uuid,expected integer,s jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare a kxra.custom_apps;v integer;o uuid;payload jsonb;
begin
 perform kxra_private.custom_app_write_fence();
 if not kxra_private.custom_apps_access() or not kxra_private.manages_team_room(r) then raise insufficient_privilege;end if;
 if i is null or expected is null or expected<0 or not kxra_private.custom_app_schema_valid(s) then raise exception 'Invalid custom app';end if;
 perform pg_advisory_xact_lock(hashtext('custom-app:'||i));
 select * into a from kxra.custom_apps where id=i for update;
 if found then
  if a.room_id<>r then raise insufficient_privilege;end if;
  if a.revision<>expected or a.latest_version>=100 then raise exception 'Custom app changed or version limit reached';end if;
  v=a.latest_version+1;
  update kxra.custom_apps set latest_version=v,revision=revision+1 where id=i;
 else
  if expected<>0 then raise exception 'Custom app unavailable';end if;
  -- Lock the room to serialize the per-room quota and bound catalog responses.
  select org_id into o from kxra.team_rooms where id=r for update;
  if (select count(*) from kxra.custom_apps where room_id=r)>=20 then raise exception 'Local app limit reached';end if;
  insert into kxra.custom_apps(id,org_id,room_id,created_by) values(i,o,r,auth.uid());v=1;
 end if;
 payload=jsonb_build_object('runtime','kxra.form.v1','schema',s);
 insert into kxra.custom_app_versions(app_id,version,artifact,sha256,created_by)
 values(i,v,payload,encode(sha256(convert_to(payload::text,'UTF8')),'hex'),auth.uid());return i;
end $$;
create function kxra.custom_app_release(i uuid,r uuid,expected integer,v integer,action text) returns void
language plpgsql security definer set search_path='' as $$
declare a kxra.custom_apps;
begin
 if not kxra_private.custom_apps_local() or not kxra_private.manages_team_room(r) then raise insufficient_privilege;end if;
 select * into a from kxra.custom_apps where id=i and room_id=r for update;
 if not found then raise insufficient_privilege;end if;
 if expected is null or a.revision<>expected or action is null or action not in ('PUBLISH_LOCAL','ROLLBACK_LOCAL')
 or v is null or not exists(select 1 from kxra.custom_app_versions where app_id=i and version=v)
 or a.active_version=v then raise exception 'Custom app changed or release unavailable';end if;
 if action='ROLLBACK_LOCAL' and not exists(select 1 from kxra.custom_app_releases where app_id=i and version=v) then raise exception 'Rollback requires a previous local release';end if;
 insert into kxra.custom_app_releases(app_id,revision,version,action,created_by) values(i,a.revision+1,v,action,auth.uid());
 update kxra.custom_apps set active_version=v,revision=revision+1 where id=i;
end $$;
revoke all on function kxra_private.custom_app_schema_valid(jsonb),kxra_private.custom_apps_local(),kxra_private.custom_app_immutable(),kxra.custom_app_register(uuid,uuid,integer,jsonb),kxra.custom_app_release(uuid,uuid,integer,integer,text) from public,anon,authenticated;
grant execute on function kxra_private.custom_apps_local(),kxra.custom_app_register(uuid,uuid,integer,jsonb),kxra.custom_app_release(uuid,uuid,integer,integer,text) to authenticated;

create table kxra.custom_app_reviews(
 app_id uuid not null,version integer not null,sequence bigint generated always as identity primary key,
 artifact_sha256 text not null check(artifact_sha256~'^[a-f0-9]{64}$'),decision text not null check(decision in('APPROVED','REJECTED','WITHDRAWN')),
 reviewed_by uuid not null references kxra.account_identities(account_id),session_version integer not null,
 reviewed_at timestamptz not null default clock_timestamp(),expires_at timestamptz not null,
 foreign key(app_id,version) references kxra.custom_app_versions(app_id,version),check(expires_at>reviewed_at)
);
create index custom_app_review_latest on kxra.custom_app_reviews(app_id,version,sequence desc);
alter table kxra.custom_app_reviews enable row level security;
create policy custom_app_reviews_read on kxra.custom_app_reviews for select to authenticated using(exists(select 1 from kxra.custom_apps a where a.id=app_id));
revoke all on kxra.custom_app_reviews from public,anon,authenticated,kxra_billing_worker,kxra_ai_worker;
revoke all on sequence kxra.custom_app_reviews_sequence_seq from public,anon,authenticated,kxra_billing_worker,kxra_ai_worker;
grant select on kxra.custom_app_reviews to authenticated;
create trigger immutable_custom_app_reviews before update or delete on kxra.custom_app_reviews for each row execute function kxra_private.custom_app_immutable();
create function kxra_private.custom_app_review_current(i uuid,v integer) returns boolean language sql volatile security definer set search_path='' as $$
 select coalesce((select r.decision='APPROVED' and r.expires_at>clock_timestamp() and r.reviewed_at<=clock_timestamp()
 and r.artifact_sha256=s.sha256 and r.reviewed_by<>s.created_by
 and exists(select 1 from kxra.account_identities account join kxra.organisation_memberships m on m.account_id=account.account_id
 where account.account_id=r.reviewed_by and account.state='ACTIVE' and account.email_verified_at is not null and account.session_version=r.session_version
 and exists(select 1 from kxra.team_rooms room where room.id=a.room_id and room.org_id=a.org_id and (room.access='PROJECT' or exists(select 1 from kxra.team_room_members rm where rm.room_id=room.id and rm.account_id=r.reviewed_by and rm.active)))
 and m.org_id=a.org_id and m.security_role='ORG_ADMIN' and m.state='ACTIVE' and m.revoked_at is null and m.starts_at<=clock_timestamp() and (m.expires_at is null or m.expires_at>clock_timestamp()))
 from kxra.custom_app_reviews r join kxra.custom_app_versions s on s.app_id=r.app_id and s.version=r.version join kxra.custom_apps a on a.id=s.app_id
 where r.app_id=i and r.version=v order by r.sequence desc limit 1),false)
$$;
create function kxra.custom_app_review_status(i uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not kxra_private.custom_apps_access() or not exists(select 1 from kxra.custom_apps a where a.id=i and kxra_private.can_team_room(a.room_id)) then raise insufficient_privilege;end if;
 return coalesce((select jsonb_agg(to_jsonb(current_review) order by version) from (
 select distinct on (r.version) r.version,r.decision,r.artifact_sha256,r.expires_at,kxra_private.custom_app_review_current(i,r.version) current
 from kxra.custom_app_reviews r where r.app_id=i order by r.version,r.sequence desc) current_review),'[]'::jsonb);
end $$;
revoke all on function kxra.custom_app_review_status(uuid) from public,anon,authenticated,kxra_billing_worker,kxra_ai_worker;
grant execute on function kxra.custom_app_review_status(uuid) to authenticated;
create function kxra.custom_app_review(i uuid,r uuid,expected integer,v integer,h text,decision text) returns void language plpgsql security definer set search_path='' as $$
declare a kxra.custom_apps;s kxra.custom_app_versions;
begin
 perform kxra_private.custom_app_write_fence();
 if kxra_private.custom_apps_local() or not coalesce(kxra_private.mfa_owner(kxra_private.member_org()),false) or not kxra_private.can_team_room(r,true) then raise insufficient_privilege;end if;
 select * into a from kxra.custom_apps where id=i and room_id=r for update;
 if not found then raise insufficient_privilege;end if;
 select * into s from kxra.custom_app_versions where app_id=i and version=v;
 if not found or s.created_by=auth.uid() or s.sha256 is distinct from h then raise insufficient_privilege;end if;
 if expected is null or expected<>a.revision or decision is null or decision not in('APPROVED','REJECTED','WITHDRAWN') then raise exception 'Review changed or invalid';end if;
 insert into kxra.custom_app_reviews(app_id,version,artifact_sha256,decision,reviewed_by,session_version,expires_at)
 values(i,v,h,decision,auth.uid(),(auth.jwt()->>'session_version')::integer,clock_timestamp()+interval '24 hours');
 update kxra.custom_apps set revision=revision+1 where id=i;
end $$;
create function kxra.custom_app_release_reviewed(i uuid,r uuid,expected integer,v integer,action text) returns void language plpgsql security definer set search_path='' as $$
declare a kxra.custom_apps;reviewer uuid;
begin
 perform kxra_private.custom_app_write_fence();
 if kxra_private.custom_apps_local() or not kxra_private.manages_team_room(r) then raise insufficient_privilege;end if;
 -- Reviewer identity/membership changes serialize with publication and record mutation.
 select reviewed_by into reviewer from kxra.custom_app_reviews where app_id=i and version=v order by sequence desc limit 1;
 perform account_id from kxra.account_identities where account_id=reviewer for share;
 perform id from kxra.organisation_memberships where account_id=reviewer order by id for share;
 select * into a from kxra.custom_apps where id=i and room_id=r for update;
 if not found or not kxra_private.custom_app_review_current(i,v) then raise insufficient_privilege;end if;
 if expected is null or expected<>a.revision or action is null or action not in('PUBLISH','ROLLBACK') or a.active_version=v then raise exception 'Release changed or invalid';end if;
 if action='ROLLBACK' and not exists(select 1 from kxra.custom_app_releases where app_id=i and version=v and custom_app_releases.action in('PUBLISH','ROLLBACK')) then raise exception 'Rollback requires a reviewed release';end if;
 insert into kxra.custom_app_releases(app_id,revision,version,action,created_by) values(i,a.revision+1,v,action,auth.uid());
 update kxra.custom_apps set active_version=v,revision=revision+1 where id=i;
end $$;
revoke all on function kxra_private.custom_apps_access(),kxra_private.custom_app_write_fence(),kxra_private.custom_app_review_current(uuid,integer),kxra.custom_app_review(uuid,uuid,integer,integer,text,text),kxra.custom_app_release_reviewed(uuid,uuid,integer,integer,text) from public,anon,authenticated,kxra_billing_worker,kxra_ai_worker;
grant execute on function kxra_private.custom_apps_access(),kxra.custom_app_review(uuid,uuid,integer,integer,text,text),kxra.custom_app_release_reviewed(uuid,uuid,integer,integer,text) to authenticated;

create function kxra_private.custom_app_values_valid(s jsonb,d jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare f jsonb;v jsonb;k text;
 whitespace text=E' \t\n\r'||chr(11)||chr(12)||U&'\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF';
begin
 if not kxra_private.custom_app_schema_valid(s) or d is null or jsonb_typeof(d)<>'object'
 or octet_length(d::text)>32768 or (select count(*) from jsonb_object_keys(d))<>jsonb_array_length(s->'fields') then return false;end if;
 for f in select value from jsonb_array_elements(s->'fields') loop
  k=f->>'key';v=d->k;
  if not d ? k then return false;end if;
  if f->>'type'='checkbox' then
   if jsonb_typeof(v)<>'boolean' or ((f->>'required')::boolean and v<>'true'::jsonb) then return false;end if;
  else
   if jsonb_typeof(v)<>'string' or length(v#>>'{}')>(case when f->>'type'='textarea' then 4000 else 1000 end)
   or ((f->>'required')::boolean and length(btrim(v#>>'{}',whitespace))=0) then return false;end if;
   if f->>'type'='select' and (v#>>'{}')<>'' and not (f->'options') @> jsonb_build_array(v) then return false;end if;
  end if;
 end loop;return true;
exception when others then return false;
end $$;
create table kxra.custom_app_records(
 id uuid primary key,app_id uuid not null,org_id uuid not null,room_id uuid not null,schema_version integer not null,
 created_by uuid not null references kxra.account_identities(account_id),created_at timestamptz not null default now(),
 unique(id,app_id,schema_version),foreign key(app_id,room_id) references kxra.custom_apps(id,room_id),
 foreign key(room_id,org_id) references kxra.team_rooms(id,org_id),foreign key(app_id,schema_version) references kxra.custom_app_versions(app_id,version)
);
create index custom_records_app on kxra.custom_app_records(app_id,id desc);
create table kxra.custom_app_record_versions(
 record_id uuid not null,app_id uuid not null,schema_version integer not null,version integer not null check(version between 1 and 100),
 operation_id uuid not null unique,base_app_revision integer not null check(base_app_revision>0),
 data jsonb not null check(jsonb_typeof(data)='object' and octet_length(data::text)<=32768),
 created_by uuid not null references kxra.account_identities(account_id),created_at timestamptz not null default now(),
 primary key(record_id,version),foreign key(record_id,app_id,schema_version) references kxra.custom_app_records(id,app_id,schema_version)
);
alter table kxra.custom_app_records enable row level security;
alter table kxra.custom_app_record_versions enable row level security;
create policy custom_records_read on kxra.custom_app_records for select to authenticated using(exists(select 1 from kxra.custom_apps a where a.id=app_id and a.room_id=custom_app_records.room_id));
create policy custom_record_versions_read on kxra.custom_app_record_versions for select to authenticated using(exists(select 1 from kxra.custom_app_records r where r.id=record_id and r.app_id=custom_app_record_versions.app_id));
revoke all on kxra.custom_app_records,kxra.custom_app_record_versions from public,anon,authenticated;
grant select on kxra.custom_app_records,kxra.custom_app_record_versions to authenticated;
create trigger immutable_custom_records before update or delete on kxra.custom_app_records for each row execute function kxra_private.custom_app_immutable();
create trigger immutable_custom_record_versions before update or delete on kxra.custom_app_record_versions for each row execute function kxra_private.custom_app_immutable();
create function kxra.custom_app_record_save(op uuid,i uuid,a_id uuid,r uuid,expected_app integer,sv integer,expected_record integer,d jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a kxra.custom_apps;rec kxra.custom_app_records;prior kxra.custom_app_record_versions;s jsonb;latest integer;
begin
 perform kxra_private.custom_app_write_fence();
 if kxra_private.custom_apps_access() is not true or kxra_private.can_team_room(r,true) is not true then raise insufficient_privilege;end if;
 if op is null or i is null or expected_app is null or expected_app<1 or expected_record is null or expected_record not between 0 and 99 or sv is null then raise exception 'Invalid record request';end if;
 select * into a from kxra.custom_apps where id=a_id and room_id=r for update;
 if not found then raise insufficient_privilege;end if;
 if not kxra_private.custom_apps_local() and not kxra_private.custom_app_review_current(a_id,a.active_version) then raise insufficient_privilege;end if;
 perform pg_advisory_xact_lock(hashtext('custom-record-operation:'||op));
 select * into prior from kxra.custom_app_record_versions where operation_id=op;
 if found then
  if prior.app_id<>a_id or prior.record_id<>i or prior.created_by<>auth.uid() or prior.schema_version<>sv
  or prior.base_app_revision<>expected_app or prior.version<>expected_record+1 or prior.data is distinct from d then raise exception 'Record request conflict';end if;
  return jsonb_build_object('record_id',i,'version',prior.version,'schema_version',sv,'operation_id',op);
 end if;
 if a.revision<>expected_app or a.active_version is distinct from sv then raise exception 'Active app changed; refresh before saving';end if;
 select artifact->'schema' into s from kxra.custom_app_versions where app_id=a_id and version=sv;
 if not kxra_private.custom_app_values_valid(s,d) then raise exception 'Invalid typed record';end if;
 perform pg_advisory_xact_lock(hashtext('custom-record:'||i));
 select * into rec from kxra.custom_app_records where id=i for update;
 if found then
  if rec.app_id<>a_id or rec.room_id<>r or rec.schema_version<>sv then raise insufficient_privilege;end if;
  select max(version) into latest from kxra.custom_app_record_versions where record_id=i;
  if latest is distinct from expected_record then raise exception 'Record changed; refresh before saving';end if;
 else
  if expected_record<>0 then raise exception 'Record unavailable';end if;
  -- App row lock also serializes quota admission and publication/schema changes.
  if (select count(*) from kxra.custom_app_records where app_id=a_id)>=500 then raise exception 'Local record limit reached';end if;
  insert into kxra.custom_app_records(id,app_id,org_id,room_id,schema_version,created_by) values(i,a_id,a.org_id,r,sv,auth.uid());
 end if;
 insert into kxra.custom_app_record_versions(record_id,app_id,schema_version,version,operation_id,base_app_revision,data,created_by)
 values(i,a_id,sv,expected_record+1,op,expected_app,d,auth.uid());
 return jsonb_build_object('record_id',i,'version',expected_record+1,'schema_version',sv,'operation_id',op);
end $$;
revoke all on function kxra_private.custom_app_values_valid(jsonb,jsonb),kxra.custom_app_record_save(uuid,uuid,uuid,uuid,integer,integer,integer,jsonb) from public,anon,authenticated;
grant execute on function kxra.custom_app_record_save(uuid,uuid,uuid,uuid,integer,integer,integer,jsonb) to authenticated;

create function kxra_private.custom_app_authority_fence() returns trigger language plpgsql set search_path='' as $$
begin perform pg_advisory_xact_lock(hashtextextended('kxra-custom-app-authority-v1',0));return null;end $$;
revoke all on function kxra_private.custom_app_authority_fence() from public,anon,authenticated,kxra_billing_worker,kxra_ai_worker;
create trigger a00_custom_app_authority before insert or update or delete on kxra.account_identities for each statement execute function kxra_private.custom_app_authority_fence();
create trigger a00_custom_app_authority before insert or update or delete on kxra.profiles for each statement execute function kxra_private.custom_app_authority_fence();
create trigger a00_custom_app_authority before insert or update or delete on kxra.organisations for each statement execute function kxra_private.custom_app_authority_fence();
create trigger a00_custom_app_authority before insert or update or delete on kxra.organisation_memberships for each statement execute function kxra_private.custom_app_authority_fence();
create trigger a00_custom_app_authority before insert or update or delete on kxra.project_memberships for each statement execute function kxra_private.custom_app_authority_fence();
create trigger a00_custom_app_authority before insert or update or delete on kxra.projects for each statement execute function kxra_private.custom_app_authority_fence();
create trigger a00_custom_app_authority before insert or update or delete on kxra.team_rooms for each statement execute function kxra_private.custom_app_authority_fence();
create trigger a00_custom_app_authority before insert or update or delete on kxra.team_room_members for each statement execute function kxra_private.custom_app_authority_fence();
create trigger a00_custom_app_authority before insert or update or delete on kxra.legal_document_requirements for each statement execute function kxra_private.custom_app_authority_fence();
create trigger a00_custom_app_authority before insert or update or delete on kxra.legal_documents for each statement execute function kxra_private.custom_app_authority_fence();
create trigger a00_custom_app_authority before insert or update or delete on kxra.legal_acceptances for each statement execute function kxra_private.custom_app_authority_fence();
create trigger a00_custom_app_authority before insert or update or delete on kxra_private.live_billing_bindings for each statement execute function kxra_private.custom_app_authority_fence();
create trigger a00_custom_app_authority before insert or update or delete on kxra_private.live_billing_mappings for each statement execute function kxra_private.custom_app_authority_fence();
create trigger a00_custom_app_authority before insert or update or delete on kxra_private.live_billing_activation for each statement execute function kxra_private.custom_app_authority_fence();
create trigger a00_custom_app_authority before insert or update or delete on kxra_private.live_paid_access for each statement execute function kxra_private.custom_app_authority_fence();
create trigger a00_custom_app_authority before insert or update or delete on kxra_private.live_paid_policies for each statement execute function kxra_private.custom_app_authority_fence();
create trigger a00_custom_app_authority before insert or update or delete on kxra_private.live_paid_receipts for each statement execute function kxra_private.custom_app_authority_fence();
create trigger a00_custom_app_authority before insert or update or delete on kxra_private.live_billing_intents for each statement execute function kxra_private.custom_app_authority_fence();
create trigger a00_custom_app_authority before insert or update or delete on kxra_private.live_customer_intents for each statement execute function kxra_private.custom_app_authority_fence();
create trigger a00_custom_app_authority before insert or update or delete on kxra_private.modern_billing_execution_identity for each statement execute function kxra_private.custom_app_authority_fence();
create trigger a00_custom_app_authority before insert or update or delete on kxra_private.business_declarations for each statement execute function kxra_private.custom_app_authority_fence();
create trigger a00_custom_app_authority before insert or update or delete on kxra_private.business_eligibility_policies for each statement execute function kxra_private.custom_app_authority_fence();
create trigger a00_custom_app_authority before insert or update or delete on kxra_private.business_eligibility_reviews for each statement execute function kxra_private.custom_app_authority_fence();
create trigger a00_custom_app_authority before insert or update or delete on kxra.workspace_pilots for each statement execute function kxra_private.custom_app_authority_fence();
create trigger a00_custom_app_authority before insert or update or delete on kxra.pilot_stripe_bindings for each statement execute function kxra_private.custom_app_authority_fence();
create trigger a00_custom_app_authority before insert or update or delete on kxra.invitations for each statement execute function kxra_private.custom_app_authority_fence();
create trigger a00_custom_app_authority before insert or update or delete on kxra.billing_customers for each statement execute function kxra_private.custom_app_authority_fence();
commit;
