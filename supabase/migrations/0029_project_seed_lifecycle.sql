begin;

-- Project-dependent reference records must be provisioned when a project is
-- inserted. Supabase applies migrations before seed data, so migration-time
-- INSERT ... SELECT statements alone leave a freshly seeded environment empty.
create function kxra_private.prepare_project_defaults() returns trigger
language plpgsql set search_path='' as $$
begin
 new.lifecycle_stage=coalesce(new.lifecycle_stage,case new.stage
  when 'DISCOVERY' then 'PROBLEM_DISCOVERY'
  when 'VALIDATION' then 'VALIDATION'
  when 'FEASIBILITY' then 'FEASIBILITY'
  else null end);
 new.disposition=coalesce(new.disposition,case
  when new.status='MONITOR' then 'MONITOR'
  when new.status='INTERNAL R&D / PAPER ONLY' then 'MONITOR'
  when new.status in ('VALIDATION','VALIDATION / LAUNCH PREPARATION','VALIDATION / PROOF OF CONCEPT') then 'ACTIVE'
  else null end);
 new.next_gate=coalesce(new.next_gate,case new.code
  when 'PROJECT-001' then 'P001_REVISIT'
  when 'PROJECT-002' then 'P002_LISTING'
  when 'PROJECT-003' then 'P003_FAITHFUL_DELIVERY'
  when 'PROJECT-004' then 'P004_PAPER_READINESS'
  when 'PROJECT-005' then 'P005_LOCAL_PROTOTYPE'
  else null end);
 return new;
end $$;

create trigger projects_prepare_defaults before insert on kxra.projects
for each row execute function kxra_private.prepare_project_defaults();

