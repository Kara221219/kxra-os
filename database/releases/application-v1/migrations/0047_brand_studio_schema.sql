begin;

-- Brand Studio is a project-bound customer tool. Every durable input, output,
-- review and delivery record inherits the selected organisation and project.
-- Website fetching and publication are deliberately absent from this schema.

create table kxra.brand_sources(
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null,
 project_id uuid not null,
 source_type text not null check(source_type in ('WEBSITE','MANUAL','FILE')),
 locator text check(locator is null or length(locator) between 1 and 2000),
 rights_basis text not null check(length(trim(rights_basis)) between 3 and 2000),
 consented_by uuid not null references kxra.account_identities(account_id),
 consented_at timestamptz not null default now(),
 current_version integer not null default 1 check(current_version>0),
 state text not null default 'ACTIVE' check(state in ('ACTIVE','RETIRED')),
 client_request_id uuid not null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(org_id,client_request_id),
 unique(org_id,project_id,id),
 foreign key(org_id,project_id) references kxra.projects(org_id,id),
 check(source_type='WEBSITE' or locator is null),
 check(source_type<>'WEBSITE' or locator is not null)
);

create table kxra.brand_source_versions(
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null,
 project_id uuid not null,
 source_id uuid not null,
 version integer not null check(version>0),
 supplied_content text not null check(length(trim(supplied_content)) between 1 and 50000),
 content_sha256 text not null check(content_sha256~'^[a-f0-9]{64}$'),
 fetch_state text not null default 'PROVIDER_DISABLED'
  check(fetch_state in ('PROVIDER_DISABLED','FETCHED','FAILED')),
 security_result text not null default 'NOT_FETCHED'
  check(security_result in ('NOT_FETCHED','PASSED','REJECTED','FAILED')),
 source_classification text not null
  check(source_classification in ('USER-SUPPLIED INFORMATION','EXTERNAL RESEARCH')),
 created_by uuid not null references kxra.account_identities(account_id),
 created_at timestamptz not null default now(),
 unique(source_id,version),
 unique(org_id,project_id,id),
 foreign key(org_id,project_id,source_id)
  references kxra.brand_sources(org_id,project_id,id),
 check(fetch_state<>'PROVIDER_DISABLED' or security_result='NOT_FETCHED')
);

