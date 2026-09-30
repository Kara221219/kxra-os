begin;

-- Add the owner's 30 September venture intake as governed discovery projects.
-- The migration adds workspace structure and gates only. Canonical seed data
-- creates the project rows, with every execution and product flag disabled.
alter table kxra.project_gate_policies
 drop constraint project_gate_policies_gate_code_check;
alter table kxra.project_gate_policies
 add constraint project_gate_policies_gate_code_check check(gate_code in (
  'P001_REVISIT','P002_LISTING','P003_FAITHFUL_DELIVERY','P004_PAPER_READINESS',
  'P005_LOCAL_PROTOTYPE','P006_PUBLICATION_PACKAGE','P007_ADOPTION',
  'P008_SUPPLIER_SELECTION','P009_PROPERTY_PILOT','P010_CLINICAL_READINESS',
  'P011_COMMERCE_PILOT','P012_DEALER_PILOT'
 ));

create or replace function kxra_private.prepare_project_defaults() returns trigger
language plpgsql set search_path='' as $$
begin
 new.lifecycle_stage=coalesce(new.lifecycle_stage,case new.stage
  when 'DISCOVERY' then 'PROBLEM_DISCOVERY'
  when 'VALIDATION' then 'VALIDATION'
  when 'FEASIBILITY' then 'FEASIBILITY'
  else null end);
 new.disposition=coalesce(new.disposition,case
  when new.code in ('PROJECT-006','PROJECT-007','PROJECT-008','PROJECT-009','PROJECT-010','PROJECT-011','PROJECT-012') then 'ACTIVE'
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
  when 'PROJECT-006' then 'P006_PUBLICATION_PACKAGE'
  when 'PROJECT-007' then 'P007_ADOPTION'
  when 'PROJECT-008' then 'P008_SUPPLIER_SELECTION'
  when 'PROJECT-009' then 'P009_PROPERTY_PILOT'
  when 'PROJECT-010' then 'P010_CLINICAL_READINESS'
  when 'PROJECT-011' then 'P011_COMMERCE_PILOT'
  when 'PROJECT-012' then 'P012_DEALER_PILOT'
  else null end);
 return new;
end $$;

