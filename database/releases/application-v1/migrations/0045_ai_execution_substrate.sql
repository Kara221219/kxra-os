begin;

-- Final Milestones 5/6: durable, versioned AI contracts and append-only run
-- evidence. Provider credentials and model calls are deliberately absent.
do $$
begin
 if not exists(select 1 from pg_roles where rolname='kxra_ai_worker') then
  create role kxra_ai_worker nologin noinherit nobypassrls;
 end if;
end $$;
grant usage on schema kxra,kxra_private to kxra_ai_worker;

create table kxra.model_policies(
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null references kxra.organisations(id),
 code text not null check(code~'^[A-Z][A-Z0-9_-]{2,79}$'),
 version integer not null check(version>0),
 provider text not null check(provider in ('FAKE','OPENAI')),
 model text not null check(length(trim(model)) between 1 and 120),
 status text not null check(status in ('DRAFT','APPROVED','RETIRED')),
 allowed_classifications text[] not null check(cardinality(allowed_classifications)>0),
 max_input_tokens integer not null check(max_input_tokens between 1 and 2000000),
 max_output_tokens integer not null check(max_output_tokens between 1 and 200000),
 max_tool_calls integer not null default 1 check(max_tool_calls between 0 and 100),
 max_duration_ms integer not null check(max_duration_ms between 100 and 3600000),
 retention_mode text not null check(retention_mode in ('LOCAL_EPHEMERAL','PROVIDER_ZERO_RETENTION','PROVIDER_CONFIGURED')),
 data_region text not null check(length(trim(data_region)) between 2 and 80),
 escalation_required boolean not null default false,
 source_hash text not null check(source_hash~'^[a-f0-9]{64}$'),
 created_by uuid references kxra.account_identities(account_id),
 created_at timestamptz not null default now(),
 unique(org_id,code,version),
 unique(org_id,id,version)
);

create table kxra.agent_manifests(
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null references kxra.organisations(id),
 code text not null check(code~'^AGT-[A-Z0-9-]{2,76}$'),
 role text not null check(length(trim(role)) between 1 and 160),
 manager_code text check(manager_code is null or manager_code~'^AGT-[A-Z0-9-]{2,76}$'),
 current_version integer not null check(current_version>0),
 classification kxra.classification not null default 'DECISION',
 source_hash text not null check(source_hash~'^[a-f0-9]{64}$'),
 created_at timestamptz not null default now(),
 unique(org_id,code),
 unique(org_id,id)
);

create table kxra.agent_manifest_versions(
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null,
 agent_id uuid not null,
 version integer not null check(version>0),
 description text not null check(length(trim(description)) between 1 and 5000),
 objective text not null check(length(trim(objective)) between 1 and 5000),
 input_schema jsonb not null check(jsonb_typeof(input_schema)='object'),
 output_schema jsonb not null check(jsonb_typeof(output_schema)='object'),
 tool_capabilities text[] not null default '{}',
 permissions text not null check(length(trim(permissions)) between 1 and 5000),
 memory_scope text not null check(length(trim(memory_scope)) between 1 and 5000),
 project_scope text not null check(length(trim(project_scope)) between 1 and 1000),
 manager_code text check(manager_code is null or manager_code~'^AGT-[A-Z0-9-]{2,76}$'),
 approval_boundary text not null check(length(trim(approval_boundary)) between 1 and 5000),
 qa_process text not null check(length(trim(qa_process)) between 1 and 5000),
 success_criteria text not null check(length(trim(success_criteria)) between 1 and 5000),
 model_policy_code text not null check(model_policy_code~'^[A-Z][A-Z0-9_-]{2,79}$'),
 model_policy_version integer not null check(model_policy_version>0),
 max_cost_minor bigint not null default 0 check(max_cost_minor>=0),
 max_steps integer not null check(max_steps between 1 and 1000),
 max_delegation_depth integer not null default 0 check(max_delegation_depth between 0 and 10),
 max_duration_ms integer not null check(max_duration_ms between 100 and 3600000),
 data_classifications text[] not null check(cardinality(data_classifications)>0),
 status text not null check(status in ('DRAFT','SUPERVISED','TESTING','APPROVED','AUTOMATED','MONITORED','NEEDS_REVIEW','RETIRED')),
 source_hash text not null check(source_hash~'^[a-f0-9]{64}$'),
 created_at timestamptz not null default now(),
 unique(agent_id,version),
 unique(org_id,id),
 unique(org_id,agent_id,version),
 foreign key(org_id,agent_id) references kxra.agent_manifests(org_id,id)
);

