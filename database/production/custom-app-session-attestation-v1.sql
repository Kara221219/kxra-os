-- REVIEW ONLY, after exact reviewed production custom-app payload. No activation, backfill or provider calls.
-- Requires genuine Supabase Auth sessions schema and supabase_auth_admin; synthetic equivalents ONLY in owned fixtures.
begin;
create table kxra_private.custom_app_session_bindings(
 session_id uuid primary key,account_id uuid not null,session_created_at timestamptz,
 original_account_version integer check(original_account_version>0),bound_at timestamptz not null default clock_timestamp()
);
alter table kxra_private.custom_app_session_bindings enable row level security;
revoke all on kxra_private.custom_app_session_bindings from public,anon,authenticated,kxra_app,kxra_billing_worker,kxra_ai_worker,supabase_auth_admin;
create function kxra_private.custom_app_session_immutable() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'Original session attestation is immutable';end $$;
create trigger immutable_session_binding before update or delete on kxra_private.custom_app_session_bindings for each row execute function kxra_private.custom_app_session_immutable();
create function kxra_private.custom_app_session_capture() returns trigger language plpgsql security definer set search_path='' as $$
declare original integer;
begin
 if session_user<>'supabase_auth_admin' then raise insufficient_privilege;end if;
 -- Statement authority fence runs before this row trigger and all canonical account writers.
 -- A missing identity or timestamp is a permanent unbound tombstone, never filled at refresh.
 select a.session_version into original from kxra.account_identities a
 where a.account_id=new.user_id and a.auth_provider='SUPABASE' and a.state not in('SUSPENDED','REVOKED');
 if new.created_at is null then original=null;end if;
 insert into kxra_private.custom_app_session_bindings(session_id,account_id,session_created_at,original_account_version)
 values(new.id,new.user_id,new.created_at,original);
 return new;
end $$;
create function kxra_private.custom_app_provider_session_identity() returns trigger language plpgsql set search_path='' as $$
begin
 if (new.id,new.user_id,new.created_at) is distinct from (old.id,old.user_id,old.created_at) then raise exception 'Provider session identity cannot change';end if;
 return new;
end $$;
create trigger z90_custom_app_provider_session_identity before update on auth.sessions for each row execute function kxra_private.custom_app_provider_session_identity();
create trigger a00_custom_app_session_authority before insert or update or delete on auth.sessions for each statement execute function kxra_private.custom_app_authority_fence();
create trigger z90_custom_app_session_capture after insert on auth.sessions for each row execute function kxra_private.custom_app_session_capture();
create function kxra_private.custom_app_session_version(u uuid,s uuid) returns integer language sql volatile security definer set search_path='' as $$
 select b.original_account_version from kxra_private.custom_app_session_bindings b
 join auth.sessions provider on provider.id=b.session_id and provider.user_id=b.account_id and provider.created_at=b.session_created_at
 join kxra.account_identities account on account.account_id=b.account_id
 where b.account_id=u and b.session_id=s and account.auth_provider='SUPABASE' and account.state='ACTIVE' and account.email_verified_at is not null
 and account.session_version=b.original_account_version and(provider.not_after is null or provider.not_after>clock_timestamp())
