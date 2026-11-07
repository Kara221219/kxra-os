begin;

alter table kxra.projects add column source_code text unique;
alter table kxra.projects add column source_version integer check(source_version>0);
alter table kxra.projects add column source_hash text check(source_hash ~ '^[a-f0-9]{64}$');
alter table kxra.projects add column source_data jsonb;
alter table kxra.projects add constraint project_source_envelope check(
 (source_code is null and source_version is null and source_hash is null and source_data is null) or
 (source_code is not null and source_version is not null and source_hash is not null and jsonb_typeof(source_data)='object')
);

create function kxra_private.guard_project_provenance() returns trigger
language plpgsql set search_path='' as $$ begin
 if old.source_hash is not null and
  (new.source_code,new.source_version,new.source_hash,new.source_data)
  is distinct from
  (old.source_code,old.source_version,old.source_hash,old.source_data)
 then raise exception 'Immutable project provenance';end if;
 return new;
end $$;
create trigger project_provenance_guard before update on kxra.projects
for each row execute function kxra_private.guard_project_provenance();

revoke all on all functions in schema kxra_private from public;
revoke all on function kxra_private.guard_project_provenance() from authenticated,anon;

commit;