create table kxra.skill_manifests(
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null,
 code text not null check(code~'^SKL-[A-Z0-9-]{2,76}$'),
 name text not null check(length(trim(name)) between 1 and 160),
 owner_agent_id uuid not null,
 current_version integer not null check(current_version>0),
 classification kxra.classification not null default 'DECISION',
 source_hash text not null check(source_hash~'^[a-f0-9]{64}$'),
 created_at timestamptz not null default now(),
 unique(org_id,code),
 unique(org_id,id),
 foreign key(org_id,owner_agent_id) references kxra.agent_manifests(org_id,id)
);

create table kxra.skill_manifest_versions(
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null,
 skill_id uuid not null,
 version integer not null check(version>0),
 when_to_use text not null check(length(trim(when_to_use)) between 1 and 5000),
 input_schema jsonb not null check(jsonb_typeof(input_schema)='object'),
 output_schema jsonb not null check(jsonb_typeof(output_schema)='object'),
 required_capabilities text[] not null default '{}',
 ordered_steps jsonb not null check(jsonb_typeof(ordered_steps)='array'),
 rules jsonb not null check(jsonb_typeof(rules)='array'),
 side_effect_class text not null check(side_effect_class in ('NONE','INTERNAL_WRITE','EXTERNAL_READ','EXTERNAL_WRITE','PUBLICATION','SPEND')),
 validation_contract jsonb not null check(jsonb_typeof(validation_contract)='object'),
 retry_policy jsonb not null check(jsonb_typeof(retry_policy)='object'),
 evidence_requirements jsonb not null check(jsonb_typeof(evidence_requirements)='object'),
 failure_handling text not null check(length(trim(failure_handling)) between 1 and 5000),
 approval_boundary text not null check(length(trim(approval_boundary)) between 1 and 5000),
 test_contract jsonb not null check(jsonb_typeof(test_contract)='object'),
 status text not null check(status in ('DRAFT','SUPERVISED','TESTING','APPROVED','AUTOMATED','MONITORED','NEEDS_REVIEW','RETIRED')),
 source_hash text not null check(source_hash~'^[a-f0-9]{64}$'),
 created_at timestamptz not null default now(),
 unique(skill_id,version),
 unique(org_id,id),
 unique(org_id,skill_id,version),
 foreign key(org_id,skill_id) references kxra.skill_manifests(org_id,id)
);

create table kxra.skill_tool_bindings(
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null,
 skill_id uuid not null,
 skill_version integer not null,
 tool_code text not null check(tool_code~'^[a-z][a-z0-9]*(?:[._:-][a-z0-9]+)*$'),
 permission_scope text not null check(length(trim(permission_scope)) between 1 and 1000),
 access_mode text not null check(access_mode in ('READ','PROPOSE','WRITE')),
 max_calls integer not null default 1 check(max_calls between 1 and 100),
 requires_approval boolean not null default false,
 created_at timestamptz not null default now(),
 unique(skill_id,skill_version,tool_code),
 foreign key(org_id,skill_id,skill_version)
  references kxra.skill_manifest_versions(org_id,skill_id,version)
);