create function kxra_private.provision_project_reference_data(target uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 with common(module_key,label,source_kind,entry_type,position,description,write_policy) as (values
 ('overview','Overview','PROJECT',null,1,'Current governed project state, scores, next action and project gate.','READ_ONLY'),
 ('problem','Problem','WORKSPACE_ENTRIES','NARRATIVE',2,'Versioned problem statements without inferred validation.','CONTRIBUTOR'),
 ('customer','Customer','WORKSPACE_ENTRIES','NARRATIVE',3,'Explicit customer definitions and unresolved customer questions.','CONTRIBUTOR'),
 ('value-proposition','Value Proposition','WORKSPACE_ENTRIES','NARRATIVE',4,'Evidence-labelled value proposition records.','CONTRIBUTOR'),
 ('market','Market','WORKSPACE_ENTRIES','RESEARCH_FINDING',5,'Market findings with source and date fields.','CONTRIBUTOR'),
 ('research','Research','RECORDS',null,6,'Accepted and draft research source records in this project.','READ_ONLY'),
 ('assumptions','Assumptions','RECORDS',null,7,'Classified assumptions in this project.','READ_ONLY'),
 ('experiments','Experiments','EXPERIMENTS',null,8,'Typed experiments, results and evidence links.','READ_ONLY'),
 ('decisions','Decisions','DECISIONS',null,9,'Versioned decisions and supersessions.','READ_ONLY'),
 ('risks','Risks','RISKS',null,10,'Classified project risks and mitigations.','READ_ONLY'),
 ('finance','Finance','FINANCE',null,11,'Deterministic native-currency actuals and labelled estimates.','OWNER'),
 ('roadmap','Roadmap','WORKSPACE_ENTRIES','MILESTONE',12,'Bounded milestones with explicit state and target date.','CONTRIBUTOR'),
 ('tasks','Tasks','TASKS',null,13,'Assigned work tied to exact record versions.','READ_ONLY'),
 ('files','Files','FILES',null,14,'Private project file metadata and quarantine state.','READ_ONLY'),
 ('activity','Activity','ACTIVITY',null,15,'Persisted project events; partner activity remains permission-scoped.','READ_ONLY'),
 ('metrics','Metrics','WORKSPACE_ENTRIES','METRIC',16,'Attributed point-in-time metrics; unknown values stay absent.','CONTRIBUTOR'),
 ('partners','Partners','PARTNERS',null,17,'Current project assignments within the viewer''s authority.','READ_ONLY'),
 ('approvals','Approvals','APPROVALS',null,18,'Exact consequential requests; details are owner-only.','OWNER')
)
insert into kxra.project_workspace_modules(
 org_id,project_id,module_key,label,module_group,source_kind,entry_type,position,description,write_policy
)
select p.org_id,p.id,c.module_key,c.label,'COMMON',c.source_kind,c.entry_type,c.position,c.description,c.write_policy
from kxra.projects p cross join common c where p.id=target
on conflict(project_id,module_key) do nothing;

 with specialist(code,module_key,label,source_kind,entry_type,position,description,hard_boundary,write_policy,filter_spec) as (values
 ('PROJECT-001','technical-research','Technical Research','WORKSPACE_ENTRIES','RESEARCH_FINDING',1,'Technical findings and source references.',null,'CONTRIBUTOR','{}'::jsonb),
 ('PROJECT-001','architecture-interoperability','Architecture / Interoperability','WORKSPACE_ENTRIES','RESEARCH_FINDING',2,'Route and interoperability architecture evidence.',null,'CONTRIBUTOR','{}'::jsonb),
 ('PROJECT-001','competitive-landscape','Competitive Landscape','WORKSPACE_ENTRIES','RESEARCH_FINDING',3,'Comparable routes, competitors and differentiation evidence.',null,'CONTRIBUTOR','{}'::jsonb),
 ('PROJECT-001','regulatory','Regulatory','WORKSPACE_ENTRIES','RESEARCH_FINDING',4,'Jurisdiction-specific regulatory findings and open questions.',null,'CONTRIBUTOR','{}'::jsonb),
 ('PROJECT-001','commercial-case','Commercial Case','WORKSPACE_ENTRIES','EVIDENCE_ITEM',5,'Buyer, liquidity and commercial evidence.',null,'CONTRIBUTOR','{}'::jsonb),
 ('PROJECT-001','revisit-criteria','Revisit Criteria','P001_REVISIT',null,6,'Evidence-bound monitor or revisit recommendations.','A revisit recommendation requires current route, liquidity, recovery, buyer and regulatory evidence.','OWNER','{}'::jsonb),
 ('PROJECT-001','red-team','Red Team','WORKSPACE_ENTRIES','EVIDENCE_ITEM',7,'Adversarial findings and unresolved failure modes.',null,'CONTRIBUTOR','{}'::jsonb),
 ('PROJECT-001','scorecard','Scorecard','PROJECT_SCORES',null,8,'Reviewed venture and confidence scores, or Not Assessed.',null,'READ_ONLY','{}'::jsonb),

 ('PROJECT-002','product-catalogue','Product Catalogue','WORKSPACE_ENTRIES','CATALOGUE_ITEM',1,'Supplier catalogue items with explicit evidence state.',null,'CONTRIBUTOR','{}'::jsonb),
 ('PROJECT-002','supplier-evidence','Supplier Evidence','WORKSPACE_ENTRIES','EVIDENCE_ITEM',2,'Supplier claims and missing evidence.',null,'CONTRIBUTOR','{}'::jsonb),
 ('PROJECT-002','fitment-matrix','Fitment Matrix','VEHICLE_COMPATIBILITY',null,3,'Exact vehicle-family fitment state.','Unknown fitment cannot be promoted without current accepted evidence.','OWNER','{}'::jsonb),
 ('PROJECT-002','vehicle-compatibility','Vehicle Compatibility','VEHICLE_COMPATIBILITY',null,4,'Vehicle compatibility and supplier SKU state.','Compatibility remains Unknown until reviewed against exact evidence.','OWNER','{}'::jsonb),
 ('PROJECT-002','safety-airbag-evidence','Safety / Airbag Evidence','VEHICLE_COMPATIBILITY',null,5,'Safety evidence state by vehicle family.','Safety may never be marked verified without current accepted evidence.','OWNER','{}'::jsonb),
 ('PROJECT-002','creative-assets','Creative Assets','WORKSPACE_ENTRIES','ASSET_NOTE',6,'Creative asset provenance and rights state.',null,'CONTRIBUTOR','{}'::jsonb),
 ('PROJECT-002','marketplace','Marketplace','WORKSPACE_ENTRIES','MARKET_ITEM',7,'Marketplace drafts; publication is not available.',null,'CONTRIBUTOR','{}'::jsonb),
 ('PROJECT-002','ebay-listings','eBay Listings','WORKSPACE_ENTRIES','MARKET_ITEM',8,'eBay listing drafts with no publication path.','A listing claim requires exact SKU, fitment and safety gate evidence.','CONTRIBUTOR','{}'::jsonb),
 ('PROJECT-002','pricing','Pricing','WORKSPACE_ENTRIES','RESEARCH_FINDING',9,'Observed price evidence and dated assumptions.',null,'CONTRIBUTOR','{}'::jsonb),
 ('PROJECT-002','competitors','Competitors','WORKSPACE_ENTRIES','RESEARCH_FINDING',10,'Competitor findings with source references.',null,'CONTRIBUTOR','{}'::jsonb),
 ('PROJECT-002','unit-economics','Unit Economics','WORKSPACE_ENTRIES','METRIC',11,'Attributed deterministic inputs; no model-calculated finance.',null,'OWNER','{}'::jsonb),
 ('PROJECT-002','orders-performance','Orders / Performance','WORKSPACE_ENTRIES','METRIC',12,'Actual performance only when attributable data exists.',null,'OWNER','{}'::jsonb),

 ('PROJECT-003','property-inputs','Property Inputs','PROPERTY_ASSETS',null,1,'Rights-labelled real property inputs.',null,'CONTRIBUTOR','{"asset_kinds":["PROPERTY_INPUT"]}'::jsonb),
 ('PROJECT-003','floorplans','Floorplans','PROPERTY_ASSETS',null,2,'Floorplans with origin, rights and geometry QA state.','Faithful delivery requires rights and geometry QA evidence.','CONTRIBUTOR','{"asset_kinds":["FLOORPLAN"]}'::jsonb),
 ('PROJECT-003','photos','Photos','PROPERTY_ASSETS',null,3,'Photos with real/generated/inferred provenance.',null,'CONTRIBUTOR','{"asset_kinds":["PHOTO"]}'::jsonb),
 ('PROJECT-003','source-assets','Source Assets','PROPERTY_ASSETS',null,4,'Source assets with explicit origin and rights state.',null,'CONTRIBUTOR','{"asset_kinds":["SOURCE_ASSET"]}'::jsonb),
 ('PROJECT-003','poc-pipeline','POC Pipeline','WORKSPACE_ENTRIES','MILESTONE',5,'Proof-of-concept milestones without delivery claims.',null,'CONTRIBUTOR','{}'::jsonb),
 ('PROJECT-003','technology-evaluation','Technology Evaluation','WORKSPACE_ENTRIES','RESEARCH_FINDING',6,'Dated technical evaluations and evidence.',null,'CONTRIBUTOR','{}'::jsonb),
 ('PROJECT-003','accuracy-qa','Accuracy QA','WORKSPACE_ENTRIES','EVIDENCE_ITEM',7,'Accuracy claims, evidence and unresolved gaps.','Generated content is never represented as a faithful input.','CONTRIBUTOR','{}'::jsonb),
 ('PROJECT-003','demo-library','Demo Library','PROPERTY_ASSETS',null,8,'Demo artifacts with explicit provenance.',null,'CONTRIBUTOR','{"asset_kinds":["DEMO"]}'::jsonb),
 ('PROJECT-003','estate-agent-validation','Estate Agent Validation','WORKSPACE_ENTRIES','EVIDENCE_ITEM',9,'Attributed agent feedback and validation gaps.',null,'CONTRIBUTOR','{}'::jsonb),
 ('PROJECT-003','pricing','Pricing','WORKSPACE_ENTRIES','RESEARCH_FINDING',10,'Pricing research and assumptions.',null,'CONTRIBUTOR','{}'::jsonb),
 ('PROJECT-003','packages','Packages','WORKSPACE_ENTRIES','CATALOGUE_ITEM',11,'Draft package definitions without market validation claims.',null,'CONTRIBUTOR','{}'::jsonb),
 ('PROJECT-003','leads-feedback','Leads / Feedback','WORKSPACE_ENTRIES','RESEARCH_FINDING',12,'Attributed lead or feedback observations.',null,'CONTRIBUTOR','{}'::jsonb),

 ('PROJECT-004','p004-research','Research','WORKSPACE_ENTRIES','PAPER_RESEARCH',1,'Paper-only research observations.','Research and paper operation only.','CONTRIBUTOR','{}'::jsonb),
 ('PROJECT-004','market-calendar','Market Calendar','WORKSPACE_ENTRIES','MILESTONE',2,'Research calendar milestones; no execution trigger.',null,'CONTRIBUTOR','{}'::jsonb),
 ('PROJECT-004','watchlist','Watchlist','WORKSPACE_ENTRIES','PAPER_RESEARCH',3,'Paper watchlist observations with no order path.','No live adapter, credential or toggle exists.','CONTRIBUTOR','{}'::jsonb),
 ('PROJECT-004','strategy','Strategy','WORKSPACE_ENTRIES','PAPER_RESEARCH',4,'Paper strategy hypotheses and observations.',null,'CONTRIBUTOR','{}'::jsonb),
 ('PROJECT-004','readiness','Readiness','WORKSPACE_ENTRIES','EVIDENCE_ITEM',5,'Paper protocol and risk-readiness evidence.','Readiness never enables live execution.','OWNER','{}'::jsonb),
 ('PROJECT-004','paper-account','Paper Account','WORKSPACE_ENTRIES','PAPER_RESEARCH',6,'Paper-account state without credentials.',null,'OWNER','{}'::jsonb),
 ('PROJECT-004','historical-data','Historical Data','WORKSPACE_ENTRIES','EVIDENCE_ITEM',7,'Historical dataset provenance and gaps.',null,'CONTRIBUTOR','{}'::jsonb),
 ('PROJECT-004','paper-experiments','Paper Experiments','EXPERIMENTS',null,8,'Versioned experiments that cannot execute trades.','Paper and research only.','READ_ONLY','{}'::jsonb),
 ('PROJECT-004','risk-ledger','Risk Ledger','RISKS',null,9,'Research and paper risks.',null,'READ_ONLY','{}'::jsonb),
 ('PROJECT-004','schedule','Schedule','WORKSPACE_ENTRIES','MILESTONE',10,'Research schedule; no broker job configuration.',null,'CONTRIBUTOR','{}'::jsonb),
 ('PROJECT-004','run-history','Run History','ACTIVITY',null,11,'Persisted paper/research activity only.','There is no live run path.','READ_ONLY','{}'::jsonb),
 ('PROJECT-004','midday-reports','Midday Reports','WORKSPACE_ENTRIES','REPORT',12,'Paper-only midday reports.',null,'CONTRIBUTOR','{}'::jsonb),
 ('PROJECT-004','after-close-reports','After-Close Reports','WORKSPACE_ENTRIES','REPORT',13,'Paper-only after-close reports.',null,'CONTRIBUTOR','{}'::jsonb),

 ('PROJECT-005','market-discovery','Market Discovery','WORKSPACE_ENTRIES','RESEARCH_FINDING',1,'Specific buyer and market discovery findings.',null,'CONTRIBUTOR','{}'::jsonb),
 ('PROJECT-005','trend-research','Trend Research','WORKSPACE_ENTRIES','RESEARCH_FINDING',2,'Dated trend evidence without inferred demand.',null,'CONTRIBUTOR','{}'::jsonb),
 ('PROJECT-005','opportunity-backlog','Opportunity Backlog','DIGITAL_OPPORTUNITIES',null,3,'Buyer-problem opportunities and exact demand evidence.',null,'CONTRIBUTOR','{}'::jsonb),
 ('PROJECT-005','opportunity-scores','Opportunity Scores','DIGITAL_OPPORTUNITIES',null,4,'Reviewed scores or Not Assessed; no invented midpoint.',null,'READ_ONLY','{}'::jsonb),
 ('PROJECT-005','competitor-research','Competitor Research','WORKSPACE_ENTRIES','RESEARCH_FINDING',5,'Competitor findings with source references.',null,'CONTRIBUTOR','{}'::jsonb),
 ('PROJECT-005','customer-complaints-gaps','Customer Complaints / Gaps','WORKSPACE_ENTRIES','EVIDENCE_ITEM',6,'Attributed complaints and unresolved gaps.',null,'CONTRIBUTOR','{}'::jsonb),
 ('PROJECT-005','product-briefs','Product Briefs','DIGITAL_OPPORTUNITIES',null,7,'Opportunity context before product creation.','Creation remains unavailable without a separate exact authority.','GATED','{}'::jsonb),
 ('PROJECT-005','production-pipeline','Production Pipeline','DIGITAL_OPPORTUNITIES',null,8,'Demand-gated local prototype state only.','No product-creation executor exists.','GATED','{}'::jsonb),
 ('PROJECT-005','assets','Assets','WORKSPACE_ENTRIES','ASSET_NOTE',9,'Asset provenance when creation is authorized.','Asset creation remains gated.','GATED','{}'::jsonb),
 ('PROJECT-005','compliance-ip','Compliance / IP','WORKSPACE_ENTRIES','EVIDENCE_ITEM',10,'Compliance and intellectual-property evidence.',null,'CONTRIBUTOR','{}'::jsonb),
 ('PROJECT-005','qa','QA','WORKSPACE_ENTRIES','EVIDENCE_ITEM',11,'Quality evidence and unresolved gaps.','QA does not authorize publication.','OWNER','{}'::jsonb),
 ('PROJECT-005','marketplace-listings','Marketplace Listings','WORKSPACE_ENTRIES','MARKET_ITEM',12,'Listing state with no external publication path.','Publication requires a separate exact approval and executor, which is absent.','GATED','{}'::jsonb),
 ('PROJECT-005','publishing-approvals','Publishing Approvals','APPROVALS',null,13,'Exact publication requests when a publication executor exists.','Publication is disabled.','OWNER','{}'::jsonb),
 ('PROJECT-005','sales-analytics','Sales Analytics','WORKSPACE_ENTRIES','METRIC',14,'Attributed sales metrics when real data exists.',null,'OWNER','{}'::jsonb),
 ('PROJECT-005','product-portfolio','Product Portfolio','DIGITAL_OPPORTUNITIES',null,15,'Demand-evidenced opportunities; no unsupported products.',null,'READ_ONLY','{}'::jsonb),
 ('PROJECT-005','p005-experiments','Experiments','EXPERIMENTS',null,16,'Demand-validation experiments.',null,'READ_ONLY','{}'::jsonb)
)
insert into kxra.project_workspace_modules(
 org_id,project_id,module_key,label,module_group,source_kind,entry_type,position,
 description,hard_boundary,write_policy,filter_spec
)
select p.org_id,p.id,s.module_key,s.label,'SPECIALIST',s.source_kind,s.entry_type,s.position,
 s.description,s.hard_boundary,s.write_policy,s.filter_spec
from specialist s join kxra.projects p on p.code=s.code where p.id=target
on conflict(project_id,module_key) do nothing;

 insert into kxra.project_gate_policies(org_id,project_id,gate_code,requirements)
 select p.org_id,p.id,
  case p.code
   when 'PROJECT-001' then 'P001_REVISIT'
   when 'PROJECT-002' then 'P002_LISTING'
   when 'PROJECT-003' then 'P003_FAITHFUL_DELIVERY'
   when 'PROJECT-004' then 'P004_PAPER_READINESS'
   when 'PROJECT-005' then 'P005_LOCAL_PROTOTYPE'
  end,
  case p.code
   when 'PROJECT-001' then '["route evidence","liquidity evidence","failure recovery evidence","buyer evidence","regulatory evidence"]'::jsonb
   when 'PROJECT-002' then '["exact SKU","fitment evidence","safety evidence"]'::jsonb
   when 'PROJECT-003' then '["rights confirmation","geometry QA"]'::jsonb
   when 'PROJECT-004' then '["paper protocol","paper risk limits","paper account readiness"]'::jsonb
   when 'PROJECT-005' then '["specific buyer problem","reviewed demand evidence"]'::jsonb
  end
 from kxra.projects p
 where p.id=target and p.code in ('PROJECT-001','PROJECT-002','PROJECT-003','PROJECT-004','PROJECT-005')
 on conflict(project_id,gate_code) do nothing;

 insert into kxra.vehicle_compatibility(id,org_id,project_id,vehicle_family)
 select case when p.id='30000000-0000-4000-8000-000000000002'::uuid then v.canonical_id else gen_random_uuid() end,
  p.org_id,p.id,v.family
 from kxra.projects p cross join (values
  ('62000000-0000-4000-8000-000000000001'::uuid,'Ford F-150'),
  ('62000000-0000-4000-8000-000000000002'::uuid,'Ram / Dodge Ram'),
  ('62000000-0000-4000-8000-000000000003'::uuid,'Toyota Tacoma')
 ) v(canonical_id,family)
 where p.id=target and p.code='PROJECT-002'
 on conflict(project_id,vehicle_family) do nothing;

 insert into kxra.project_governance_versions(
  project_id,version,org_id,lifecycle_stage,disposition,next_gate,next_action,
  current_recommendation,owner_user_id,venture_score,confidence_score,score_coverage,
  score_lower_bound,score_upper_bound,editor_id,created_at
 )
 select p.id,p.governance_version,p.org_id,p.lifecycle_stage,p.disposition,p.next_gate,p.next_action,
  p.current_recommendation,p.owner_user_id,p.venture_score,p.confidence_score,p.score_coverage,
  p.score_lower_bound,p.score_upper_bound,null,p.governance_updated_at
 from kxra.projects p where p.id=target
 on conflict(project_id,version) do nothing;
end $$;

create function kxra_private.provision_project_reference_data_trigger() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 perform kxra_private.provision_project_reference_data(new.id);
 return new;
end $$;

revoke all on function kxra_private.prepare_project_defaults(),
 kxra_private.provision_project_reference_data(uuid),
 kxra_private.provision_project_reference_data_trigger() from public,anon,authenticated;

create trigger projects_provision_reference_data after insert on kxra.projects
for each row execute function kxra_private.provision_project_reference_data_trigger();

-- Backfill databases upgraded from earlier milestones without changing rows
-- whose current governance state is already populated.
update kxra.projects set
 lifecycle_stage=coalesce(lifecycle_stage,case stage
  when 'DISCOVERY' then 'PROBLEM_DISCOVERY'
  when 'VALIDATION' then 'VALIDATION'
  when 'FEASIBILITY' then 'FEASIBILITY'
  else null end),
 disposition=coalesce(disposition,case
  when status='MONITOR' then 'MONITOR'
  when status='INTERNAL R&D / PAPER ONLY' then 'MONITOR'
  when status in ('VALIDATION','VALIDATION / LAUNCH PREPARATION','VALIDATION / PROOF OF CONCEPT') then 'ACTIVE'
  else null end),
 next_gate=coalesce(next_gate,case code
  when 'PROJECT-001' then 'P001_REVISIT'
  when 'PROJECT-002' then 'P002_LISTING'
  when 'PROJECT-003' then 'P003_FAITHFUL_DELIVERY'
  when 'PROJECT-004' then 'P004_PAPER_READINESS'
  when 'PROJECT-005' then 'P005_LOCAL_PROTOTYPE'
  else null end)
where lifecycle_stage is null or disposition is null or next_gate is null;

select kxra_private.provision_project_reference_data(id) from kxra.projects;

commit;
