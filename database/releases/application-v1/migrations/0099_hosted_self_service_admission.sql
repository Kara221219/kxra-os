begin;

-- Source capability only. No hosted Auth hook or public admission is enabled.
create table kxra.hosted_self_service_config(
 singleton boolean primary key default true check(singleton),
 enabled boolean not null default false,
 revision integer not null default 1 check(revision>0),
 auth_settings_review text,
 updated_at timestamptz not null default now(),
 check(not enabled or (auth_settings_review is not null and length(trim(auth_settings_review)) between 10 and 200))
);
insert into kxra.hosted_self_service_config(singleton) values(true);
alter table kxra.hosted_self_service_config enable row level security;
revoke all on kxra.hosted_self_service_config from public,anon,authenticated;
grant select on kxra.hosted_self_service_config to supabase_auth_admin;
create policy hosted_self_service_config_hook on kxra.hosted_self_service_config
 for select to supabase_auth_admin using(true);

create table kxra.hosted_signup_admissions(
 id uuid primary key,
 email_digest text not null check(email_digest~'^[a-f0-9]{64}$'),
 proof_digest text not null unique check(proof_digest~'^[a-f0-9]{64}$'),
 config_revision integer not null check(config_revision>0),
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '5 minutes',
 consumed_at timestamptz,
 revoked_at timestamptz,
 auth_user_id uuid unique,
 check(expires_at>created_at),
 check((consumed_at is null)=(auth_user_id is null))
);
create index hosted_signup_admissions_email on kxra.hosted_signup_admissions(email_digest,created_at desc);
alter table kxra.hosted_signup_admissions enable row level security;
revoke all on kxra.hosted_signup_admissions from public,anon,authenticated;
grant select,update(consumed_at,auth_user_id) on kxra.hosted_signup_admissions to supabase_auth_admin;
create policy hosted_signup_admissions_hook_read on kxra.hosted_signup_admissions
 for select to supabase_auth_admin using(true);
create policy hosted_signup_admissions_hook_consume on kxra.hosted_signup_admissions
 for update to supabase_auth_admin using(true) with check(true);

alter table kxra.self_service_workspaces add column auth_provider text not null default 'LOCAL_FAKE'
 check(auth_provider in ('LOCAL_FAKE','SUPABASE'));

create function kxra_private.hosted_self_service_open() returns boolean
language sql stable security definer set search_path='' as $$
 select session_user='kxra_app'
  and coalesce(current_setting('request.kxra.hosted_self_service',true),'off')='on'
  and exists(select 1 from kxra.hosted_self_service_config where singleton and enabled)
$$;
revoke all on function kxra_private.hosted_self_service_open() from public;
grant execute on function kxra_private.hosted_self_service_open() to anon,authenticated;

-- Pre-auth exception: no identity exists yet. Only the server runtime connection
-- may prepare a bounded opaque proof; it grants no membership or paid access.
create function kxra_private.prepare_hosted_signup(p_email_digest text,p_proof_digest text,p_request uuid)
returns void language plpgsql security definer set search_path='' as $$
declare rev integer;
begin
 if not kxra_private.hosted_self_service_open() or p_request is null
  or p_email_digest is null or p_email_digest!~'^[a-f0-9]{64}$'
  or p_proof_digest is null or p_proof_digest!~'^[a-f0-9]{64}$'
 then raise insufficient_privilege;end if;
 if not kxra.consume_rate_limit('hosted-signup',p_email_digest,8,900)
  or not kxra.consume_rate_limit('hosted-signup-total',encode(sha256(convert_to('hosted-self-service-global','UTF8')),'hex'),50,3600)
 then raise exception 'Registration temporarily unavailable';end if;
 perform pg_advisory_xact_lock(hashtext('hosted-signup:'||p_email_digest));
 select revision into rev from kxra.hosted_self_service_config where singleton and enabled for share;
 if rev is null then raise insufficient_privilege;end if;
 update kxra.hosted_signup_admissions set revoked_at=now()
 where email_digest=p_email_digest and consumed_at is null and revoked_at is null;
 insert into kxra.hosted_signup_admissions(id,email_digest,proof_digest,config_revision)
 values(p_request,p_email_digest,p_proof_digest,rev);
end $$;
revoke all on function kxra_private.prepare_hosted_signup(text,text,uuid) from public;
grant execute on function kxra_private.prepare_hosted_signup(text,text,uuid) to anon,authenticated;