create table kxra.budget_policies(
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null references kxra.organisations(id),
 project_id uuid,
 code text not null check(code~'^[A-Z][A-Z0-9_-]{2,79}$'),
 version integer not null check(version>0),
 currency text not null check(currency~'^[A-Z]{3}$'),
 max_reserved_minor bigint not null check(max_reserved_minor>=0),
 max_spend_minor bigint not null check(max_spend_minor>=0),
 max_runs integer not null check(max_runs>=0),
 max_input_tokens bigint not null check(max_input_tokens>=0),
 max_output_tokens bigint not null check(max_output_tokens>=0),
 current_reserved_minor bigint not null default 0 check(current_reserved_minor>=0),
 current_spend_minor bigint not null default 0 check(current_spend_minor>=0),
 current_reserved_runs integer not null default 0 check(current_reserved_runs>=0),
 current_completed_runs integer not null default 0 check(current_completed_runs>=0),
 consumed_input_tokens bigint not null default 0 check(consumed_input_tokens>=0),
 consumed_output_tokens bigint not null default 0 check(consumed_output_tokens>=0),
 state text not null check(state in ('DRAFT','APPROVED','PAUSED','RETIRED')),
 starts_at timestamptz not null default now(),
 ends_at timestamptz,
 source_hash text not null check(source_hash~'^[a-f0-9]{64}$'),
 created_by uuid references kxra.account_identities(account_id),
 created_at timestamptz not null default now(),
 unique(org_id,code,version),
 unique(org_id,id,version),
 foreign key(org_id,project_id) references kxra.projects(org_id,id),
 check(ends_at is null or ends_at>starts_at),
 check(current_reserved_minor+current_spend_minor<=max_spend_minor),
 check(current_reserved_runs+current_completed_runs<=max_runs),
 check(consumed_input_tokens<=max_input_tokens),
 check(consumed_output_tokens<=max_output_tokens)
);

create table kxra.agent_runs(
 id uuid primary key default gen_random_uuid(),
 request_id uuid not null,
 org_id uuid not null,
 project_id uuid,
 initiated_by uuid not null references kxra.account_identities(account_id),
 membership_id uuid not null,
 membership_version integer not null check(membership_version>0),
 agent_id uuid not null,
 agent_version integer not null check(agent_version>0),
 skill_id uuid not null,
 skill_version integer not null check(skill_version>0),
 model_policy_id uuid not null,
 model_policy_version integer not null check(model_policy_version>0),
 budget_policy_id uuid not null,
 budget_policy_version integer not null check(budget_policy_version>0),
 provider text not null check(provider in ('FAKE','OPENAI')),
 model text not null check(length(trim(model)) between 1 and 120),
 origin text not null check(origin in ('ASK','MANUAL','ROUTINE','WHATSAPP','SYSTEM')),
 parent_run_id uuid,
 delegation_depth integer not null default 0 check(delegation_depth between 0 and 10),
 input_sha256 text not null check(input_sha256~'^[a-f0-9]{64}$'),
 output_sha256 text check(output_sha256 is null or output_sha256~'^[a-f0-9]{64}$'),
 authorized_tools text[] not null default '{}',
 state text not null check(state in ('QUEUED','AUTHORIZED','RUNNING','WAITING_APPROVAL','COMPLETED','FAILED','CANCELLED','RECONCILIATION_REQUIRED')),
 delivery_state text not null default 'PENDING' check(delivery_state in ('PENDING','DELIVERED','WITHHELD')),
 started_at timestamptz,
 completed_at timestamptz,
 created_at timestamptz not null default now(),
 unique(initiated_by,request_id),
 unique(org_id,id),
 foreign key(org_id,project_id) references kxra.projects(org_id,id),
 foreign key(org_id,membership_id) references kxra.organisation_memberships(org_id,id),
 foreign key(org_id,agent_id,agent_version) references kxra.agent_manifest_versions(org_id,agent_id,version),
 foreign key(org_id,skill_id,skill_version) references kxra.skill_manifest_versions(org_id,skill_id,version),
 foreign key(org_id,model_policy_id,model_policy_version) references kxra.model_policies(org_id,id,version),
 foreign key(org_id,budget_policy_id,budget_policy_version) references kxra.budget_policies(org_id,id,version),
 foreign key(org_id,parent_run_id) references kxra.agent_runs(org_id,id),
 check(parent_run_id is not null or delegation_depth=0),
 check((state in ('COMPLETED','FAILED','CANCELLED','RECONCILIATION_REQUIRED'))=(completed_at is not null))
);
create index agent_runs_scope on kxra.agent_runs(org_id,project_id,created_at desc);
create index agent_runs_initiator on kxra.agent_runs(initiated_by,created_at desc);

create table kxra.evidence_envelopes(
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null,
 project_id uuid not null,
 run_id uuid not null unique,
 initiated_by uuid not null references kxra.account_identities(account_id),
 membership_id uuid not null,
 membership_version integer not null check(membership_version>0),
 query_sha256 text not null check(query_sha256~'^[a-f0-9]{64}$'),
 envelope_sha256 text check(envelope_sha256 is null or envelope_sha256~'^[a-f0-9]{64}$'),
 state text not null default 'ACTIVE' check(state in ('ACTIVE','WITHHELD')),
 created_at timestamptz not null default now(),
 unique(org_id,id),
 unique(org_id,project_id,id),
 foreign key(org_id,project_id) references kxra.projects(org_id,id),
 foreign key(org_id,run_id) references kxra.agent_runs(org_id,id),
 foreign key(org_id,membership_id) references kxra.organisation_memberships(org_id,id)
);

