-- UNPROMOTED REVIEW PROPOSAL, after the exact reviewed application126 cohort.
-- This is NOT a migration, installation grant, feature activation or hosted acceptance.
-- SECURITY DEFINER is deliberate: selected-organisation RLS cannot enumerate tenants.
-- Only the seven explicitly projected metadata fields may cross this boundary.
-- No existing object, policy, data, role, credential or release manifest is changed.
begin;

-- Refuse a new/untrusted definer owner or missing authority fences. Full source
-- provenance/catalog review remains a separate prerequisite, not inferred here.
do $$
declare target text; expected_trigger text;
begin
 if current_user in('anon','authenticated','authenticator','service_role','supabase_auth_admin','kxra_app')
 or current_user~'^kxra_.*worker$'
 or exists(select 1 from pg_roles r where(r.rolname in('anon','authenticated','authenticator','service_role','supabase_auth_admin','kxra_app') or r.rolname~'^kxra_.*worker$')
  and pg_has_role(r.oid,current_user::regrole,'MEMBER'))
 or current_user<>(select pg_get_userbyid(relowner) from pg_class where oid='kxra.organisations'::regclass)
 or current_user<>(select pg_get_userbyid(proowner) from pg_proc where oid='kxra_private.custom_app_original_session_current()'::regprocedure)
 or to_regprocedure('kxra_paired_admission.hosted_setup_session_current()') is null
 then raise exception 'Reviewed application126 owner and dependencies required';end if;
 foreach target in array array[
  'kxra.account_identities','kxra.profiles','kxra.organisations',
  'kxra.organisation_memberships','kxra.legal_document_requirements',
  'kxra.legal_documents','kxra.legal_acceptances','auth.sessions'
 ] loop
  expected_trigger=case when target='auth.sessions' then 'a00_custom_app_session_authority' else 'a00_custom_app_authority' end;
  if not exists(select 1 from pg_trigger where tgrelid=target::regclass
   and tgname=expected_trigger and tgtype=30 and tgenabled in('O','A')
   and tgfoid='kxra_private.custom_app_authority_fence()'::regprocedure)
  then raise exception 'Reviewed authority statement fence required: %',target;end if;
 end loop;
end $$;

create schema kxra_owner_metadata;
revoke all on schema kxra_owner_metadata from public;

