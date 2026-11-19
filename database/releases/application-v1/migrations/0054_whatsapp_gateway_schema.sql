begin;

do $$ begin
 create role kxra_whatsapp_worker nologin noinherit nobypassrls;
exception when duplicate_object then null;end $$;
grant usage on schema kxra,kxra_private to kxra_whatsapp_worker;

create table kxra.whatsapp_pairing_challenges(
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null references kxra.organisations(id),
 account_id uuid not null references kxra.account_identities(account_id),
 membership_version integer not null check(membership_version>0),
 phone_digest text not null check(phone_digest~'^[a-f0-9]{64}$'),
 waba_id text not null check(length(trim(waba_id)) between 1 and 120),
 phone_number_id text not null check(length(trim(phone_number_id)) between 1 and 120),
 challenge_digest text not null check(challenge_digest~'^[a-f0-9]{64}$'),
 state text not null default 'PENDING'
  check(state in ('PENDING','COMPLETED','EXPIRED','REVOKED','ATTEMPTS_EXHAUSTED')),
 attempt_count integer not null default 0 check(attempt_count between 0 and 5),
 maximum_attempts integer not null default 5 check(maximum_attempts between 1 and 5),
 request_id uuid not null,
 expires_at timestamptz not null,
 completed_at timestamptz,
 revoked_at timestamptz,
 created_at timestamptz not null default now(),
 unique(org_id,account_id,request_id),
 unique(challenge_digest),
 foreign key(org_id,account_id)
  references kxra.organisation_memberships(org_id,account_id),
 check(expires_at>created_at and expires_at<=created_at+interval '15 minutes'),
 check((state='COMPLETED')=(completed_at is not null)),
 check((state='REVOKED')=(revoked_at is not null))
);

create table kxra.whatsapp_gateway_pairings(
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null references kxra.organisations(id),
 account_id uuid not null references kxra.account_identities(account_id),
 challenge_id uuid not null unique references kxra.whatsapp_pairing_challenges(id),
 phone_digest text not null check(phone_digest~'^[a-f0-9]{64}$'),
 waba_id text not null check(length(trim(waba_id)) between 1 and 120),
 phone_number_id text not null check(length(trim(phone_number_id)) between 1 and 120),
 state text not null default 'ACTIVE' check(state in ('ACTIVE','REVOKED')),
 version integer not null default 1 check(version>0),
 verified_at timestamptz not null,
 revoked_at timestamptz,
 revoke_reason text check(revoke_reason is null or length(trim(revoke_reason)) between 3 and 1000),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(org_id,id),
 foreign key(org_id,account_id)
  references kxra.organisation_memberships(org_id,account_id),
 check((state='REVOKED')=(revoked_at is not null))
);

create table kxra.whatsapp_project_selections(
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null references kxra.organisations(id),
 pairing_id uuid not null references kxra.whatsapp_gateway_pairings(id),
 project_id uuid not null,
 account_id uuid not null references kxra.account_identities(account_id),
 pairing_version integer not null check(pairing_version>0),
 request_id uuid not null,
 state text not null default 'ACTIVE' check(state in ('ACTIVE','REVOKED')),
 selected_at timestamptz not null default now(),
 revoked_at timestamptz,
 foreign key(org_id,pairing_id) references kxra.whatsapp_gateway_pairings(org_id,id),
 foreign key(org_id,project_id) references kxra.projects(org_id,id),
 foreign key(org_id,account_id)
  references kxra.organisation_memberships(org_id,account_id),
 check((state='REVOKED')=(revoked_at is not null))
);

create table kxra.whatsapp_ingress_events(
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null references kxra.organisations(id),
 pairing_id uuid not null references kxra.whatsapp_gateway_pairings(id),
 provider text not null default 'META_WHATSAPP_CLOUD'
  check(provider='META_WHATSAPP_CLOUD'),
 provider_event_id text not null check(length(trim(provider_event_id)) between 1 and 240),
 provider_message_id text not null check(length(trim(provider_message_id)) between 1 and 240),
 payload_sha256 text not null check(payload_sha256~'^[a-f0-9]{64}$'),
 signature_verified_at timestamptz not null,
 received_at timestamptz not null default now(),
 state text not null default 'RECEIVED'
  check(state in ('RECEIVED','HELD','AUTHORIZED','REJECTED','PROCESSED')),
 rejection_code text check(rejection_code is null or rejection_code in (
  'PAIRING_REVOKED','ACCOUNT_UNAVAILABLE','PROJECT_REQUIRED','PROJECT_UNAVAILABLE',
  'UNSUPPORTED_INTENT','MEDIA_REQUIRED','CONSENT_REQUIRED','TAKEOVER_ACTIVE'
 )),
 unique(provider,provider_event_id),
 unique(provider,provider_message_id),
 foreign key(org_id,pairing_id) references kxra.whatsapp_gateway_pairings(org_id,id)
);

