begin;

-- Milestone 3: database-backed project workspaces. Module definitions are
-- executable navigation metadata, while each writable module is tied to a
-- bounded record shape or a specialist table below.
create table kxra.project_workspace_modules(
 org_id uuid not null,
 project_id uuid not null,
 module_key text not null check(module_key~'^[a-z0-9]+(?:-[a-z0-9]+)*$'),
 label text not null check(length(trim(label)) between 1 and 120),
 module_group text not null check(module_group in ('COMMON','SPECIALIST')),
 source_kind text not null check(source_kind in (
  'PROJECT','WORKSPACE_ENTRIES','RECORDS','EXPERIMENTS','DECISIONS','RISKS',
  'FINANCE','TASKS','FILES','ACTIVITY','PARTNERS','APPROVALS','PROJECT_SCORES',
  'VEHICLE_COMPATIBILITY','PROPERTY_ASSETS','P001_REVISIT','DIGITAL_OPPORTUNITIES'
 )),
 entry_type text check(entry_type is null or entry_type in (
  'NARRATIVE','RESEARCH_FINDING','EVIDENCE_ITEM','MILESTONE','METRIC',
  'CATALOGUE_ITEM','MARKET_ITEM','PAPER_RESEARCH','REPORT','ASSET_NOTE'
 )),
 position integer not null check(position between 1 and 100),
 description text not null check(length(trim(description)) between 1 and 1000),
 hard_boundary text,
 write_policy text not null default 'READ_ONLY' check(write_policy in ('OWNER','CONTRIBUTOR','READ_ONLY','GATED')),
 filter_spec jsonb not null default '{}'::jsonb check(jsonb_typeof(filter_spec)='object'),
 created_at timestamptz not null default now(),
 primary key(project_id,module_key),
 foreign key(org_id,project_id) references kxra.projects(org_id,id),
 check((source_kind='WORKSPACE_ENTRIES')=(entry_type is not null)),
 check(hard_boundary is null or length(trim(hard_boundary))>0)
);

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
from kxra.projects p cross join common c;

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
from specialist s join kxra.projects p on p.code=s.code;