$$;
create function kxra_private.custom_app_access_token_hook(event jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare claims jsonb;u uuid;s uuid;v integer;
begin
 if session_user<>'supabase_auth_admin' then raise insufficient_privilege;end if;
 if event is null or jsonb_typeof(event)<>'object' or octet_length(event::text)>65536
 or jsonb_typeof(event->'claims') is distinct from 'object' then raise invalid_parameter_value;end if;
 -- Do not trust previous custom claims or metadata, including on token_refresh.
 claims=(event->'claims')-'kxra_session_version';
 if event->>'user_id' is distinct from claims->>'sub'
 or coalesce(claims->>'sub','')!~'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
 or coalesce(claims->>'session_id','')!~'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
 or claims->>'role' is distinct from 'authenticated' or claims->'is_anonymous' is distinct from 'false'::jsonb then return jsonb_build_object('claims',claims);end if;
 u=(claims->>'sub')::uuid;s=(claims->>'session_id')::uuid;
 perform pg_advisory_xact_lock_shared(hashtextextended('kxra-custom-app-authority-v1',0));
 v=kxra_private.custom_app_session_version(u,s);
 if v is not null then claims=jsonb_set(claims,'{kxra_session_version}',to_jsonb(v));end if;
 return jsonb_build_object('claims',claims);
end $$;
create function kxra_private.custom_app_original_session_current() returns boolean language plpgsql volatile security definer set search_path='' as $$
declare s text=auth.jwt()->>'provider_session_id';v integer;
begin
 if session_user<>'kxra_app' or coalesce(s,'')!~'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' then return false;end if;
 v=kxra_private.custom_app_session_version(auth.uid(),s::uuid);
 return coalesce(v=(auth.jwt()->>'provider_session_version')::integer and v=(auth.jwt()->>'session_version')::integer,false);
end $$;
create function kxra_private.custom_apps_paid_access_v1() returns boolean language sql volatile security definer set search_path='' as $$
 select coalesce(kxra_private.custom_apps_local() or (
 session_user='kxra_app' and current_setting('request.kxra.execution_mode',true)='hosted'
 and current_setting('request.kxra.custom_apps_verified',true)='on'
 and kxra_private.member_org() is not null
 and exists(select 1 from kxra.organisations o where o.id=kxra_private.member_org() and o.organisation_kind='CUSTOMER' and o.state='ACTIVE')
 and exists(select 1 from kxra.account_identities a where a.account_id=auth.uid() and a.state='ACTIVE' and a.email_verified_at is not null and a.session_version=(auth.jwt()->>'session_version')::integer and a.session_version=(auth.jwt()->>'provider_session_version')::integer)
 and kxra_private.is_live_billing_lane(kxra_private.member_org()) and kxra_private.live_paid_entitled(kxra_private.member_org())
 and exists(select 1 from kxra.organisation_memberships m where m.org_id=kxra_private.member_org() and m.account_id=auth.uid() and m.state='ACTIVE' and m.revoked_at is null and m.starts_at<=clock_timestamp() and(m.expires_at is null or m.expires_at>clock_timestamp()))
 and exists(select 1 from kxra_private.live_paid_access paid join kxra_private.live_paid_policies policy on policy.id=paid.policy_id and policy.revision=paid.policy_revision where paid.org_id=kxra_private.member_org() and policy.enabled and paid.period_start<=clock_timestamp() and paid.period_end>clock_timestamp() and paid.valid_until>clock_timestamp() and paid.checked_at<=clock_timestamp()+interval '30 seconds' and paid.checked_at>clock_timestamp()-make_interval(secs=>policy.proof_ttl_seconds))
 and exists(select 1 from kxra.organisation_memberships m join kxra.account_identities account on account.account_id=m.account_id join kxra.organisations org on org.id=m.org_id where m.org_id=kxra_private.member_org() and m.security_role='ORG_ADMIN' and m.relationship_type='CUSTOMER' and m.state='ACTIVE' and m.revoked_at is null and m.starts_at<=clock_timestamp() and(m.expires_at is null or m.expires_at>clock_timestamp()) and account.auth_provider='SUPABASE' and account.state='ACTIVE' and account.email_verified_at is not null and org.state='ACTIVE' and kxra_private.live_billing_legal_allowed(m.org_id,m.account_id))
 ),false)
$$;
-- Replace the ORIGINAL predicate OID: existing policies/definer callers keep this stricter authority.
create or replace function kxra_private.custom_apps_access() returns boolean language sql volatile security definer set search_path='' as $$
 select coalesce(kxra_private.custom_apps_local() or (kxra_private.custom_apps_paid_access_v1() and kxra_private.custom_app_original_session_current()),false)
$$;
revoke all on function kxra_private.custom_app_provider_session_identity(),kxra_private.custom_app_session_immutable(),kxra_private.custom_app_session_capture(),kxra_private.custom_app_session_version(uuid,uuid),kxra_private.custom_app_access_token_hook(jsonb),kxra_private.custom_app_original_session_current(),kxra_private.custom_apps_paid_access_v1() from public,anon,authenticated,kxra_app,kxra_billing_worker,kxra_ai_worker,supabase_auth_admin;
grant usage on schema kxra_private to supabase_auth_admin;
grant execute on function kxra_private.custom_app_access_token_hook(jsonb) to supabase_auth_admin;
-- custom_apps_access keeps its original explicit authenticated EXECUTE grant. No Auth table writes/reads are granted to app roles.
commit;