create table kxra.whatsapp_messages(
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null references kxra.organisations(id),
 ingress_event_id uuid not null unique references kxra.whatsapp_ingress_events(id),
 pairing_id uuid not null references kxra.whatsapp_gateway_pairings(id),
 account_id uuid not null references kxra.account_identities(account_id),
 project_id uuid,
 intent_type text not null check(intent_type in (
  'IDEA','DISCUSSION','VALIDATION_REQUEST','RESEARCH_REQUEST','NOTE',
  'TASK_PROPOSAL','PROJECT_STATUS','MEDIA','VOICE_NOTE','HUMAN_HELP'
 )),
 content_sha256 text not null check(content_sha256~'^[a-f0-9]{64}$'),
 content_reference text check(content_reference is null or length(content_reference)<=500),
 state text not null default 'HELD'
  check(state in ('HELD','AUTHORIZED','PROPOSED','REJECTED','TAKEOVER')),
 authorization_checked_at timestamptz,
 created_at timestamptz not null default now(),
 unique(org_id,id),
 foreign key(org_id,pairing_id) references kxra.whatsapp_gateway_pairings(org_id,id),
 foreign key(org_id,project_id) references kxra.projects(org_id,id),
 foreign key(org_id,account_id)
  references kxra.organisation_memberships(org_id,account_id),
 check(intent_type='HUMAN_HELP' or project_id is not null)
);

create table kxra.whatsapp_media_items(
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null references kxra.organisations(id),
 message_id uuid not null references kxra.whatsapp_messages(id),
 provider_media_id text not null check(length(trim(provider_media_id)) between 1 and 240),
 media_kind text not null check(media_kind in ('DOCUMENT','IMAGE','VOICE')),
 declared_mime_type text not null check(length(trim(declared_mime_type)) between 1 and 160),
 declared_size_bytes bigint check(declared_size_bytes is null or declared_size_bytes between 0 and 20971520),
 object_key text check(object_key is null or length(object_key)<=500),
 object_sha256 text check(object_sha256 is null or object_sha256~'^[a-f0-9]{64}$'),
 scan_state text not null default 'NOT_FETCHED'
  check(scan_state in ('NOT_FETCHED','QUARANTINED','CLEAN','REJECTED','FAILED')),
 transcription_consent boolean not null default false,
 transcription_state text not null default 'NOT_REQUESTED'
  check(transcription_state in ('NOT_REQUESTED','BLOCKED','QUEUED','COMPLETE','FAILED')),
 created_at timestamptz not null default now(),
 unique(org_id,provider_media_id),
 foreign key(org_id,message_id) references kxra.whatsapp_messages(org_id,id),
 check(media_kind='VOICE' or not transcription_consent),
 check(transcription_state not in ('QUEUED','COMPLETE') or (
  media_kind='VOICE' and transcription_consent and scan_state='CLEAN'
 ))
);

create table kxra.whatsapp_takeovers(
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null references kxra.organisations(id),
 pairing_id uuid not null references kxra.whatsapp_gateway_pairings(id),
 state text not null default 'ACTIVE' check(state in ('ACTIVE','RELEASED')),
 reason text not null check(length(trim(reason)) between 3 and 1000),
 started_by uuid not null references kxra.account_identities(account_id),
 started_at timestamptz not null default now(),
 released_by uuid references kxra.account_identities(account_id),
 released_at timestamptz,
 foreign key(org_id,pairing_id) references kxra.whatsapp_gateway_pairings(org_id,id),
 check((state='RELEASED')=(released_at is not null))
);

create table kxra.whatsapp_outbound_intents(
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null references kxra.organisations(id),
 pairing_id uuid not null references kxra.whatsapp_gateway_pairings(id),
 message_id uuid not null unique references kxra.whatsapp_messages(id),
 project_id uuid not null,
 pairing_version integer not null check(pairing_version>0),
 project_access_version integer not null check(project_access_version>0),
 response_sha256 text not null check(response_sha256~'^[a-f0-9]{64}$'),
 response_reference text not null check(length(trim(response_reference)) between 1 and 500),
 adapter text not null default 'DISABLED' check(adapter='DISABLED'),
 state text not null default 'HELD'
  check(state in ('HELD','READY','CANCELLED','AMBIGUOUS','SENT')),
 delivery_state text not null default 'NOT_SENT'
  check(delivery_state in ('NOT_SENT','AMBIGUOUS','DELIVERED','FAILED')),
 idempotency_key uuid not null unique,
 authorization_checked_at timestamptz,
 cancellation_code text check(cancellation_code is null or cancellation_code in (
  'PAIRING_REVOKED','ACCOUNT_UNAVAILABLE','PROJECT_UNAVAILABLE','TAKEOVER_ACTIVE',
  'ADAPTER_DISABLED','STALE_CONTEXT'
 )),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 foreign key(org_id,pairing_id) references kxra.whatsapp_gateway_pairings(org_id,id),
 foreign key(org_id,message_id) references kxra.whatsapp_messages(org_id,id),
 foreign key(org_id,project_id) references kxra.projects(org_id,id),
 check(adapter='DISABLED' and state<>'SENT' and delivery_state<>'DELIVERED')
);