create table kxra.evidence_envelope_items(
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null,
 project_id uuid not null,
 envelope_id uuid not null,
 source_type text not null check(source_type in ('RECORD','CHUNK')),
 source_id uuid not null,
 source_version integer not null check(source_version>0),
 source_sha256 text not null check(source_sha256~'^[a-f0-9]{64}$'),
 record_id uuid not null,
 file_id uuid,
 classification kxra.classification not null,
 audience text not null check(audience in ('owner_only','project_shared')),
 ordinal integer check(ordinal is null or ordinal>=0),
 created_at timestamptz not null default now(),
 unique(envelope_id,source_type,source_id,source_version),
 unique(org_id,id),
 foreign key(org_id,project_id,envelope_id) references kxra.evidence_envelopes(org_id,project_id,id),
 foreign key(org_id,project_id,record_id) references kxra.records(org_id,project_id,id),
 foreign key(org_id,project_id,file_id) references kxra.files(org_id,project_id,id)
);

create table kxra.budget_reservations(
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null,
 project_id uuid,
 run_id uuid not null,
 policy_id uuid not null,
 policy_version integer not null check(policy_version>0),
 cycle integer not null check(cycle>0),
 reserved_cost_minor bigint not null check(reserved_cost_minor>=0),
 reserved_input_tokens integer not null check(reserved_input_tokens>=0),
 reserved_output_tokens integer not null check(reserved_output_tokens>=0),
 actual_cost_minor bigint check(actual_cost_minor is null or actual_cost_minor>=0),
 actual_input_tokens integer check(actual_input_tokens is null or actual_input_tokens>=0),
 actual_output_tokens integer check(actual_output_tokens is null or actual_output_tokens>=0),
 state text not null check(state in ('RESERVED','CONSUMED','RELEASED','RECONCILIATION_REQUIRED')),
 reserved_at timestamptz not null default now(),
 completed_at timestamptz,
 unique(run_id,cycle),
 unique(org_id,id),
 foreign key(org_id,run_id) references kxra.agent_runs(org_id,id),
 foreign key(org_id,policy_id,policy_version) references kxra.budget_policies(org_id,id,version)
);

create table kxra.agent_run_attempts(
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null,
 project_id uuid,
 run_id uuid not null,
 attempt_number integer not null check(attempt_number>0),
 replay_of_attempt_id uuid,
 budget_reservation_id uuid not null,
 state text not null check(state in ('RUNNING','COMPLETED','FAILED','CANCELLED','RECONCILIATION_REQUIRED')),
 worker_reference text not null check(length(trim(worker_reference)) between 1 and 160),
 started_at timestamptz not null default clock_timestamp(),
 completed_at timestamptz,
 failure_code text,
 unique(run_id,attempt_number),
 unique(org_id,id),
 foreign key(org_id,run_id) references kxra.agent_runs(org_id,id),
 foreign key(org_id,budget_reservation_id) references kxra.budget_reservations(org_id,id),
 foreign key(org_id,replay_of_attempt_id) references kxra.agent_run_attempts(org_id,id),
 check((state='RUNNING')=(completed_at is null))
);

create table kxra.agent_run_steps(
 id bigint generated always as identity primary key,
 org_id uuid not null,
 project_id uuid,
 run_id uuid not null,
 attempt_id uuid not null,
 sequence integer not null check(sequence>0),
 step_type text not null check(step_type in ('AUTHORIZATION','RETRIEVAL','MODEL_REQUEST','VALIDATION','HANDOFF','DELIVERY','FINALIZATION')),
 outcome text not null check(outcome in ('PASS','FAIL','SKIP','DENY')),
 summary_code text not null check(length(trim(summary_code)) between 1 and 160),
 input_reference text check(input_reference is null or input_reference~'^[a-f0-9]{64}$'),
 output_reference text check(output_reference is null or output_reference~'^[a-f0-9]{64}$'),
 duration_ms integer not null default 0 check(duration_ms>=0),
 created_at timestamptz not null default clock_timestamp(),
 unique(run_id,attempt_id,sequence),
 foreign key(org_id,run_id) references kxra.agent_runs(org_id,id),
 foreign key(org_id,attempt_id) references kxra.agent_run_attempts(org_id,id)
);

