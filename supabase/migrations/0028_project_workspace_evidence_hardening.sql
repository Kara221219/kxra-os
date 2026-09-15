begin;

-- PROJECT-001 requires five distinct current records. A single source cannot
-- be relabelled as route, liquidity, recovery, buyer and regulatory evidence.
create or replace function kxra.create_clpr_revisit_review(
 project uuid,recommendation text,rationale text,
 route_id uuid,route_version integer,liquidity_id uuid,liquidity_version integer,
 recovery_id uuid,recovery_version integer,buyer_id uuid,buyer_version integer,
 regulatory_id uuid,regulatory_version integer
) returns kxra.clpr_revisit_reviews language plpgsql security definer set search_path='' as $$
 declare o uuid=kxra_private.member_org();v kxra.clpr_revisit_reviews;evidence jsonb;distinct_evidence integer;
 begin
 select count(distinct selected_id) into distinct_evidence
 from unnest(array[route_id,liquidity_id,recovery_id,buyer_id,regulatory_id]) selected(selected_id);
 if not kxra_private.is_owner(o) or not exists(
   select 1 from kxra.projects p where p.id=project and p.org_id=o and p.code='PROJECT-001'
  ) or recommendation not in ('MONITOR','REVISIT','DO_NOT_REVISIT')
  or length(trim(rationale))<1 or distinct_evidence<>5
 then raise exception 'CLPR revisit review unavailable';end if;
 evidence=jsonb_build_array(
  jsonb_build_object('record_id',route_id,'version',route_version),
  jsonb_build_object('record_id',liquidity_id,'version',liquidity_version),
  jsonb_build_object('record_id',recovery_id,'version',recovery_version),
  jsonb_build_object('record_id',buyer_id,'version',buyer_version),
  jsonb_build_object('record_id',regulatory_id,'version',regulatory_version));
 perform kxra_private.require_evidence(o,project,evidence);
 insert into kxra.clpr_revisit_reviews(
  org_id,project_id,recommendation,rationale,
  route_evidence_id,route_evidence_version,liquidity_evidence_id,liquidity_evidence_version,
  recovery_evidence_id,recovery_evidence_version,buyer_evidence_id,buyer_evidence_version,
  regulatory_evidence_id,regulatory_evidence_version,created_by
 ) values(o,project,recommendation,trim(rationale),route_id,route_version,liquidity_id,liquidity_version,
  recovery_id,recovery_version,buyer_id,buyer_version,regulatory_id,regulatory_version,auth.uid())
 returning * into v;
 insert into kxra.audit_events(org_id,actor_id,action,resource_id,metadata)
 values(o,auth.uid(),'clpr.revisit.reviewed',v.id,
  jsonb_build_object('project_id',project,'recommendation',recommendation));
 return v;
 end $$;

create or replace function kxra.create_gate_evidence_packet(
 project uuid,gate_name text,title text,summary text,claims jsonb,evidence jsonb
) returns uuid language plpgsql security definer set search_path='' as $$
 declare o uuid=kxra_private.member_org();new_id uuid;distinct_evidence integer;
 begin
 if not kxra_private.is_owner(o) or not kxra_private.can_project(project)
  or not kxra_private.gate_matches_project(project,gate_name)
  or not kxra_private.gate_claims_valid(gate_name,claims)
  or length(trim(title)) not between 1 and 240 or length(trim(summary))<1
 then raise exception 'Gate evidence unavailable';end if;
 if gate_name='P001_REVISIT' then
  if jsonb_typeof(evidence)<>'array' or jsonb_array_length(evidence)<5
  then raise exception 'Gate evidence unavailable';end if;
  select count(distinct item->>'record_id') into distinct_evidence
  from jsonb_array_elements(evidence) item;
  if distinct_evidence<5 then raise exception 'Gate evidence unavailable';end if;
 end if;
 perform kxra_private.require_evidence(o,project,evidence);
 insert into kxra.records(org_id,project_id,kind,title,body,data,classification,visibility,created_by)
 values(o,project,'note',title,summary,claims||jsonb_build_object('gate',gate_name),
  'USER-SUPPLIED INFORMATION','project_shared',auth.uid()) returning id into new_id;
 perform kxra_private.add_evidence_links(o,project,new_id,1,'uses_evidence',evidence);
 return new_id;
 end $$;

revoke all on function
 kxra.create_clpr_revisit_review(uuid,text,text,uuid,integer,uuid,integer,uuid,integer,uuid,integer,uuid,integer),
 kxra.create_gate_evidence_packet(uuid,text,text,text,jsonb,jsonb)
from public;
grant execute on function
 kxra.create_clpr_revisit_review(uuid,text,text,uuid,integer,uuid,integer,uuid,integer,uuid,integer,uuid,integer),
 kxra.create_gate_evidence_packet(uuid,text,text,text,jsonb,jsonb)
to authenticated;

commit;
