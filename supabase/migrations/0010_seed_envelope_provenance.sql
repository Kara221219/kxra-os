begin;

-- Upgrade legacy data-only hashes to hashes of the complete imported record.
-- The importer immediately compares these envelopes with the reviewed files;
-- any local source-row change aborts the whole startup transaction.
do $$ begin
 if exists(select 1 from kxra.records where source_code is not null) then
  if exists(
   select 1 from kxra.records r join kxra.projects p on p.id=r.project_id
   where r.source_code like 'PROJECT-%-BRIEF' and (
    r.source_code<>p.code||'-BRIEF' or r.body<>p.next_action or
    r.data<>jsonb_build_object('next_action',p.next_action) or
    r.title not in ('Project brief','Project next action')
   )
  ) then raise exception 'Project brief envelope requires manual reconciliation';end if;

  alter table kxra.records disable trigger records_guard;
  alter table kxra.records disable trigger records_audit;
  with envelopes as (
   select r.id,
    case when r.source_code like 'PROJECT-%-BRIEF' then 'Project next action' else r.title end as canonical_title,
    jsonb_build_object(
     'kind',r.kind::text,
     'title',case when r.source_code like 'PROJECT-%-BRIEF' then 'Project next action' else r.title end,
     'body',r.body,
     'data',r.data,
     'classification',r.classification::text,
     'status',r.status,
     'visibility',r.visibility,
     'project_id',r.project_id
    ) as envelope
   from kxra.records r where r.source_code is not null
  )
  update kxra.records r set
   title=e.canonical_title,
   provenance=r.provenance||jsonb_build_object(
    'source_hash',encode(sha256(convert_to(e.envelope::text,'UTF8')),'hex'),
    'source_version',1,
    'importer','genesis-v3'
   ),
   version=r.version+1,
   updated_at=now()
  from envelopes e where e.id=r.id;
  alter table kxra.records enable trigger records_guard;
  alter table kxra.records enable trigger records_audit;

  insert into kxra.record_versions(
   record_id,version,title,body,data,classification,status,editor_id,provenance
  )
  select id,version,title,body,data,classification,status,null,provenance
  from kxra.records where source_code is not null
  on conflict do nothing;
  insert into kxra.audit_events(org_id,actor_id,action,resource_id,metadata)
  select org_id,null,'seed.envelope_hash.upgraded',id,
   jsonb_build_object('version',version,'source_version',provenance->'source_version')
  from kxra.records where source_code is not null;
 end if;
end $$;

commit;
