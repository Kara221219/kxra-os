-- LOCAL FIXTURE EXTENSION ONLY. Not a release migration and never installed remotely.
-- Production migration numbering belongs to the release owner.
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
 action text not null check(action in ('PUBLISH_LOCAL','ROLLBACK_LOCAL')),created_by uuid not null references kxra.account_identities(account_id),
 created_at timestamptz not null default now(),primary key(app_id,revision),foreign key(app_id,version) references kxra.custom_app_versions(app_id,version)
);
create function kxra_private.custom_apps_local() returns boolean language sql stable set search_path='' as $$
 select coalesce(session_user='kxra_app' and current_setting('request.kxra.execution_mode',true)='fixture' and auth.uid() is not null,false)
$$;
alter table kxra.custom_apps enable row level security;
alter table kxra.custom_app_versions enable row level security;
alter table kxra.custom_app_releases enable row level security;
create policy custom_apps_read on kxra.custom_apps for select to authenticated using(kxra_private.custom_apps_local() and kxra_private.can_team_room(room_id));
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
 if not kxra_private.custom_apps_local() or not kxra_private.manages_team_room(r) then raise insufficient_privilege;end if;
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
commit;