create table kxra.agent_tool_calls(
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null,
 project_id uuid,
 run_id uuid not null,
 attempt_id uuid not null,
 tool_code text not null check(tool_code~'^[a-z][a-z0-9]*(?:[._:-][a-z0-9]+)*$'),
 request_sha256 text not null check(request_sha256~'^[a-f0-9]{64}$'),
 result_sha256 text check(result_sha256 is null or result_sha256~'^[a-f0-9]{64}$'),
 outcome text not null check(outcome in ('COMPLETED','FAILED','DENIED')),
 reason_code text,
 idempotency_key uuid not null,
 duration_ms integer not null check(duration_ms>=0),
 created_at timestamptz not null default clock_timestamp(),
 unique(run_id,idempotency_key),
 foreign key(org_id,run_id) references kxra.agent_runs(org_id,id),
 foreign key(org_id,attempt_id) references kxra.agent_run_attempts(org_id,id)
);

create table kxra.agent_evidence_links(
 org_id uuid not null,
 project_id uuid not null,
 run_id uuid not null,
 envelope_item_id uuid not null,
 usage text not null check(usage in ('INPUT','CITATION','OUTPUT')),
 claim_id text not null default '' check(length(claim_id)<=160),
 created_at timestamptz not null default now(),
 primary key(run_id,envelope_item_id,usage,claim_id),
 foreign key(org_id,run_id) references kxra.agent_runs(org_id,id),
 foreign key(org_id,envelope_item_id) references kxra.evidence_envelope_items(org_id,id)
);

create table kxra.agent_handoffs(
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null,
 project_id uuid,
 from_run_id uuid not null,
 to_agent_id uuid not null,
 to_agent_version integer not null check(to_agent_version>0),
 to_skill_id uuid,
 to_skill_version integer,
 delegation_depth integer not null check(delegation_depth between 1 and 10),
 brief_sha256 text not null check(brief_sha256~'^[a-f0-9]{64}$'),
 state text not null check(state in ('PROPOSED','ACCEPTED','REJECTED','CANCELLED')),
 created_at timestamptz not null default now(),
 resolved_at timestamptz,
 unique(org_id,id),
 foreign key(org_id,from_run_id) references kxra.agent_runs(org_id,id),
 foreign key(org_id,to_agent_id,to_agent_version) references kxra.agent_manifest_versions(org_id,agent_id,version),
 foreign key(org_id,to_skill_id,to_skill_version) references kxra.skill_manifest_versions(org_id,skill_id,version),
 check((to_skill_id is null)=(to_skill_version is null))
);

create table kxra.provider_usage_events(
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null,
 project_id uuid,
 run_id uuid not null,
 attempt_id uuid not null,
 reservation_id uuid not null,
 provider text not null check(provider in ('FAKE','OPENAI')),
 provider_event_id text not null check(length(trim(provider_event_id)) between 1 and 240),
 model text not null check(length(trim(model)) between 1 and 120),
 input_tokens integer not null check(input_tokens>=0),
 output_tokens integer not null check(output_tokens>=0),
 cost_minor bigint not null check(cost_minor>=0),
 currency text not null check(currency~'^[A-Z]{3}$'),
 usage_sha256 text not null check(usage_sha256~'^[a-f0-9]{64}$'),
 occurred_at timestamptz not null,
 recorded_at timestamptz not null default now(),
 unique(provider,provider_event_id),
 foreign key(org_id,run_id) references kxra.agent_runs(org_id,id),
 foreign key(org_id,attempt_id) references kxra.agent_run_attempts(org_id,id),
 foreign key(org_id,reservation_id) references kxra.budget_reservations(org_id,id)
);

