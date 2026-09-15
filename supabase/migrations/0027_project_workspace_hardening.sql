begin;

-- RLS policies may call only this bounded visibility helper. Other private
-- workspace helpers remain unavailable to browser roles.
grant execute on function kxra_private.can_workspace_entry(uuid) to authenticated,anon;

create or replace function kxra_private.guard_workspace_entry() returns trigger
language plpgsql set search_path='' as $$ begin
 if tg_op='INSERT' then
  new.version=1;new.created_at=now();new.updated_at=now();
 else
  if (new.id,new.org_id,new.project_id,new.module_key,new.record_type,new.created_by,new.created_at,new.visibility)
   is distinct from
   (old.id,old.org_id,old.project_id,old.module_key,old.record_type,old.created_by,old.created_at,old.visibility)
  then raise exception 'Immutable workspace scope';end if;
  if old.status<>'DRAFT' then raise exception 'Reviewed workspace entry is immutable';end if;
  new.version=old.version+1;new.updated_at=now();
 end if;
 if not kxra_private.workspace_payload_valid(new.record_type,new.payload)
 then raise exception 'Invalid workspace payload';end if;
 if not exists(select 1 from kxra.project_workspace_modules m
  where m.project_id=new.project_id and m.module_key=new.module_key
   and m.source_kind='WORKSPACE_ENTRIES' and m.entry_type=new.record_type)
 then raise exception 'Workspace type mismatch';end if;
 if new.record_type='REPORT' and exists(
  select 1 from kxra.projects p where p.id=new.project_id and p.code='PROJECT-004'
 ) and new.payload->'paper_only' is distinct from 'true'::jsonb
 then raise exception 'PROJECT-004 reports must remain paper only';end if;
 return new;
end $$;

create or replace function kxra.create_property_asset(project uuid,module text,title text,asset_kind text,origin text)
returns kxra.property_assets language plpgsql security definer set search_path='' as $$
 declare o uuid=kxra_private.member_org();definition kxra.project_workspace_modules;v kxra.property_assets;
 begin
 select workspace_module.* into definition
 from kxra.project_workspace_modules workspace_module
 join kxra.projects p on p.id=workspace_module.project_id
 where workspace_module.project_id=project and workspace_module.module_key=module and p.code='PROJECT-003';
 if o is null or definition.project_id is null or definition.org_id<>o or definition.source_kind<>'PROPERTY_ASSETS'
  or not kxra_private.can_project(project,true) or length(trim(title)) not between 1 and 240
  or asset_kind not in ('PROPERTY_INPUT','FLOORPLAN','PHOTO','SOURCE_ASSET','DEMO')
  or origin not in ('REAL_INPUT','AI_GENERATED','AI_INFERRED')
  or not coalesce(definition.filter_spec->'asset_kinds' ? asset_kind,false)
 then raise exception 'Property asset unavailable';end if;
 insert into kxra.property_assets(org_id,project_id,module_key,title,asset_kind,origin,created_by)
 values(o,project,module,trim(title),asset_kind,origin,auth.uid()) returning * into v;
 insert into kxra.audit_events(org_id,actor_id,action,resource_id,metadata)
 values(o,auth.uid(),'property.asset.created',v.id,jsonb_build_object('project_id',project,'origin',origin,'asset_kind',asset_kind));
 return v;
 end $$;

create or replace function kxra.authorize_digital_local_prototype(
 target uuid,expected_version integer,gate_authorization uuid
) returns kxra.digital_opportunities language plpgsql security definer set search_path='' as $$
 declare v kxra.digital_opportunities;g kxra.project_gate_authorizations;
 begin
 select * into v from kxra.digital_opportunities where id=target for update;
 if not found then raise exception 'Exact demand gate authority required';end if;
 select * into g from kxra.project_gate_authorizations where id=gate_authorization;
 if not found or not kxra_private.is_owner(v.org_id) or v.version is distinct from expected_version
  or v.stage<>'EVIDENCE_REVIEW' or g.org_id<>v.org_id or g.project_id<>v.project_id
  or g.gate_code<>'P005_LOCAL_PROTOTYPE' or not exists(
   select 1 from kxra.record_links l where l.from_record_id=g.evidence_id
    and l.from_version=g.evidence_version and l.relation='uses_evidence'
    and l.to_record_id=v.demand_evidence_id and l.to_version=v.demand_evidence_version
  )
 then raise exception 'Exact demand gate authority required';end if;
 update kxra.digital_opportunities set stage='LOCAL_PROTOTYPE_AUTHORIZED',
  gate_authorization_id=g.id,version=version+1,updated_at=now()
 where id=v.id returning * into v;
 insert into kxra.audit_events(org_id,actor_id,action,resource_id,metadata)
 values(v.org_id,auth.uid(),'digital.opportunity.local_prototype_authorized',v.id,
  jsonb_build_object('project_id',v.project_id,'version',v.version,'scope','local_only','authorization_id',g.id));
 return v;
 end $$;

revoke all on function kxra.create_property_asset(uuid,text,text,text,text),
 kxra.authorize_digital_local_prototype(uuid,integer,uuid) from public;
grant execute on function kxra.create_property_asset(uuid,text,text,text,text),
 kxra.authorize_digital_local_prototype(uuid,integer,uuid) to authenticated;

commit;