create function kxra_owner_metadata.customer_directory_authorized_v1(
 expected_membership_id uuid,expected_membership_version integer,expected_account_epoch integer
) returns boolean
language plpgsql volatile security definer set search_path='' as $$
declare claims jsonb;selected_org uuid;actor uuid;verified_at timestamptz;
begin
 -- current_user is the definer here. The transaction's selected role must be
 -- authenticated and its original login must be the verified server runtime.
 if session_user<>'kxra_app'
 or current_setting('role',true) is distinct from 'authenticated'
 or current_setting('request.kxra.execution_mode',true) is distinct from 'hosted'
 or current_setting('transaction_isolation')<>'read committed'
 or expected_membership_id is null or expected_membership_version is null
 or expected_membership_version<1 or expected_account_epoch is null or expected_account_epoch<1
 then return false;end if;

 -- 0124 writers take exclusive custom-app authority before their row writes;
 -- 0125 captures immutable ORIGINAL Auth session epoch under that same fence.
 -- Auth/identity/legal writers may next take paired-policy authority (0122/126).
 -- Take NO paired-policy, row, FK or other authority lock under this shared lock.
 -- This read-only transaction must not perform unrelated writes/lock upgrades.
 perform pg_advisory_xact_lock_shared(hashtextextended('kxra-custom-app-authority-v1',0));
 -- Separate queries in a VOLATILE function under READ COMMITTED obtain fresh
 -- snapshots after an authority writer finishes. A same-SELECT STABLE gate does not.
 claims=auth.jwt();actor=auth.uid();selected_org=kxra_private.requested_org();
 if actor is null or selected_org is null or claims->>'sub' is distinct from actor::text
 or claims->>'role' is distinct from 'authenticated' or claims->>'aal' is distinct from 'aal2'
 or coalesce(claims->>'auth_time','')!~'^[0-9]{1,12}$'
 or coalesce(claims->>'session_version','')!~'^[1-9][0-9]{0,9}$'
 or coalesce(claims->>'provider_session_version','')!~'^[1-9][0-9]{0,9}$'
 then return false;end if;
 if (claims->>'session_version')::bigint<>expected_account_epoch
 or (claims->>'provider_session_version')::bigint<>expected_account_epoch
 then return false;end if;
 verified_at=to_timestamp((claims->>'auth_time')::double precision);
 if verified_at<clock_timestamp()-interval '15 minutes'
 or verified_at>clock_timestamp()+interval '1 minute'
 then return false;end if;

 -- Do not use is_owner/mfa_owner: their tenant ORG_ADMIN scope is broader.
 -- Membership identifiers/versions are server-derived hints, never authority.
 -- No user ID or organisation ID is accepted as an RPC argument.
 return coalesce(exists(
  select 1 from kxra.account_identities a
  join kxra.organisation_memberships m on m.account_id=a.account_id
  join kxra.organisations o on o.id=m.org_id
  where a.account_id=actor and a.auth_provider='SUPABASE' and a.state='ACTIVE'
   and a.email_verified_at is not null and a.session_version=expected_account_epoch
   and m.id=expected_membership_id and m.version=expected_membership_version
   and m.org_id=selected_org and m.security_role='KXRA_OWNER' and m.relationship_type='INTERNAL'
   and m.state='ACTIVE' and m.revoked_at is null and m.starts_at<=clock_timestamp()
   and(m.expires_at is null or m.expires_at>clock_timestamp())
   and o.organisation_kind='KXRA' and o.relationship_type='INTERNAL' and o.state='ACTIVE'
   and kxra_private.legal_requirements_satisfied(selected_org)
   and kxra_private.member_org()=selected_org
   and kxra_private.custom_app_original_session_current()
 ),false);
end $$;