create table kxra.run_evaluations(
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null,
 project_id uuid,
 run_id uuid not null,
 attempt_id uuid not null,
 evaluator_code text not null check(length(trim(evaluator_code)) between 1 and 120),
 evaluator_version integer not null check(evaluator_version>0),
 schema_valid boolean not null,
 citations_valid boolean not null,
 policy_valid boolean not null,
 outcome text not null check(outcome in ('PASS','FAIL')),
 reason_codes text[] not null default '{}',
 output_sha256 text check(output_sha256 is null or output_sha256~'^[a-f0-9]{64}$'),
 created_at timestamptz not null default now(),
 foreign key(org_id,run_id) references kxra.agent_runs(org_id,id),
 foreign key(org_id,attempt_id) references kxra.agent_run_attempts(org_id,id)
);

create table kxra.run_failures(
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null,
 project_id uuid,
 run_id uuid not null,
 attempt_id uuid,
 stage text not null check(stage in ('AUTHORIZATION','BUDGET','BROKER','PROVIDER','VALIDATION','DELIVERY','RECONCILIATION')),
 failure_code text not null check(length(trim(failure_code)) between 1 and 160),
 retryable boolean not null,
 detail_sha256 text check(detail_sha256 is null or detail_sha256~'^[a-f0-9]{64}$'),
 created_at timestamptz not null default now(),
 foreign key(org_id,run_id) references kxra.agent_runs(org_id,id),
 foreign key(org_id,attempt_id) references kxra.agent_run_attempts(org_id,id)
);

create table kxra.run_reconciliations(
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null,
 project_id uuid,
 run_id uuid not null,
 attempt_id uuid,
 reservation_id uuid,
 expected_sha256 text not null check(expected_sha256~'^[a-f0-9]{64}$'),
 observed_sha256 text check(observed_sha256 is null or observed_sha256~'^[a-f0-9]{64}$'),
 outcome text not null check(outcome in ('MATCHED','MISMATCH','MISSING','REVIEW_REQUIRED')),
 reason_code text,
 created_at timestamptz not null default now(),
 foreign key(org_id,run_id) references kxra.agent_runs(org_id,id),
 foreign key(org_id,attempt_id) references kxra.agent_run_attempts(org_id,id),
 foreign key(org_id,reservation_id) references kxra.budget_reservations(org_id,id)
);

alter table kxra.knowledge_query_runs
 add column agent_run_id uuid references kxra.agent_runs(id),
 add column response_schema_version integer check(response_schema_version is null or response_schema_version>0);

