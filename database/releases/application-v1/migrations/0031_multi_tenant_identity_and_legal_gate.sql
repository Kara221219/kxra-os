begin;

-- Slice 1 identity boundary. Legacy members/profiles remain as a compatibility
-- projection while this normalized model becomes the authorization source.
alter table kxra.organisations
 add column slug text,
 add column organisation_kind text not null default 'CUSTOMER'
  check(organisation_kind in ('KXRA','CUSTOMER')),
 add column state text not null default 'ACTIVE'
  check(state in ('ACTIVE','SUSPENDED','CLOSED')),
 add column relationship_type text not null default 'CUSTOMER'
  check(relationship_type in ('INTERNAL','PARTNER','CUSTOMER','CLIENT')),
 add column jurisdiction text not null default 'GB',
 add column timezone text not null default 'Europe/London',
 add column created_provenance jsonb not null default '{}'::jsonb
  check(jsonb_typeof(created_provenance)='object'),
 add column updated_at timestamptz not null default now();

update kxra.organisations set
 slug=case when id='10000000-0000-4000-8000-000000000001'::uuid
  then 'kxra-group' else 'organisation-'||left(replace(id::text,'-',''),12) end,
 organisation_kind=case when id='10000000-0000-4000-8000-000000000001'::uuid
  then 'KXRA' else organisation_kind end,
 relationship_type=case when id='10000000-0000-4000-8000-000000000001'::uuid
  then 'INTERNAL' else relationship_type end,
 created_provenance=case when id='10000000-0000-4000-8000-000000000001'::uuid
  then '{"source":"GENESIS_SEED"}'::jsonb else created_provenance end
where slug is null;

create function kxra_private.organisation_defaults() returns trigger
language plpgsql set search_path='' as $$
begin
 if new.slug is null or trim(new.slug)='' then
  new.slug='organisation-'||left(replace(new.id::text,'-',''),12);
 end if;
 new.slug=lower(trim(new.slug));
 new.updated_at=now();
 return new;
end $$;
create trigger organisation_defaults before insert or update on kxra.organisations
for each row execute function kxra_private.organisation_defaults();
alter table kxra.organisations alter column slug set not null;
alter table kxra.organisations add constraint organisations_slug_format
 check(slug~'^[a-z0-9]+(?:-[a-z0-9]+)*$' and length(slug) between 3 and 80);
create unique index organisations_slug_unique on kxra.organisations(slug);

create table kxra.account_identities(
 account_id uuid primary key,
 auth_provider text not null default 'SUPABASE'
  check(auth_provider in ('SUPABASE','LOCAL_FAKE','FIXTURE')),
 auth_subject text not null check(length(auth_subject) between 1 and 240),
 email_digest text check(email_digest is null or email_digest~'^[a-f0-9]{64}$'),
 display_email text check(display_email is null or (
  display_email=lower(trim(display_email)) and length(display_email)<=320
  and display_email~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
 )),
 state text not null default 'REGISTERED' check(state in (
  'INVITED','REGISTERED','EMAIL_VERIFIED','ONBOARDING','ACTIVE','SUSPENDED','REVOKED'
 )),
 email_verified_at timestamptz,
 session_version integer not null default 1 check(session_version>0),
 last_authenticated_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(auth_provider,auth_subject)
);