create function kxra_owner_metadata.customer_directory_page_v1(
 expected_membership_id uuid,expected_membership_version integer,expected_account_epoch integer,request jsonb
) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare after_id uuid;filter_state text;row_limit integer;rows jsonb;entry jsonb;sampled_at timestamptz;
begin
 -- Independently protects direct RPC calls; CASE preflight is not a security gate.
 if not kxra_owner_metadata.customer_directory_authorized_v1(
  expected_membership_id,expected_membership_version,expected_account_epoch
 ) then raise insufficient_privilege;end if;
 if request is null or jsonb_typeof(request) is distinct from 'object'
 or octet_length(request::text)>512
 or not request ?& array['version','after_organisation_id','organisation_state','limit']
 or request-array['version','after_organisation_id','organisation_state','limit']<>'{}'::jsonb
 or request->'version' is distinct from '1'::jsonb
 or jsonb_typeof(request->'limit') is distinct from 'number'
 or coalesce(request->>'limit','')!~'^[0-9]{1,2}$'
 then raise invalid_parameter_value;end if;
 row_limit=(request->>'limit')::integer;
 -- The server requests page_size + 1, not an unbounded total count.
 if row_limit not between 2 and 51 then raise invalid_parameter_value;end if;
 if request->'after_organisation_id'<>'null'::jsonb then
  if jsonb_typeof(request->'after_organisation_id') is distinct from 'string'
  or (request->>'after_organisation_id')!~'^([a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$'
  then raise invalid_parameter_value;end if;
  after_id=(request->>'after_organisation_id')::uuid;
 end if;
 if request->'organisation_state'<>'null'::jsonb then
  if jsonb_typeof(request->'organisation_state') is distinct from 'string'
  or request->>'organisation_state' not in('ACTIVE','SUSPENDED','CLOSED')
  then raise invalid_parameter_value;end if;
  filter_state=request->>'organisation_state';
 end if;
 -- A CUSTOMER organisation is a workspace, never a room. UUID keyset is a live
 -- traversal, not a snapshot: later pages may reflect later committed changes.
 sampled_at=clock_timestamp();
 select coalesce(jsonb_agg(jsonb_build_object(
  'organisation_id',page.id,'name',page.name,'slug',page.slug,
  'organisation_kind','CUSTOMER','relationship_type',page.relationship_type,
  'organisation_state',page.state,'updated_at',
  case when isfinite(page.updated_at) and extract(year from page.updated_at at time zone 'UTC') between 1 and 9999
   then to_char(page.updated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') end
 ) order by page.id),'[]'::jsonb) into rows from (
  select o.id,case when octet_length(o.name)<=960 then o.name end name,
   case when octet_length(o.slug)<=320 then o.slug end slug,o.relationship_type,o.state,o.updated_at
  from kxra.organisations o
  where o.organisation_kind='CUSTOMER' and(after_id is null or o.id>after_id)
   and(filter_state is null or o.state=filter_state)
  order by o.id asc limit row_limit
 ) page;
 -- Check even the hidden lookahead. Invalid legacy metadata fails the whole
 -- page; do not silently omit, coerce or truncate rows and break keyset semantics.
 for entry in select value from jsonb_array_elements(rows) loop
  if (entry->>'organisation_id')!~'^([a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$'
  or jsonb_typeof(entry->'name') is distinct from 'string'
  or length(entry->>'name') not between 1 and 240
  or (entry->>'name')~'[[:cntrl:]]'
  or (entry->>'name')<>btrim(entry->>'name', E' \t\n\r\f' || chr(11) || chr(160) || chr(5760)
   || chr(8192) || chr(8193) || chr(8194) || chr(8195) || chr(8196) || chr(8197)
   || chr(8198) || chr(8199) || chr(8200) || chr(8201) || chr(8202) || chr(8232)
   || chr(8233) || chr(8239) || chr(8287) || chr(12288) || chr(65279))
  or (select sum(case when ascii(character_value)>65535 then 2 else 1 end)
   from regexp_split_to_table(entry->>'name','') as codepoint(character_value))>240
  or jsonb_typeof(entry->'slug') is distinct from 'string'
  or length(entry->>'slug') not between 3 and 80
  or (entry->>'slug')!~'^[a-z0-9]+(?:-[a-z0-9]+)*$'
  or entry->>'relationship_type' not in('INTERNAL','PARTNER','CUSTOMER','CLIENT')
  or entry->>'organisation_state' not in('ACTIVE','SUSPENDED','CLOSED')
  or jsonb_typeof(entry->'updated_at') is distinct from 'string'
  then raise exception 'Customer metadata unavailable' using errcode='22023';end if;
 end loop;
 -- Writer commits are fenced throughout this transaction. Time-bound authority
 -- can still expire while reading, so recheck immediately before returning.
 if not kxra_owner_metadata.customer_directory_authorized_v1(
  expected_membership_id,expected_membership_version,expected_account_epoch
 ) then raise insufficient_privilege;end if;
 return jsonb_build_object('version',1,
  'sampled_at',to_char(sampled_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
  'items',rows,'has_more',jsonb_array_length(rows)=row_limit);
end $$;

-- No runtime grant in this proposal. Remove even inherited default grants on
-- these NEW objects for all existing non-owner roles, including app, worker,
-- Auth and service roles. Existing private-helper ACLs are untouched.
revoke all on all functions in schema kxra_owner_metadata from public;
do $$
declare recipient name;
begin
 for recipient in select rolname from pg_roles where rolname<>current_user loop
  execute format('revoke all on schema kxra_owner_metadata from %I',recipient);
  execute format('revoke all on all functions in schema kxra_owner_metadata from %I',recipient);
 end loop;
end $$;
-- Owner-only final ACL assertion also catches PUBLIC/default-grant surprises.
do $$
begin
 if exists(select 1 from pg_namespace n,
  lateral aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a
  where n.nspname='kxra_owner_metadata' and(a.grantee<>n.nspowner or n.nspowner<>current_user::regrole))
 or exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace,
  lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
  where n.nspname='kxra_owner_metadata' and(a.grantee<>p.proowner or p.proowner<>current_user::regrole))
 then raise exception 'Owner-only customer metadata ACL required';end if;
end $$;
commit;