create table kxra.workspace_entries(
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null,
 project_id uuid not null,
 module_key text not null,
 record_type text not null check(record_type in (
  'NARRATIVE','RESEARCH_FINDING','EVIDENCE_ITEM','MILESTONE','METRIC',
  'CATALOGUE_ITEM','MARKET_ITEM','PAPER_RESEARCH','REPORT','ASSET_NOTE'
 )),
 title text not null check(length(trim(title)) between 1 and 240),
 summary text not null check(length(trim(summary)) between 1 and 50000),
 payload jsonb not null check(jsonb_typeof(payload)='object'),
 classification kxra.classification not null,
 visibility text not null default 'project_shared' check(visibility in ('owner_only','project_shared')),
 status text not null default 'DRAFT' check(status in ('DRAFT','REVIEWED','ARCHIVED')),
 created_by uuid not null default auth.uid(),
 reviewed_by uuid,
 reviewed_at timestamptz,
 version integer not null default 1 check(version>0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(org_id,project_id,id),
 foreign key(org_id,project_id) references kxra.projects(org_id,id),
 foreign key(project_id,module_key) references kxra.project_workspace_modules(project_id,module_key),
 foreign key(org_id,created_by) references kxra.members(org_id,id),
 foreign key(org_id,reviewed_by) references kxra.members(org_id,id),
 check((status='REVIEWED')=(reviewed_by is not null and reviewed_at is not null))
);
create index workspace_entries_module on kxra.workspace_entries(project_id,module_key,status,updated_at desc);

create table kxra.workspace_entry_versions(
 entry_id uuid not null references kxra.workspace_entries,
 version integer not null check(version>0),
 org_id uuid not null,
 project_id uuid not null,
 module_key text not null,
 record_type text not null,
 title text not null,
 summary text not null,
 payload jsonb not null,
 classification kxra.classification not null,
 visibility text not null,
 status text not null,
 editor_id uuid,
 created_at timestamptz not null default now(),
 primary key(entry_id,version),
 foreign key(org_id,project_id) references kxra.projects(org_id,id),
 foreign key(org_id,editor_id) references kxra.members(org_id,id)
);

create table kxra.workspace_entry_evidence(
 entry_id uuid not null,
 entry_version integer not null,
 org_id uuid not null,
 project_id uuid not null,
 evidence_id uuid not null,
 evidence_version integer not null,
 primary key(entry_id,entry_version,evidence_id,evidence_version),
 foreign key(entry_id,entry_version) references kxra.workspace_entry_versions(entry_id,version),
 foreign key(org_id,project_id,evidence_id) references kxra.records(org_id,project_id,id),
 foreign key(evidence_id,evidence_version) references kxra.record_versions(record_id,version)
);

create function kxra_private.workspace_payload_valid(t text,p jsonb) returns boolean
language sql immutable set search_path='' as $$
 select jsonb_typeof(p)='object' and case t
  when 'NARRATIVE' then p-array['statement']='{}'::jsonb
   and jsonb_typeof(p->'statement')='string' and length(trim(p->>'statement'))>0
  when 'RESEARCH_FINDING' then p-array['finding','source_url','as_of']='{}'::jsonb
   and jsonb_typeof(p->'finding')='string' and length(trim(p->>'finding'))>0
   and (not p?'source_url' or (jsonb_typeof(p->'source_url')='string' and p->>'source_url'~'^https?://'))
   and (not p?'as_of' or jsonb_typeof(p->'as_of')='string')
  when 'EVIDENCE_ITEM' then p-array['claim','gap']='{}'::jsonb
   and jsonb_typeof(p->'claim')='string' and length(trim(p->>'claim'))>0
   and jsonb_typeof(p->'gap')='string'
  when 'MILESTONE' then p-array['outcome','state','target_date']='{}'::jsonb
   and jsonb_typeof(p->'outcome')='string' and length(trim(p->>'outcome'))>0
   and p->>'state' in ('PLANNED','IN_PROGRESS','BLOCKED','COMPLETE')
   and (not p?'target_date' or jsonb_typeof(p->'target_date')='string')
  when 'METRIC' then p ?& array['metric_name','value','unit','as_of','basis']
   and p-array['metric_name','value','unit','as_of','basis']='{}'::jsonb
   and (select bool_and(jsonb_typeof(value)='string') from jsonb_each(p))
   and length(trim(p->>'metric_name'))>0 and length(trim(p->>'value'))>0
  when 'CATALOGUE_ITEM' then p ?& array['item_code','description','item_state']
   and p-array['item_code','description','item_state']='{}'::jsonb
   and jsonb_typeof(p->'item_code')='string' and length(trim(p->>'item_code'))>0
   and jsonb_typeof(p->'description')='string'
   and p->>'item_state' in ('UNKNOWN','DRAFT','EVIDENCE_PENDING')
  when 'MARKET_ITEM' then p ?& array['channel','listing_state']
   and p-array['channel','listing_state','external_ref']='{}'::jsonb
   and jsonb_typeof(p->'channel')='string' and length(trim(p->>'channel'))>0
   and p->>'listing_state' in ('NOT_STARTED','DRAFT','AWAITING_EVIDENCE')
   and (not p?'external_ref' or jsonb_typeof(p->'external_ref')='string')
  when 'PAPER_RESEARCH' then p ?& array['topic','observation','paper_only']
   and p-array['topic','observation','paper_only']='{}'::jsonb
   and jsonb_typeof(p->'topic')='string' and length(trim(p->>'topic'))>0
   and jsonb_typeof(p->'observation')='string' and p->'paper_only'='true'::jsonb
  when 'REPORT' then p ?& array['report_period','summary','paper_only']
   and p-array['report_period','summary','paper_only']='{}'::jsonb
   and jsonb_typeof(p->'report_period')='string' and length(trim(p->>'report_period'))>0
   and jsonb_typeof(p->'summary')='string' and jsonb_typeof(p->'paper_only')='boolean'
  when 'ASSET_NOTE' then p ?& array['description','origin','rights_state']
   and p-array['description','origin','rights_state']='{}'::jsonb
   and jsonb_typeof(p->'description')='string'
   and p->>'origin' in ('REAL_INPUT','AI_GENERATED','AI_INFERRED')
   and p->>'rights_state' in ('UNKNOWN','EVIDENCE_PENDING')
  else false end
$$;

create function kxra_private.can_workspace_entry(target uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from kxra.workspace_entries e where e.id=target and (
  kxra_private.is_owner(e.org_id) or
  (e.visibility='project_shared' and kxra_private.can_project(e.project_id))
 ))
$$;

create function kxra_private.guard_workspace_entry() returns trigger
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
 return new;
end $$;

create function kxra_private.log_workspace_entry() returns trigger
language plpgsql security definer set search_path='' as $$ begin
 insert into kxra.workspace_entry_versions(
  entry_id,version,org_id,project_id,module_key,record_type,title,summary,payload,
  classification,visibility,status,editor_id
 ) values(new.id,new.version,new.org_id,new.project_id,new.module_key,new.record_type,
  new.title,new.summary,new.payload,new.classification,new.visibility,new.status,auth.uid());
 insert into kxra.audit_events(org_id,actor_id,action,resource_id,metadata)
 values(new.org_id,auth.uid(),case when tg_op='INSERT' then 'workspace.entry.created' else 'workspace.entry.updated' end,
  new.id,jsonb_build_object('project_id',new.project_id,'module_key',new.module_key,'version',new.version,'status',new.status));
 return new;
end $$;

create trigger workspace_entry_guard before insert or update on kxra.workspace_entries
for each row execute function kxra_private.guard_workspace_entry();
create trigger workspace_entry_audit after insert or update on kxra.workspace_entries
for each row execute function kxra_private.log_workspace_entry();

create function kxra.create_workspace_entry(
 project uuid,module text,title text,summary text,classification kxra.classification,
 visibility text,payload jsonb,evidence jsonb default '[]'::jsonb
) returns kxra.workspace_entries language plpgsql security definer set search_path='' as $$
 declare o uuid=kxra_private.member_org();m kxra.project_workspace_modules;v kxra.workspace_entries;item jsonb;
 begin
 select * into m from kxra.project_workspace_modules where project_id=project and module_key=module;
 if o is null or m.project_id is null or m.org_id<>o or m.source_kind<>'WORKSPACE_ENTRIES'
  or m.write_policy not in ('OWNER','CONTRIBUTOR') or not kxra_private.can_project(project,true)
  or (m.write_policy='OWNER' and not kxra_private.is_owner(o))
  or length(trim(title)) not between 1 and 240 or length(trim(summary))<1
  or classification='FACT' or visibility not in ('owner_only','project_shared')
  or (not kxra_private.is_owner(o) and visibility<>'project_shared')
  or not kxra_private.workspace_payload_valid(m.entry_type,payload)
  or jsonb_typeof(evidence)<>'array' or jsonb_array_length(evidence)>20
 then raise exception 'Workspace entry unavailable';end if;
 if jsonb_array_length(evidence)>0 then perform kxra_private.require_evidence(o,project,evidence);end if;
 insert into kxra.workspace_entries(
  org_id,project_id,module_key,record_type,title,summary,payload,classification,visibility,created_by
 ) values(o,project,module,m.entry_type,trim(title),trim(summary),payload,classification,visibility,auth.uid())
 returning * into v;
 for item in select value from jsonb_array_elements(evidence) loop
  insert into kxra.workspace_entry_evidence(entry_id,entry_version,org_id,project_id,evidence_id,evidence_version)
  values(v.id,v.version,o,project,(item->>'record_id')::uuid,(item->>'version')::integer);
 end loop;
 return v;
 end $$;

create function kxra.review_workspace_entry(target uuid,expected_version integer) returns kxra.workspace_entries
language plpgsql security definer set search_path='' as $$
 declare v kxra.workspace_entries;old_version integer;
 begin
 select * into v from kxra.workspace_entries where id=target for update;
 if not found or not kxra_private.is_owner(v.org_id) or not kxra_private.can_project(v.project_id)
  or v.status<>'DRAFT' or v.version is distinct from expected_version
  or (v.record_type not in ('NARRATIVE','MILESTONE') and not exists(
   select 1 from kxra.workspace_entry_evidence e where e.entry_id=v.id and e.entry_version=v.version
  ))
 then raise exception 'Workspace review unavailable';end if;
 old_version=v.version;
 update kxra.workspace_entries set status='REVIEWED',reviewed_by=auth.uid(),reviewed_at=now()
 where id=v.id returning * into v;
 insert into kxra.workspace_entry_evidence(entry_id,entry_version,org_id,project_id,evidence_id,evidence_version)
 select entry_id,v.version,org_id,project_id,evidence_id,evidence_version
 from kxra.workspace_entry_evidence where entry_id=v.id and entry_version=old_version;
 return v;
 end $$;

alter table kxra.project_workspace_modules enable row level security;
alter table kxra.workspace_entries enable row level security;
alter table kxra.workspace_entry_versions enable row level security;
alter table kxra.workspace_entry_evidence enable row level security;
grant select on kxra.project_workspace_modules,kxra.workspace_entries,
 kxra.workspace_entry_versions,kxra.workspace_entry_evidence to authenticated,anon;
create policy workspace_modules_read on kxra.project_workspace_modules for select using(kxra_private.can_project(project_id));
create policy workspace_entries_read on kxra.workspace_entries for select using(kxra_private.can_workspace_entry(id));
create policy workspace_versions_read on kxra.workspace_entry_versions for select using(kxra_private.can_workspace_entry(entry_id));
create policy workspace_evidence_read on kxra.workspace_entry_evidence for select using(
 kxra_private.can_workspace_entry(entry_id) and kxra_private.can_record(evidence_id)
);

-- PROJECT-002 typed compatibility matrix. Seeded families deliberately retain
-- unknown fit-critical fields until reviewed evidence is supplied.
create table kxra.vehicle_compatibility(
 id uuid primary key,
 org_id uuid not null,
 project_id uuid not null,
 vehicle_family text not null check(vehicle_family in ('Ford F-150','Ram / Dodge Ram','Toyota Tacoma')),
 supplier_sku text,
 fitment_state text not null default 'UNKNOWN' check(fitment_state in ('UNKNOWN','VERIFIED')),
 safety_state text not null default 'UNKNOWN' check(safety_state in ('UNKNOWN','VERIFIED')),
 fitment_evidence_id uuid,
 fitment_evidence_version integer,
 safety_evidence_id uuid,
 safety_evidence_version integer,
 reviewed_by uuid,
 reviewed_at timestamptz,
 version integer not null default 1 check(version>0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(project_id,vehicle_family),
 foreign key(org_id,project_id) references kxra.projects(org_id,id),
 foreign key(org_id,project_id,fitment_evidence_id) references kxra.records(org_id,project_id,id),
 foreign key(fitment_evidence_id,fitment_evidence_version) references kxra.record_versions(record_id,version),
 foreign key(org_id,project_id,safety_evidence_id) references kxra.records(org_id,project_id,id),
 foreign key(safety_evidence_id,safety_evidence_version) references kxra.record_versions(record_id,version),
 foreign key(org_id,reviewed_by) references kxra.members(org_id,id),
 check((fitment_state='UNKNOWN')=(fitment_evidence_id is null and fitment_evidence_version is null)),
 check((safety_state='UNKNOWN')=(safety_evidence_id is null and safety_evidence_version is null)),
 check((fitment_state='VERIFIED' or safety_state='VERIFIED')=(reviewed_by is not null and reviewed_at is not null)),
 check(supplier_sku is null or length(trim(supplier_sku))>0)
);
insert into kxra.vehicle_compatibility(id,org_id,project_id,vehicle_family)
select v.id,p.org_id,p.id,v.family from kxra.projects p cross join (values
 ('62000000-0000-4000-8000-000000000001'::uuid,'Ford F-150'),
 ('62000000-0000-4000-8000-000000000002'::uuid,'Ram / Dodge Ram'),
 ('62000000-0000-4000-8000-000000000003'::uuid,'Toyota Tacoma')
) v(id,family) where p.code='PROJECT-002';

create function kxra.verify_vehicle_compatibility(
 target uuid,expected_version integer,sku text,
 fitment_evidence uuid,fitment_version integer,safety_evidence uuid,safety_version integer
) returns kxra.vehicle_compatibility language plpgsql security definer set search_path='' as $$
 declare v kxra.vehicle_compatibility;f kxra.records;s kxra.records;
 begin
 select * into v from kxra.vehicle_compatibility where id=target for update;
 if not found or not kxra_private.is_owner(v.org_id) or v.version is distinct from expected_version
  or length(trim(sku))<1 then raise exception 'Compatibility review unavailable';end if;
 select * into f from kxra.records where id=fitment_evidence;
 select * into s from kxra.records where id=safety_evidence;
 if f.id is null or s.id is null or f.org_id<>v.org_id or s.org_id<>v.org_id
  or f.project_id<>v.project_id or s.project_id<>v.project_id
  or f.version is distinct from fitment_version or s.version is distinct from safety_version
  or f.status<>'accepted' or s.status<>'accepted'
  or f.visibility<>'project_shared' or s.visibility<>'project_shared'
 then raise exception 'Current accepted fitment and safety evidence required';end if;
 update kxra.vehicle_compatibility set supplier_sku=trim(sku),fitment_state='VERIFIED',safety_state='VERIFIED',
  fitment_evidence_id=f.id,fitment_evidence_version=f.version,
  safety_evidence_id=s.id,safety_evidence_version=s.version,
  reviewed_by=auth.uid(),reviewed_at=now(),version=version+1,updated_at=now()
 where id=v.id returning * into v;
 insert into kxra.audit_events(org_id,actor_id,action,resource_id,metadata)
 values(v.org_id,auth.uid(),'vehicle.compatibility.verified',v.id,
  jsonb_build_object('project_id',v.project_id,'version',v.version,'vehicle_family',v.vehicle_family));
 return v;
 end $$;

alter table kxra.vehicle_compatibility enable row level security;
grant select on kxra.vehicle_compatibility to authenticated,anon;
create policy vehicle_compatibility_read on kxra.vehicle_compatibility for select using(kxra_private.can_project(project_id));

-- PROJECT-003 assets keep real inputs distinct from generated or inferred
-- material. Rights/geometry review is an exact-evidence transition.
create table kxra.property_assets(
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null,
 project_id uuid not null,
 module_key text not null,
 title text not null check(length(trim(title)) between 1 and 240),
 asset_kind text not null check(asset_kind in ('PROPERTY_INPUT','FLOORPLAN','PHOTO','SOURCE_ASSET','DEMO')),
 origin text not null check(origin in ('REAL_INPUT','AI_GENERATED','AI_INFERRED')),
 rights_state text not null default 'UNKNOWN' check(rights_state in ('UNKNOWN','CONFIRMED')),
 geometry_state text not null default 'NOT_ASSESSED' check(geometry_state in ('NOT_ASSESSED','NOT_APPLICABLE','PASSED')),
 rights_evidence_id uuid,
 rights_evidence_version integer,
 geometry_evidence_id uuid,
 geometry_evidence_version integer,
 created_by uuid not null default auth.uid(),
 reviewed_by uuid,
 reviewed_at timestamptz,
 version integer not null default 1 check(version>0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(org_id,project_id,id),
 foreign key(org_id,project_id) references kxra.projects(org_id,id),
 foreign key(project_id,module_key) references kxra.project_workspace_modules(project_id,module_key),
 foreign key(org_id,created_by) references kxra.members(org_id,id),
 foreign key(org_id,reviewed_by) references kxra.members(org_id,id),
 foreign key(org_id,project_id,rights_evidence_id) references kxra.records(org_id,project_id,id),
 foreign key(rights_evidence_id,rights_evidence_version) references kxra.record_versions(record_id,version),
 foreign key(org_id,project_id,geometry_evidence_id) references kxra.records(org_id,project_id,id),
 foreign key(geometry_evidence_id,geometry_evidence_version) references kxra.record_versions(record_id,version),
 check((rights_state='UNKNOWN')=(rights_evidence_id is null and rights_evidence_version is null)),
 check((geometry_state in ('NOT_ASSESSED','NOT_APPLICABLE'))=(geometry_evidence_id is null and geometry_evidence_version is null)),
 check((rights_state='CONFIRMED' or geometry_state='PASSED')=(reviewed_by is not null and reviewed_at is not null))
);

create function kxra.create_property_asset(project uuid,module text,title text,asset_kind text,origin text)
returns kxra.property_assets language plpgsql security definer set search_path='' as $$
 declare o uuid=kxra_private.member_org();m kxra.project_workspace_modules;v kxra.property_assets;
 begin
 select m.* into m from kxra.project_workspace_modules m join kxra.projects p on p.id=m.project_id
 where m.project_id=project and m.module_key=module and p.code='PROJECT-003';
 if o is null or m.project_id is null or m.org_id<>o or m.source_kind<>'PROPERTY_ASSETS'
  or not kxra_private.can_project(project,true) or length(trim(title)) not between 1 and 240
  or asset_kind not in ('PROPERTY_INPUT','FLOORPLAN','PHOTO','SOURCE_ASSET','DEMO')
  or origin not in ('REAL_INPUT','AI_GENERATED','AI_INFERRED')
  or not coalesce(m.filter_spec->'asset_kinds' ? asset_kind,false)
 then raise exception 'Property asset unavailable';end if;
 insert into kxra.property_assets(org_id,project_id,module_key,title,asset_kind,origin,created_by)
 values(o,project,module,trim(title),asset_kind,origin,auth.uid()) returning * into v;
 insert into kxra.audit_events(org_id,actor_id,action,resource_id,metadata)
 values(o,auth.uid(),'property.asset.created',v.id,jsonb_build_object('project_id',project,'origin',origin,'asset_kind',asset_kind));
 return v;
 end $$;

create function kxra.review_property_asset(
 target uuid,expected_version integer,rights_evidence uuid,rights_version integer,
 geometry_evidence uuid default null,geometry_version integer default null
) returns kxra.property_assets language plpgsql security definer set search_path='' as $$
 declare v kxra.property_assets;r kxra.records;g kxra.records;
 begin
 select * into v from kxra.property_assets where id=target for update;
 if not found or not kxra_private.is_owner(v.org_id) or v.version is distinct from expected_version
 then raise exception 'Property review unavailable';end if;
 select * into r from kxra.records where id=rights_evidence;
 if r.id is null or r.org_id<>v.org_id or r.project_id<>v.project_id or r.version is distinct from rights_version
  or r.status<>'accepted' or r.visibility<>'project_shared'
 then raise exception 'Current accepted rights evidence required';end if;
 if (geometry_evidence is null)<>(geometry_version is null) then raise exception 'Complete geometry evidence reference required';end if;
 if geometry_evidence is not null then
  select * into g from kxra.records where id=geometry_evidence;
  if g.id is null or g.org_id<>v.org_id or g.project_id<>v.project_id or g.version is distinct from geometry_version
   or g.status<>'accepted' or g.visibility<>'project_shared'
  then raise exception 'Current accepted geometry evidence required';end if;
 end if;
 update kxra.property_assets set rights_state='CONFIRMED',
  geometry_state=case when geometry_evidence is null then 'NOT_APPLICABLE' else 'PASSED' end,
  rights_evidence_id=r.id,rights_evidence_version=r.version,
  geometry_evidence_id=g.id,geometry_evidence_version=g.version,
  reviewed_by=auth.uid(),reviewed_at=now(),version=version+1,updated_at=now()
 where id=v.id returning * into v;
 insert into kxra.audit_events(org_id,actor_id,action,resource_id,metadata)
 values(v.org_id,auth.uid(),'property.asset.reviewed',v.id,
  jsonb_build_object('project_id',v.project_id,'version',v.version,'rights_state',v.rights_state,'geometry_state',v.geometry_state));
 return v;
 end $$;

alter table kxra.property_assets enable row level security;
grant select on kxra.property_assets to authenticated,anon;
create policy property_assets_read on kxra.property_assets for select using(kxra_private.can_project(project_id));

-- PROJECT-001 revisit reviews are insert-only recommendations tied to all
-- required current evidence categories.
create table kxra.clpr_revisit_reviews(
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null,
 project_id uuid not null,
 recommendation text not null check(recommendation in ('MONITOR','REVISIT','DO_NOT_REVISIT')),
 rationale text not null check(length(trim(rationale)) between 1 and 50000),
 route_evidence_id uuid not null,route_evidence_version integer not null,
 liquidity_evidence_id uuid not null,liquidity_evidence_version integer not null,
 recovery_evidence_id uuid not null,recovery_evidence_version integer not null,
 buyer_evidence_id uuid not null,buyer_evidence_version integer not null,
 regulatory_evidence_id uuid not null,regulatory_evidence_version integer not null,
 created_by uuid not null default auth.uid(),
 created_at timestamptz not null default now(),
 foreign key(org_id,project_id) references kxra.projects(org_id,id),
 foreign key(org_id,created_by) references kxra.members(org_id,id),
 foreign key(org_id,project_id,route_evidence_id) references kxra.records(org_id,project_id,id),
 foreign key(route_evidence_id,route_evidence_version) references kxra.record_versions(record_id,version),
 foreign key(org_id,project_id,liquidity_evidence_id) references kxra.records(org_id,project_id,id),
 foreign key(liquidity_evidence_id,liquidity_evidence_version) references kxra.record_versions(record_id,version),
 foreign key(org_id,project_id,recovery_evidence_id) references kxra.records(org_id,project_id,id),
 foreign key(recovery_evidence_id,recovery_evidence_version) references kxra.record_versions(record_id,version),
 foreign key(org_id,project_id,buyer_evidence_id) references kxra.records(org_id,project_id,id),
 foreign key(buyer_evidence_id,buyer_evidence_version) references kxra.record_versions(record_id,version),
 foreign key(org_id,project_id,regulatory_evidence_id) references kxra.records(org_id,project_id,id),
 foreign key(regulatory_evidence_id,regulatory_evidence_version) references kxra.record_versions(record_id,version)
);

create function kxra.create_clpr_revisit_review(
 project uuid,recommendation text,rationale text,
 route_id uuid,route_version integer,liquidity_id uuid,liquidity_version integer,
 recovery_id uuid,recovery_version integer,buyer_id uuid,buyer_version integer,
 regulatory_id uuid,regulatory_version integer
) returns kxra.clpr_revisit_reviews language plpgsql security definer set search_path='' as $$
 declare o uuid=kxra_private.member_org();v kxra.clpr_revisit_reviews;evidence jsonb;
 begin
 if not kxra_private.is_owner(o) or not exists(select 1 from kxra.projects p where p.id=project and p.org_id=o and p.code='PROJECT-001')
  or recommendation not in ('MONITOR','REVISIT','DO_NOT_REVISIT') or length(trim(rationale))<1
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

alter table kxra.clpr_revisit_reviews enable row level security;
grant select on kxra.clpr_revisit_reviews to authenticated,anon;
create policy clpr_revisit_read on kxra.clpr_revisit_reviews for select using(kxra_private.can_project(project_id));

-- PROJECT-005 has no creation or publication states. The furthest executable
-- transition is a local prototype authorization tied to the exact reviewed
-- demand evidence used by an executed P005 gate approval.
create table kxra.digital_opportunities(
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null,
 project_id uuid not null,
 title text not null check(length(trim(title)) between 1 and 240),
 buyer_problem text not null check(length(trim(buyer_problem)) between 1 and 5000),
 stage text not null default 'DISCOVERY' check(stage in ('DISCOVERY','EVIDENCE_REVIEW','LOCAL_PROTOTYPE_AUTHORIZED')),
 demand_evidence_id uuid,
 demand_evidence_version integer,
 gate_authorization_id uuid,
 opportunity_score numeric check(opportunity_score between 0 and 100),
 confidence_score numeric check(confidence_score between 0 and 100),
 created_by uuid not null default auth.uid(),
 version integer not null default 1 check(version>0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(org_id,project_id,id),
 foreign key(org_id,project_id) references kxra.projects(org_id,id),
 foreign key(org_id,created_by) references kxra.members(org_id,id),
 foreign key(org_id,project_id,demand_evidence_id) references kxra.records(org_id,project_id,id),
 foreign key(demand_evidence_id,demand_evidence_version) references kxra.record_versions(record_id,version),
 foreign key(gate_authorization_id) references kxra.project_gate_authorizations(id),
 check((stage='DISCOVERY')=(demand_evidence_id is null and demand_evidence_version is null and gate_authorization_id is null)),
 check((stage='LOCAL_PROTOTYPE_AUTHORIZED')=(gate_authorization_id is not null)),
 check(opportunity_score is null and confidence_score is null)
);

create function kxra.create_digital_opportunity(project uuid,title text,buyer_problem text)
returns kxra.digital_opportunities language plpgsql security definer set search_path='' as $$
 declare o uuid=kxra_private.member_org();v kxra.digital_opportunities;
 begin
 if o is null or not kxra_private.can_project(project,true)
  or not exists(select 1 from kxra.projects p where p.id=project and p.org_id=o and p.code='PROJECT-005')
  or length(trim(title)) not between 1 and 240 or length(trim(buyer_problem))<1
 then raise exception 'Digital opportunity unavailable';end if;
 insert into kxra.digital_opportunities(org_id,project_id,title,buyer_problem,created_by)
 values(o,project,trim(title),trim(buyer_problem),auth.uid()) returning * into v;
 insert into kxra.audit_events(org_id,actor_id,action,resource_id,metadata)
 values(o,auth.uid(),'digital.opportunity.created',v.id,jsonb_build_object('project_id',project,'stage',v.stage));
 return v;
 end $$;

create function kxra.attach_digital_demand_evidence(
 target uuid,expected_version integer,evidence_id uuid,evidence_version integer
) returns kxra.digital_opportunities language plpgsql security definer set search_path='' as $$
 declare v kxra.digital_opportunities;r kxra.records;
 begin
 select * into v from kxra.digital_opportunities where id=target for update;
 if not found or not kxra_private.can_project(v.project_id,true) or v.version is distinct from expected_version
  or v.stage not in ('DISCOVERY','EVIDENCE_REVIEW') then raise exception 'Demand evidence unavailable';end if;
 select * into r from kxra.records where id=evidence_id;
 if r.id is null or r.org_id<>v.org_id or r.project_id<>v.project_id or r.version is distinct from evidence_version
  or r.status<>'accepted' or r.visibility<>'project_shared'
 then raise exception 'Current accepted demand evidence required';end if;
 update kxra.digital_opportunities set stage='EVIDENCE_REVIEW',demand_evidence_id=r.id,
  demand_evidence_version=r.version,gate_authorization_id=null,version=version+1,updated_at=now()
 where id=v.id returning * into v;
 insert into kxra.audit_events(org_id,actor_id,action,resource_id,metadata)
 values(v.org_id,auth.uid(),'digital.opportunity.evidence_attached',v.id,
  jsonb_build_object('project_id',v.project_id,'version',v.version,'evidence_id',r.id,'evidence_version',r.version));
 return v;
 end $$;

create function kxra.authorize_digital_local_prototype(
 target uuid,expected_version integer,gate_authorization uuid
) returns kxra.digital_opportunities language plpgsql security definer set search_path='' as $$
 declare v kxra.digital_opportunities;g kxra.project_gate_authorizations;
 begin
 select * into v from kxra.digital_opportunities where id=target for update;
 select * into g from kxra.project_gate_authorizations where id=gate_authorization;
 if not found or not kxra_private.is_owner(v.org_id) or v.version is distinct from expected_version
  or v.stage<>'EVIDENCE_REVIEW' or g.id is null or g.org_id<>v.org_id or g.project_id<>v.project_id
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

alter table kxra.digital_opportunities enable row level security;
grant select on kxra.digital_opportunities to authenticated,anon;
create policy digital_opportunities_read on kxra.digital_opportunities for select using(kxra_private.can_project(project_id));

-- Every project has an explicit gate. P001 and P004 add evidence gates without
-- enabling build, commercial activity or live trading.
alter table kxra.project_gate_policies drop constraint project_gate_policies_gate_code_check;
alter table kxra.project_gate_policies add constraint project_gate_policies_gate_code_check check(gate_code in (
 'P001_REVISIT','P002_LISTING','P003_FAITHFUL_DELIVERY','P004_PAPER_READINESS','P005_LOCAL_PROTOTYPE'
));
insert into kxra.project_gate_policies(org_id,project_id,gate_code,requirements)
select p.org_id,p.id,
 case p.code when 'PROJECT-001' then 'P001_REVISIT' else 'P004_PAPER_READINESS' end,
 case p.code
  when 'PROJECT-001' then '["route evidence","liquidity evidence","failure recovery evidence","buyer evidence","regulatory evidence"]'::jsonb
  else '["paper protocol","paper risk limits","paper account readiness"]'::jsonb end
from kxra.projects p where p.code in ('PROJECT-001','PROJECT-004')
on conflict(project_id,gate_code) do nothing;
update kxra.projects set next_gate=case code
 when 'PROJECT-001' then 'P001_REVISIT'
 when 'PROJECT-004' then 'P004_PAPER_READINESS' end
where code in ('PROJECT-001','PROJECT-004') and next_gate is null;

create or replace function kxra_private.gate_matches_project(project uuid,gate_name text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from kxra.projects p where p.id=project and (
  (p.code='PROJECT-001' and gate_name='P001_REVISIT') or
  (p.code='PROJECT-002' and gate_name='P002_LISTING') or
  (p.code='PROJECT-003' and gate_name='P003_FAITHFUL_DELIVERY') or
  (p.code='PROJECT-004' and gate_name='P004_PAPER_READINESS') or
  (p.code='PROJECT-005' and gate_name='P005_LOCAL_PROTOTYPE')
 ))
$$;
create or replace function kxra_private.gate_claims_valid(gate_name text,claims jsonb) returns boolean
language sql immutable set search_path='' as $$
 select jsonb_typeof(claims)='object' and case gate_name
  when 'P001_REVISIT' then
   claims-array['route_evidenced','liquidity_evidenced','recovery_evidenced','buyer_evidenced','regulatory_evidenced']='{}'::jsonb
   and claims->'route_evidenced'='true'::jsonb and claims->'liquidity_evidenced'='true'::jsonb
   and claims->'recovery_evidenced'='true'::jsonb and claims->'buyer_evidenced'='true'::jsonb
   and claims->'regulatory_evidenced'='true'::jsonb
  when 'P002_LISTING' then
   claims-array['exact_sku','fitment_verified','safety_evidence_verified']='{}'::jsonb and
   jsonb_typeof(claims->'exact_sku')='string' and length(trim(claims->>'exact_sku'))>0 and
   claims->'fitment_verified'='true'::jsonb and claims->'safety_evidence_verified'='true'::jsonb
  when 'P003_FAITHFUL_DELIVERY' then
   claims-array['rights_confirmed','geometry_qa_passed']='{}'::jsonb and
   claims->'rights_confirmed'='true'::jsonb and claims->'geometry_qa_passed'='true'::jsonb
  when 'P004_PAPER_READINESS' then
   claims-array['protocol_defined','risk_limits_defined','paper_account_ready']='{}'::jsonb and
   claims->'protocol_defined'='true'::jsonb and claims->'risk_limits_defined'='true'::jsonb and
   claims->'paper_account_ready'='true'::jsonb
  when 'P005_LOCAL_PROTOTYPE' then
   claims-array['buyer_problem','demand_reviewed']='{}'::jsonb and
   jsonb_typeof(claims->'buyer_problem')='string' and length(trim(claims->>'buyer_problem'))>0 and
   claims->'demand_reviewed'='true'::jsonb
  else false end
$$;

create or replace function kxra.create_gate_evidence_packet(
 project uuid,gate_name text,title text,summary text,claims jsonb,evidence jsonb
) returns uuid language plpgsql security definer set search_path='' as $$
 declare o uuid=kxra_private.member_org();new_id uuid;
 begin
 if not kxra_private.is_owner(o) or not kxra_private.can_project(project)
  or not kxra_private.gate_matches_project(project,gate_name)
  or not kxra_private.gate_claims_valid(gate_name,claims)
  or length(trim(title)) not between 1 and 240 or length(trim(summary))<1
  or (gate_name='P001_REVISIT' and (jsonb_typeof(evidence)<>'array' or jsonb_array_length(evidence)<5))
 then raise exception 'Gate evidence unavailable';end if;
 perform kxra_private.require_evidence(o,project,evidence);
 insert into kxra.records(org_id,project_id,kind,title,body,data,classification,visibility,created_by)
 values(o,project,'note',title,summary,claims||jsonb_build_object('gate',gate_name),
  'USER-SUPPLIED INFORMATION','project_shared',auth.uid()) returning id into new_id;
 perform kxra_private.add_evidence_links(o,project,new_id,1,'uses_evidence',evidence);
 return new_id;
 end $$;

revoke all on all functions in schema kxra_private from public;
revoke all on function kxra.create_workspace_entry(uuid,text,text,text,kxra.classification,text,jsonb,jsonb),
 kxra.review_workspace_entry(uuid,integer),
 kxra.verify_vehicle_compatibility(uuid,integer,text,uuid,integer,uuid,integer),
 kxra.create_property_asset(uuid,text,text,text,text),
 kxra.review_property_asset(uuid,integer,uuid,integer,uuid,integer),
 kxra.create_clpr_revisit_review(uuid,text,text,uuid,integer,uuid,integer,uuid,integer,uuid,integer,uuid,integer),
 kxra.create_digital_opportunity(uuid,text,text),
 kxra.attach_digital_demand_evidence(uuid,integer,uuid,integer),
 kxra.authorize_digital_local_prototype(uuid,integer,uuid)
from public;
grant execute on function kxra.create_workspace_entry(uuid,text,text,text,kxra.classification,text,jsonb,jsonb),
 kxra.review_workspace_entry(uuid,integer),
 kxra.verify_vehicle_compatibility(uuid,integer,text,uuid,integer,uuid,integer),
 kxra.create_property_asset(uuid,text,text,text,text),
 kxra.review_property_asset(uuid,integer,uuid,integer,uuid,integer),
 kxra.create_clpr_revisit_review(uuid,text,text,uuid,integer,uuid,integer,uuid,integer,uuid,integer,uuid,integer),
 kxra.create_digital_opportunity(uuid,text,text),
 kxra.attach_digital_demand_evidence(uuid,integer,uuid,integer),
 kxra.authorize_digital_local_prototype(uuid,integer,uuid)
to authenticated;

commit;