create table kxra.brand_profiles(
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null,
 project_id uuid not null,
 name text not null check(length(trim(name)) between 1 and 160),
 current_version integer not null default 1 check(current_version>0),
 approved_version integer check(approved_version is null or approved_version>0),
 state text not null default 'DRAFT' check(state in ('DRAFT','ACTIVE','RETIRED')),
 client_request_id uuid not null,
 created_by uuid not null references kxra.account_identities(account_id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(org_id,client_request_id),
 unique(org_id,project_id,id),
 foreign key(org_id,project_id) references kxra.projects(org_id,id),
 check(state<>'ACTIVE' or approved_version is not null)
);

create table kxra.brand_profile_versions(
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null,
 project_id uuid not null,
 profile_id uuid not null,
 version integer not null check(version>0),
 profile_data jsonb not null check(jsonb_typeof(profile_data)='object'),
 profile_sha256 text not null check(profile_sha256~'^[a-f0-9]{64}$'),
 status text not null default 'DRAFT'
  check(status in ('DRAFT','APPROVED','REJECTED','SUPERSEDED')),
 classification text not null default 'AI INFERENCE'
  check(classification in ('AI INFERENCE','USER-SUPPLIED INFORMATION','DECISION')),
 client_request_id uuid not null,
 created_by uuid not null references kxra.account_identities(account_id),
 created_at timestamptz not null default now(),
 reviewed_by uuid references kxra.account_identities(account_id),
 reviewed_at timestamptz,
 review_note text check(review_note is null or length(review_note)<=5000),
 unique(profile_id,version),
 unique(profile_id,client_request_id),
 unique(org_id,project_id,id),
 unique(org_id,project_id,profile_id,version),
 foreign key(org_id,project_id,profile_id)
  references kxra.brand_profiles(org_id,project_id,id),
 check((reviewed_at is null)=(reviewed_by is null)),
 check(status not in ('APPROVED','REJECTED') or reviewed_at is not null)
);

create table kxra.brand_profile_evidence(
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null,
 project_id uuid not null,
 profile_version_id uuid not null,
 source_version_id uuid not null,
 field_path text not null check(field_path~'^[a-z][a-z0-9_]*(?:\.[a-z0-9_]+)*$'),
 classification text not null
  check(classification in ('AI INFERENCE','USER-SUPPLIED INFORMATION','EXTERNAL RESEARCH')),
 evidence_note text not null check(length(trim(evidence_note)) between 1 and 2000),
 created_at timestamptz not null default now(),
 unique(profile_version_id,source_version_id,field_path),
 foreign key(org_id,project_id,profile_version_id)
  references kxra.brand_profile_versions(org_id,project_id,id),
 foreign key(org_id,project_id,source_version_id)
  references kxra.brand_source_versions(org_id,project_id,id)
);

create table kxra.brand_assets(
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null,
 project_id uuid not null,
 profile_id uuid not null,
 file_id uuid not null,
 file_version_id uuid not null,
 asset_role text not null
  check(asset_role in ('LOGO','IMAGE','DOCUMENT','PALETTE_REFERENCE','TYPOGRAPHY_REFERENCE','OTHER')),
 rights_basis text not null check(length(trim(rights_basis)) between 3 and 2000),
 rights_confirmed_by uuid not null references kxra.account_identities(account_id),
 rights_confirmed_at timestamptz not null default now(),
 state text not null default 'ACTIVE' check(state in ('ACTIVE','RETIRED')),
 created_at timestamptz not null default now(),
 unique(profile_id,file_version_id,asset_role),
 unique(org_id,project_id,id),
 foreign key(org_id,project_id,profile_id)
  references kxra.brand_profiles(org_id,project_id,id),
 foreign key(org_id,project_id,file_id)
  references kxra.files(org_id,project_id,id),
 foreign key(org_id,project_id,file_version_id)
  references kxra.file_versions(org_id,project_id,id)
);

create table kxra.campaign_briefs(
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null,
 project_id uuid not null,
 profile_id uuid not null,
 name text not null check(length(trim(name)) between 1 and 160),
 current_version integer not null default 1 check(current_version>0),
 approved_version integer check(approved_version is null or approved_version>0),
 state text not null default 'DRAFT' check(state in ('DRAFT','ACTIVE','RETIRED')),
 client_request_id uuid not null,
 created_by uuid not null references kxra.account_identities(account_id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(org_id,client_request_id),
 unique(org_id,project_id,id),
 foreign key(org_id,project_id,profile_id)
  references kxra.brand_profiles(org_id,project_id,id),
 check(state<>'ACTIVE' or approved_version is not null)
);

create table kxra.campaign_brief_versions(
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null,
 project_id uuid not null,
 brief_id uuid not null,
 version integer not null check(version>0),
 profile_version_id uuid not null,
 objective text not null check(length(trim(objective)) between 1 and 2000),
 audience text not null check(length(trim(audience)) between 1 and 2000),
 offer text not null check(length(trim(offer)) between 1 and 2000),
 channels text[] not null check(cardinality(channels) between 1 and 6),
 constraints text not null default '' check(length(constraints)<=5000),
 claims jsonb not null default '[]'::jsonb check(jsonb_typeof(claims)='array'),
 success_measure text not null check(length(trim(success_measure)) between 1 and 2000),
 brief_sha256 text not null check(brief_sha256~'^[a-f0-9]{64}$'),
 status text not null default 'DRAFT'
  check(status in ('DRAFT','APPROVED','REJECTED','SUPERSEDED')),
 client_request_id uuid not null,
 created_by uuid not null references kxra.account_identities(account_id),
 created_at timestamptz not null default now(),
 reviewed_by uuid references kxra.account_identities(account_id),
 reviewed_at timestamptz,
 review_note text check(review_note is null or length(review_note)<=5000),
 unique(brief_id,version),
 unique(brief_id,client_request_id),
 unique(org_id,project_id,id),
 unique(org_id,project_id,brief_id,version),
 foreign key(org_id,project_id,brief_id)
  references kxra.campaign_briefs(org_id,project_id,id),
 foreign key(org_id,project_id,profile_version_id)
  references kxra.brand_profile_versions(org_id,project_id,id),
 check(channels<@array['LINKEDIN','INSTAGRAM','FACEBOOK','EMAIL','WEB','YOUTUBE']::text[]),
 check((reviewed_at is null)=(reviewed_by is null)),
 check(status not in ('APPROVED','REJECTED') or reviewed_at is not null)
);

create table kxra.creative_requests(
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null,
 project_id uuid not null,
 profile_id uuid not null,
 profile_version_id uuid not null,
 brief_id uuid not null,
 brief_version_id uuid not null,
 initiated_by uuid not null references kxra.account_identities(account_id),
 client_request_id uuid not null,
 usage_reservation_id uuid not null unique references kxra.usage_reservations(id),
 requested_channels text[] not null check(cardinality(requested_channels) between 1 and 6),
 variant_count integer not null check(variant_count between 1 and 6),
 input_sha256 text not null check(input_sha256~'^[a-f0-9]{64}$'),
 output_sha256 text check(output_sha256 is null or output_sha256~'^[a-f0-9]{64}$'),
 adapter text not null default 'LOCAL_DETERMINISTIC'
  check(adapter in ('LOCAL_DETERMINISTIC')),
 adapter_version text not null check(length(adapter_version) between 1 and 80),
 state text not null default 'RUNNING'
  check(state in ('RUNNING','SUCCEEDED','FAILED','WITHHELD')),
 failure_code text check(failure_code is null or failure_code~'^[A-Z][A-Z0-9_]{2,79}$'),
 started_at timestamptz not null default now(),
 completed_at timestamptz,
 unique(org_id,client_request_id),
 unique(org_id,project_id,id),
 foreign key(org_id,project_id,profile_id)
  references kxra.brand_profiles(org_id,project_id,id),
 foreign key(org_id,project_id,profile_version_id)
  references kxra.brand_profile_versions(org_id,project_id,id),
 foreign key(org_id,project_id,brief_id)
  references kxra.campaign_briefs(org_id,project_id,id),
 foreign key(org_id,project_id,brief_version_id)
  references kxra.campaign_brief_versions(org_id,project_id,id),
 check(requested_channels<@array['LINKEDIN','INSTAGRAM','FACEBOOK','EMAIL','WEB','YOUTUBE']::text[]),
 check((state='RUNNING')=(completed_at is null)),
 check(state='SUCCEEDED' or output_sha256 is null)
);

create table kxra.creative_variants(
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null,
 project_id uuid not null,
 request_id uuid not null,
 generation_ordinal integer check(generation_ordinal is null or generation_ordinal between 1 and 6),
 channel text not null check(channel in ('LINKEDIN','INSTAGRAM','FACEBOOK','EMAIL','WEB','YOUTUBE')),
 content jsonb not null check(jsonb_typeof(content)='object'),
 content_sha256 text not null check(content_sha256~'^[a-f0-9]{64}$'),
 generation_input_sha256 text not null check(generation_input_sha256~'^[a-f0-9]{64}$'),
 adapter text not null check(length(adapter) between 1 and 120),
 adapter_version text not null check(length(adapter_version) between 1 and 80),
 agent_run_id uuid references kxra.agent_runs(id),
 parent_variant_id uuid,
 client_request_id uuid,
 state text not null default 'REVIEW_REQUIRED'
  check(state in ('REVIEW_REQUIRED','APPROVED','REJECTED','EXPORTED','SUPERSEDED')),
 edited_by uuid references kxra.account_identities(account_id),
 created_at timestamptz not null default now(),
 unique(org_id,project_id,id),
 unique(org_id,client_request_id),
 foreign key(org_id,project_id,request_id)
  references kxra.creative_requests(org_id,project_id,id),
 foreign key(org_id,project_id,parent_variant_id)
  references kxra.creative_variants(org_id,project_id,id)
);
create unique index creative_variants_generated_ordinal
 on kxra.creative_variants(request_id,generation_ordinal)
 where generation_ordinal is not null;

create table kxra.creative_reviews(
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null,
 project_id uuid not null,
 variant_id uuid not null,
 variant_sha256 text not null check(variant_sha256~'^[a-f0-9]{64}$'),
 checks jsonb not null check(jsonb_typeof(checks)='object'),
 decision text not null check(decision in ('APPROVE_EXPORT','REQUEST_CHANGES','REJECT')),
 note text not null check(length(trim(note)) between 1 and 5000),
 client_request_id uuid not null,
 reviewed_by uuid not null references kxra.account_identities(account_id),
 created_at timestamptz not null default now(),
 unique(org_id,project_id,id),
 unique(org_id,client_request_id),
 foreign key(org_id,project_id,variant_id)
  references kxra.creative_variants(org_id,project_id,id)
);

create table kxra.brand_exports(
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null,
 project_id uuid not null,
 variant_id uuid not null,
 review_id uuid not null,
 usage_reservation_id uuid not null unique references kxra.usage_reservations(id),
 requested_by uuid not null references kxra.account_identities(account_id),
 client_request_id uuid not null,
 export_format text not null check(export_format in ('TEXT','MARKDOWN','JSON')),
 content_sha256 text not null check(content_sha256~'^[a-f0-9]{64}$'),
 metadata jsonb not null default '{}'::jsonb check(jsonb_typeof(metadata)='object'),
 state text not null default 'READY' check(state in ('READY','EXPIRED')),
 created_at timestamptz not null default now(),
 delivered_at timestamptz,
 unique(org_id,client_request_id),
 unique(org_id,project_id,id),
 foreign key(org_id,project_id,variant_id)
  references kxra.creative_variants(org_id,project_id,id),
 foreign key(org_id,project_id,review_id)
  references kxra.creative_reviews(org_id,project_id,id)
);

create table kxra.brand_export_deliveries(
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null,
 project_id uuid not null,
 export_id uuid not null,
 account_id uuid not null references kxra.account_identities(account_id),
 membership_id uuid not null references kxra.organisation_memberships(id),
 membership_version integer not null check(membership_version>0),
 outcome text not null check(outcome in ('DELIVERED','WITHHELD')),
 reason_code text not null check(reason_code~'^[A-Z][A-Z0-9_]{2,79}$'),
 created_at timestamptz not null default now(),
 foreign key(org_id,project_id,export_id)
  references kxra.brand_exports(org_id,project_id,id)
);

create table kxra.brand_product_events(
 id bigint generated always as identity primary key,
 org_id uuid not null,
 project_id uuid not null,
 account_id uuid not null references kxra.account_identities(account_id),
 event_type text not null check(event_type in (
  'SOURCE_ADDED','PROFILE_CREATED','PROFILE_APPROVED','CAMPAIGN_APPROVED',
  'GENERATION_STARTED','GENERATION_COMPLETED','GENERATION_FAILED',
  'VARIANT_EDITED','VARIANT_REVIEWED','EXPORT_CREATED','EXPORT_DELIVERED'
 )),
 resource_id uuid not null,
 metadata jsonb not null default '{}'::jsonb check(jsonb_typeof(metadata)='object'),
 created_at timestamptz not null default now(),
 foreign key(org_id,project_id) references kxra.projects(org_id,id)
);

create index brand_sources_scope on kxra.brand_sources(org_id,project_id,created_at desc);
create index brand_profiles_scope on kxra.brand_profiles(org_id,project_id,updated_at desc);
create index campaign_briefs_scope on kxra.campaign_briefs(org_id,project_id,updated_at desc);
create index creative_requests_scope on kxra.creative_requests(org_id,project_id,started_at desc);
create index creative_variants_request on kxra.creative_variants(request_id,created_at,id);
create index creative_reviews_variant on kxra.creative_reviews(variant_id,created_at desc,id desc);
create index brand_exports_scope on kxra.brand_exports(org_id,project_id,created_at desc);
create index brand_product_events_scope on kxra.brand_product_events(org_id,project_id,created_at desc,id desc);

alter table kxra.brand_sources enable row level security;
alter table kxra.brand_source_versions enable row level security;
alter table kxra.brand_profiles enable row level security;
alter table kxra.brand_profile_versions enable row level security;
alter table kxra.brand_profile_evidence enable row level security;
alter table kxra.brand_assets enable row level security;
alter table kxra.campaign_briefs enable row level security;
alter table kxra.campaign_brief_versions enable row level security;
alter table kxra.creative_requests enable row level security;
alter table kxra.creative_variants enable row level security;
alter table kxra.creative_reviews enable row level security;
alter table kxra.brand_exports enable row level security;
alter table kxra.brand_export_deliveries enable row level security;
alter table kxra.brand_product_events enable row level security;

grant select on kxra.brand_sources,kxra.brand_source_versions,kxra.brand_profiles,
 kxra.brand_profile_versions,kxra.brand_profile_evidence,kxra.brand_assets,
 kxra.campaign_briefs,kxra.campaign_brief_versions,kxra.creative_requests,
 kxra.creative_variants,kxra.creative_reviews,kxra.brand_exports,
 kxra.brand_export_deliveries,kxra.brand_product_events
to authenticated,anon;

create policy brand_sources_read on kxra.brand_sources for select using(
 kxra_private.can_project(project_id,false)
);
create policy brand_source_versions_read on kxra.brand_source_versions for select using(
 kxra_private.can_project(project_id,false)
);
create policy brand_profiles_read on kxra.brand_profiles for select using(
 kxra_private.can_project(project_id,false)
);
create policy brand_profile_versions_read on kxra.brand_profile_versions for select using(
 kxra_private.can_project(project_id,false)
);
create policy brand_profile_evidence_read on kxra.brand_profile_evidence for select using(
 kxra_private.can_project(project_id,false)
);
create policy brand_assets_read on kxra.brand_assets for select using(
 kxra_private.can_project(project_id,false)
);
create policy campaign_briefs_read on kxra.campaign_briefs for select using(
 kxra_private.can_project(project_id,false)
);
create policy campaign_brief_versions_read on kxra.campaign_brief_versions for select using(
 kxra_private.can_project(project_id,false)
);
create policy creative_requests_read on kxra.creative_requests for select using(
 kxra_private.can_project(project_id,false)
);
create policy creative_variants_read on kxra.creative_variants for select using(
 kxra_private.can_project(project_id,false)
);
create policy creative_reviews_read on kxra.creative_reviews for select using(
 kxra_private.can_project(project_id,false)
);
create policy brand_exports_read on kxra.brand_exports for select using(
 kxra_private.can_project(project_id,false)
);
create policy brand_export_deliveries_read on kxra.brand_export_deliveries for select using(
 kxra_private.can_project(project_id,false)
 and (account_id=auth.uid() or kxra_private.is_owner(org_id))
);
create policy brand_product_events_read on kxra.brand_product_events for select using(
 kxra_private.can_project(project_id,false)
);

commit;
