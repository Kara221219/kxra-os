begin;

do $$ begin
 if exists(select 1 from kxra.records where source_code like 'PROJECT-%-BRIEF') then
  if (
   select count(*) from kxra.records r join kxra.projects p on p.id=r.project_id
   where r.source_code=p.code||'-BRIEF' and r.status='accepted' and r.data='{}'::jsonb
   and r.body=p.next_action
   and r.provenance->>'source_hash'=encode(
    sha256(convert_to(jsonb_build_object('next_action',r.body)::text,'UTF8')),'hex'
   )
  )<>5 then raise exception 'Project brief repair requires five exact legacy rows';end if;

  alter table kxra.records disable trigger records_guard;
  alter table kxra.records disable trigger records_audit;
  update kxra.records r set
   data=jsonb_build_object('next_action',r.body),version=r.version+1,updated_at=now()
  from kxra.projects p where p.id=r.project_id and r.source_code=p.code||'-BRIEF'
   and r.status='accepted' and r.data='{}'::jsonb and r.body=p.next_action;
  alter table kxra.records enable trigger records_guard;
  alter table kxra.records enable trigger records_audit;

  insert into kxra.record_versions(
   record_id,version,title,body,data,classification,status,editor_id,provenance
  )
  select id,version,title,body,data,classification,status,null,provenance
  from kxra.records where source_code like 'PROJECT-%-BRIEF'
  on conflict do nothing;
  insert into kxra.audit_events(org_id,actor_id,action,resource_id,metadata)
  select org_id,null,'seed.project_brief.repaired',id,jsonb_build_object('version',version)
  from kxra.records where source_code like 'PROJECT-%-BRIEF';
 end if;
end $$;

commit;