create index whatsapp_challenges_actor on kxra.whatsapp_pairing_challenges(org_id,account_id,state);
create index whatsapp_pairings_actor on kxra.whatsapp_gateway_pairings(org_id,account_id,state);
create unique index whatsapp_active_phone_pairing
 on kxra.whatsapp_gateway_pairings(waba_id,phone_number_id,phone_digest)
 where state='ACTIVE';
create unique index whatsapp_active_selection on kxra.whatsapp_project_selections(pairing_id)
 where state='ACTIVE';
create unique index whatsapp_selection_request
 on kxra.whatsapp_project_selections(org_id,account_id,request_id);
create unique index whatsapp_active_takeover on kxra.whatsapp_takeovers(pairing_id)
 where state='ACTIVE';
create index whatsapp_ingress_pairing on kxra.whatsapp_ingress_events(pairing_id,received_at desc);
create index whatsapp_messages_project on kxra.whatsapp_messages(org_id,project_id,created_at desc);
create index whatsapp_outbound_state on kxra.whatsapp_outbound_intents(state,created_at);

alter table kxra.whatsapp_pairing_challenges enable row level security;
alter table kxra.whatsapp_gateway_pairings enable row level security;
alter table kxra.whatsapp_project_selections enable row level security;
alter table kxra.whatsapp_ingress_events enable row level security;
alter table kxra.whatsapp_messages enable row level security;
alter table kxra.whatsapp_media_items enable row level security;
alter table kxra.whatsapp_takeovers enable row level security;
alter table kxra.whatsapp_outbound_intents enable row level security;

create policy whatsapp_challenge_read on kxra.whatsapp_pairing_challenges for select using(
 org_id=kxra_private.member_org() and (account_id=auth.uid() or kxra_private.is_owner(org_id))
);
create policy whatsapp_pairing_read on kxra.whatsapp_gateway_pairings for select using(
 org_id=kxra_private.member_org() and (account_id=auth.uid() or kxra_private.is_owner(org_id))
);
create policy whatsapp_selection_read on kxra.whatsapp_project_selections for select using(
 org_id=kxra_private.member_org() and (account_id=auth.uid() or kxra_private.is_owner(org_id))
 and kxra_private.can_project(project_id,false)
);
create policy whatsapp_message_read on kxra.whatsapp_messages for select using(
 org_id=kxra_private.member_org() and (account_id=auth.uid() or kxra_private.is_owner(org_id))
 and (project_id is null or kxra_private.can_project(project_id,false))
);
create policy whatsapp_media_read on kxra.whatsapp_media_items for select using(exists(
 select 1 from kxra.whatsapp_messages m where m.id=message_id
  and m.org_id=kxra_private.member_org()
  and (m.account_id=auth.uid() or kxra_private.is_owner(m.org_id))
  and (m.project_id is null or kxra_private.can_project(m.project_id,false))
));
create policy whatsapp_outbound_read on kxra.whatsapp_outbound_intents for select using(exists(
 select 1 from kxra.whatsapp_gateway_pairings p where p.id=pairing_id
  and p.org_id=kxra_private.member_org()
  and (p.account_id=auth.uid() or kxra_private.is_owner(p.org_id))
  and kxra_private.can_project(project_id,false)
));
create policy whatsapp_ingress_owner_read on kxra.whatsapp_ingress_events for select using(
 kxra_private.is_owner(org_id)
);
create policy whatsapp_takeover_owner_read on kxra.whatsapp_takeovers for select using(
 kxra_private.is_owner(org_id)
);

grant select on kxra.whatsapp_pairing_challenges,kxra.whatsapp_gateway_pairings,
 kxra.whatsapp_project_selections,kxra.whatsapp_ingress_events,kxra.whatsapp_messages,
 kxra.whatsapp_media_items,kxra.whatsapp_takeovers,kxra.whatsapp_outbound_intents
to authenticated,anon;

commit;