create function kxra_private.can_read_agent_run(requested_run uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(
  select 1 from kxra.agent_runs r
  join kxra.organisation_memberships m on m.id=r.membership_id and m.org_id=r.org_id
  where r.id=requested_run and (
   kxra_private.is_owner(r.org_id) or (
    r.initiated_by=auth.uid() and r.org_id=kxra_private.requested_org()
    and m.account_id=auth.uid() and m.state='ACTIVE' and m.revoked_at is null
    and m.version=r.membership_version
    and (m.expires_at is null or m.expires_at>now())
    and (r.project_id is null or kxra_private.can_project(r.project_id,false))
   )
  )
 )
$$;

create function kxra_private.guard_ai_append_only() returns trigger
language plpgsql set search_path='' as $$
begin
 raise exception 'AI execution evidence is append-only';
end $$;

create trigger evidence_envelope_items_append_only before update or delete on kxra.evidence_envelope_items
for each row execute function kxra_private.guard_ai_append_only();
create trigger agent_run_steps_append_only before update or delete on kxra.agent_run_steps
for each row execute function kxra_private.guard_ai_append_only();
create trigger agent_tool_calls_append_only before update or delete on kxra.agent_tool_calls
for each row execute function kxra_private.guard_ai_append_only();
create trigger agent_evidence_links_append_only before update or delete on kxra.agent_evidence_links
for each row execute function kxra_private.guard_ai_append_only();
create trigger provider_usage_events_append_only before update or delete on kxra.provider_usage_events
for each row execute function kxra_private.guard_ai_append_only();
create trigger run_evaluations_append_only before update or delete on kxra.run_evaluations
for each row execute function kxra_private.guard_ai_append_only();
create trigger run_failures_append_only before update or delete on kxra.run_failures
for each row execute function kxra_private.guard_ai_append_only();
create trigger run_reconciliations_append_only before update or delete on kxra.run_reconciliations
for each row execute function kxra_private.guard_ai_append_only();

alter table kxra.model_policies enable row level security;
alter table kxra.agent_manifests enable row level security;
alter table kxra.agent_manifest_versions enable row level security;
alter table kxra.skill_manifests enable row level security;
alter table kxra.skill_manifest_versions enable row level security;
alter table kxra.skill_tool_bindings enable row level security;
alter table kxra.budget_policies enable row level security;
alter table kxra.agent_runs enable row level security;
alter table kxra.evidence_envelopes enable row level security;
alter table kxra.evidence_envelope_items enable row level security;
alter table kxra.budget_reservations enable row level security;
alter table kxra.agent_run_attempts enable row level security;
alter table kxra.agent_run_steps enable row level security;
alter table kxra.agent_tool_calls enable row level security;
alter table kxra.agent_evidence_links enable row level security;
alter table kxra.agent_handoffs enable row level security;
alter table kxra.provider_usage_events enable row level security;
alter table kxra.run_evaluations enable row level security;
alter table kxra.run_failures enable row level security;
alter table kxra.run_reconciliations enable row level security;

grant select on kxra.model_policies,kxra.agent_manifests,
 kxra.agent_manifest_versions,kxra.skill_manifests,kxra.skill_manifest_versions,
 kxra.skill_tool_bindings,kxra.budget_policies,kxra.agent_runs,
 kxra.evidence_envelopes,kxra.evidence_envelope_items,kxra.budget_reservations,
 kxra.agent_run_attempts,kxra.agent_run_steps,kxra.agent_tool_calls,
 kxra.agent_evidence_links,kxra.agent_handoffs,kxra.provider_usage_events,
 kxra.run_evaluations,kxra.run_failures,kxra.run_reconciliations
to authenticated,anon;

create policy model_policies_owner_read on kxra.model_policies for select using(kxra_private.is_owner(org_id));
create policy agent_manifests_owner_read on kxra.agent_manifests for select using(kxra_private.is_owner(org_id));
create policy agent_manifest_versions_owner_read on kxra.agent_manifest_versions for select using(kxra_private.is_owner(org_id));
create policy skill_manifests_owner_read on kxra.skill_manifests for select using(kxra_private.is_owner(org_id));
create policy skill_manifest_versions_owner_read on kxra.skill_manifest_versions for select using(kxra_private.is_owner(org_id));
create policy skill_tool_bindings_owner_read on kxra.skill_tool_bindings for select using(kxra_private.is_owner(org_id));
create policy budget_policies_owner_read on kxra.budget_policies for select using(kxra_private.is_owner(org_id));
create policy agent_runs_read on kxra.agent_runs for select using(kxra_private.can_read_agent_run(id));
create policy evidence_envelopes_read on kxra.evidence_envelopes for select using(kxra_private.can_read_agent_run(run_id));
create policy evidence_envelope_items_read on kxra.evidence_envelope_items for select using(
 exists(select 1 from kxra.evidence_envelopes e where e.id=envelope_id and kxra_private.can_read_agent_run(e.run_id))
);
create policy budget_reservations_read on kxra.budget_reservations for select using(kxra_private.can_read_agent_run(run_id));
create policy agent_run_attempts_read on kxra.agent_run_attempts for select using(kxra_private.can_read_agent_run(run_id));
create policy agent_run_steps_read on kxra.agent_run_steps for select using(kxra_private.can_read_agent_run(run_id));
create policy agent_tool_calls_read on kxra.agent_tool_calls for select using(kxra_private.can_read_agent_run(run_id));
create policy agent_evidence_links_read on kxra.agent_evidence_links for select using(kxra_private.can_read_agent_run(run_id));
create policy agent_handoffs_read on kxra.agent_handoffs for select using(kxra_private.can_read_agent_run(from_run_id));
create policy provider_usage_events_read on kxra.provider_usage_events for select using(kxra_private.can_read_agent_run(run_id));
create policy run_evaluations_read on kxra.run_evaluations for select using(kxra_private.can_read_agent_run(run_id));
create policy run_failures_read on kxra.run_failures for select using(kxra_private.can_read_agent_run(run_id));
create policy run_reconciliations_read on kxra.run_reconciliations for select using(kxra_private.can_read_agent_run(run_id));

revoke all on function kxra_private.can_read_agent_run(uuid),
 kxra_private.guard_ai_append_only()
from public,authenticated,anon;
grant execute on function kxra_private.can_read_agent_run(uuid)
to authenticated,anon;

commit;