-- Additive hook. The currently configured invitation hook is not changed.
-- A separate reviewed hosted setting must select this wrapper before activation.
create function kxra_private.before_user_created_with_self_service(event jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare proof text=event->'user'->'user_metadata'->>'kxra_self_service_challenge';
 email text=lower(trim(event->'user'->>'email'));subject text=event->'user'->>'id';accepted uuid;
begin
 if proof is null then return kxra_private.before_user_created(event);end if;
 if current_user<>'supabase_auth_admin' or proof!~'^[A-Za-z0-9_-]{43,128}$'
  or email is null or email!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  or subject is null or subject!~'^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$'
  or event->'user'->>'is_anonymous' is distinct from 'false'
  or event->'user'->'app_metadata'->>'provider' is distinct from 'email'
 then return jsonb_build_object('error',jsonb_build_object('http_code',403,'message','Registration unavailable'));end if;
 update kxra.hosted_signup_admissions a set consumed_at=coalesce(a.consumed_at,now()),auth_user_id=subject::uuid
 from kxra.hosted_self_service_config c
 where c.singleton and c.enabled and c.revision=a.config_revision
  and a.email_digest=encode(sha256(convert_to(email,'UTF8')),'hex')
  and a.proof_digest=encode(sha256(convert_to(proof,'UTF8')),'hex') and a.revoked_at is null
  and ((a.consumed_at is null and a.expires_at>now()) or a.auth_user_id=subject::uuid)
 returning a.id into accepted;
 if accepted is null then return jsonb_build_object('error',jsonb_build_object('http_code',403,'message','Registration unavailable'));end if;
 return '{}'::jsonb;
end $$;
revoke all on function kxra_private.before_user_created_with_self_service(jsonb) from public,anon,authenticated;
grant execute on function kxra_private.before_user_created_with_self_service(jsonb) to supabase_auth_admin;

create function kxra_private.hosted_self_service_identity_pending() returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce(kxra_private.hosted_self_service_open()
  and current_setting('request.kxra.verified_supabase_identity',true)='on'
  and auth.uid() is not null and coalesce(auth.jwt()->>'email_verified','')='true'
  and not exists(select 1 from kxra.account_identities where account_id=auth.uid())
  and exists(select 1 from kxra.hosted_signup_admissions a join kxra.hosted_self_service_config c
   on c.singleton and c.enabled and c.revision=a.config_revision
   where a.auth_user_id=auth.uid() and a.consumed_at is not null and a.revoked_at is null
    and a.email_digest=encode(sha256(convert_to(lower(trim(auth.jwt()->>'email')),'UTF8')),'hex')),false)
$$;
revoke all on function kxra_private.hosted_self_service_identity_pending() from public,anon;
grant execute on function kxra_private.hosted_self_service_identity_pending() to authenticated;

-- Own-identity recovery status only: no identity parameter and no authority to
-- renew a revoked or stale admission. This works before a tenant is selected.
create function kxra_private.hosted_self_service_status() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare uid uuid=auth.uid();existing kxra.self_service_workspaces;
begin
 if not kxra_private.hosted_self_service_open()
  or current_setting('request.kxra.verified_supabase_identity',true) is distinct from 'on'
  or uid is null or coalesce(auth.jwt()->>'email_verified','')<>'true'
 then return jsonb_build_object('state','UNAVAILABLE');end if;
 select * into existing from kxra.self_service_workspaces where account_id=uid;
 if found then
  if existing.auth_provider='SUPABASE' and exists(
   select 1 from kxra.organisation_memberships m join kxra.account_identities a on a.account_id=m.account_id
   join kxra.organisations org on org.id=m.org_id
   where m.account_id=uid and m.org_id=existing.org_id and m.security_role='ORG_ADMIN'
    and m.relationship_type='CUSTOMER' and m.state='ACTIVE' and m.revoked_at is null
    and (m.expires_at is null or m.expires_at>now()) and a.auth_provider='SUPABASE'
    and a.state in ('ONBOARDING','ACTIVE') and org.state='ACTIVE')
  then return jsonb_build_object('state','EXISTING','workspace_name',existing.requested_name);end if;
  return jsonb_build_object('state','REVIEW_REQUIRED');
 end if;
 if exists(select 1 from kxra.account_identities where account_id=uid)
 then return jsonb_build_object('state','EXISTING_ACCOUNT');end if;
 if kxra_private.hosted_self_service_identity_pending()
 then return jsonb_build_object('state','READY');end if;
 return jsonb_build_object('state','REVIEW_REQUIRED');
end $$;
revoke all on function kxra_private.hosted_self_service_status() from public,anon;
grant execute on function kxra_private.hosted_self_service_status() to authenticated;

create function kxra_private.provision_hosted_self_service(p_request uuid,p_name text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid=auth.uid();email text=lower(trim(auth.jwt()->>'email'));
 existing kxra.self_service_workspaces;admission kxra.hosted_signup_admissions;
 o uuid=gen_random_uuid();p uuid=gen_random_uuid();rev integer;
begin
 if not kxra_private.hosted_self_service_open()
  or current_setting('request.kxra.verified_supabase_identity',true) is distinct from 'on'
  or uid is null or coalesce(auth.jwt()->>'email_verified','')<>'true'
  or email is null or email!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
 then raise insufficient_privilege;end if;
 if p_request is null or p_name is null or p_name<>trim(p_name) or length(p_name) not between 2 and 120
 then raise exception 'Invalid workspace request';end if;
 perform pg_advisory_xact_lock(hashtext('self-service:'||uid::text));
 select * into existing from kxra.self_service_workspaces where account_id=uid;
 if found then
  if existing.auth_provider<>'SUPABASE' or existing.requested_name<>p_name or not exists(
   select 1 from kxra.organisation_memberships m join kxra.account_identities a on a.account_id=m.account_id
   join kxra.organisations org on org.id=m.org_id
   where m.account_id=uid and m.org_id=existing.org_id and m.security_role='ORG_ADMIN'
    and m.relationship_type='CUSTOMER' and m.state='ACTIVE' and m.revoked_at is null
    and (m.expires_at is null or m.expires_at>now()) and a.auth_provider='SUPABASE'
    and a.state in ('ONBOARDING','ACTIVE') and org.state='ACTIVE')
  then raise exception 'Workspace request conflicts';end if;
  return jsonb_build_object('organisation_id',existing.org_id,'project_id',existing.project_id,'request_id',existing.request_id);
 end if;
 select revision into rev from kxra.hosted_self_service_config where singleton and enabled for share;
 select * into admission from kxra.hosted_signup_admissions
 where auth_user_id=uid and consumed_at is not null and revoked_at is null
  and config_revision=rev and email_digest=encode(sha256(convert_to(email,'UTF8')),'hex') for update;
 if not found or exists(select 1 from kxra.account_identities where account_id=uid)
  or exists(select 1 from kxra.self_service_workspaces where request_id=p_request)
 then raise insufficient_privilege;end if;
 insert into kxra.organisations(id,name,slug,created_provenance)
 values(o,p_name,'customer-'||replace(o::text,'-',''),'{"source":"HOSTED_SELF_SERVICE"}'::jsonb);
 insert into kxra.profiles(user_id,org_id,email_digest,account_state,email_verified_at)
 values(uid,o,encode(sha256(convert_to(email,'UTF8')),'hex'),'ONBOARDING',now());
 insert into kxra.organisation_memberships(org_id,account_id,security_role,relationship_type,state,display_name,grant_source)
 values(o,uid,'ORG_ADMIN','CUSTOMER','ACTIVE','Customer administrator','HOSTED_SELF_SERVICE');
 insert into kxra.projects(id,org_id,code,name,stage,status,next_action)
 values(p,o,'WORKSPACE','First workspace','SETUP','ACTIVE','Complete onboarding and recorded billing');
 insert into kxra.project_memberships(org_id,project_id,user_id,role,active) values(o,p,uid,'contributor',true);
 insert into kxra.user_preferences(user_id,org_id) values(uid,o);
 insert into kxra.onboarding_progress(user_id,org_id) values(uid,o);
 insert into kxra.self_service_workspaces(account_id,org_id,project_id,request_id,requested_name,auth_provider)
 values(uid,o,p,p_request,p_name,'SUPABASE');
 insert into kxra.audit_events(org_id,actor_id,action,resource_id,metadata)
 values(o,uid,'workspace.self_service_hosted',o,jsonb_build_object('request_id',p_request,'admission_id',admission.id,'config_revision',rev));
 return jsonb_build_object('organisation_id',o,'project_id',p,'request_id',p_request);
end $$;
revoke all on function kxra_private.provision_hosted_self_service(uuid,text) from public,anon;
grant execute on function kxra_private.provision_hosted_self_service(uuid,text) to authenticated;

commit;
