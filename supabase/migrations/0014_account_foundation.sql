begin;

-- Phase 2 account foundation. Passwords and MFA secrets remain in the Auth
-- provider. These tables store only KXRA lifecycle and provider-safe evidence.
create table kxra.profiles(
 user_id uuid primary key,
 org_id uuid not null references kxra.organisations(id),
 email_digest text check(email_digest is null or email_digest~'^[a-f0-9]{64}$'),
 first_name text check(first_name is null or length(trim(first_name)) between 1 and 100),
 last_name text check(last_name is null or length(trim(last_name)) between 1 and 100),
 job_title text check(job_title is null or length(trim(job_title)) between 1 and 160),
 company text check(company is null or length(trim(company)) between 1 and 200),
 phone text check(phone is null or length(trim(phone)) between 3 and 40),
 profile_image_key text check(profile_image_key is null or length(profile_image_key)<=500),
 account_state text not null check(account_state in (
  'INVITED','REGISTERED','EMAIL_VERIFIED','ONBOARDING','ACTIVE','SUSPENDED','REVOKED'
 )),
 status_reason text check(status_reason is null or length(status_reason)<=1000),
 email_verified_at timestamptz,
 onboarding_completed_at timestamptz,
 mfa_state text not null default 'NOT_ENROLLED' check(mfa_state in (
  'NOT_ENROLLED','ENROLLING','ENROLLED','RECOVERY_REQUIRED'
 )),
 provider_factor_ref text check(provider_factor_ref is null or length(provider_factor_ref)<=240),
 session_version integer not null default 1 check(session_version>0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(org_id,user_id),
 check(account_state<>'ACTIVE' or onboarding_completed_at is not null),
 check(email_verified_at is not null or account_state in ('INVITED','REGISTERED','SUSPENDED','REVOKED'))
);

-- Existing local members predate the account lifecycle. Preserve them as
-- completed accounts; fresh fixtures are inserted by the seed helper.
insert into kxra.profiles(
 user_id,org_id,first_name,last_name,account_state,email_verified_at,
 onboarding_completed_at,mfa_state
)
select id,org_id,display_name,'Fixture','ACTIVE',now(),now(),
 case when role='owner' then 'ENROLLED' else 'NOT_ENROLLED' end
from kxra.members
on conflict(user_id) do nothing;

alter table kxra.invitations drop constraint if exists invitations_state_check;
alter table kxra.invitations drop constraint if exists invitations_check;
alter table kxra.invitations alter column state drop default;
update kxra.invitations set state=upper(state);
alter table kxra.invitations alter column state set default 'PENDING';
alter table kxra.invitations add column recipient_email text;
alter table kxra.invitations add column note text check(note is null or length(note)<=2000);
alter table kxra.invitations add column version integer not null default 1 check(version>0);
alter table kxra.invitations add column sent_at timestamptz;
alter table kxra.invitations add column delivery_error text check(delivery_error is null or length(delivery_error)<=1000);
alter table kxra.invitations add column revoked_at timestamptz;
alter table kxra.invitations add column updated_at timestamptz not null default now();
alter table kxra.invitations add constraint invitations_state_check check(
 state in ('PENDING','SENT','DELIVERY_FAILED','REDEEMED','EXPIRED','REVOKED')
);
alter table kxra.invitations add constraint invitations_lifecycle_check check(
 (state='REDEEMED' and redeemed_by is not null and redeemed_at is not null) or
 (state<>'REDEEMED' and redeemed_by is null and redeemed_at is null)
);
alter table kxra.invitations add constraint invitations_recipient_check check(
 recipient_email is null or (
  recipient_email=lower(trim(recipient_email)) and
  recipient_email~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
 )
);
alter table kxra.invitations add constraint invitations_org_id_id_key unique(org_id,id);

create table kxra.invitation_project_grants(
 invitation_id uuid not null,
 org_id uuid not null,
 project_id uuid not null,
 role text not null check(role in ('viewer','contributor')),
 membership_expires_at timestamptz,
 created_at timestamptz not null default now(),
 primary key(invitation_id,project_id),
 foreign key(org_id,invitation_id) references kxra.invitations(org_id,id) on delete cascade,
 foreign key(org_id,project_id) references kxra.projects(org_id,id),
 check(membership_expires_at is null or membership_expires_at>created_at)
);
insert into kxra.invitation_project_grants(invitation_id,org_id,project_id,role)
select id,org_id,project_id,role from kxra.invitations
on conflict do nothing;

create table kxra.onboarding_progress(
 user_id uuid primary key,
 org_id uuid not null,
 current_step integer not null default 1 check(current_step between 1 and 9),
 completed_steps integer[] not null default '{}'::integer[],
 whatsapp_choice text check(whatsapp_choice is null or whatsapp_choice in ('SKIP','CONNECT_LATER','CONNECTED')),
 started_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 completed_at timestamptz,
 foreign key(org_id,user_id) references kxra.profiles(org_id,user_id),
 check(completed_steps<@array[1,2,3,4,5,6,7,8,9]),
 check(completed_at is null or (current_step=9 and completed_steps@>array[1,2,3,4,5,6,7,8,9]))
);

create table kxra.user_preferences(
 user_id uuid primary key,
 org_id uuid not null,
 timezone text not null default 'Europe/London' check(length(timezone) between 1 and 100),
 email_notifications boolean not null default true,
 whatsapp_notifications boolean not null default false,
 security_alerts boolean not null default true check(security_alerts),
 display_density text not null default 'comfortable' check(display_density in ('comfortable','compact')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 foreign key(org_id,user_id) references kxra.profiles(org_id,user_id)
);

create table kxra.agreement_documents(
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null references kxra.organisations(id),
 document_key text not null check(document_key in ('terms','privacy','required_agreement')),
 version integer not null check(version>0),
 title text not null check(length(trim(title)) between 1 and 240),
 body text not null check(length(trim(body)) between 1 and 50000),
 status text not null check(status in ('APPROVED','UNAPPROVED_PLACEHOLDER','RETIRED')),
 required boolean not null default true,
 effective_at timestamptz,
 created_at timestamptz not null default now(),
 unique(org_id,document_key,version),
 check(status<>'APPROVED' or effective_at is not null)
);

create table kxra.agreement_acceptances(
 user_id uuid not null,
 org_id uuid not null,
 agreement_id uuid not null references kxra.agreement_documents(id),
 agreement_version integer not null,
 accepted_at timestamptz not null default now(),
 request_id uuid not null default gen_random_uuid(),
 primary key(user_id,agreement_id,agreement_version),
 foreign key(org_id,user_id) references kxra.profiles(org_id,user_id)
);

create table kxra.session_revocations(
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null,
 user_id uuid not null,
 requested_by uuid not null,
 reason text not null check(length(trim(reason)) between 1 and 1000),
 provider_state text not null check(provider_state in (
  'LOCAL_APPLIED','PROVIDER_PENDING','PROVIDER_CONFIRMED','FAILED'
 )),
 requested_at timestamptz not null default now(),
 completed_at timestamptz,
 provider_reference text check(provider_reference is null or length(provider_reference)<=240),
 foreign key(org_id,user_id) references kxra.profiles(org_id,user_id)
);

create table kxra.transactional_email_outbox(
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null references kxra.organisations(id),
 invitation_id uuid references kxra.invitations(id),
 user_id uuid,
 template_key text not null check(template_key in (
  'PARTNER_INVITATION','INVITATION_REMINDER','PASSWORD_RESET','EMAIL_VERIFICATION',
  'WELCOME','SECURITY_ALERT','PROJECT_ASSIGNMENT','ACCESS_REMOVED','APPROVAL_REQUIRED'
 )),
 template_version integer not null default 1 check(template_version>0),
 recipient_digest text not null check(recipient_digest~'^[a-f0-9]{64}$'),
 recipient_hint text not null check(length(recipient_hint) between 3 and 120),
 payload jsonb not null check(jsonb_typeof(payload)='object'),
 operation_key text not null unique check(length(operation_key) between 8 and 240),
 state text not null default 'PENDING' check(state in (
  'PENDING','SENT','DELIVERY_FAILED','CANCELLED','BOUNCED'
 )),
 attempt_count integer not null default 0 check(attempt_count>=0),
 provider_message_id text,
 last_error text check(last_error is null or length(last_error)<=1000),
 next_attempt_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 foreign key(org_id,user_id) references kxra.profiles(org_id,user_id)
);

create table kxra.account_security_events(
 id bigint generated always as identity primary key,
 org_id uuid not null references kxra.organisations(id),
 user_id uuid,
 actor_id uuid,
 event_type text not null check(event_type in (
  'REGISTERED','EMAIL_VERIFIED','INVITATION_REDEEMED','ONBOARDING_COMPLETED',
  'PROFILE_UPDATED','PREFERENCES_UPDATED','PASSWORD_CHANGED','PASSWORD_RESET_REQUESTED',
  'MFA_STATE_CHANGED','SESSIONS_REVOKED','ACCOUNT_SUSPENDED','ACCOUNT_REACTIVATED',
  'ACCOUNT_REVOKED','INVITATION_REVOKED','INVITATION_RESENT'
 )),
 metadata jsonb not null default '{}'::jsonb check(jsonb_typeof(metadata)='object'),
 created_at timestamptz not null default now(),
 foreign key(org_id,user_id) references kxra.profiles(org_id,user_id)
);

create index profiles_org_state on kxra.profiles(org_id,account_state);
create index invitation_grants_project on kxra.invitation_project_grants(org_id,project_id);
create index onboarding_org on kxra.onboarding_progress(org_id,user_id);
create index agreement_documents_current on kxra.agreement_documents(org_id,document_key,status);
create index agreement_acceptances_agreement on kxra.agreement_acceptances(agreement_id);
create index session_revocations_user on kxra.session_revocations(org_id,user_id,requested_at desc);
create index email_outbox_state on kxra.transactional_email_outbox(org_id,state,created_at);
create index email_outbox_invitation on kxra.transactional_email_outbox(invitation_id);
create index security_events_user on kxra.account_security_events(org_id,user_id,created_at desc);

create or replace function kxra_private.account_org() returns uuid
language sql stable security definer set search_path='' as $$
 select org_id from kxra.profiles
 where user_id=auth.uid() and account_state not in ('SUSPENDED','REVOKED')
$$;
create or replace function kxra_private.is_owner(o uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(
  select 1 from kxra.members m join kxra.profiles p on p.user_id=m.id and p.org_id=m.org_id
  where m.id=auth.uid() and m.org_id=o and m.active and m.role='owner' and p.account_state='ACTIVE'
 )
$$;
create or replace function kxra_private.member_org() returns uuid
language sql stable security definer set search_path='' as $$
 select m.org_id from kxra.members m join kxra.profiles p on p.user_id=m.id and p.org_id=m.org_id
 where m.id=auth.uid() and m.active and p.account_state='ACTIVE'
$$;
create or replace function kxra_private.can_project(p uuid,write_access boolean default false) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(
  select 1 from kxra.projects pr
  join kxra.members m on m.org_id=pr.org_id and m.id=auth.uid() and m.active
  join kxra.profiles profile on profile.user_id=m.id and profile.org_id=m.org_id and profile.account_state='ACTIVE'
  where pr.id=p and (
   m.role='owner' or exists(
    select 1 from kxra.project_memberships pm
    where pm.project_id=p and pm.user_id=m.id and pm.active
     and (pm.expires_at is null or pm.expires_at>now())
     and (not write_access or pm.role='contributor')
   )
  )
 )
$$;

alter table kxra.profiles enable row level security;
alter table kxra.invitation_project_grants enable row level security;
alter table kxra.onboarding_progress enable row level security;
alter table kxra.user_preferences enable row level security;
alter table kxra.agreement_documents enable row level security;
alter table kxra.agreement_acceptances enable row level security;
alter table kxra.session_revocations enable row level security;
alter table kxra.transactional_email_outbox enable row level security;
alter table kxra.account_security_events enable row level security;

grant select on kxra.profiles,kxra.invitation_project_grants,kxra.onboarding_progress,
 kxra.user_preferences,kxra.agreement_documents,kxra.agreement_acceptances,
 kxra.session_revocations,kxra.transactional_email_outbox,kxra.account_security_events
to authenticated,anon;

create policy profiles_read on kxra.profiles for select using(
 user_id=auth.uid() or kxra_private.is_owner(org_id)
);
create policy invitation_grants_read on kxra.invitation_project_grants for select using(
 kxra_private.is_owner(org_id) or exists(
  select 1 from kxra.invitations i
  where i.id=invitation_id and i.redeemed_by=auth.uid() and i.state='REDEEMED'
 )
);
create policy onboarding_read on kxra.onboarding_progress for select using(
 user_id=auth.uid() or kxra_private.is_owner(org_id)
);
create policy preferences_read on kxra.user_preferences for select using(
 user_id=auth.uid() or kxra_private.is_owner(org_id)
);
create policy agreement_documents_read on kxra.agreement_documents for select using(
 (org_id=kxra_private.account_org() and status<>'RETIRED') or kxra_private.is_owner(org_id)
);
create policy agreement_acceptances_read on kxra.agreement_acceptances for select using(
 user_id=auth.uid() or kxra_private.is_owner(org_id)
);
create policy session_revocations_read on kxra.session_revocations for select using(
 user_id=auth.uid() or kxra_private.is_owner(org_id)
);
create policy email_outbox_owner_read on kxra.transactional_email_outbox for select using(
 kxra_private.is_owner(org_id)
);
create policy security_events_read on kxra.account_security_events for select using(
 user_id=auth.uid() or kxra_private.is_owner(org_id)
);

revoke all on all functions in schema kxra_private from public;
grant execute on function kxra_private.account_org(),kxra_private.is_owner(uuid),
 kxra_private.member_org(),kxra_private.can_project(uuid,boolean)
to authenticated,anon;

commit;