create table kxra.organisation_memberships(
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null references kxra.organisations(id),
 account_id uuid not null references kxra.account_identities(account_id),
 security_role text not null check(security_role in (
  'KXRA_OWNER','KXRA_STAFF','ORG_ADMIN','ORG_MEMBER'
 )),
 relationship_type text not null check(relationship_type in (
  'INTERNAL','PARTNER','CUSTOMER','CLIENT'
 )),
 state text not null default 'ACTIVE' check(state in (
  'INVITED','ACTIVE','SUSPENDED','REVOKED','EXPIRED'
 )),
 display_name text not null check(length(trim(display_name)) between 1 and 160),
 invited_by uuid references kxra.account_identities(account_id),
 grant_source text not null default 'MIGRATION'
  check(length(trim(grant_source)) between 1 and 120),
 starts_at timestamptz not null default now(),
 expires_at timestamptz,
 revoked_at timestamptz,
 version integer not null default 1 check(version>0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(org_id,account_id),
 unique(org_id,id),
 check(expires_at is null or expires_at>starts_at),
 check((state='REVOKED')=(revoked_at is not null))
);
create index organisation_memberships_account
 on kxra.organisation_memberships(account_id,state,org_id);

create table kxra.active_context_events(
 id bigint generated always as identity primary key,
 account_id uuid not null references kxra.account_identities(account_id),
 membership_id uuid not null references kxra.organisation_memberships(id),
 org_id uuid not null references kxra.organisations(id),
 request_id uuid not null,
 source text not null check(source in ('LOGIN','USER_SELECTION','INVITATION','SESSION_RESTORE')),
 selected_at timestamptz not null default now(),
 unique(account_id,request_id),
 foreign key(org_id,membership_id) references kxra.organisation_memberships(org_id,id)
);
create index active_context_events_account on kxra.active_context_events(account_id,selected_at desc);

create table kxra.capability_grants(
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null references kxra.organisations(id),
 membership_id uuid not null references kxra.organisation_memberships(id),
 capability text not null check(capability~'^[a-z][a-z0-9]*(?:[.:_-][a-z0-9]+)*$'),
 resource_type text not null check(resource_type in ('ORGANISATION','PROJECT','TOOL','SYSTEM')),
 resource_id uuid,
 state text not null default 'ACTIVE' check(state in ('ACTIVE','REVOKED','EXPIRED')),
 issued_by uuid references kxra.account_identities(account_id),
 policy_version integer not null default 1 check(policy_version>0),
 reason text not null check(length(trim(reason)) between 1 and 1000),
 starts_at timestamptz not null default now(),
 expires_at timestamptz,
 revoked_at timestamptz,
 created_at timestamptz not null default now(),
 unique(org_id,membership_id,capability,resource_type,resource_id,starts_at),
 check(expires_at is null or expires_at>starts_at),
 check((state='REVOKED')=(revoked_at is not null))
);

insert into kxra.account_identities(
 account_id,auth_subject,email_digest,state,email_verified_at,session_version,created_at,updated_at
)
select coalesce(p.user_id,m.id),coalesce(p.user_id,m.id)::text,p.email_digest,
 coalesce(p.account_state,case when m.active then 'ACTIVE' else 'REVOKED' end),
 p.email_verified_at,coalesce(p.session_version,1),
 coalesce(p.created_at,now()),coalesce(p.updated_at,now())
from kxra.members m
left join kxra.profiles p on p.user_id=m.id and p.org_id=m.org_id
on conflict(account_id) do update set
 email_digest=coalesce(excluded.email_digest,kxra.account_identities.email_digest),
 state=excluded.state,email_verified_at=excluded.email_verified_at,
 session_version=excluded.session_version,updated_at=excluded.updated_at;

insert into kxra.organisation_memberships(
 org_id,account_id,security_role,relationship_type,state,display_name,
 grant_source,starts_at,revoked_at
)
select m.org_id,m.id,
 case when m.role='owner' then 'KXRA_OWNER' else 'ORG_MEMBER' end,
 case when m.role='owner' then 'INTERNAL' else 'PARTNER' end,
 case when m.active then 'ACTIVE' else 'REVOKED' end,
 m.display_name,'LEGACY_BACKFILL',now(),case when m.active then null else now() end
from kxra.members m
on conflict(org_id,account_id) do nothing;

create function kxra_private.sync_legacy_member_identity() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 insert into kxra.account_identities(account_id,auth_subject,state)
 values(new.id,new.id::text,case when new.active then 'ACTIVE' else 'REVOKED' end)
 on conflict(account_id) do update set updated_at=now();
 insert into kxra.organisation_memberships(
  org_id,account_id,security_role,relationship_type,state,display_name,
  grant_source,starts_at,revoked_at,version
 ) values(
  new.org_id,new.id,
  case when new.role='owner' then 'KXRA_OWNER' else 'ORG_MEMBER' end,
  case when new.role='owner' then 'INTERNAL' else 'PARTNER' end,
  case when new.active then 'ACTIVE' else 'REVOKED' end,
  new.display_name,'LEGACY_SYNC',now(),case when new.active then null else now() end,
  new.access_version
 ) on conflict(org_id,account_id) do update set
  security_role=excluded.security_role,relationship_type=excluded.relationship_type,
  state=excluded.state,display_name=excluded.display_name,
  revoked_at=excluded.revoked_at,version=excluded.version,updated_at=now();
 return new;
end $$;
create trigger sync_legacy_member_identity after insert or update on kxra.members
for each row execute function kxra_private.sync_legacy_member_identity();

create function kxra_private.sync_legacy_profile_identity() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 insert into kxra.account_identities(
  account_id,auth_subject,email_digest,state,email_verified_at,session_version
 ) values(
  new.user_id,new.user_id::text,new.email_digest,new.account_state,
  new.email_verified_at,new.session_version
 ) on conflict(account_id) do update set
  email_digest=coalesce(excluded.email_digest,kxra.account_identities.email_digest),
  state=excluded.state,email_verified_at=excluded.email_verified_at,
  session_version=excluded.session_version,updated_at=now();
 return new;
end $$;
create trigger sync_legacy_profile_identity after insert or update on kxra.profiles
for each row execute function kxra_private.sync_legacy_profile_identity();

alter table kxra.project_memberships
 drop constraint if exists project_memberships_org_id_user_id_fkey;
alter table kxra.project_memberships
 add constraint project_memberships_normalized_membership_fkey
 foreign key(org_id,user_id)
 references kxra.organisation_memberships(org_id,account_id);

-- Versioned legal documents are separate from the old onboarding placeholder
-- acknowledgement. Only an APPROVED exact version can become a requirement.
create table kxra.legal_documents(
 id uuid not null default gen_random_uuid(),
 org_id uuid not null references kxra.organisations(id),
 document_type text not null check(document_type in (
  'NDA','TERMS','PRIVACY','COOKIE','DATA_PROCESSING','CUSTOM_PROJECT','OTHER'
 )),
 audience text not null check(audience in (
  'ALL','PARTNER','CUSTOMER','CLIENT','STAFF'
 )),
 jurisdiction text not null default 'GB' check(length(jurisdiction) between 2 and 20),
 version integer not null check(version>0),
 title text not null check(length(trim(title)) between 1 and 240),
 rendered_content text not null check(length(rendered_content) between 1 and 200000),
 content_sha256 text not null check(content_sha256~'^[a-f0-9]{64}$'),
 immutable_object_key text check(immutable_object_key is null or length(immutable_object_key)<=500),
 status text not null check(status in (
  'DRAFT','APPROVED','UNAPPROVED_PLACEHOLDER','RETIRED'
 )),
 effective_at timestamptz,
 retired_at timestamptz,
 legal_reviewer_reference text check(legal_reviewer_reference is null or length(legal_reviewer_reference)<=500),
 created_by uuid references kxra.account_identities(account_id),
 created_at timestamptz not null default now(),
 primary key(id,version),
 unique(org_id,document_type,audience,jurisdiction,version),
 unique(org_id,id,version,content_sha256),
 check(status<>'APPROVED' or (
  effective_at is not null and legal_reviewer_reference is not null
  and immutable_object_key is not null
 )),
 check(status<>'RETIRED' or retired_at is not null)
);

create table kxra.legal_document_requirements(
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null references kxra.organisations(id),
 membership_id uuid references kxra.organisation_memberships(id),
 relationship_type text check(relationship_type is null or relationship_type in (
  'INTERNAL','PARTNER','CUSTOMER','CLIENT'
 )),
 plan_scope text check(plan_scope is null or length(plan_scope)<=120),
 document_id uuid not null,
 document_version integer not null,
 document_sha256 text not null check(document_sha256~'^[a-f0-9]{64}$'),
 mandatory boolean not null default true,
 state text not null default 'DRAFT' check(state in ('DRAFT','ACTIVE','RETIRED')),
 acceptance_wording text not null check(length(trim(acceptance_wording)) between 1 and 2000),
 acceptance_wording_version integer not null check(acceptance_wording_version>0),
 acceptance_wording_sha256 text not null check(acceptance_wording_sha256~'^[a-f0-9]{64}$'),
 effective_at timestamptz,
 retired_at timestamptz,
 created_by uuid references kxra.account_identities(account_id),
 created_at timestamptz not null default now(),
 foreign key(org_id,document_id,document_version,document_sha256)
  references kxra.legal_documents(org_id,id,version,content_sha256),
 check(state<>'ACTIVE' or effective_at is not null),
 check(state<>'RETIRED' or retired_at is not null)
);
create index legal_requirements_gate on kxra.legal_document_requirements(org_id,state,mandatory);

create function kxra_private.validate_legal_requirement() returns trigger
language plpgsql set search_path='' as $$
declare document_state text;
begin
 if new.acceptance_wording_sha256<>
  encode(sha256(convert_to(new.acceptance_wording,'UTF8')),'hex')
 then raise exception 'Acceptance wording hash mismatch';end if;
 if new.state='ACTIVE' then
  select status into document_state from kxra.legal_documents
  where org_id=new.org_id and id=new.document_id and version=new.document_version
   and content_sha256=new.document_sha256;
  if document_state is distinct from 'APPROVED'
  then raise exception 'Only an approved legal document can be required';end if;
 end if;
 return new;
end $$;
create trigger validate_legal_requirement before insert or update
on kxra.legal_document_requirements for each row
execute function kxra_private.validate_legal_requirement();

create table kxra.legal_presentations(
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null references kxra.organisations(id),
 account_id uuid not null references kxra.account_identities(account_id),
 membership_id uuid not null references kxra.organisation_memberships(id),
 requirement_id uuid not null references kxra.legal_document_requirements(id),
 document_id uuid not null,
 document_version integer not null,
 document_sha256 text not null check(document_sha256~'^[a-f0-9]{64}$'),
 acceptance_wording text not null,
 acceptance_wording_version integer not null,
 acceptance_wording_sha256 text not null check(acceptance_wording_sha256~'^[a-f0-9]{64}$'),
 immutable_snapshot jsonb not null check(jsonb_typeof(immutable_snapshot)='object'),
 user_agent_digest text check(user_agent_digest is null or user_agent_digest~'^[a-f0-9]{64}$'),
 ip_digest text check(ip_digest is null or ip_digest~'^[a-f0-9]{64}$'),
 presented_at timestamptz not null default now(),
 unique(account_id,membership_id,requirement_id,document_id,document_version,document_sha256),
 foreign key(org_id,document_id,document_version,document_sha256)
  references kxra.legal_documents(org_id,id,version,content_sha256)
);

create table kxra.legal_acceptances(
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null references kxra.organisations(id),
 account_id uuid not null references kxra.account_identities(account_id),
 membership_id uuid not null references kxra.organisation_memberships(id),
 requirement_id uuid not null references kxra.legal_document_requirements(id),
 presentation_id uuid not null unique references kxra.legal_presentations(id),
 document_id uuid not null,
 document_version integer not null,
 document_sha256 text not null check(document_sha256~'^[a-f0-9]{64}$'),
 response text not null check(response in ('ACCEPTED','DECLINED')),
 acceptance_wording text not null,
 acceptance_wording_version integer not null,
 acceptance_wording_sha256 text not null check(acceptance_wording_sha256~'^[a-f0-9]{64}$'),
 request_id uuid not null unique,
 presented_at timestamptz not null,
 responded_at timestamptz not null default now(),
 immutable_audit jsonb not null check(jsonb_typeof(immutable_audit)='object'),
 foreign key(org_id,document_id,document_version,document_sha256)
  references kxra.legal_documents(org_id,id,version,content_sha256),
 unique(account_id,membership_id,requirement_id,document_id,document_version,response)
);
create index legal_acceptance_gate on kxra.legal_acceptances(
 account_id,membership_id,requirement_id,response
);

create table kxra.legal_reacknowledgements(
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null references kxra.organisations(id),
 account_id uuid not null references kxra.account_identities(account_id),
 membership_id uuid not null references kxra.organisation_memberships(id),
 requirement_id uuid not null references kxra.legal_document_requirements(id),
 reason text not null check(length(trim(reason)) between 1 and 1000),
 deadline timestamptz,
 state text not null default 'REQUIRED' check(state in ('REQUIRED','SATISFIED','WAIVED')),
 created_at timestamptz not null default now(),
 resolved_at timestamptz
);

create table kxra.release_manifests(
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null references kxra.organisations(id),
 release_name text not null check(length(trim(release_name)) between 1 and 160),
 release_version text not null check(length(trim(release_version)) between 1 and 80),
 legal_document_refs jsonb not null default '[]'::jsonb check(jsonb_typeof(legal_document_refs)='array'),
 commercial_configuration jsonb not null default '{}'::jsonb check(jsonb_typeof(commercial_configuration)='object'),
 support_channels jsonb not null default '{}'::jsonb check(jsonb_typeof(support_channels)='object'),
 state text not null default 'DRAFT' check(state in ('DRAFT','BLOCKED','READY','RELEASED')),
 legal_owner text check(legal_owner is null or length(legal_owner)<=240),
 commercial_owner text check(commercial_owner is null or length(commercial_owner)<=240),
 reviewed_at timestamptz,
 created_at timestamptz not null default now(),
 unique(org_id,release_version)
);

-- Preserve placeholder history, but deliberately create no active requirement.
insert into kxra.legal_documents(
 id,org_id,document_type,audience,jurisdiction,version,title,rendered_content,
 content_sha256,status,created_at
)
select id,org_id,
 case document_key when 'terms' then 'TERMS' when 'privacy' then 'PRIVACY' else 'NDA' end,
 'ALL','GB',version,title,body,
 encode(sha256(convert_to(body,'UTF8')),'hex'),'UNAPPROVED_PLACEHOLDER',created_at
from kxra.agreement_documents
on conflict(id,version) do nothing;

-- The tenant selector is request-local and is never read from JWT claims.
create function kxra_private.requested_org() returns uuid
language plpgsql stable security definer set search_path='' as $$
declare raw text=current_setting('request.kxra.org_id',true);
begin
 if raw is null or raw='' then return null;end if;
 if raw!~'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
 then return null;end if;
 return raw::uuid;
end $$;

create function kxra_private.has_active_membership(o uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(
  select 1 from kxra.account_identities a
  join kxra.organisation_memberships m on m.account_id=a.account_id
  join kxra.organisations organisation on organisation.id=m.org_id
  where a.account_id=auth.uid() and a.state not in ('SUSPENDED','REVOKED')
   and m.org_id=o and m.state='ACTIVE' and m.starts_at<=now()
   and (m.expires_at is null or m.expires_at>now()) and m.revoked_at is null
   and organisation.state='ACTIVE'
 )
$$;

create function kxra_private.legal_requirements_satisfied(o uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select not exists(
  select 1 from kxra.organisation_memberships m
  join kxra.legal_document_requirements r on r.org_id=m.org_id
   and r.state='ACTIVE' and r.mandatory
   and (r.membership_id is null or r.membership_id=m.id)
   and (r.relationship_type is null or r.relationship_type=m.relationship_type)
  join kxra.legal_documents d on d.org_id=r.org_id and d.id=r.document_id
   and d.version=r.document_version and d.content_sha256=r.document_sha256
   and d.status='APPROVED'
  where m.account_id=auth.uid() and m.org_id=o and m.state='ACTIVE'
   and not exists(
    select 1 from kxra.legal_acceptances a
    where a.account_id=m.account_id and a.membership_id=m.id
     and a.requirement_id=r.id and a.document_id=r.document_id
     and a.document_version=r.document_version
     and a.document_sha256=r.document_sha256 and a.response='ACCEPTED'
   )
 )
$$;

create function kxra_private.private_access_allowed(o uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select o is not null and o=kxra_private.requested_org()
  and kxra_private.has_active_membership(o)
  and exists(select 1 from kxra.account_identities where account_id=auth.uid() and state='ACTIVE')
  and kxra_private.legal_requirements_satisfied(o)
$$;

create or replace function kxra_private.account_org() returns uuid
language sql stable security definer set search_path='' as $$
 select o from (select kxra_private.requested_org() o) selected
 where kxra_private.has_active_membership(o)
$$;

create or replace function kxra_private.member_org() returns uuid
language sql stable security definer set search_path='' as $$
 select o from (select kxra_private.requested_org() o) selected
 where kxra_private.private_access_allowed(o)
$$;

create or replace function kxra_private.is_owner(o uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select kxra_private.private_access_allowed(o) and exists(
  select 1 from kxra.organisation_memberships m
  where m.account_id=auth.uid() and m.org_id=o and m.state='ACTIVE'
   and m.security_role in ('KXRA_OWNER','ORG_ADMIN')
   and (m.expires_at is null or m.expires_at>now())
 )
$$;

create function kxra_private.is_platform_owner() returns boolean
language sql stable security definer set search_path='' as $$
 select exists(
  select 1 from kxra.organisation_memberships m
  join kxra.organisations o on o.id=m.org_id and o.organisation_kind='KXRA'
  join kxra.account_identities a on a.account_id=m.account_id and a.state='ACTIVE'
  where m.account_id=auth.uid() and m.org_id=kxra_private.requested_org()
   and m.state='ACTIVE' and m.security_role='KXRA_OWNER'
   and (m.expires_at is null or m.expires_at>now())
   and kxra_private.legal_requirements_satisfied(m.org_id)
 )
$$;

create or replace function kxra_private.can_project(p uuid,write_access boolean default false)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(
  select 1 from kxra.projects project
  join kxra.organisation_memberships membership
   on membership.org_id=project.org_id and membership.account_id=auth.uid()
  where project.id=p and project.org_id=kxra_private.requested_org()
   and kxra_private.private_access_allowed(project.org_id)
   and membership.state='ACTIVE'
   and (membership.expires_at is null or membership.expires_at>now())
   and (
    membership.security_role in ('KXRA_OWNER','ORG_ADMIN') or exists(
     select 1 from kxra.project_memberships pm
     where pm.project_id=project.id and pm.org_id=project.org_id
      and pm.user_id=membership.account_id and pm.active
      and (pm.expires_at is null or pm.expires_at>now())
      and (not write_access or pm.role='contributor')
    )
   )
 )
$$;

create function kxra.select_organisation_context(o uuid,request uuid,selection_source text)
returns table(org_id uuid,membership_id uuid,security_role text,relationship_type text)
language plpgsql security definer set search_path='' as $$
declare membership kxra.organisation_memberships;
begin
 if request is null or selection_source not in ('LOGIN','USER_SELECTION','INVITATION','SESSION_RESTORE')
 then raise exception 'Organisation selection unavailable';end if;
 select * into membership from kxra.organisation_memberships m
 where m.account_id=auth.uid() and m.org_id=o and m.state='ACTIVE'
  and m.starts_at<=now() and (m.expires_at is null or m.expires_at>now())
  and m.revoked_at is null;
 if not found or not exists(
  select 1 from kxra.account_identities a where a.account_id=auth.uid()
   and a.state not in ('SUSPENDED','REVOKED')
 ) then raise exception 'Organisation selection unavailable';end if;
 insert into kxra.active_context_events(account_id,membership_id,org_id,request_id,source)
 values(auth.uid(),membership.id,membership.org_id,request,selection_source)
 on conflict(account_id,request_id) do nothing;
 return query select membership.org_id,membership.id,membership.security_role,membership.relationship_type;
end $$;

create function kxra.legal_gate_status()
returns table(allowed boolean,code text,missing_count integer)
language sql stable security definer set search_path='' as $$
 select
  kxra_private.private_access_allowed(kxra_private.requested_org()),
  case
   when not kxra_private.has_active_membership(kxra_private.requested_org()) then 'ACCESS_UNAVAILABLE'
   when not exists(select 1 from kxra.account_identities where account_id=auth.uid() and state='ACTIVE') then 'ACCOUNT_NOT_ACTIVE'
   when not kxra_private.legal_requirements_satisfied(kxra_private.requested_org()) then 'AGREEMENT_REQUIRED'
   else 'ALLOWED'
  end,
  (
   select count(*)::integer
   from kxra.organisation_memberships m
   join kxra.legal_document_requirements r on r.org_id=m.org_id
    and r.state='ACTIVE' and r.mandatory
    and (r.membership_id is null or r.membership_id=m.id)
    and (r.relationship_type is null or r.relationship_type=m.relationship_type)
   join kxra.legal_documents d on d.org_id=r.org_id and d.id=r.document_id
    and d.version=r.document_version and d.content_sha256=r.document_sha256
    and d.status='APPROVED'
   where m.account_id=auth.uid() and m.org_id=kxra_private.requested_org()
    and not exists(
     select 1 from kxra.legal_acceptances a
     where a.account_id=m.account_id and a.membership_id=m.id
      and a.requirement_id=r.id and a.document_id=r.document_id
      and a.document_version=r.document_version
      and a.document_sha256=r.document_sha256 and a.response='ACCEPTED'
    )
  )
$$;

create function kxra.present_required_legal_documents(agent_digest text,network_digest text)
returns table(
 presentation_id uuid,requirement_id uuid,document_id uuid,document_version integer,
 document_sha256 text,title text,rendered_content text,acceptance_wording text,
 acceptance_wording_version integer,acceptance_wording_sha256 text,presented_at timestamptz
)
language plpgsql security definer set search_path='' as $$
declare membership kxra.organisation_memberships;requirement record;
begin
 if (agent_digest is not null and agent_digest!~'^[a-f0-9]{64}$')
  or (network_digest is not null and network_digest!~'^[a-f0-9]{64}$')
 then raise exception 'Legal presentation unavailable';end if;
 select * into membership from kxra.organisation_memberships m
 where m.account_id=auth.uid() and m.org_id=kxra_private.requested_org()
  and m.state='ACTIVE' and (m.expires_at is null or m.expires_at>now())
  and m.revoked_at is null;
 if not found or not kxra_private.has_active_membership(membership.org_id)
 then raise exception 'Legal presentation unavailable';end if;
 for requirement in
  select r.*,d.title,d.rendered_content
  from kxra.legal_document_requirements r
  join kxra.legal_documents d on d.org_id=r.org_id and d.id=r.document_id
   and d.version=r.document_version and d.content_sha256=r.document_sha256
  where r.org_id=membership.org_id and r.state='ACTIVE' and r.mandatory
   and d.status='APPROVED'
   and (r.membership_id is null or r.membership_id=membership.id)
   and (r.relationship_type is null or r.relationship_type=membership.relationship_type)
   and not exists(
    select 1 from kxra.legal_acceptances a
    where a.account_id=membership.account_id and a.membership_id=membership.id
     and a.requirement_id=r.id and a.document_id=r.document_id
     and a.document_version=r.document_version
     and a.document_sha256=r.document_sha256 and a.response='ACCEPTED'
   )
  order by r.effective_at,r.id
 loop
  insert into kxra.legal_presentations(
   org_id,account_id,membership_id,requirement_id,document_id,document_version,
   document_sha256,acceptance_wording,acceptance_wording_version,
   acceptance_wording_sha256,immutable_snapshot,user_agent_digest,ip_digest
  ) values(
   membership.org_id,membership.account_id,membership.id,requirement.id,
   requirement.document_id,requirement.document_version,requirement.document_sha256,
   requirement.acceptance_wording,requirement.acceptance_wording_version,
   requirement.acceptance_wording_sha256,
   jsonb_build_object(
    'title',requirement.title,'rendered_content',requirement.rendered_content,
    'document_sha256',requirement.document_sha256,
    'acceptance_wording',requirement.acceptance_wording,
    'acceptance_wording_sha256',requirement.acceptance_wording_sha256
   ),agent_digest,network_digest
  ) on conflict(
   account_id,membership_id,requirement_id,document_id,document_version,document_sha256
  ) do nothing;
 end loop;
 return query
 select p.id,p.requirement_id,p.document_id,p.document_version,p.document_sha256,
  p.immutable_snapshot->>'title',p.immutable_snapshot->>'rendered_content',
  p.acceptance_wording,p.acceptance_wording_version,p.acceptance_wording_sha256,p.presented_at
 from kxra.legal_presentations p
 join kxra.legal_document_requirements r on r.id=p.requirement_id and r.state='ACTIVE'
 where p.account_id=membership.account_id and p.membership_id=membership.id
  and not exists(select 1 from kxra.legal_acceptances a where a.presentation_id=p.id)
 order by p.presented_at,p.id;
end $$;

create function kxra.record_legal_response(presentation uuid,accept boolean,request uuid)
returns table(response text,responded_at timestamptz)
language plpgsql security definer set search_path='' as $$
declare shown kxra.legal_presentations;requirement kxra.legal_document_requirements;result kxra.legal_acceptances;
begin
 select * into shown from kxra.legal_presentations p where p.id=presentation for update;
 select * into requirement from kxra.legal_document_requirements r where r.id=shown.requirement_id;
 if shown.id is null or shown.account_id<>auth.uid()
  or shown.org_id<>kxra_private.requested_org()
  or requirement.state<>'ACTIVE' or requirement.document_id<>shown.document_id
  or requirement.document_version<>shown.document_version
  or requirement.document_sha256<>shown.document_sha256 or request is null
 then raise exception 'Legal response unavailable';end if;
 insert into kxra.legal_acceptances(
  org_id,account_id,membership_id,requirement_id,presentation_id,
  document_id,document_version,document_sha256,response,
  acceptance_wording,acceptance_wording_version,acceptance_wording_sha256,
  request_id,presented_at,immutable_audit
 ) values(
  shown.org_id,shown.account_id,shown.membership_id,shown.requirement_id,shown.id,
  shown.document_id,shown.document_version,shown.document_sha256,
  case when accept then 'ACCEPTED' else 'DECLINED' end,
  shown.acceptance_wording,shown.acceptance_wording_version,shown.acceptance_wording_sha256,
  request,shown.presented_at,
  shown.immutable_snapshot||jsonb_build_object('response',case when accept then 'ACCEPTED' else 'DECLINED' end)
 ) on conflict(presentation_id) do nothing returning * into result;
 if result.id is null then
  select * into result from kxra.legal_acceptances a where a.presentation_id=shown.id;
 end if;
 if result.request_id<>request
 then raise exception 'Legal response already recorded';end if;
 insert into kxra.audit_events(org_id,actor_id,action,resource_id,metadata)
 values(shown.org_id,auth.uid(),'legal.'||lower(result.response),result.id,
  jsonb_build_object('document_id',shown.document_id,'document_version',shown.document_version,'document_sha256',shown.document_sha256));
 return query select result.response,result.responded_at;
end $$;

create function kxra.release_manifest_check(manifest uuid)
returns table(ready boolean,blockers text[])
language plpgsql stable security definer set search_path='' as $$
declare value kxra.release_manifests;problems text[]='{}'::text[];
begin
 select * into value from kxra.release_manifests where id=manifest;
 if not found or not kxra_private.is_owner(value.org_id)
 then raise exception 'Release manifest unavailable';end if;
 if exists(
  select 1 from jsonb_array_elements(value.legal_document_refs) item
  left join kxra.legal_documents d on d.org_id=value.org_id
   and d.id=(item->>'document_id')::uuid and d.version=(item->>'version')::integer
   and d.content_sha256=item->>'sha256'
  where d.id is null or d.status<>'APPROVED'
 ) then problems=array_append(problems,'LEGAL_DOCUMENT_UNAPPROVED_OR_HASH_MISMATCH');end if;
 if jsonb_array_length(value.legal_document_refs)=0
 then problems=array_append(problems,'LEGAL_DOCUMENTS_MISSING');end if;
 if value.commercial_configuration='{}'::jsonb
 then problems=array_append(problems,'COMMERCIAL_CONFIGURATION_MISSING');end if;
 if value.support_channels='{}'::jsonb
 then problems=array_append(problems,'SUPPORT_CHANNELS_MISSING');end if;
 if value.legal_owner is null or value.commercial_owner is null or value.reviewed_at is null
 then problems=array_append(problems,'OWNERS_OR_REVIEW_MISSING');end if;
 return query select cardinality(problems)=0,problems;
end $$;

-- Prevent mutation of exact legal evidence after it has been presented.
create function kxra_private.guard_legal_evidence() returns trigger
language plpgsql set search_path='' as $$
begin
 if tg_table_name='legal_documents' and exists(
  select 1 from kxra.legal_presentations p
  where p.document_id=old.id and p.document_version=old.version
 ) then raise exception 'Presented legal document is immutable';end if;
 if tg_table_name in ('legal_presentations','legal_acceptances')
 then raise exception 'Legal evidence is immutable';end if;
 return new;
end $$;
create trigger legal_document_immutable before update or delete on kxra.legal_documents
for each row execute function kxra_private.guard_legal_evidence();
create trigger legal_presentation_immutable before update or delete on kxra.legal_presentations
for each row execute function kxra_private.guard_legal_evidence();
create trigger legal_acceptance_immutable before update or delete on kxra.legal_acceptances
for each row execute function kxra_private.guard_legal_evidence();

alter table kxra.account_identities enable row level security;
alter table kxra.organisation_memberships enable row level security;
alter table kxra.active_context_events enable row level security;
alter table kxra.capability_grants enable row level security;
alter table kxra.legal_documents enable row level security;
alter table kxra.legal_document_requirements enable row level security;
alter table kxra.legal_presentations enable row level security;
alter table kxra.legal_acceptances enable row level security;
alter table kxra.legal_reacknowledgements enable row level security;
alter table kxra.release_manifests enable row level security;

grant select on kxra.account_identities,kxra.organisation_memberships,
 kxra.active_context_events,kxra.capability_grants,kxra.legal_documents,
 kxra.legal_document_requirements,kxra.legal_presentations,
 kxra.legal_acceptances,kxra.legal_reacknowledgements,kxra.release_manifests
to authenticated,anon;

create policy account_identities_read on kxra.account_identities for select using(
 account_id=auth.uid() or kxra_private.is_platform_owner()
);
create policy organisation_memberships_read on kxra.organisation_memberships for select using(
 account_id=auth.uid() or kxra_private.is_owner(org_id)
);
create policy active_context_events_read on kxra.active_context_events for select using(
 account_id=auth.uid() and kxra_private.private_access_allowed(org_id)
);
create policy capability_grants_read on kxra.capability_grants for select using(
 kxra_private.private_access_allowed(org_id) and (
  kxra_private.is_owner(org_id) or membership_id=(
   select m.id from kxra.organisation_memberships m
   where m.account_id=auth.uid() and m.org_id=capability_grants.org_id
  )
 )
);
create policy legal_documents_read on kxra.legal_documents for select using(
 kxra_private.has_active_membership(org_id) and status in ('APPROVED','RETIRED')
 or kxra_private.is_owner(org_id)
);
create policy legal_requirements_read on kxra.legal_document_requirements for select using(
 kxra_private.has_active_membership(org_id) and state in ('ACTIVE','RETIRED')
 or kxra_private.is_owner(org_id)
);
create policy legal_presentations_read on kxra.legal_presentations for select using(
 account_id=auth.uid() or kxra_private.is_owner(org_id)
);
create policy legal_acceptances_read on kxra.legal_acceptances for select using(
 account_id=auth.uid() or kxra_private.is_owner(org_id)
);
create policy legal_reacknowledgements_read on kxra.legal_reacknowledgements for select using(
 account_id=auth.uid() or kxra_private.is_owner(org_id)
);
create policy release_manifests_read on kxra.release_manifests for select using(
 kxra_private.is_owner(org_id)
);

drop policy org_read on kxra.organisations;
create policy org_read on kxra.organisations for select using(
 kxra_private.has_active_membership(id)
);

revoke all on function kxra_private.organisation_defaults(),
 kxra_private.sync_legacy_member_identity(),kxra_private.sync_legacy_profile_identity(),
 kxra_private.validate_legal_requirement(),kxra_private.guard_legal_evidence()
from public,authenticated,anon;
revoke all on function kxra_private.requested_org(),
 kxra_private.has_active_membership(uuid),kxra_private.legal_requirements_satisfied(uuid),
 kxra_private.private_access_allowed(uuid),kxra_private.is_platform_owner()
from public,authenticated,anon;
revoke all on function kxra.select_organisation_context(uuid,uuid,text),
 kxra.legal_gate_status(),kxra.present_required_legal_documents(text,text),
 kxra.record_legal_response(uuid,boolean,uuid),kxra.release_manifest_check(uuid)
from public;
grant execute on function kxra.select_organisation_context(uuid,uuid,text),
 kxra.legal_gate_status(),kxra.present_required_legal_documents(text,text),
 kxra.record_legal_response(uuid,boolean,uuid),kxra.release_manifest_check(uuid)
to authenticated;

-- Existing policies/functions call these helpers, so authenticated/anon need
-- EXECUTE while the bodies remain protected by SECURITY DEFINER.
grant execute on function kxra_private.account_org(),kxra_private.member_org(),
 kxra_private.is_owner(uuid),kxra_private.can_project(uuid,boolean)
to authenticated,anon;

commit;
