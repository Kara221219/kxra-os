begin;

-- Project 006 records an exact content package and stops at a local upload
-- intent. Provider credentials, tokens, publication jobs and send functions are
-- deliberately absent.
create table kxra.youtube_channel_bindings(
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null,
 project_id uuid not null,
 expected_channel_url text not null check(expected_channel_url~'^https://youtube\.com/@[A-Za-z0-9_-]+$'),
 expected_handle text not null check(expected_handle~'^@[A-Za-z0-9_-]+$'),
 provider_channel_id text check(provider_channel_id is null or provider_channel_id~'^UC[A-Za-z0-9_-]{20,40}$'),
 provider_grant_reference text check(provider_grant_reference is null or length(provider_grant_reference) between 8 and 240),
 scope_sha256 text check(scope_sha256 is null or scope_sha256~'^[a-f0-9]{64}$'),
 proof_sha256 text check(proof_sha256 is null or proof_sha256~'^[a-f0-9]{64}$'),
 state text not null default 'UNVERIFIED' check(state in ('UNVERIFIED','VERIFIED','DISCONNECTED')),
 verified_account_id uuid references kxra.account_identities(account_id),
 verified_at timestamptz,
 disconnected_at timestamptz,
 version integer not null default 1 check(version>0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(project_id),
 unique(org_id,project_id,id),
 foreign key(org_id,project_id) references kxra.projects(org_id,id),
 check(state<>'VERIFIED' or (
  provider_channel_id is not null and provider_grant_reference is not null
  and scope_sha256 is not null and proof_sha256 is not null
  and verified_account_id is not null and verified_at is not null
  and disconnected_at is null
 ))
);

create table kxra.youtube_content_packages(
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null,
 project_id uuid not null,
 topic text not null check(length(trim(topic)) between 3 and 500),
 current_version integer not null default 1 check(current_version>0),
 approved_version integer check(approved_version is null or approved_version>0),
 state text not null default 'DRAFT' check(state in ('DRAFT','APPROVED','CHANGES_REQUIRED')),
 client_request_id uuid not null,
 created_by uuid not null references kxra.account_identities(account_id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(org_id,project_id,client_request_id),
 unique(org_id,project_id,id),
 foreign key(org_id,project_id) references kxra.projects(org_id,id),
 check(state<>'APPROVED' or approved_version=current_version)
);

create table kxra.youtube_content_package_versions(
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null,
 project_id uuid not null,
 package_id uuid not null,
 version integer not null check(version>0),
 source_pack jsonb not null check(jsonb_typeof(source_pack)='array'),
 claim_ledger jsonb not null check(jsonb_typeof(claim_ledger)='array'),
 script text not null check(length(trim(script)) between 100 and 50000),
 red_team jsonb not null check(jsonb_typeof(red_team)='object'),
 storyboard jsonb not null check(jsonb_typeof(storyboard)='object'),
 rights_review jsonb not null check(jsonb_typeof(rights_review)='object'),
 voice_provenance jsonb not null check(jsonb_typeof(voice_provenance)='object'),
 render_manifest jsonb not null check(jsonb_typeof(render_manifest)='object'),
 qa_review jsonb not null check(jsonb_typeof(qa_review)='object'),
 publication_metadata jsonb not null check(jsonb_typeof(publication_metadata)='object'),
 content_sha256 text not null check(content_sha256~'^[a-f0-9]{64}$'),
 status text not null default 'DRAFT' check(status in ('DRAFT','APPROVED','REJECTED','SUPERSEDED')),
 client_request_id uuid not null,
 created_by uuid not null references kxra.account_identities(account_id),
 created_at timestamptz not null default now(),
 unique(package_id,version),
 unique(package_id,client_request_id),
 unique(org_id,project_id,id),
 unique(org_id,project_id,package_id,version),
 foreign key(org_id,project_id,package_id)
  references kxra.youtube_content_packages(org_id,project_id,id)
);

create table kxra.youtube_content_reviews(
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null,
 project_id uuid not null,
 package_id uuid not null,
 package_version_id uuid not null,
 package_version integer not null check(package_version>0),
 content_sha256 text not null check(content_sha256~'^[a-f0-9]{64}$'),
 checks jsonb not null check(jsonb_typeof(checks)='object'),
 decision text not null check(decision in ('APPROVE_UPLOAD_INTENT','REQUEST_CHANGES','REJECT')),
 note text not null check(length(trim(note)) between 3 and 5000),
 client_request_id uuid not null,
 reviewed_by uuid not null references kxra.account_identities(account_id),
 created_at timestamptz not null default now(),
 unique(org_id,project_id,client_request_id),
 unique(org_id,project_id,id),
 foreign key(org_id,project_id,package_id)
  references kxra.youtube_content_packages(org_id,project_id,id),
 foreign key(org_id,project_id,package_version_id)
  references kxra.youtube_content_package_versions(org_id,project_id,id)
);

create table kxra.youtube_upload_intents(
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null,
 project_id uuid not null,
 channel_binding_id uuid not null,
 channel_binding_version integer not null check(channel_binding_version>0),
 package_id uuid not null,
 package_version_id uuid not null,
 package_version integer not null check(package_version>0),
 review_id uuid not null,
 content_sha256 text not null check(content_sha256~'^[a-f0-9]{64}$'),
 intent_sha256 text not null check(intent_sha256~'^[a-f0-9]{64}$'),
 idempotency_key uuid not null,
 requested_by uuid not null references kxra.account_identities(account_id),
 state text not null default 'READY' check(state in ('READY','WITHDRAWN')),
 adapter text not null default 'DISABLED' check(adapter='DISABLED'),
 delivery_state text not null default 'NOT_SENT' check(delivery_state='NOT_SENT'),
 created_at timestamptz not null default now(),
 withdrawn_at timestamptz,
 unique(org_id,project_id,idempotency_key),
 unique(org_id,project_id,id),
 foreign key(org_id,project_id,channel_binding_id)
  references kxra.youtube_channel_bindings(org_id,project_id,id),
 foreign key(org_id,project_id,package_id)
  references kxra.youtube_content_packages(org_id,project_id,id),
 foreign key(org_id,project_id,package_version_id)
  references kxra.youtube_content_package_versions(org_id,project_id,id),
 foreign key(org_id,project_id,review_id)
  references kxra.youtube_content_reviews(org_id,project_id,id),
 check((state='WITHDRAWN')=(withdrawn_at is not null))
);

-- Project 007 records untrusted repositories as data. These records provide no
-- archive reader, process launcher, package installer, Git writer or merge path.
create table kxra.repository_candidates(
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null,
 project_id uuid not null,
 repository_owner text not null check(repository_owner~'^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38}[A-Za-z0-9])?$'),
 repository_name text not null check(repository_name~'^[A-Za-z0-9._-]{1,100}$'),
 source_url text not null check(source_url~'^https://github\.com/[A-Za-z0-9-]+/[A-Za-z0-9._-]+$'),
 default_branch text check(default_branch is null or default_branch~'^[A-Za-z0-9._/-]{1,240}$'),
 commit_sha text not null check(commit_sha~'^[a-f0-9]{40}$'),
 tree_sha text check(tree_sha is null or tree_sha~'^[a-f0-9]{40}$'),
 fetched_at timestamptz not null,
 source_classification text not null check(source_classification in ('EXTERNAL RESEARCH','USER-SUPPLIED INFORMATION')),
 intake_source text not null check(intake_source in ('APPROVED_REFERENCE_SEED','CONTROLLED_METADATA')),
 state text not null check(state in ('REFERENCE_ONLY','METADATA_ONLY')),
 licence_observation text not null check(length(trim(licence_observation)) between 3 and 3000),
 adoption_recommendation text not null check(length(trim(adoption_recommendation)) between 3 and 3000),
 client_request_id uuid not null,
 created_by uuid references kxra.account_identities(account_id),
 created_at timestamptz not null default now(),
 unique(org_id,project_id,repository_owner,repository_name,commit_sha),
 unique(org_id,project_id,client_request_id),
 unique(org_id,project_id,id),
 foreign key(org_id,project_id) references kxra.projects(org_id,id),
 check((intake_source='APPROVED_REFERENCE_SEED')=(created_by is null))
);

create table kxra.repository_quarantine_records(
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null,
 project_id uuid not null,
 candidate_id uuid not null,
 commit_sha text not null check(commit_sha~'^[a-f0-9]{40}$'),
 tree_sha text not null check(tree_sha~'^[a-f0-9]{40}$'),
 object_reference text not null check(object_reference~'^private://repository-quarantine/[a-f0-9-]{36}$'),
 archive_sha256 text not null check(archive_sha256~'^[a-f0-9]{64}$'),
 manifest_sha256 text not null check(manifest_sha256~'^[a-f0-9]{64}$'),
 archive_size_bytes bigint not null check(archive_size_bytes between 1 and 104857600),
 controls jsonb not null check(jsonb_typeof(controls)='object'),
 policy_version text not null check(length(policy_version) between 1 and 80),
 result text not null check(result in ('ACCEPTED','REJECTED')),
 reason text not null check(length(trim(reason)) between 3 and 3000),
 client_request_id uuid not null,
 recorded_by uuid not null references kxra.account_identities(account_id),
 created_at timestamptz not null default now(),
 unique(candidate_id),
 unique(org_id,project_id,client_request_id),
 unique(org_id,project_id,id),
 foreign key(org_id,project_id,candidate_id)
  references kxra.repository_candidates(org_id,project_id,id)
);

create table kxra.repository_assessments(
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null,
 project_id uuid not null,
 candidate_id uuid not null,
 quarantine_id uuid not null,
 commit_sha text not null check(commit_sha~'^[a-f0-9]{40}$'),
 tree_sha text not null check(tree_sha~'^[a-f0-9]{40}$'),
 archive_sha256 text not null check(archive_sha256~'^[a-f0-9]{64}$'),
 toolchain jsonb not null check(jsonb_typeof(toolchain)='object'),
 findings jsonb not null check(jsonb_typeof(findings)='array'),
 licence_state text not null check(licence_state in ('CLEAR','AMBIGUOUS','BLOCKED')),
 provenance_state text not null check(provenance_state in ('CLEAR','UNRESOLVED','BLOCKED')),
 secret_state text not null check(secret_state in ('NO_FINDING','FINDING')),
 malware_state text not null check(malware_state in ('NO_FINDING','FINDING')),
 dependency_state text not null check(dependency_state in ('PASS','BLOCKED')),
 sast_state text not null check(sast_state in ('PASS','BLOCKED')),
 workflow_state text not null check(workflow_state in ('PASS','BLOCKED')),
 binary_state text not null check(binary_state in ('PASS','BLOCKED')),
 critical_count integer not null check(critical_count between 0 and 100000),
 high_count integer not null check(high_count between 0 and 100000),
 bounded_conclusion text not null check(length(trim(bounded_conclusion)) between 20 and 3000),
 residual_risk text not null check(length(trim(residual_risk)) between 3 and 5000),
 disposition text not null check(disposition in ('PASS','BLOCKED')),
 client_request_id uuid not null,
 reviewed_by uuid not null references kxra.account_identities(account_id),
 created_at timestamptz not null default now(),
 unique(org_id,project_id,client_request_id),
 unique(org_id,project_id,id),
 foreign key(org_id,project_id,candidate_id)
  references kxra.repository_candidates(org_id,project_id,id),
 foreign key(org_id,project_id,quarantine_id)
  references kxra.repository_quarantine_records(org_id,project_id,id)
);

create table kxra.repository_adoption_proposals(
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null,
 project_id uuid not null,
 candidate_id uuid not null,
 current_version integer not null default 1 check(current_version>0),
 approved_version integer check(approved_version is null or approved_version>0),
 state text not null default 'DRAFT' check(state in ('DRAFT','APPROVED','CHANGES_REQUIRED')),
 client_request_id uuid not null,
 created_by uuid not null references kxra.account_identities(account_id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(org_id,project_id,client_request_id),
 unique(org_id,project_id,id),
 foreign key(org_id,project_id,candidate_id)
  references kxra.repository_candidates(org_id,project_id,id),
 check(state<>'APPROVED' or approved_version=current_version)
);

create table kxra.repository_adoption_proposal_versions(
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null,
 project_id uuid not null,
 proposal_id uuid not null,
 version integer not null check(version>0),
 candidate_id uuid not null,
 assessment_id uuid not null,
 need_statement text not null check(length(trim(need_statement)) between 3 and 5000),
 exact_scope jsonb not null check(jsonb_typeof(exact_scope)='array' and jsonb_array_length(exact_scope) between 1 and 100),
 licence_obligations text not null check(length(trim(licence_obligations)) between 3 and 5000),
 architecture_changes text not null check(length(trim(architecture_changes)) between 3 and 10000),
 threat_model text not null check(length(trim(threat_model)) between 3 and 10000),
 test_plan text not null check(length(trim(test_plan)) between 3 and 10000),
 rollback_plan text not null check(length(trim(rollback_plan)) between 3 and 10000),
 proposal_sha256 text not null check(proposal_sha256~'^[a-f0-9]{64}$'),
 status text not null default 'DRAFT' check(status in ('DRAFT','APPROVED','REJECTED','SUPERSEDED')),
 client_request_id uuid not null,
 created_by uuid not null references kxra.account_identities(account_id),
 created_at timestamptz not null default now(),
 unique(proposal_id,version),
 unique(proposal_id,client_request_id),
 unique(org_id,project_id,id),
 unique(org_id,project_id,proposal_id,version),
 foreign key(org_id,project_id,proposal_id)
  references kxra.repository_adoption_proposals(org_id,project_id,id),
 foreign key(org_id,project_id,candidate_id)
  references kxra.repository_candidates(org_id,project_id,id),
 foreign key(org_id,project_id,assessment_id)
  references kxra.repository_assessments(org_id,project_id,id)
);

create table kxra.repository_adoption_reviews(
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null,
 project_id uuid not null,
 proposal_id uuid not null,
 proposal_version_id uuid not null,
 proposal_version integer not null check(proposal_version>0),
 proposal_sha256 text not null check(proposal_sha256~'^[a-f0-9]{64}$'),
 checks jsonb not null check(jsonb_typeof(checks)='object'),
 decision text not null check(decision in ('APPROVE_IMPLEMENTATION_INTENT','REQUEST_CHANGES','REJECT')),
 note text not null check(length(trim(note)) between 3 and 5000),
 client_request_id uuid not null,
 reviewed_by uuid not null references kxra.account_identities(account_id),
 created_at timestamptz not null default now(),
 unique(org_id,project_id,client_request_id),
 unique(org_id,project_id,id),
 foreign key(org_id,project_id,proposal_id)
  references kxra.repository_adoption_proposals(org_id,project_id,id),
 foreign key(org_id,project_id,proposal_version_id)
  references kxra.repository_adoption_proposal_versions(org_id,project_id,id)
);

create table kxra.repository_implementation_intents(
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null,
 project_id uuid not null,
 candidate_id uuid not null,
 assessment_id uuid not null,
 proposal_id uuid not null,
 proposal_version_id uuid not null,
 review_id uuid not null,
 commit_sha text not null check(commit_sha~'^[a-f0-9]{40}$'),
 proposal_sha256 text not null check(proposal_sha256~'^[a-f0-9]{64}$'),
 branch_name text not null check(branch_name~'^codex/[a-z0-9]+(?:-[a-z0-9]+)*$' and length(branch_name)<=120),
 intent_sha256 text not null check(intent_sha256~'^[a-f0-9]{64}$'),
 idempotency_key uuid not null,
 requested_by uuid not null references kxra.account_identities(account_id),
 state text not null default 'AUTHORIZED' check(state='AUTHORIZED'),
 git_execution_state text not null default 'NOT_STARTED' check(git_execution_state='NOT_STARTED'),
 merge_enabled boolean not null default false check(not merge_enabled),
 release_enabled boolean not null default false check(not release_enabled),
 deploy_enabled boolean not null default false check(not deploy_enabled),
 created_at timestamptz not null default now(),
 unique(org_id,project_id,idempotency_key),
 unique(org_id,project_id,id),
 foreign key(org_id,project_id,candidate_id)
  references kxra.repository_candidates(org_id,project_id,id),
 foreign key(org_id,project_id,assessment_id)
  references kxra.repository_assessments(org_id,project_id,id),
 foreign key(org_id,project_id,proposal_id)
  references kxra.repository_adoption_proposals(org_id,project_id,id),
 foreign key(org_id,project_id,proposal_version_id)
  references kxra.repository_adoption_proposal_versions(org_id,project_id,id),
 foreign key(org_id,project_id,review_id)
  references kxra.repository_adoption_reviews(org_id,project_id,id)
);

create index youtube_packages_scope on kxra.youtube_content_packages(org_id,project_id,updated_at desc);
create index youtube_package_versions_scope on kxra.youtube_content_package_versions(package_id,version desc);
create index youtube_reviews_scope on kxra.youtube_content_reviews(package_id,created_at desc);
create index youtube_upload_intents_scope on kxra.youtube_upload_intents(org_id,project_id,created_at desc);
create index repository_candidates_scope on kxra.repository_candidates(org_id,project_id,created_at desc);
create index repository_assessments_scope on kxra.repository_assessments(candidate_id,created_at desc);
create index repository_proposals_scope on kxra.repository_adoption_proposals(org_id,project_id,updated_at desc);
create index repository_implementation_intents_scope on kxra.repository_implementation_intents(org_id,project_id,created_at desc);

alter table kxra.youtube_channel_bindings enable row level security;
alter table kxra.youtube_content_packages enable row level security;
alter table kxra.youtube_content_package_versions enable row level security;
alter table kxra.youtube_content_reviews enable row level security;
alter table kxra.youtube_upload_intents enable row level security;
alter table kxra.repository_candidates enable row level security;
alter table kxra.repository_quarantine_records enable row level security;
alter table kxra.repository_assessments enable row level security;
alter table kxra.repository_adoption_proposals enable row level security;
alter table kxra.repository_adoption_proposal_versions enable row level security;
alter table kxra.repository_adoption_reviews enable row level security;
alter table kxra.repository_implementation_intents enable row level security;

grant select on kxra.youtube_channel_bindings,kxra.youtube_content_packages,
 kxra.youtube_content_package_versions,kxra.youtube_content_reviews,
 kxra.youtube_upload_intents,kxra.repository_candidates,
 kxra.repository_quarantine_records,kxra.repository_assessments,
 kxra.repository_adoption_proposals,kxra.repository_adoption_proposal_versions,
 kxra.repository_adoption_reviews,kxra.repository_implementation_intents
to authenticated,anon;

create policy youtube_channel_bindings_read on kxra.youtube_channel_bindings for select
 using(kxra_private.can_project(project_id,false));
create policy youtube_content_packages_read on kxra.youtube_content_packages for select
 using(kxra_private.can_project(project_id,false));
create policy youtube_content_package_versions_read on kxra.youtube_content_package_versions for select
 using(kxra_private.can_project(project_id,false));
create policy youtube_content_reviews_read on kxra.youtube_content_reviews for select
 using(kxra_private.can_project(project_id,false));
create policy youtube_upload_intents_read on kxra.youtube_upload_intents for select
 using(kxra_private.can_project(project_id,false));
create policy repository_candidates_read on kxra.repository_candidates for select
 using(kxra_private.can_project(project_id,false));
create policy repository_quarantine_records_read on kxra.repository_quarantine_records for select
 using(kxra_private.can_project(project_id,false));
create policy repository_assessments_read on kxra.repository_assessments for select
 using(kxra_private.can_project(project_id,false));
create policy repository_adoption_proposals_read on kxra.repository_adoption_proposals for select
 using(kxra_private.can_project(project_id,false));
create policy repository_adoption_proposal_versions_read on kxra.repository_adoption_proposal_versions for select
 using(kxra_private.can_project(project_id,false));
create policy repository_adoption_reviews_read on kxra.repository_adoption_reviews for select
 using(kxra_private.can_project(project_id,false));
create policy repository_implementation_intents_read on kxra.repository_implementation_intents for select
 using(kxra_private.can_project(project_id,false));

create function kxra_private.provision_phase2_pipeline_seed(target uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 insert into kxra.youtube_channel_bindings(
  id,org_id,project_id,expected_channel_url,expected_handle,state
 )
 select case when p.id='30000000-0000-4000-8000-000000000006'::uuid
   then '66000000-0000-4000-8000-000000000006'::uuid else gen_random_uuid() end,
  p.org_id,p.id,'https://youtube.com/@finance-unfolded247','@Finance-Unfolded247','UNVERIFIED'
 from kxra.projects p where p.id=target and p.code='PROJECT-006'
 on conflict(project_id) do nothing;

 insert into kxra.repository_candidates(
  id,org_id,project_id,repository_owner,repository_name,source_url,
  commit_sha,fetched_at,source_classification,intake_source,state,
  licence_observation,adoption_recommendation,client_request_id,created_by
 )
 select case when p.id='30000000-0000-4000-8000-000000000007'::uuid
   then seed.id else gen_random_uuid() end,
  p.org_id,p.id,seed.repository_owner,seed.repository_name,seed.source_url,
  seed.commit_sha,'2026-09-19T00:00:00Z'::timestamptz,'EXTERNAL RESEARCH',
  'APPROVED_REFERENCE_SEED','REFERENCE_ONLY',seed.licence_observation,
  seed.adoption_recommendation,seed.client_request_id,null
 from kxra.projects p cross join (values
  ('67000000-0000-4000-8000-000000000001'::uuid,'worldflowai','everything-claude-code',
   'https://github.com/worldflowai/everything-claude-code',
   '432485ba6b92c14fb357276a98957f348bcff9ee',
   'Mirror advertises MIT in README; root licence and upstream provenance require element-level resolution.',
   'Concepts only: manifest, command organization and lifecycle patterns; no wholesale import or execution.',
   '67000000-0000-4000-8000-000000000011'::uuid),
  ('67000000-0000-4000-8000-000000000002'::uuid,'msitarzewski','agency-agents',
   'https://github.com/msitarzewski/agency-agents',
   'ad9264e309bd5e5422c04784372d7841b1e5d604',
   'MIT was observed at the audited revision; reused elements still require exact attribution review.',
   'Concepts only: selected role briefs and deliverable patterns within the KXRA hierarchy; no agent swarm import.',
   '67000000-0000-4000-8000-000000000012'::uuid)
 ) seed(id,repository_owner,repository_name,source_url,commit_sha,licence_observation,adoption_recommendation,client_request_id)
 where p.id=target and p.code='PROJECT-007'
 on conflict(org_id,project_id,repository_owner,repository_name,commit_sha) do nothing;
end $$;

create function kxra_private.provision_phase2_pipeline_seed_trigger()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform kxra_private.provision_phase2_pipeline_seed(new.id);
 return new;
end $$;

revoke all on function kxra_private.provision_phase2_pipeline_seed(uuid),
 kxra_private.provision_phase2_pipeline_seed_trigger()
from public,anon,authenticated;

create trigger projects_provision_phase2_pipeline_seed after insert on kxra.projects
for each row execute function kxra_private.provision_phase2_pipeline_seed_trigger();

select kxra_private.provision_phase2_pipeline_seed(id)
from kxra.projects where code in ('PROJECT-006','PROJECT-007');

commit;
