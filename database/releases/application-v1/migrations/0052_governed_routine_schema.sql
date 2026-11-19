begin;

do $$
begin
 if not exists(select 1 from pg_roles where rolname='kxra_routine_worker') then
  create role kxra_routine_worker nologin noinherit nobypassrls;
 end if;
end $$;
grant usage on schema kxra,kxra_private to kxra_routine_worker;

create table kxra.routine_service_identities(
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null references kxra.organisations(id),
 code text not null check(code~'^SVC-[A-Z0-9-]{3,76}$'),
 name text not null check(length(trim(name)) between 3 and 160),
 state text not null default 'ACTIVE' check(state in ('ACTIVE','SUSPENDED','REVOKED')),
 allowed_capabilities text[] not null default '{}',
 version integer not null default 1 check(version>0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(org_id,code),
 unique(org_id,id)
);

create table kxra.routine_manifests(
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null references kxra.organisations(id),
 code text not null check(code~'^RTN-[0-9]{3}$'),
 name text not null check(length(trim(name)) between 3 and 160),
 current_version integer not null default 1 check(current_version>0),
 enabled boolean not null default false,
 classification kxra.classification not null default 'DECISION',
 source_hash text not null check(source_hash~'^[a-f0-9]{64}$'),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(org_id,code),
 unique(org_id,id),
 unique(org_id,id,current_version)
);

create table kxra.routine_manifest_versions(
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null,
 routine_id uuid not null,
 version integer not null check(version>0),
 trigger_type text not null check(trigger_type in ('LOCAL_SCHEDULE','EVENT','BUSINESS_CALENDAR','EXCHANGE_CALENDAR','MANUAL')),
 trigger_config jsonb not null check(jsonb_typeof(trigger_config)='object'),
 timezone text not null check(length(timezone) between 1 and 80),
 calendar_code text check(calendar_code is null or calendar_code~'^[A-Z0-9_-]{2,40}$'),
 action_graph jsonb not null check(jsonb_typeof(action_graph)='array' and jsonb_array_length(action_graph) between 1 and 50),
 service_identity_id uuid not null,
 scope_mode text not null check(scope_mode in ('ORGANISATION','PROJECT')),
 budget_cap_minor bigint not null default 0 check(budget_cap_minor>=0),
 concurrency_key text not null check(length(concurrency_key) between 3 and 240),
 maximum_attempts integer not null check(maximum_attempts between 1 and 10),
 retry_backoff_seconds integer[] not null check(cardinality(retry_backoff_seconds)>=maximum_attempts-1),
 lease_seconds integer not null check(lease_seconds between 5 and 3600),
 checkpoint_policy jsonb not null check(jsonb_typeof(checkpoint_policy)='object'),
 notification_policy jsonb not null check(jsonb_typeof(notification_policy)='object'),
 approval_requirements jsonb not null check(jsonb_typeof(approval_requirements)='object'),
 side_effect_class text not null check(side_effect_class in ('NONE','INTERNAL_WRITE')),
 status text not null default 'DRAFT' check(status in ('DRAFT','APPROVED','RETIRED')),
 version_sha256 text not null check(version_sha256~'^[a-f0-9]{64}$'),
 approved_by uuid references kxra.account_identities(account_id),
 approved_at timestamptz,
 created_at timestamptz not null default now(),
 unique(routine_id,version),
 unique(org_id,id),
 unique(org_id,routine_id,version),
 foreign key(org_id,routine_id) references kxra.routine_manifests(org_id,id),
 foreign key(org_id,service_identity_id) references kxra.routine_service_identities(org_id,id),
 check((status='APPROVED')=(approved_by is not null and approved_at is not null)),
 check((trigger_type in ('BUSINESS_CALENDAR','EXCHANGE_CALENDAR'))=(calendar_code is not null))
);

create table kxra.routine_version_projects(
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null,
 routine_version_id uuid not null,
 project_id uuid not null,
 created_at timestamptz not null default now(),
 unique(routine_version_id,project_id),
 unique(org_id,id),
 foreign key(org_id,routine_version_id) references kxra.routine_manifest_versions(org_id,id),
 foreign key(org_id,project_id) references kxra.projects(org_id,id)
);

create table kxra.routine_calendar_days(
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null references kxra.organisations(id),
 calendar_code text not null check(calendar_code~'^[A-Z0-9_-]{2,40}$'),
 local_date date not null,
 is_open boolean not null,
 session_label text not null check(length(session_label) between 1 and 80),
 source_reference text not null check(length(source_reference) between 3 and 500),
 source_sha256 text not null check(source_sha256~'^[a-f0-9]{64}$'),
 recorded_by uuid not null references kxra.account_identities(account_id),
 created_at timestamptz not null default now(),
 unique(org_id,calendar_code,local_date),
 unique(org_id,id)
);

create table kxra.routine_runs(
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null,
 project_id uuid,
 routine_id uuid not null,
 routine_version_id uuid not null,
 routine_version integer not null check(routine_version>0),
 service_identity_id uuid not null,
 trigger_type text not null,
 trigger_reference text not null check(length(trigger_reference) between 3 and 500),
 logical_slot_key text not null check(length(logical_slot_key) between 3 and 500),
 scheduled_for timestamptz not null,
 input_sha256 text not null check(input_sha256~'^[a-f0-9]{64}$'),
 action_graph jsonb not null check(jsonb_typeof(action_graph)='array'),
 version_sha256 text not null check(version_sha256~'^[a-f0-9]{64}$'),
 state text not null default 'QUEUED' check(state in ('QUEUED','RUNNING','RETRY_WAIT','SUCCEEDED','FAILED','CANCELLED')),
 attempt_count integer not null default 0 check(attempt_count between 0 and 10),
 lease_owner text,
 lease_expires_at timestamptz,
 next_attempt_at timestamptz,
 outcome_sha256 text check(outcome_sha256 is null or outcome_sha256~'^[a-f0-9]{64}$'),
 outcome_disposition text check(outcome_disposition is null or outcome_disposition in ('CHANGED','UNCHANGED','FAILED','CANCELLED')),
 summary text check(summary is null or length(summary) between 1 and 5000),
 client_request_id uuid not null,
 initiated_by uuid not null references kxra.account_identities(account_id),
 created_at timestamptz not null default now(),
 started_at timestamptz,
 completed_at timestamptz,
 unique(org_id,routine_version_id,logical_slot_key),
 unique(org_id,client_request_id),
 unique(org_id,id),
 foreign key(org_id,project_id) references kxra.projects(org_id,id),
 foreign key(org_id,routine_id) references kxra.routine_manifests(org_id,id),
 foreign key(org_id,routine_version_id) references kxra.routine_manifest_versions(org_id,id),
 foreign key(org_id,service_identity_id) references kxra.routine_service_identities(org_id,id),
 check((state='RUNNING')=(lease_owner is not null and lease_expires_at is not null)),
 check((state in ('SUCCEEDED','FAILED','CANCELLED'))=(completed_at is not null))
);

create table kxra.routine_run_checkpoints(
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null,
 project_id uuid,
 run_id uuid not null,
 attempt integer not null check(attempt>0),
 sequence integer not null check(sequence>0),
 checkpoint_key text not null check(checkpoint_key~'^[a-z][a-z0-9._-]{2,119}$'),
 payload_sha256 text not null check(payload_sha256~'^[a-f0-9]{64}$'),
 worker_id text not null check(length(worker_id) between 3 and 160),
 created_at timestamptz not null default now(),
 unique(run_id,checkpoint_key),
 unique(run_id,attempt,sequence),
 unique(org_id,id),
 foreign key(org_id,project_id) references kxra.projects(org_id,id),
 foreign key(org_id,run_id) references kxra.routine_runs(org_id,id)
);

create table kxra.routine_notification_intents(
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null,
 project_id uuid,
 run_id uuid not null,
 category text not null check(category in ('ACTION_REQUIRED','FAILURE','COMPLETION_REVIEW')),
 recipient_scope text not null default 'OWNER' check(recipient_scope='OWNER'),
 subject text not null check(length(subject) between 3 and 240),
 body_reference text not null check(length(body_reference) between 3 and 500),
 adapter text not null default 'DISABLED' check(adapter='DISABLED'),
 delivery_state text not null default 'NOT_SENT' check(delivery_state='NOT_SENT'),
 idempotency_key text not null check(length(idempotency_key) between 3 and 500),
 created_at timestamptz not null default now(),
 unique(org_id,idempotency_key),
 unique(org_id,id),
 foreign key(org_id,project_id) references kxra.projects(org_id,id),
 foreign key(org_id,run_id) references kxra.routine_runs(org_id,id)
);

create index routine_runs_claim on kxra.routine_runs(state,next_attempt_at,scheduled_for,created_at);
create index routine_runs_scope on kxra.routine_runs(org_id,routine_id,project_id,created_at desc);
create index routine_checkpoints_run on kxra.routine_run_checkpoints(run_id,attempt,sequence);

alter table kxra.routine_service_identities enable row level security;
alter table kxra.routine_manifests enable row level security;
alter table kxra.routine_manifest_versions enable row level security;
alter table kxra.routine_version_projects enable row level security;
alter table kxra.routine_calendar_days enable row level security;
alter table kxra.routine_runs enable row level security;
alter table kxra.routine_run_checkpoints enable row level security;
alter table kxra.routine_notification_intents enable row level security;

grant select on kxra.routine_service_identities,kxra.routine_manifests,
 kxra.routine_manifest_versions,kxra.routine_version_projects,kxra.routine_calendar_days,
 kxra.routine_runs,kxra.routine_run_checkpoints,kxra.routine_notification_intents
to authenticated,anon;

create policy routine_service_owner_read on kxra.routine_service_identities for select using(kxra_private.is_owner(org_id));
create policy routine_manifests_owner_read on kxra.routine_manifests for select using(kxra_private.is_owner(org_id));
create policy routine_versions_owner_read on kxra.routine_manifest_versions for select using(kxra_private.is_owner(org_id));
create policy routine_projects_owner_read on kxra.routine_version_projects for select using(kxra_private.is_owner(org_id));
create policy routine_calendars_owner_read on kxra.routine_calendar_days for select using(kxra_private.is_owner(org_id));
create policy routine_runs_owner_read on kxra.routine_runs for select using(kxra_private.is_owner(org_id));
create policy routine_checkpoints_owner_read on kxra.routine_run_checkpoints for select using(kxra_private.is_owner(org_id));
create policy routine_notifications_owner_read on kxra.routine_notification_intents for select using(kxra_private.is_owner(org_id));

commit;