create function kxra_private.provision_venture_intake_reference_data(target uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 with specialist(code,module_key,label,position,description,hard_boundary,write_policy) as (values
  ('PROJECT-008','supplier-intake','Supplier Intake',1,'Owner-supplied supplier references and identity checks.','A social profile is not verified supplier authority.','CONTRIBUTOR'),
  ('PROJECT-008','machine-comparison','Machine Comparison',2,'Comparable model, specification and supported-surface evidence.','Comparisons must use exact model and dated evidence.','CONTRIBUTOR'),
  ('PROJECT-008','purchase-lease-quotes','Purchase / Lease Quotes',3,'Written purchase, lease and finance quotes with expiry and assumptions.','No spend from indicative or social-media pricing.','OWNER'),
  ('PROJECT-008','landed-costs','Landed Costs',4,'Machine, option, freight, duty, VAT, setup and finance inputs.','Only deterministic arithmetic from sourced inputs.','OWNER'),
  ('PROJECT-008','support-warranty','Support / Warranty',5,'Training, warranty, spare parts, response times and failure handling.',null,'CONTRIBUTOR'),
  ('PROJECT-008','print-quality-pilot','Print Quality Pilot',6,'Rights-cleared sample output, surface tests and operator QA.','No purchase before an observed output and maintenance test.','OWNER'),
  ('PROJECT-008','route-to-market','Route to Market',7,'Customer segment, pricing and demand interview evidence.',null,'CONTRIBUTOR'),
  ('PROJECT-008','supplier-selection-gate','Supplier Selection Gate',8,'Evidence-bound machine selection or no-buy decision.','Requires comparable quotes, due diligence, pilot evidence and approved economics.','OWNER'),

  ('PROJECT-009','operator-discovery','Operator Discovery',1,'Manchester owner and operator interviews with attributed needs.',null,'CONTRIBUTOR'),
  ('PROJECT-009','property-pipeline','Property Pipeline',2,'Potential properties and owner authority state.','No property is advertised without written authority.','CONTRIBUTOR'),
  ('PROJECT-009','commercial-models','Commercial Models',3,'Referral, fixed marketing and managed-listing hypotheses.',null,'CONTRIBUTOR'),
  ('PROJECT-009','planning-registration','Planning / Registration',4,'Property-specific planning, registration and local-rule evidence.','Unresolved planning or registration blocks onboarding.','OWNER'),
  ('PROJECT-009','redress-client-money','Redress / Client Money',5,'Perimeter, redress and client-money protection assessment.','KXRA cannot hold client money until applicable protections are satisfied.','OWNER'),
  ('PROJECT-009','guest-operations','Guest Operations',6,'Booking, safety, cleaning, support, complaints and incident model.',null,'CONTRIBUTOR'),
  ('PROJECT-009','unit-economics','Unit Economics',7,'Deterministic property-level revenue, fees and cost scenarios.','No unsupported occupancy, rate or margin claim.','OWNER'),
  ('PROJECT-009','property-pilot-gate','Property Pilot Gate',8,'Evidence-bound authority for one controlled property pilot.','Requires rights, compliance, insurance, service agreement and approved economics.','OWNER'),

  ('PROJECT-010','clinical-operator','Clinical Operator',1,'Accountable provider entity, clinical lead and registered professionals.','No clinical activity without named accountable professionals.','OWNER'),
  ('PROJECT-010','professional-scope','Professional Scope',2,'Task allocation by title, training, competence and indemnity.','No AI or commercial role may diagnose, prescribe or expand professional scope.','OWNER'),
  ('PROJECT-010','provider-registration','Provider Registration',3,'CQC activities, provider, manager and location evidence.','No regulated activity before required registration is effective.','OWNER'),
  ('PROJECT-010','premises-options','Premises Options',4,'Compliant chair, room-hire, sessional and lease options.',null,'CONTRIBUTOR'),
  ('PROJECT-010','supplier-pathway','Aligner Supplier Pathway',5,'Provider certification, commercial terms and trademark permissions.','Do not represent KXRA as an Invisalign provider without verified authority.','OWNER'),
  ('PROJECT-010','patient-safety-data','Patient Safety / Data',6,'Consent, records, safeguarding, complaints and special-category data controls.','No patient intake until clinical and data governance pass.','OWNER'),
  ('PROJECT-010','dental-economics','Dental Economics',7,'Deterministic staffing, premises, lab, finance and acquisition scenarios.','No unsupported treatment volume or outcome claim.','OWNER'),
  ('PROJECT-010','clinical-readiness-gate','Clinical Readiness Gate',8,'Evidence-bound go, redesign or stop decision.','Requires clinical owner, scopes, registration, premises, insurance and approved pathway.','OWNER'),

  ('PROJECT-011','product-hypotheses','Product Hypotheses',1,'Specific product and buyer hypotheses; no generic trend list.',null,'CONTRIBUTOR'),
  ('PROJECT-011','demand-evidence','Demand Evidence',2,'Search, competitor, interview and pre-commitment evidence.','Product creation and listing wait for reviewed demand evidence.','CONTRIBUTOR'),
  ('PROJECT-011','supplier-due-diligence','Supplier Due Diligence',3,'Supplier identity, rights, quality and traceability evidence.','A marketplace listing alone is not supplier validation.','OWNER'),
  ('PROJECT-011','product-safety','Product Safety',4,'Applicable standards, technical records, labels and incident process.','Unknown safety or importer duty blocks listing.','OWNER'),
  ('PROJECT-011','landed-contribution','Landed Contribution',5,'Deterministic product, freight, duty, VAT, platform, returns and service costs.','No model-calculated money or unsupported margin.','OWNER'),
  ('PROJECT-011','consumer-journey','Consumer Journey',6,'Pre-contract, delivery, cancellation, return and complaints controls.',null,'CONTRIBUTOR'),
  ('PROJECT-011','listing-experiment','Listing Experiment',7,'Bounded draft or no-charge demand test.','No external listing, ad or order without approval.','OWNER'),
  ('PROJECT-011','commerce-pilot-gate','Commerce Pilot Gate',8,'Evidence-bound decision for one product pilot.','Requires demand, safety, supplier, rights, fulfilment and approved economics.','OWNER'),

  ('PROJECT-012','dealer-discovery','Dealer Discovery',1,'Dealer interviews and exact sales-workflow pain points.',null,'CONTRIBUTOR'),
  ('PROJECT-012','assisted-sales-workflow','Assisted Sales Workflow',2,'One bounded workflow with human handoff and approval points.','The assistant cannot make commitments or contact leads without authority.','CONTRIBUTOR'),
  ('PROJECT-012','crm-data-boundary','CRM / Data Boundary',3,'Source systems, fields, retention, access and deletion rules.','No cross-dealer context or model-selected permissions.','OWNER'),
  ('PROJECT-012','consent-outreach','Consent / Outreach',4,'Channel-specific consent, suppression and contact records.','No automated call, message or email without a lawful, evidenced route.','OWNER'),
  ('PROJECT-012','vehicle-claim-qa','Vehicle Claim QA',5,'Availability, specification, price and condition evidence.','No invented stock, price, finance or vehicle claim.','OWNER'),
  ('PROJECT-012','finance-perimeter','Finance Perimeter',6,'Credit-broking, promotion and broker-not-lender boundary.','No finance introduction or promotion until the dealer and KXRA perimeter is approved.','OWNER'),
  ('PROJECT-012','sales-handoff-analytics','Sales Handoff / Analytics',7,'Human handoff, outcome and correction evidence without dark patterns.',null,'CONTRIBUTOR'),
  ('PROJECT-012','dealer-pilot-gate','Dealer Pilot Gate',8,'Evidence-bound authority for one monitored dealer pilot.','Requires dealer agreement, consent path, data controls, QA and finance-perimeter review.','OWNER')
 )
 insert into kxra.project_workspace_modules(
  org_id,project_id,module_key,label,module_group,source_kind,entry_type,position,
  description,hard_boundary,write_policy,filter_spec
 )
 select p.org_id,p.id,s.module_key,s.label,'SPECIALIST','WORKSPACE_ENTRIES','EVIDENCE_ITEM',s.position,
  s.description,s.hard_boundary,s.write_policy,'{}'::jsonb
 from specialist s join kxra.projects p on p.code=s.code
 where p.id=target
 on conflict(project_id,module_key) do nothing;

 insert into kxra.project_gate_policies(org_id,project_id,gate_code,requirements)
 select p.org_id,p.id,
  case p.code
   when 'PROJECT-008' then 'P008_SUPPLIER_SELECTION'
   when 'PROJECT-009' then 'P009_PROPERTY_PILOT'
   when 'PROJECT-010' then 'P010_CLINICAL_READINESS'
   when 'PROJECT-011' then 'P011_COMMERCE_PILOT'
   when 'PROJECT-012' then 'P012_DEALER_PILOT'
  end,
  case p.code
   when 'PROJECT-008' then '["verified supplier identity","comparable written purchase and lease quotes","warranty, training, consumables and delivery evidence","observed print and maintenance pilot","approved deterministic economics"]'::jsonb
   when 'PROJECT-009' then '["written property and listing authority","property-specific planning and registration review","redress and client-money perimeter","insurance and operating agreement","approved deterministic property economics"]'::jsonb
   when 'PROJECT-010' then '["accountable clinical provider and named professionals","title, competence and indemnity evidence","CQC activity, manager and location readiness","supplier and trademark authority","patient safety and special-category data controls"]'::jsonb
   when 'PROJECT-011' then '["specific buyer demand evidence","verified supplier and traceability","product-safety and importer-duty evidence","consumer-rights and fulfilment controls","approved deterministic landed contribution"]'::jsonb
   when 'PROJECT-012' then '["signed dealer pilot scope","channel consent and suppression controls","one-dealer data isolation","vehicle claim QA and human approval","documented finance and promotion perimeter"]'::jsonb
  end
 from kxra.projects p
 where p.id=target and p.code in ('PROJECT-008','PROJECT-009','PROJECT-010','PROJECT-011','PROJECT-012')
 on conflict(project_id,gate_code) do nothing;
end $$;

create function kxra_private.provision_venture_intake_reference_data_trigger()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform kxra_private.provision_venture_intake_reference_data(new.id);
 return new;
end $$;

revoke all on function
 kxra_private.provision_venture_intake_reference_data(uuid),
 kxra_private.provision_venture_intake_reference_data_trigger()
from public,anon,authenticated;

create trigger projects_provision_venture_intake_reference_data
after insert on kxra.projects for each row
execute function kxra_private.provision_venture_intake_reference_data_trigger();

select kxra_private.provision_venture_intake_reference_data(id)
from kxra.projects
where code in ('PROJECT-008','PROJECT-009','PROJECT-010','PROJECT-011','PROJECT-012');

commit;
