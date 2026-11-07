-- Local preparation only: no hosted self-service admission or Auth hook change.
create table kxra.self_service_workspaces(
 account_id uuid primary key references kxra.account_identities(account_id),
 org_id uuid not null unique references kxra.organisations(id),
 project_id uuid not null references kxra.projects(id),
 request_id uuid not null unique,
 requested_name text not null check(length(requested_name) between 2 and 120),
 created_at timestamptz not null default now()
);
alter table kxra.self_service_workspaces enable row level security;
revoke all on kxra.self_service_workspaces from public,anon,authenticated;
grant select on kxra.self_service_workspaces to authenticated;
create policy self_service_workspace_read on kxra.self_service_workspaces for select to authenticated
 using(account_id=auth.uid() and exists(select 1 from kxra.organisation_memberships m
 where m.org_id=self_service_workspaces.org_id and m.account_id=auth.uid() and m.state='ACTIVE'));

-- Distinguish a new identity from an existing account hidden by lifecycle RLS.
-- Returns only a boolean for the current signed identity, never another account.
create function kxra_private.self_service_identity_available() returns boolean
language sql stable security definer set search_path='' as $$
 select session_user='kxra_app' and current_setting('request.kxra.local_self_service',true)='on'
  and auth.uid() is not null and not exists(select 1 from kxra.account_identities where account_id=auth.uid())
$$;
revoke all on function kxra_private.self_service_identity_available() from public,anon;
grant execute on function kxra_private.self_service_identity_available() to authenticated;

-- Narrow transactional constructor: server-derived verified identity only. No role,
-- tenant ID, project ID or paid state is accepted from a caller.
create function kxra_private.provision_self_service(p_request uuid,p_name text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid=auth.uid(); email text=lower(trim(auth.jwt()->>'email'));
 existing kxra.self_service_workspaces; o uuid=gen_random_uuid(); p uuid=gen_random_uuid();
begin
 if session_user<>'kxra_app' or current_setting('request.kxra.local_self_service',true) is distinct from 'on'
  or uid is null or coalesce(auth.jwt()->>'email_verified','')<>'true'
  or email!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
 then raise insufficient_privilege;end if;
 if p_request is null or p_name is null or p_name<>trim(p_name) or length(p_name) not between 2 and 120
 then raise exception 'Invalid workspace request';end if;
 perform pg_advisory_xact_lock(hashtext('self-service:'||uid::text));
 select * into existing from kxra.self_service_workspaces where account_id=uid;
 if found then
  if existing.requested_name<>p_name or not exists(
   select 1 from kxra.organisation_memberships m join kxra.account_identities a on a.account_id=m.account_id
   join kxra.organisations org on org.id=m.org_id
   where m.account_id=uid and m.org_id=existing.org_id and m.security_role='ORG_ADMIN'
    and m.state='ACTIVE' and m.revoked_at is null and (m.expires_at is null or m.expires_at>now())
    and a.state in ('ONBOARDING','ACTIVE') and org.state='ACTIVE')
   then raise exception 'Workspace request conflicts';end if;
  return jsonb_build_object('organisation_id',existing.org_id,'project_id',existing.project_id,'request_id',existing.request_id);
 end if;
 if exists(select 1 from kxra.account_identities where account_id=uid)
  or exists(select 1 from kxra.self_service_workspaces where request_id=p_request)
 then raise exception 'Use your existing account';end if;
 insert into kxra.organisations(id,name,slug,created_provenance)
 values(o,p_name,'customer-'||replace(o::text,'-',''),'{"source":"LOCAL_SELF_SERVICE"}'::jsonb);
 insert into kxra.profiles(user_id,org_id,email_digest,account_state,email_verified_at)
 values(uid,o,encode(sha256(convert_to(email,'UTF8')),'hex'),'ONBOARDING',now());
 update kxra.account_identities set auth_provider='LOCAL_FAKE' where account_id=uid;
 insert into kxra.organisation_memberships(org_id,account_id,security_role,relationship_type,state,display_name,grant_source)
 values(o,uid,'ORG_ADMIN','CUSTOMER','ACTIVE','Customer administrator','LOCAL_SELF_SERVICE');
 insert into kxra.projects(id,org_id,code,name,stage,status,next_action)
 values(p,o,'WORKSPACE','First workspace','SETUP','ACTIVE','Complete onboarding and recorded billing');
 insert into kxra.project_memberships(org_id,project_id,user_id,role,active) values(o,p,uid,'contributor',true);
 insert into kxra.user_preferences(user_id,org_id) values(uid,o);
 insert into kxra.onboarding_progress(user_id,org_id) values(uid,o);
 insert into kxra.self_service_workspaces(account_id,org_id,project_id,request_id,requested_name)
 values(uid,o,p,p_request,p_name);
 insert into kxra.audit_events(org_id,actor_id,action,resource_id,metadata)
 values(o,uid,'workspace.self_service_local',o,jsonb_build_object('request_id',p_request));
 return jsonb_build_object('organisation_id',o,'project_id',p,'request_id',p_request);
end $$;
revoke all on function kxra_private.provision_self_service(uuid,text) from public,anon;
grant execute on function kxra_private.provision_self_service(uuid,text) to authenticated;

create or replace function kxra_private.pilot_entitled(o uuid) returns boolean
language sql volatile security definer set search_path='' as $$
 select (
  not exists(select 1 from kxra.self_service_workspaces where org_id=o)
  and not exists(select 1 from kxra.workspace_pilots where org_id=o)
  and not exists(select 1 from kxra.pilot_stripe_bindings where org_id=o)
 ) or exists(
  select 1 from kxra.workspace_pilots p
  where p.org_id=o and p.period_start<=now()
   and kxra_private.pilot_access_at(p.state,p.period_end,now())
   and ((p.mode='FIXTURE' and not exists(select 1 from kxra.pilot_stripe_bindings where org_id=o)) or exists(
    select 1 from kxra.pilot_stripe_bindings b
    join kxra.billing_customers c on c.org_id=b.org_id and c.provider='STRIPE'
     and c.state='ACTIVE' and c.provider_customer_id=b.customer_id
    where b.org_id=o and b.subscription_id is not null
     and not b.reconcile_required and not b.terminal
   ))
 )
$$;
revoke all on function kxra_private.pilot_entitled(uuid) from public,anon,authenticated;
