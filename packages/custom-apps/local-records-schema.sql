-- LOCAL SYNTHETIC PROPOSAL ONLY. Never part of release migration discovery.
begin;
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
 if kxra_private.custom_apps_local() is not true or kxra_private.can_team_room(r,true) is not true then raise insufficient_privilege;end if;
 if op is null or i is null or expected_app is null or expected_app<1 or expected_record is null or expected_record not between 0 and 99 or sv is null then raise exception 'Invalid record request';end if;
 select * into a from kxra.custom_apps where id=a_id and room_id=r for update;
 if not found then raise insufficient_privilege;end if;
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
commit;
