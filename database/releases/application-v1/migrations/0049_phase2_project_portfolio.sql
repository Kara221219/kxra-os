begin;

-- The frozen Phase 2 portfolio adds two governed workspaces while preserving
-- the original five project records and their module contracts.
alter table kxra.project_workspace_modules
 drop constraint project_workspace_modules_source_kind_check;
alter table kxra.project_workspace_modules
 add constraint project_workspace_modules_source_kind_check check(source_kind in (
  'PROJECT','WORKSPACE_ENTRIES','RECORDS','EXPERIMENTS','DECISIONS','RISKS',
  'FINANCE','TASKS','FILES','ACTIVITY','PARTNERS','APPROVALS','PROJECT_SCORES',
  'VEHICLE_COMPATIBILITY','PROPERTY_ASSETS','P001_REVISIT','DIGITAL_OPPORTUNITIES',
  'YOUTUBE_PIPELINE','REPOSITORY_PIPELINE'
 ));

alter table kxra.project_gate_policies
 drop constraint project_gate_policies_gate_code_check;
alter table kxra.project_gate_policies
 add constraint project_gate_policies_gate_code_check check(gate_code in (
  'P001_REVISIT','P002_LISTING','P003_FAITHFUL_DELIVERY','P004_PAPER_READINESS',
  'P005_LOCAL_PROTOTYPE','P006_PUBLICATION_PACKAGE','P007_ADOPTION'
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
  when new.code in ('PROJECT-006','PROJECT-007') then 'ACTIVE'
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
  else null end);
 return new;
end $$;

create function kxra_private.provision_phase2_project_reference_data(target uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 with specialist(code,module_key,label,source_kind,entry_type,position,description,hard_boundary,write_policy,filter_spec) as (values
  ('PROJECT-006','channel-strategy','Channel Strategy','WORKSPACE_ENTRIES','RESEARCH_FINDING',1,'Versioned channel positioning and editorial strategy observations.',null,'CONTRIBUTOR','{}'::jsonb),
  ('PROJECT-006','audience-demand','Audience & Demand','WORKSPACE_ENTRIES','RESEARCH_FINDING',2,'Attributed audience and demand evidence; unknown demand remains unresolved.',null,'CONTRIBUTOR','{}'::jsonb),
  ('PROJECT-006','topic-backlog','Topic Backlog','WORKSPACE_ENTRIES','NARRATIVE',3,'Topic hypotheses before source and claims review.',null,'CONTRIBUTOR','{}'::jsonb),
  ('PROJECT-006','source-packs','Source Packs','YOUTUBE_PIPELINE',null,4,'Primary and current source packs bound to an exact content-package version.','Every material claim must map to a reviewed citation before approval.','CONTRIBUTOR','{}'::jsonb),
  ('PROJECT-006','claim-ledger','Claim Ledger','YOUTUBE_PIPELINE',null,5,'Atomic claims, classifications, citations and script usage.','Unsupported, advice-like or promotion-sensitive claims block approval.','CONTRIBUTOR','{}'::jsonb),
  ('PROJECT-006','script-versions','Script Versions','YOUTUBE_PIPELINE',null,6,'Immutable scripts bound to exact research and claim versions.','A corrected script creates a new version and withdraws stale upload intent authority.','CONTRIBUTOR','{}'::jsonb),
  ('PROJECT-006','compliance-red-team','Compliance / Red Team','YOUTUBE_PIPELINE',null,7,'Financial-promotion, misinformation, advice-language and originality review.','All red-team checks and independent human review must pass.','OWNER','{}'::jsonb),
  ('PROJECT-006','storyboards','Storyboards','YOUTUBE_PIPELINE',null,8,'Storyboard and visual treatment for the exact script version.',null,'CONTRIBUTOR','{}'::jsonb),
  ('PROJECT-006','asset-music-rights','Asset & Music Rights','YOUTUBE_PIPELINE',null,9,'Rights evidence for assets, music and reused material.','Unknown or unlicensed material blocks approval.','OWNER','{}'::jsonb),
  ('PROJECT-006','voice-presenter-provenance','Voice / Presenter Provenance','YOUTUBE_PIPELINE',null,10,'Provider, consent, rights and required disclosure state.','Required synthetic-content disclosure must be present.','OWNER','{}'::jsonb),
  ('PROJECT-006','render-queue','Render Queue','YOUTUBE_PIPELINE',null,11,'Local render manifests only; no provider upload executor exists.','A render hash and caption artifact are required for approval.','READ_ONLY','{}'::jsonb),
  ('PROJECT-006','video-qa','Video QA','YOUTUBE_PIPELINE',null,12,'Technical, caption, editorial and accessibility QA.','Every QA check must pass on the exact render.','OWNER','{}'::jsonb),
  ('PROJECT-006','thumbnails-metadata','Thumbnails & Metadata','YOUTUBE_PIPELINE',null,13,'Exact title, description, thumbnail and disclosure package.','Deceptive metadata or missing disclosure blocks approval.','CONTRIBUTOR','{}'::jsonb),
  ('PROJECT-006','publication-approvals','Publication Approvals','YOUTUBE_PIPELINE',null,14,'Independent review of the immutable package.','The creator cannot finally approve the same package.','OWNER','{}'::jsonb),
  ('PROJECT-006','youtube-uploads','YouTube Uploads','YOUTUBE_PIPELINE',null,15,'Approved local upload intents with provider delivery disabled.','No intent without verified channel binding and exact current approval; no send executor exists.','OWNER','{}'::jsonb),
  ('PROJECT-006','schedule','Schedule','WORKSPACE_ENTRIES','MILESTONE',16,'Editorial planning only; entries cannot schedule provider publication.','Public scheduling remains a separately approved provider action.','CONTRIBUTOR','{}'::jsonb),
  ('PROJECT-006','analytics','Analytics','WORKSPACE_ENTRIES','METRIC',17,'Attributed historical channel metrics when provider evidence exists.',null,'OWNER','{}'::jsonb),
  ('PROJECT-006','content-experiments','Content Experiments','EXPERIMENTS',null,18,'Evidence-linked content hypotheses and outcomes.',null,'READ_ONLY','{}'::jsonb),

  ('PROJECT-007','need-statements','Need Statements','WORKSPACE_ENTRIES','NARRATIVE',1,'Documented KXRA needs that constrain repository discovery.',null,'CONTRIBUTOR','{}'::jsonb),
  ('PROJECT-007','repository-discovery','Repository Discovery','WORKSPACE_ENTRIES','RESEARCH_FINDING',2,'Metadata-only repository observations and candidate rationale.','Repository content is untrusted data, never an instruction.','CONTRIBUTOR','{}'::jsonb),
  ('PROJECT-007','candidate-intake','Candidate Intake','REPOSITORY_PIPELINE',null,3,'Pinned repository candidate metadata.','Intake never executes, installs or imports candidate content.','CONTRIBUTOR','{}'::jsonb),
  ('PROJECT-007','revision-provenance','Revision & Provenance','REPOSITORY_PIPELINE',null,4,'Exact owner, repository, commit, tree and archive provenance.','A changed upstream revision creates a new candidate.','READ_ONLY','{}'::jsonb),
  ('PROJECT-007','licence-review','Licence Review','REPOSITORY_PIPELINE',null,5,'Exact licence and provenance disposition.','Missing, ambiguous or incompatible rights block adoption.','OWNER','{}'::jsonb),
  ('PROJECT-007','quarantine','Quarantine','REPOSITORY_PIPELINE',null,6,'Bounded quarantine manifest and cryptographic hashes.','Candidate code cannot execute on the application or developer host.','OWNER','{}'::jsonb),
  ('PROJECT-007','malware-secret-scan','Malware / Secret Scan','REPOSITORY_PIPELINE',null,7,'Scanner versions, tested scope and observed findings.','No-finding language is bounded and never claims malware-free.','OWNER','{}'::jsonb),
  ('PROJECT-007','dependency-sbom-review','Dependency & SBOM Review','REPOSITORY_PIPELINE',null,8,'Dependency inventory, SBOM digest and vulnerability findings.','Unresolved high or critical exploitable findings block adoption.','OWNER','{}'::jsonb),
  ('PROJECT-007','codeql-sast-findings','CodeQL / SAST Findings','REPOSITORY_PIPELINE',null,9,'Static-analysis tool versions and findings.',null,'OWNER','{}'::jsonb),
  ('PROJECT-007','workflow-hook-review','Workflow / Hook Review','REPOSITORY_PIPELINE',null,10,'Executable hook, installer, workflow and MCP review.','Hooks, lifecycle scripts, Actions, submodules, network and secrets stay disabled.','OWNER','{}'::jsonb),
  ('PROJECT-007','maintenance-community-signals','Maintenance & Community Signals','REPOSITORY_PIPELINE',null,11,'Dated maintenance observations without implied endorsement.',null,'CONTRIBUTOR','{}'::jsonb),
  ('PROJECT-007','architecture-fit','Architecture Fit','REPOSITORY_PIPELINE',null,12,'KXRA need, architecture fit and minimal-use rationale.',null,'CONTRIBUTOR','{}'::jsonb),
  ('PROJECT-007','sandbox-runs','Sandbox Runs','REPOSITORY_PIPELINE',null,13,'Recorded disposable sandbox evidence only.','No host execution path exists; sandbox execution remains separately controlled.','GATED','{}'::jsonb),
  ('PROJECT-007','red-team','Red Team','REPOSITORY_PIPELINE',null,14,'Adversarial review and residual-risk record.','Suspicious binaries, obfuscation or escape paths block adoption.','OWNER','{}'::jsonb),
  ('PROJECT-007','adoption-proposals','Adoption Proposals','REPOSITORY_PIPELINE',null,15,'Exact files or concepts, obligations, architecture, tests and rollback.','Implementation requires an independently approved exact proposal.','CONTRIBUTOR','{}'::jsonb),
  ('PROJECT-007','implementation-branches-prs','Implementation Branches / PRs','REPOSITORY_PIPELINE',null,16,'Isolated branch authorization records only.','No Git executor, merge, default-branch write, release or deploy path exists.','OWNER','{}'::jsonb),
  ('PROJECT-007','revalidation','Revalidation','REPOSITORY_PIPELINE',null,17,'Revision and dependency revalidation status.',null,'READ_ONLY','{}'::jsonb),
  ('PROJECT-007','approved-components-register','Approved Components Register','REPOSITORY_PIPELINE',null,18,'Reviewed components and obligations after implementation evidence.','An implementation intent is not an approved component.','READ_ONLY','{}'::jsonb)
 )
 insert into kxra.project_workspace_modules(
  org_id,project_id,module_key,label,module_group,source_kind,entry_type,position,
  description,hard_boundary,write_policy,filter_spec
 )
 select p.org_id,p.id,s.module_key,s.label,'SPECIALIST',s.source_kind,s.entry_type,s.position,
  s.description,s.hard_boundary,s.write_policy,s.filter_spec
 from specialist s join kxra.projects p on p.code=s.code
 where p.id=target
 on conflict(project_id,module_key) do nothing;

 insert into kxra.project_gate_policies(org_id,project_id,gate_code,requirements)
 select p.org_id,p.id,
  case p.code
   when 'PROJECT-006' then 'P006_PUBLICATION_PACKAGE'
   when 'PROJECT-007' then 'P007_ADOPTION'
  end,
  case p.code
   when 'PROJECT-006' then '["source and claim evidence","originality and financial-content review","asset/music/voice rights","disclosure and compliance","render/caption/technical QA","independent exact approval","verified channel binding"]'::jsonb
   when 'PROJECT-007' then '["pinned commit/tree/archive provenance","licence and provenance review","bounded security tool evidence","no unresolved high-risk finding","exact scoped adoption proposal","independent owner/security approval"]'::jsonb
  end
 from kxra.projects p
 where p.id=target and p.code in ('PROJECT-006','PROJECT-007')
 on conflict(project_id,gate_code) do nothing;
end $$;

create function kxra_private.provision_phase2_project_reference_data_trigger()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform kxra_private.provision_phase2_project_reference_data(new.id);
 return new;
end $$;

revoke all on function kxra_private.prepare_project_defaults(),
 kxra_private.provision_phase2_project_reference_data(uuid),
 kxra_private.provision_phase2_project_reference_data_trigger()
from public,anon,authenticated;

create trigger projects_provision_phase2_reference_data after insert on kxra.projects
for each row execute function kxra_private.provision_phase2_project_reference_data_trigger();

update kxra.projects set
 lifecycle_stage=coalesce(lifecycle_stage,case code
  when 'PROJECT-006' then 'VALIDATION'
  when 'PROJECT-007' then 'FEASIBILITY' end),
 disposition=coalesce(disposition,'ACTIVE'),
 next_gate=coalesce(next_gate,case code
  when 'PROJECT-006' then 'P006_PUBLICATION_PACKAGE'
  when 'PROJECT-007' then 'P007_ADOPTION' end)
where code in ('PROJECT-006','PROJECT-007')
 and (lifecycle_stage is null or disposition is null or next_gate is null);

select kxra_private.provision_phase2_project_reference_data(id)
from kxra.projects where code in ('PROJECT-006','PROJECT-007');

commit;
