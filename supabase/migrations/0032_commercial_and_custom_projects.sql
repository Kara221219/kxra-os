begin;

create table kxra.tool_catalogue(
 id uuid primary key default gen_random_uuid(),
 tool_key text not null unique check(tool_key~'^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$'),
 name text not null check(length(trim(name)) between 1 and 160),
 description text not null check(length(description) between 1 and 5000),
 state text not null default 'DRAFT' check(state in ('DRAFT','ACTIVE','RETIRED')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);

create table kxra.tool_versions(
 id uuid primary key default gen_random_uuid(),
 tool_id uuid not null references kxra.tool_catalogue(id),
 version integer not null check(version>0),
 state text not null default 'DRAFT' check(state in ('DRAFT','ACTIVE','RETIRED')),
 activation_event text not null check(length(trim(activation_event)) between 1 and 240),
 usage_unit text not null check(usage_unit~'^[a-z][a-z0-9_-]*$'),
 configuration jsonb not null default '{}'::jsonb check(jsonb_typeof(configuration)='object'),
 effective_at timestamptz,
 retired_at timestamptz,
 created_at timestamptz not null default now(),
 unique(tool_id,version),
 check(state<>'ACTIVE' or effective_at is not null),
 check(state<>'RETIRED' or retired_at is not null)
);

create table kxra.plans(
 id uuid primary key default gen_random_uuid(),
 plan_key text not null unique check(plan_key~'^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$'),
 name text not null check(length(trim(name)) between 1 and 160),
 state text not null default 'DRAFT' check(state in ('DRAFT','ACTIVE','RETIRED')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);

create table kxra.plan_versions(
 id uuid primary key default gen_random_uuid(),
 plan_id uuid not null references kxra.plans(id),
 version integer not null check(version>0),
 state text not null default 'DRAFT' check(state in ('DRAFT','ACTIVE','RETIRED')),
 currency text not null check(currency~'^[A-Z]{3}$'),
 amount_minor bigint not null check(amount_minor>=0),
 billing_interval text not null check(billing_interval in ('MONTH','YEAR','ONE_TIME')),
 tax_behavior text not null check(tax_behavior in ('EXCLUSIVE','INCLUSIVE','UNSPECIFIED')),
 provider_price_reference text check(provider_price_reference is null or length(provider_price_reference)<=240),
 policy_version integer not null default 1 check(policy_version>0),
 commercial_copy jsonb not null default '{}'::jsonb check(jsonb_typeof(commercial_copy)='object'),
 effective_at timestamptz,
 retired_at timestamptz,
 created_at timestamptz not null default now(),
 unique(plan_id,version),
 unique(provider_price_reference),
 check(state<>'ACTIVE' or (effective_at is not null and provider_price_reference is not null)),
 check(state<>'RETIRED' or retired_at is not null)
);

create table kxra.plan_features(
 id uuid primary key default gen_random_uuid(),
 plan_version_id uuid not null references kxra.plan_versions(id),
 tool_version_id uuid references kxra.tool_versions(id),
 feature_key text not null check(feature_key~'^[a-z][a-z0-9]*(?:[.:_-][a-z0-9]+)*$'),
 quantity_limit bigint check(quantity_limit is null or quantity_limit>0),
 usage_window text not null check(usage_window in ('MONTH','SUBSCRIPTION_PERIOD','NONE')),
 configuration jsonb not null default '{}'::jsonb check(jsonb_typeof(configuration)='object'),
 unique(plan_version_id,feature_key)
);

create table kxra.billing_customers(
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null references kxra.organisations(id),
 provider text not null default 'STRIPE' check(provider='STRIPE'),
 provider_customer_id text not null check(length(provider_customer_id) between 3 and 240),
 state text not null default 'ACTIVE' check(state in ('ACTIVE','DELETED','UNKNOWN')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(provider,provider_customer_id),
 unique(org_id,provider)
);

create table kxra.billing_subscriptions(
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null references kxra.organisations(id),
 billing_customer_id uuid not null references kxra.billing_customers(id),
 provider text not null default 'STRIPE' check(provider='STRIPE'),
 provider_subscription_id text not null check(length(provider_subscription_id) between 3 and 240),
 plan_version_id uuid not null references kxra.plan_versions(id),
 state text not null check(state in (
  'INCOMPLETE','TRIALING','ACTIVE','PAST_DUE','PAUSED','CANCELLED','UNPAID','UNKNOWN'
 )),
 current_period_start timestamptz,
 current_period_end timestamptz,
 grace_until timestamptz,
 cancel_at_period_end boolean not null default false,
 provider_event_created_at timestamptz not null,
 provider_event_id text not null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(provider,provider_subscription_id),
 check(current_period_end is null or current_period_start is null or current_period_end>current_period_start)
);
create index billing_subscriptions_entitlement on kxra.billing_subscriptions(org_id,state,current_period_end);

create table kxra.billing_subscription_items(
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null references kxra.organisations(id),
 subscription_id uuid not null references kxra.billing_subscriptions(id),
 provider_item_id text not null check(length(provider_item_id) between 3 and 240),
 plan_feature_id uuid references kxra.plan_features(id),
 quantity bigint not null default 1 check(quantity>0),
 created_at timestamptz not null default now(),
 unique(subscription_id,provider_item_id)
);

create table kxra.billing_events(
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null references kxra.organisations(id),
 provider text not null default 'STRIPE' check(provider='STRIPE'),
 provider_event_id text not null check(length(provider_event_id) between 3 and 240),
 event_type text not null check(length(event_type) between 3 and 160),
 provider_created_at timestamptz not null,
 received_at timestamptz not null default now(),
 signature_verified boolean not null check(signature_verified),
 payload_hash text not null check(payload_hash~'^[a-f0-9]{64}$'),
 payload jsonb not null check(jsonb_typeof(payload)='object'),
 processing_state text not null default 'RECEIVED'
  check(processing_state in ('RECEIVED','PROCESSED','IGNORED','FAILED')),
 processing_reason text check(processing_reason is null or length(processing_reason)<=1000),
 processed_at timestamptz,
 unique(provider,provider_event_id)
);

create table kxra.entitlement_grants(
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null references kxra.organisations(id),
 feature_key text not null check(feature_key~'^[a-z][a-z0-9]*(?:[.:_-][a-z0-9]+)*$'),
 source text not null check(source in ('FREE_OWNER_GRANT','MANUAL_RECOVERY')),
 state text not null default 'ACTIVE' check(state in ('ACTIVE','REVOKED','EXPIRED')),
 quantity_limit bigint check(quantity_limit is null or quantity_limit>0),
 usage_window text not null check(usage_window in ('MONTH','NONE')),
 policy_version integer not null default 1 check(policy_version>0),
 reason text not null check(length(trim(reason)) between 1 and 1000),
 issued_by uuid not null references kxra.account_identities(account_id),
 starts_at timestamptz not null default now(),
 expires_at timestamptz,
 revoked_at timestamptz,
 revoked_by uuid references kxra.account_identities(account_id),
 created_at timestamptz not null default now(),
 check(expires_at is null or expires_at>starts_at),
 check((state='REVOKED')=(revoked_at is not null))
);
create index entitlement_grants_active on kxra.entitlement_grants(org_id,feature_key,state,expires_at);

create table kxra.entitlement_effective_periods(
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null references kxra.organisations(id),
 feature_key text not null,
 source_type text not null check(source_type in ('SUBSCRIPTION','OWNER_GRANT')),
 source_id uuid not null,
 quantity_limit bigint,
 usage_window text not null,
 policy_version integer not null,
 effective_from timestamptz not null,
 effective_until timestamptz,
 recorded_at timestamptz not null default now(),
 check(effective_until is null or effective_until>effective_from)
);

create table kxra.usage_reservations(
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null references kxra.organisations(id),
 account_id uuid not null references kxra.account_identities(account_id),
 feature_key text not null,
 units bigint not null check(units>0),
 state text not null default 'RESERVED' check(state in ('RESERVED','COMMITTED','RELEASED','EXPIRED')),
 idempotency_key text not null check(length(idempotency_key) between 8 and 240),
 entitlement_source_type text not null check(entitlement_source_type in ('SUBSCRIPTION','OWNER_GRANT')),
 entitlement_source_id uuid not null,
 policy_version integer not null,
 window_start timestamptz not null,
 window_end timestamptz not null,
 reserved_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '15 minutes',
 completed_at timestamptz,
 provider_units bigint,
 provider_cost_minor bigint,
 provider_currency text check(provider_currency is null or provider_currency~'^[A-Z]{3}$'),
 unique(org_id,idempotency_key),
 check(window_end>window_start),
 check(expires_at>reserved_at),
 check(provider_units is null or provider_units>=0),
 check(provider_cost_minor is null or provider_cost_minor>=0)
);
create index usage_reservations_active on kxra.usage_reservations(org_id,feature_key,state,window_start,window_end);

create table kxra.usage_events(
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null references kxra.organisations(id),
 account_id uuid not null references kxra.account_identities(account_id),
 reservation_id uuid not null unique references kxra.usage_reservations(id),
 feature_key text not null,
 units bigint not null check(units>0),
 provider_units bigint,
 provider_cost_minor bigint,
 provider_currency text check(provider_currency is null or provider_currency~'^[A-Z]{3}$'),
 occurred_at timestamptz not null default now()
);

create table kxra.usage_aggregates(
 org_id uuid not null references kxra.organisations(id),
 feature_key text not null,
 window_start timestamptz not null,
 window_end timestamptz not null,
 consumed_units bigint not null default 0 check(consumed_units>=0),
 updated_at timestamptz not null default now(),
 primary key(org_id,feature_key,window_start,window_end),
 check(window_end>window_start)
);

create table kxra.usage_adjustments(
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null references kxra.organisations(id),
 feature_key text not null,
 window_start timestamptz not null,
 window_end timestamptz not null,
 units_delta bigint not null check(units_delta<>0),
 reason text not null check(length(trim(reason)) between 1 and 1000),
 approved_by uuid not null references kxra.account_identities(account_id),
 created_at timestamptz not null default now(),
 check(window_end>window_start)
);

create table kxra.commercial_offers(
 id uuid primary key default gen_random_uuid(),
 org_id uuid references kxra.organisations(id),
 plan_version_id uuid references kxra.plan_versions(id),
 state text not null default 'DRAFT' check(state in ('DRAFT','ACTIVE','EXPIRED','RETIRED')),
 offer_code text not null unique check(length(offer_code) between 3 and 80),
 valid_from timestamptz,
 valid_until timestamptz,
 terms jsonb not null default '{}'::jsonb check(jsonb_typeof(terms)='object'),
 created_at timestamptz not null default now(),
 check(valid_until is null or valid_from is null or valid_until>valid_from)
);

create table kxra.price_references(
 id uuid primary key default gen_random_uuid(),
 plan_version_id uuid not null references kxra.plan_versions(id),
 provider text not null check(provider='STRIPE'),
 provider_price_id text not null unique,
 environment text not null check(environment in ('TEST','LIVE')),
 state text not null check(state in ('ACTIVE','RETIRED')),
 created_at timestamptz not null default now()
);

create table kxra.tax_contexts(
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null references kxra.organisations(id),
 jurisdiction text not null,
 customer_type text not null check(customer_type in ('BUSINESS','CONSUMER','UNKNOWN')),
 tax_identifier_digest text check(tax_identifier_digest is null or tax_identifier_digest~'^[a-f0-9]{64}$'),
 evidence_state text not null default 'UNVERIFIED' check(evidence_state in ('UNVERIFIED','VERIFIED','EXPIRED')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(org_id,jurisdiction)
);

create table kxra.custom_project_requests(
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null references kxra.organisations(id),
 submitted_by uuid not null references kxra.account_identities(account_id),
 client_request_id uuid not null,
 problem text not null check(length(trim(problem)) between 1 and 20000),
 desired_outcome text not null check(length(trim(desired_outcome)) between 1 and 20000),
 constraints text not null default '' check(length(constraints)<=20000),
 reuse_consent boolean not null default false,
 state text not null default 'SUBMITTED' check(state in (
  'SUBMITTED','TRIAGE','CLARIFICATION','PROPOSAL_PENDING','PROPOSAL_ISSUED',
  'ACCEPTED','REJECTED','WITHDRAWN','PROJECT_CREATED'
 )),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(org_id,client_request_id)
);

create table kxra.custom_project_triage(
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null references kxra.organisations(id),
 request_id uuid not null references kxra.custom_project_requests(id),
 version integer not null check(version>0),
 assessment text not null check(length(trim(assessment)) between 1 and 20000),
 evidence jsonb not null default '[]'::jsonb check(jsonb_typeof(evidence)='array'),
 created_by uuid not null references kxra.account_identities(account_id),
 created_at timestamptz not null default now(),
 unique(request_id,version)
);

create table kxra.project_proposals(
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null references kxra.organisations(id),
 request_id uuid not null references kxra.custom_project_requests(id),
 version integer not null check(version>0),
 state text not null default 'DRAFT' check(state in (
  'DRAFT','ISSUED','ACCEPTED','REJECTED','EXPIRED','SUPERSEDED','PROJECT_CREATED'
 )),
 scope text not null check(length(trim(scope)) between 1 and 50000),
 exclusions text not null check(length(exclusions)<=30000),
 assumptions text not null check(length(assumptions)<=30000),
 milestones jsonb not null check(jsonb_typeof(milestones)='array' and jsonb_array_length(milestones)>0),
 price_minor bigint not null check(price_minor>=0),
 currency text not null check(currency~'^[A-Z]{3}$'),
 tax_treatment text not null check(length(trim(tax_treatment)) between 1 and 500),
 payment_gate text not null check(payment_gate in ('NONE','DEPOSIT','PAID_IN_FULL')),
 deposit_minor bigint not null default 0 check(deposit_minor>=0 and deposit_minor<=price_minor),
 legal_document_id uuid not null,
 legal_document_version integer not null,
 legal_document_sha256 text not null check(legal_document_sha256~'^[a-f0-9]{64}$'),
 proposal_hash text not null check(proposal_hash~'^[a-f0-9]{64}$'),
 valid_until timestamptz not null,
 issued_at timestamptz,
 created_by uuid not null references kxra.account_identities(account_id),
 created_at timestamptz not null default now(),
 unique(request_id,version),
 unique(org_id,id,proposal_hash),
 foreign key(org_id,legal_document_id,legal_document_version,legal_document_sha256)
  references kxra.legal_documents(org_id,id,version,content_sha256),
 check(state not in ('ISSUED','ACCEPTED','PROJECT_CREATED') or issued_at is not null),
 check(valid_until>created_at),
 check(payment_gate<>'DEPOSIT' or deposit_minor>0),
 check(payment_gate<>'PAID_IN_FULL' or deposit_minor=price_minor)
);

create table kxra.project_proposal_acceptances(
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null references kxra.organisations(id),
 proposal_id uuid not null references kxra.project_proposals(id),
 proposal_hash text not null check(proposal_hash~'^[a-f0-9]{64}$'),
 accepted_by uuid not null references kxra.account_identities(account_id),
 membership_id uuid not null references kxra.organisation_memberships(id),
 request_id uuid not null unique,
 accepted_at timestamptz not null default now(),
 unique(proposal_id),
 foreign key(org_id,proposal_id,proposal_hash)
  references kxra.project_proposals(org_id,id,proposal_hash)
);

create table kxra.custom_project_payments(
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null references kxra.organisations(id),
 proposal_id uuid not null references kxra.project_proposals(id),
 amount_minor bigint not null check(amount_minor>0),
 currency text not null check(currency~'^[A-Z]{3}$'),
 state text not null check(state in ('PENDING','RECEIVED','REFUNDED','FAILED')),
 evidence_reference text not null check(length(trim(evidence_reference)) between 3 and 500),
 recorded_by uuid not null references kxra.account_identities(account_id),
 recorded_at timestamptz not null default now(),
 unique(proposal_id,evidence_reference)
);

create table kxra.custom_project_change_requests(
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null references kxra.organisations(id),
 project_id uuid not null references kxra.projects(id),
 version integer not null check(version>0),
 requested_by uuid not null references kxra.account_identities(account_id),
 scope_delta text not null check(length(trim(scope_delta)) between 1 and 30000),
 price_delta_minor bigint not null,
 currency text not null check(currency~'^[A-Z]{3}$'),
 state text not null default 'SUBMITTED' check(state in ('SUBMITTED','ACCEPTED','REJECTED','SUPERSEDED')),
 created_at timestamptz not null default now(),
 unique(project_id,version)
);

create table kxra.custom_project_milestone_acceptances(
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null references kxra.organisations(id),
 project_id uuid not null references kxra.projects(id),
 proposal_id uuid not null references kxra.project_proposals(id),
 milestone_key text not null check(length(trim(milestone_key)) between 1 and 120),
 accepted_by uuid not null references kxra.account_identities(account_id),
 accepted_at timestamptz not null default now(),
 evidence jsonb not null default '{}'::jsonb check(jsonb_typeof(evidence)='object'),
 unique(project_id,proposal_id,milestone_key)
);

create function kxra.entitlement_decision(feature text,requested_units bigint default 1)
returns table(
 allowed boolean,reason text,source_type text,source_id uuid,quantity_limit bigint,
 consumed_units bigint,reserved_units bigint,window_start timestamptz,
 window_end timestamptz,policy_version integer
)
language plpgsql stable security definer set search_path='' as $$
declare o uuid=kxra_private.member_org();grant_row kxra.entitlement_grants;
 subscription_row record;start_at timestamptz;end_at timestamptz;consumed bigint;reserved bigint;
begin
 if o is null or feature!~'^[a-z][a-z0-9]*(?:[.:_-][a-z0-9]+)*$'
  or requested_units is null or requested_units<1
 then return query select false,'ACCESS_UNAVAILABLE',null::text,null::uuid,null::bigint,
  0::bigint,0::bigint,null::timestamptz,null::timestamptz,null::integer;return;end if;

 select * into grant_row from kxra.entitlement_grants g
 where g.org_id=o and g.feature_key=feature and g.state='ACTIVE'
  and g.starts_at<=now() and (g.expires_at is null or g.expires_at>now())
 order by g.quantity_limit desc nulls first,g.created_at desc limit 1;
 if found then
  start_at=case when grant_row.usage_window='MONTH' then date_trunc('month',now()) else grant_row.starts_at end;
  end_at=case when grant_row.usage_window='MONTH' then date_trunc('month',now())+interval '1 month'
   else coalesce(grant_row.expires_at,'infinity'::timestamptz) end;
  select coalesce(sum(a.consumed_units),0) into consumed from kxra.usage_aggregates a
   where a.org_id=o and a.feature_key=feature and a.window_start=start_at and a.window_end=end_at;
  select coalesce(sum(r.units),0) into reserved from kxra.usage_reservations r
   where r.org_id=o and r.feature_key=feature and r.window_start=start_at and r.window_end=end_at
    and r.state='RESERVED' and r.expires_at>now();
  return query select
   grant_row.quantity_limit is null or consumed+reserved+requested_units<=grant_row.quantity_limit,
   case when grant_row.quantity_limit is null or consumed+reserved+requested_units<=grant_row.quantity_limit
    then 'ALLOWED_OWNER_GRANT' else 'USAGE_LIMIT_EXCEEDED' end,
   'OWNER_GRANT',grant_row.id,grant_row.quantity_limit,consumed,reserved,start_at,end_at,grant_row.policy_version;
  return;
 end if;

 select s.id,s.current_period_start,s.current_period_end,pf.quantity_limit,pf.usage_window,pv.policy_version
 into subscription_row
 from kxra.billing_subscriptions s
 join kxra.plan_versions pv on pv.id=s.plan_version_id and pv.state='ACTIVE'
 join kxra.plan_features pf on pf.plan_version_id=pv.id and pf.feature_key=feature
 where s.org_id=o and (
  s.state in ('ACTIVE','TRIALING') and (s.current_period_end is null or s.current_period_end>now())
  or s.state='PAST_DUE' and s.grace_until is not null and s.grace_until>now()
 )
 order by s.updated_at desc limit 1;
 if not found then
  return query select false,'NO_ACTIVE_ENTITLEMENT',null::text,null::uuid,null::bigint,
   0::bigint,0::bigint,null::timestamptz,null::timestamptz,null::integer;return;
 end if;
 start_at=case when subscription_row.usage_window='MONTH' then date_trunc('month',now())
  else coalesce(subscription_row.current_period_start,date_trunc('month',now())) end;
 end_at=case when subscription_row.usage_window='MONTH' then date_trunc('month',now())+interval '1 month'
  else coalesce(subscription_row.current_period_end,date_trunc('month',now())+interval '1 month') end;
 select coalesce(sum(a.consumed_units),0) into consumed from kxra.usage_aggregates a
  where a.org_id=o and a.feature_key=feature and a.window_start=start_at and a.window_end=end_at;
 select coalesce(sum(r.units),0) into reserved from kxra.usage_reservations r
  where r.org_id=o and r.feature_key=feature and r.window_start=start_at and r.window_end=end_at
   and r.state='RESERVED' and r.expires_at>now();
 return query select
  subscription_row.quantity_limit is null or consumed+reserved+requested_units<=subscription_row.quantity_limit,
  case when subscription_row.quantity_limit is null or consumed+reserved+requested_units<=subscription_row.quantity_limit
   then 'ALLOWED_SUBSCRIPTION' else 'USAGE_LIMIT_EXCEEDED' end,
  'SUBSCRIPTION',subscription_row.id,subscription_row.quantity_limit,consumed,reserved,
  start_at,end_at,subscription_row.policy_version;
end $$;

create function kxra.reserve_usage(feature text,units bigint,idempotency text)
returns kxra.usage_reservations
language plpgsql security definer set search_path='' as $$
declare o uuid=kxra_private.member_org();existing kxra.usage_reservations;decision record;created kxra.usage_reservations;
begin
 if o is null or idempotency is null or length(idempotency) not between 8 and 240
 then raise exception 'Usage reservation unavailable';end if;
 perform pg_advisory_xact_lock(hashtextextended(o::text||':'||feature,0));
 update kxra.usage_reservations set state='EXPIRED',completed_at=now()
 where org_id=o and feature_key=feature and state='RESERVED' and expires_at<=now();
 select * into existing from kxra.usage_reservations r
 where r.org_id=o and r.idempotency_key=idempotency;
 if found then
  if existing.account_id<>auth.uid() or existing.feature_key<>feature or existing.units<>units
  then raise exception 'Usage reservation conflict';end if;
  return existing;
 end if;
 select * into decision from kxra.entitlement_decision(feature,units);
 if decision.allowed is distinct from true then raise exception 'ENTITLEMENT_DENIED:%',decision.reason;end if;
 insert into kxra.usage_reservations(
  org_id,account_id,feature_key,units,idempotency_key,entitlement_source_type,
  entitlement_source_id,policy_version,window_start,window_end
 ) values(
  o,auth.uid(),feature,units,idempotency,decision.source_type,
  decision.source_id,decision.policy_version,decision.window_start,decision.window_end
 ) returning * into created;
 return created;
end $$;

create function kxra.complete_usage_reservation(
 reservation uuid,outcome text,actual_provider_units bigint,
 actual_provider_cost_minor bigint,actual_provider_currency text
) returns kxra.usage_reservations
language plpgsql security definer set search_path='' as $$
declare value kxra.usage_reservations;next_state text;
begin
 select * into value from kxra.usage_reservations r where r.id=reservation for update;
 if not found or value.org_id<>kxra_private.member_org() or value.account_id<>auth.uid()
  or value.state<>'RESERVED' or outcome not in ('SUCCESS','FAILURE')
  or actual_provider_units is not null and actual_provider_units<0
  or actual_provider_cost_minor is not null and actual_provider_cost_minor<0
  or actual_provider_currency is not null and actual_provider_currency!~'^[A-Z]{3}$'
 then raise exception 'Usage completion unavailable';end if;
 next_state=case when outcome='SUCCESS' then 'COMMITTED' else 'RELEASED' end;
 update kxra.usage_reservations set state=next_state,completed_at=now(),
  provider_units=actual_provider_units,provider_cost_minor=actual_provider_cost_minor,
  provider_currency=actual_provider_currency where id=value.id returning * into value;
 if next_state='COMMITTED' then
  insert into kxra.usage_events(
   org_id,account_id,reservation_id,feature_key,units,provider_units,
   provider_cost_minor,provider_currency
  ) values(
   value.org_id,value.account_id,value.id,value.feature_key,value.units,
   value.provider_units,value.provider_cost_minor,value.provider_currency
  );
  insert into kxra.usage_aggregates(org_id,feature_key,window_start,window_end,consumed_units)
  values(value.org_id,value.feature_key,value.window_start,value.window_end,value.units)
  on conflict(org_id,feature_key,window_start,window_end) do update set
   consumed_units=kxra.usage_aggregates.consumed_units+excluded.consumed_units,updated_at=now();
 end if;
 return value;
end $$;

create function kxra.grant_free_entitlement(
 target_org uuid,feature text,quantity bigint,window_name text,expiry timestamptz,grant_reason text
) returns uuid
language plpgsql security definer set search_path='' as $$
declare created uuid;
begin
 if not kxra_private.is_platform_owner() or not kxra_private.mfa_owner(kxra_private.requested_org())
  or feature!~'^[a-z][a-z0-9]*(?:[.:_-][a-z0-9]+)*$'
  or quantity is not null and quantity<1 or window_name not in ('MONTH','NONE')
  or expiry is not null and expiry<=now() or length(trim(grant_reason)) not between 1 and 1000
  or not exists(select 1 from kxra.organisations where id=target_org and state='ACTIVE')
 then raise exception 'Entitlement grant unavailable';end if;
 insert into kxra.entitlement_grants(
  org_id,feature_key,source,quantity_limit,usage_window,reason,issued_by,expires_at
 ) values(target_org,feature,'FREE_OWNER_GRANT',quantity,window_name,trim(grant_reason),auth.uid(),expiry)
 returning id into created;
 insert into kxra.entitlement_effective_periods(
  org_id,feature_key,source_type,source_id,quantity_limit,usage_window,policy_version,
  effective_from,effective_until
 ) values(target_org,feature,'OWNER_GRANT',created,quantity,window_name,1,now(),expiry);
 insert into kxra.audit_events(org_id,actor_id,action,resource_id,metadata)
 values(target_org,auth.uid(),'entitlement.free_granted',created,
  jsonb_build_object('feature_key',feature,'quantity_limit',quantity,'expires_at',expiry,'reason',trim(grant_reason)));
 return created;
end $$;

create function kxra.revoke_free_entitlement(grant_id uuid,revocation_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare value kxra.entitlement_grants;
begin
 select * into value from kxra.entitlement_grants where id=grant_id for update;
 if not found or value.source<>'FREE_OWNER_GRANT' or value.state<>'ACTIVE'
  or not kxra_private.is_platform_owner() or not kxra_private.mfa_owner(kxra_private.requested_org())
  or length(trim(revocation_reason)) not between 1 and 1000
 then raise exception 'Entitlement revocation unavailable';end if;
 update kxra.entitlement_grants set state='REVOKED',revoked_at=now(),revoked_by=auth.uid()
 where id=value.id;
 update kxra.entitlement_effective_periods set effective_until=coalesce(effective_until,now())
 where source_type='OWNER_GRANT' and source_id=value.id and effective_until is null;
 insert into kxra.audit_events(org_id,actor_id,action,resource_id,metadata)
 values(value.org_id,auth.uid(),'entitlement.free_revoked',value.id,
  jsonb_build_object('reason',trim(revocation_reason)));
end $$;

create function kxra_private.apply_billing_event(
 provider_event text,event_name text,event_created timestamptz,event_payload jsonb,event_hash text
) returns text
language plpgsql security definer set search_path='' as $$
declare o uuid;customer kxra.billing_customers;subscription kxra.billing_subscriptions;
 plan_version uuid;incoming_state text;event_row kxra.billing_events;outcome text;
begin
 if provider_event is null or event_name not in (
  'customer.subscription.created','customer.subscription.updated','customer.subscription.deleted'
 ) or event_created is null or jsonb_typeof(event_payload)<>'object'
  or event_hash!~'^[a-f0-9]{64}$'
  or event_hash<>encode(sha256(convert_to(event_payload::text,'UTF8')),'hex')
 then raise exception 'Billing event unavailable';end if;
 o=(event_payload->>'org_id')::uuid;
 select * into event_row from kxra.billing_events
 where provider='STRIPE' and provider_event_id=provider_event;
 if found then
  if event_row.payload_hash<>event_hash then raise exception 'Billing event replay mismatch';end if;
  return event_row.processing_state;
 end if;
 insert into kxra.billing_events(
  org_id,provider_event_id,event_type,provider_created_at,signature_verified,
  payload_hash,payload
 ) values(o,provider_event,event_name,event_created,true,event_hash,event_payload)
 returning * into event_row;
 select * into customer from kxra.billing_customers c
 where c.org_id=o and c.provider='STRIPE'
  and c.provider_customer_id=event_payload->>'customer_id';
 plan_version=(event_payload->>'plan_version_id')::uuid;
 incoming_state=case when event_name='customer.subscription.deleted' then 'CANCELLED'
  else upper(event_payload->>'status') end;
 if customer.id is null or incoming_state not in (
  'INCOMPLETE','TRIALING','ACTIVE','PAST_DUE','PAUSED','CANCELLED','UNPAID','UNKNOWN'
 ) or not exists(select 1 from kxra.plan_versions where id=plan_version)
 then
  update kxra.billing_events set processing_state='FAILED',processing_reason='INVALID_NORMALIZED_REFERENCE',processed_at=now()
  where id=event_row.id;
  return 'FAILED';
 end if;
 select * into subscription from kxra.billing_subscriptions s
 where s.provider='STRIPE' and s.provider_subscription_id=event_payload->>'subscription_id' for update;
 if found and (subscription.org_id<>o or subscription.billing_customer_id<>customer.id)
 then raise exception 'Billing subscription scope mismatch';end if;
 if found and (event_created,provider_event)<=(subscription.provider_event_created_at,subscription.provider_event_id) then
  update kxra.billing_events set processing_state='IGNORED',processing_reason='OUT_OF_ORDER',processed_at=now()
  where id=event_row.id;return 'IGNORED';
 end if;
 insert into kxra.billing_subscriptions(
  org_id,billing_customer_id,provider_subscription_id,plan_version_id,state,
  current_period_start,current_period_end,grace_until,cancel_at_period_end,
  provider_event_created_at,provider_event_id
 ) values(
  o,customer.id,event_payload->>'subscription_id',plan_version,incoming_state,
  (event_payload->>'period_start')::timestamptz,(event_payload->>'period_end')::timestamptz,
  nullif(event_payload->>'grace_until','')::timestamptz,
  coalesce((event_payload->>'cancel_at_period_end')::boolean,false),event_created,provider_event
 ) on conflict(provider,provider_subscription_id) do update set
  plan_version_id=excluded.plan_version_id,state=excluded.state,
  current_period_start=excluded.current_period_start,current_period_end=excluded.current_period_end,
  grace_until=excluded.grace_until,cancel_at_period_end=excluded.cancel_at_period_end,
  provider_event_created_at=excluded.provider_event_created_at,
  provider_event_id=excluded.provider_event_id,updated_at=now()
 returning * into subscription;
 insert into kxra.entitlement_effective_periods(
  org_id,feature_key,source_type,source_id,quantity_limit,usage_window,policy_version,
  effective_from,effective_until
 )
 select o,pf.feature_key,'SUBSCRIPTION',subscription.id,pf.quantity_limit,pf.usage_window,
  pv.policy_version,coalesce(subscription.current_period_start,event_created),
  case when incoming_state in ('ACTIVE','TRIALING','PAST_DUE') then subscription.current_period_end else event_created end
 from kxra.plan_features pf join kxra.plan_versions pv on pv.id=pf.plan_version_id
 where pf.plan_version_id=subscription.plan_version_id;
 update kxra.billing_events set processing_state='PROCESSED',processed_at=now()
 where id=event_row.id;
 return 'PROCESSED';
end $$;

create function kxra.submit_custom_project_request(
 problem_text text,outcome_text text,constraints_text text,consent boolean,request uuid
) returns uuid
language plpgsql security definer set search_path='' as $$
declare o uuid=kxra_private.member_org();created uuid;
begin
 if o is null or length(trim(problem_text)) not between 1 and 20000
  or length(trim(outcome_text)) not between 1 and 20000
  or length(coalesce(constraints_text,''))>20000 or request is null
 then raise exception 'Custom project request unavailable';end if;
 insert into kxra.custom_project_requests(
  org_id,submitted_by,client_request_id,problem,desired_outcome,constraints,reuse_consent
 ) values(o,auth.uid(),request,trim(problem_text),trim(outcome_text),coalesce(constraints_text,''),coalesce(consent,false))
 on conflict(org_id,client_request_id) do nothing returning id into created;
 if created is null then select id into created from kxra.custom_project_requests
  where org_id=o and client_request_id=request and submitted_by=auth.uid();end if;
 if created is null then raise exception 'Custom project request conflict';end if;
 insert into kxra.audit_events(org_id,actor_id,action,resource_id)
 values(o,auth.uid(),'custom_project.request_submitted',created);
 return created;
end $$;

create function kxra.create_project_proposal(
 request uuid,scope_text text,exclusions_text text,assumptions_text text,
 milestone_list jsonb,amount_minor bigint,currency_code text,tax_text text,
 payment_requirement text,deposit_amount bigint,legal_id uuid,legal_version integer,
 legal_hash text,expires timestamptz
) returns table(id uuid,version integer,proposal_hash text)
language plpgsql security definer set search_path='' as $$
declare o uuid=kxra_private.member_org();request_row kxra.custom_project_requests;
 document kxra.legal_documents;next_version integer;hash_value text;created kxra.project_proposals;
begin
 select * into request_row from kxra.custom_project_requests r where r.id=request for update;
 select * into document from kxra.legal_documents d where d.org_id=o and d.id=legal_id
  and d.version=legal_version and d.content_sha256=legal_hash and d.status='APPROVED';
 if not kxra_private.is_owner(o) or request_row.id is null or request_row.org_id<>o
  or request_row.state in ('WITHDRAWN','REJECTED','PROJECT_CREATED') or document.id is null
  or length(trim(scope_text)) not between 1 and 50000
  or length(coalesce(exclusions_text,''))>30000 or length(coalesce(assumptions_text,''))>30000
  or jsonb_typeof(milestone_list)<>'array' or jsonb_array_length(milestone_list)<1
  or amount_minor<0 or currency_code!~'^[A-Z]{3}$'
  or length(trim(tax_text)) not between 1 and 500
  or payment_requirement not in ('NONE','DEPOSIT','PAID_IN_FULL')
  or deposit_amount<0 or deposit_amount>amount_minor
  or payment_requirement='DEPOSIT' and deposit_amount=0
  or payment_requirement='PAID_IN_FULL' and deposit_amount<>amount_minor
  or expires<=now()
 then raise exception 'Project proposal unavailable';end if;
 select coalesce(max(p.version),0)+1 into next_version from kxra.project_proposals p where p.request_id=request;
 update kxra.project_proposals set state='SUPERSEDED'
 where request_id=request and state in ('DRAFT','ISSUED');
 hash_value=encode(sha256(convert_to(jsonb_build_object(
  'request_id',request,'version',next_version,'scope',trim(scope_text),
  'exclusions',coalesce(exclusions_text,''),'assumptions',coalesce(assumptions_text,''),
  'milestones',milestone_list,'price_minor',amount_minor,'currency',currency_code,
  'tax_treatment',trim(tax_text),'payment_gate',payment_requirement,
  'deposit_minor',deposit_amount,'legal_document_id',legal_id,
  'legal_document_version',legal_version,'legal_document_sha256',legal_hash,
  'valid_until',expires
 )::text,'UTF8')),'hex');
 insert into kxra.project_proposals(
  org_id,request_id,version,state,scope,exclusions,assumptions,milestones,
  price_minor,currency,tax_treatment,payment_gate,deposit_minor,
  legal_document_id,legal_document_version,legal_document_sha256,
  proposal_hash,valid_until,issued_at,created_by
 ) values(
  o,request,next_version,'ISSUED',trim(scope_text),coalesce(exclusions_text,''),
  coalesce(assumptions_text,''),milestone_list,amount_minor,currency_code,
  trim(tax_text),payment_requirement,deposit_amount,legal_id,legal_version,
  legal_hash,hash_value,expires,now(),auth.uid()
 ) returning * into created;
 update kxra.custom_project_requests set state='PROPOSAL_ISSUED',updated_at=now() where id=request;
 return query select created.id,created.version,created.proposal_hash;
end $$;

create function kxra.accept_project_proposal(proposal uuid,expected_hash text,request uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare o uuid=kxra_private.member_org();value kxra.project_proposals;
 membership kxra.organisation_memberships;created uuid;latest integer;
begin
 select * into value from kxra.project_proposals p where p.id=proposal for update;
 select max(version) into latest from kxra.project_proposals where request_id=value.request_id;
 select * into membership from kxra.organisation_memberships m
 where m.org_id=o and m.account_id=auth.uid() and m.state='ACTIVE';
 if value.id is null or value.org_id<>o or value.state<>'ISSUED'
  or value.version<>latest or value.proposal_hash<>expected_hash
  or value.valid_until<=now() or request is null
  or membership.security_role not in ('ORG_ADMIN','KXRA_OWNER')
 then raise exception 'Proposal acceptance unavailable';end if;
 insert into kxra.project_proposal_acceptances(
  org_id,proposal_id,proposal_hash,accepted_by,membership_id,request_id
 ) values(o,value.id,value.proposal_hash,auth.uid(),membership.id,request)
 on conflict(proposal_id) do nothing returning id into created;
 if created is null then select id into created from kxra.project_proposal_acceptances
  where proposal_id=value.id and accepted_by=auth.uid() and request_id=request;end if;
 if created is null then raise exception 'Proposal acceptance conflict';end if;
 update kxra.project_proposals set state='ACCEPTED' where id=value.id;
 update kxra.custom_project_requests set state='ACCEPTED',updated_at=now() where id=value.request_id;
 insert into kxra.audit_events(org_id,actor_id,action,resource_id,metadata)
 values(o,auth.uid(),'custom_project.proposal_accepted',value.id,
  jsonb_build_object('proposal_hash',value.proposal_hash,'version',value.version));
 return created;
end $$;

create function kxra.activate_custom_project(proposal uuid,project_code text,project_name text)
returns uuid language plpgsql security definer set search_path='' as $$
declare o uuid=kxra_private.member_org();value kxra.project_proposals;
 accepted kxra.project_proposal_acceptances;created uuid;paid bigint;
begin
 select * into value from kxra.project_proposals p where p.id=proposal for update;
 select * into accepted from kxra.project_proposal_acceptances a where a.proposal_id=value.id;
 select coalesce(sum(amount_minor) filter(where state='RECEIVED'),0) into paid
 from kxra.custom_project_payments where proposal_id=value.id;
 if not kxra_private.is_owner(o) or value.id is null or value.org_id<>o
  or value.state<>'ACCEPTED' or accepted.id is null or value.valid_until<=accepted.accepted_at
  or value.payment_gate='DEPOSIT' and paid<value.deposit_minor
  or value.payment_gate='PAID_IN_FULL' and paid<value.price_minor
  or project_code!~'^[A-Z][A-Z0-9-]{2,39}$'
  or length(trim(project_name)) not between 1 and 240
 then raise exception 'Custom project activation unavailable';end if;
 insert into kxra.projects(
  org_id,code,name,stage,status,next_action,lifecycle_stage,disposition,
  live_execution_enabled,product_creation_enabled
 ) values(
  o,project_code,trim(project_name),'CUSTOM INTAKE','active',
  'Confirm project kickoff and first accepted milestone.','VALIDATION','ACTIVE',false,false
 ) returning id into created;
 insert into kxra.project_memberships(org_id,project_id,user_id,role,active)
 values(o,created,accepted.accepted_by,'contributor',true)
 on conflict(project_id,user_id) do update set role='contributor',active=true,expires_at=null;
 update kxra.project_proposals set state='PROJECT_CREATED' where id=value.id;
 update kxra.custom_project_requests set state='PROJECT_CREATED',updated_at=now() where id=value.request_id;
 insert into kxra.audit_events(org_id,actor_id,action,resource_id,metadata)
 values(o,auth.uid(),'custom_project.project_created',created,
  jsonb_build_object('proposal_id',value.id,'proposal_hash',value.proposal_hash));
 return created;
end $$;

-- Every commercial/customer table is RLS protected. Mutations occur only via
-- the narrow functions above or later provider workers with separate grants.
alter table kxra.tool_catalogue enable row level security;
alter table kxra.tool_versions enable row level security;
alter table kxra.plans enable row level security;
alter table kxra.plan_versions enable row level security;
alter table kxra.plan_features enable row level security;
alter table kxra.billing_customers enable row level security;
alter table kxra.billing_subscriptions enable row level security;
alter table kxra.billing_subscription_items enable row level security;
alter table kxra.billing_events enable row level security;
alter table kxra.entitlement_grants enable row level security;
alter table kxra.entitlement_effective_periods enable row level security;
alter table kxra.usage_reservations enable row level security;
alter table kxra.usage_events enable row level security;
alter table kxra.usage_aggregates enable row level security;
alter table kxra.usage_adjustments enable row level security;
alter table kxra.commercial_offers enable row level security;
alter table kxra.price_references enable row level security;
alter table kxra.tax_contexts enable row level security;
alter table kxra.custom_project_requests enable row level security;
alter table kxra.custom_project_triage enable row level security;
alter table kxra.project_proposals enable row level security;
alter table kxra.project_proposal_acceptances enable row level security;
alter table kxra.custom_project_payments enable row level security;
alter table kxra.custom_project_change_requests enable row level security;
alter table kxra.custom_project_milestone_acceptances enable row level security;

grant select on kxra.tool_catalogue,kxra.tool_versions,kxra.plans,kxra.plan_versions,
 kxra.plan_features,kxra.billing_customers,kxra.billing_subscriptions,
 kxra.billing_subscription_items,kxra.billing_events,kxra.entitlement_grants,
 kxra.entitlement_effective_periods,kxra.usage_reservations,kxra.usage_events,
 kxra.usage_aggregates,kxra.usage_adjustments,kxra.commercial_offers,
 kxra.price_references,kxra.tax_contexts,kxra.custom_project_requests,
 kxra.custom_project_triage,kxra.project_proposals,
 kxra.project_proposal_acceptances,kxra.custom_project_payments,
 kxra.custom_project_change_requests,kxra.custom_project_milestone_acceptances
to authenticated,anon;

create policy tool_catalogue_read on kxra.tool_catalogue for select using(
 state='ACTIVE' and kxra_private.member_org() is not null or kxra_private.is_platform_owner()
);
create policy tool_versions_read on kxra.tool_versions for select using(
 state='ACTIVE' and kxra_private.member_org() is not null or kxra_private.is_platform_owner()
);
create policy plans_read on kxra.plans for select using(
 state='ACTIVE' and kxra_private.member_org() is not null or kxra_private.is_platform_owner()
);
create policy plan_versions_read on kxra.plan_versions for select using(
 state='ACTIVE' and kxra_private.member_org() is not null or kxra_private.is_platform_owner()
);
create policy plan_features_read on kxra.plan_features for select using(
 exists(select 1 from kxra.plan_versions v where v.id=plan_version_id and v.state='ACTIVE')
 and kxra_private.member_org() is not null or kxra_private.is_platform_owner()
);
create policy billing_customers_read on kxra.billing_customers for select using(
 kxra_private.is_owner(org_id) or kxra_private.is_platform_owner()
);
create policy billing_subscriptions_read on kxra.billing_subscriptions for select using(
 kxra_private.is_owner(org_id) or kxra_private.is_platform_owner()
);
create policy billing_subscription_items_read on kxra.billing_subscription_items for select using(
 kxra_private.is_owner(org_id) or kxra_private.is_platform_owner()
);
create policy billing_events_read on kxra.billing_events for select using(
 kxra_private.is_platform_owner()
);
create policy entitlement_grants_read on kxra.entitlement_grants for select using(
 kxra_private.private_access_allowed(org_id) or kxra_private.is_platform_owner()
);
create policy entitlement_periods_read on kxra.entitlement_effective_periods for select using(
 kxra_private.private_access_allowed(org_id) or kxra_private.is_platform_owner()
);
create policy usage_reservations_read on kxra.usage_reservations for select using(
 kxra_private.private_access_allowed(org_id) and (account_id=auth.uid() or kxra_private.is_owner(org_id))
 or kxra_private.is_platform_owner()
);
create policy usage_events_read on kxra.usage_events for select using(
 kxra_private.private_access_allowed(org_id) and (account_id=auth.uid() or kxra_private.is_owner(org_id))
 or kxra_private.is_platform_owner()
);
create policy usage_aggregates_read on kxra.usage_aggregates for select using(
 kxra_private.is_owner(org_id) or kxra_private.is_platform_owner()
);
create policy usage_adjustments_read on kxra.usage_adjustments for select using(
 kxra_private.is_owner(org_id) or kxra_private.is_platform_owner()
);
create policy commercial_offers_read on kxra.commercial_offers for select using(
 state='ACTIVE' and (org_id is null or org_id=kxra_private.member_org())
 or kxra_private.is_platform_owner()
);
create policy price_references_read on kxra.price_references for select using(
 kxra_private.is_platform_owner()
);
create policy tax_contexts_read on kxra.tax_contexts for select using(
 kxra_private.is_owner(org_id) or kxra_private.is_platform_owner()
);
create policy custom_requests_read on kxra.custom_project_requests for select using(
 kxra_private.private_access_allowed(org_id) or kxra_private.is_platform_owner()
);
create policy custom_triage_read on kxra.custom_project_triage for select using(
 kxra_private.private_access_allowed(org_id) or kxra_private.is_platform_owner()
);
create policy proposals_read on kxra.project_proposals for select using(
 kxra_private.private_access_allowed(org_id) or kxra_private.is_platform_owner()
);
create policy proposal_acceptances_read on kxra.project_proposal_acceptances for select using(
 kxra_private.private_access_allowed(org_id) or kxra_private.is_platform_owner()
);
create policy custom_payments_read on kxra.custom_project_payments for select using(
 kxra_private.is_owner(org_id) or kxra_private.is_platform_owner()
);
create policy custom_changes_read on kxra.custom_project_change_requests for select using(
 kxra_private.can_project(project_id)
);
create policy milestone_acceptances_read on kxra.custom_project_milestone_acceptances for select using(
 kxra_private.can_project(project_id)
);

revoke all on function kxra.entitlement_decision(text,bigint),
 kxra.reserve_usage(text,bigint,text),
 kxra.complete_usage_reservation(uuid,text,bigint,bigint,text),
 kxra.grant_free_entitlement(uuid,text,bigint,text,timestamptz,text),
 kxra.revoke_free_entitlement(uuid,text),
 kxra.submit_custom_project_request(text,text,text,boolean,uuid),
 kxra.create_project_proposal(uuid,text,text,text,jsonb,bigint,text,text,text,bigint,uuid,integer,text,timestamptz),
 kxra.accept_project_proposal(uuid,text,uuid),
 kxra.activate_custom_project(uuid,text,text)
from public;
grant execute on function kxra.entitlement_decision(text,bigint),
 kxra.reserve_usage(text,bigint,text),
 kxra.complete_usage_reservation(uuid,text,bigint,bigint,text),
 kxra.grant_free_entitlement(uuid,text,bigint,text,timestamptz,text),
 kxra.revoke_free_entitlement(uuid,text),
 kxra.submit_custom_project_request(text,text,text,boolean,uuid),
 kxra.create_project_proposal(uuid,text,text,text,jsonb,bigint,text,text,text,bigint,uuid,integer,text,timestamptz),
 kxra.accept_project_proposal(uuid,text,uuid),
 kxra.activate_custom_project(uuid,text,text)
to authenticated;
revoke all on function kxra_private.apply_billing_event(text,text,timestamptz,jsonb,text)
from public,authenticated,anon;

commit;
