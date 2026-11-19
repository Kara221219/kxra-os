begin;

create table kxra.billing_session_intents(
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null references kxra.organisations(id),
 requested_by uuid not null references kxra.account_identities(account_id),
 session_kind text not null check(session_kind in ('CHECKOUT','PORTAL')),
 client_request_id uuid not null,
 plan_version_id uuid references kxra.plan_versions(id),
 provider_customer_id text not null check(provider_customer_id~'^cus_[A-Za-z0-9]{6,}$'),
 provider_price_id text check(provider_price_id is null or provider_price_id~'^price_[A-Za-z0-9]{6,}$'),
 idempotency_key text not null unique check(idempotency_key~'^kxra-(checkout|portal)-[0-9a-f-]{36}$'),
 request_hash text not null check(request_hash~'^[a-f0-9]{64}$'),
 state text not null default 'REQUESTED' check(state in ('REQUESTED','READY','FAILED')),
 provider_session_id text unique,
 redirect_url text,
 expires_at timestamptz,
 failure_code text check(failure_code is null or failure_code~'^[A-Z0-9_]{3,80}$'),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(org_id,session_kind,client_request_id),
 check((session_kind='CHECKOUT' and plan_version_id is not null and provider_price_id is not null)
    or (session_kind='PORTAL' and plan_version_id is null and provider_price_id is null)),
 check(state<>'READY' or (provider_session_id is not null and redirect_url is not null and expires_at>created_at))
);

alter table kxra.billing_session_intents enable row level security;
grant select on kxra.billing_session_intents to authenticated,anon;
create policy billing_session_intents_admin_read on kxra.billing_session_intents for select using(
 kxra_private.is_owner(org_id) or kxra_private.is_platform_owner()
);

create function kxra.request_checkout_session(p_plan_version_id uuid,p_client_request_id uuid)
returns table(
 intent_id uuid,intent_state text,provider_customer_id text,provider_price_id text,
 idempotency_key text,redirect_url text,expires_at timestamptz
) language plpgsql security definer set search_path='' as $$
declare
 selected_org uuid=kxra_private.member_org();
 selected_account uuid=auth.uid();
 customer_id text;
 price_id text;
 intent kxra.billing_session_intents;
 expected_hash text;
begin
 if selected_org is null or selected_account is null or not kxra_private.is_owner(selected_org)
  or not kxra_private.private_access_allowed(selected_org) then
  raise exception 'Billing session unavailable' using errcode='42501';
 end if;
 if not exists(select 1 from kxra.organisations o where o.id=selected_org and o.state='ACTIVE' and o.organisation_kind='CUSTOMER') then
  raise exception 'Billing session unavailable';
 end if;
 select c.provider_customer_id into customer_id from kxra.billing_customers c
 where c.org_id=selected_org and c.provider='STRIPE' and c.state='ACTIVE';
 if customer_id is null or customer_id!~'^cus_[A-Za-z0-9]{6,}$' then
  raise exception 'Billing customer unavailable';
 end if;
 select r.provider_price_id into price_id
 from kxra.plan_versions v join kxra.plans p on p.id=v.plan_id
 join kxra.price_references r on r.plan_version_id=v.id
 where v.id=p_plan_version_id and v.state='ACTIVE' and p.state='ACTIVE'
  and r.provider='STRIPE' and r.environment='TEST' and r.state='ACTIVE';
 if price_id is null then raise exception 'Billing price unavailable';end if;
 if exists(select 1 from kxra.billing_subscriptions s where s.org_id=selected_org
  and s.state in ('INCOMPLETE','TRIALING','ACTIVE','PAST_DUE','PAUSED','UNPAID')) then
  raise exception 'Subscription already exists';
 end if;
 expected_hash=encode(sha256(convert_to(concat_ws('|','CHECKOUT',selected_org,p_plan_version_id,customer_id,price_id),'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtextextended(selected_org::text,17027));
 select * into intent from kxra.billing_session_intents i
 where i.org_id=selected_org and i.session_kind='CHECKOUT' and i.client_request_id=p_client_request_id;
 if intent.id is null then
  select * into intent from kxra.billing_session_intents i
  where i.org_id=selected_org and i.session_kind='CHECKOUT'
   and (i.state='REQUESTED' or (i.state='READY' and i.expires_at>now()))
  order by i.created_at desc limit 1;
 end if;
 if intent.id is null then
  insert into kxra.billing_session_intents(
   org_id,requested_by,session_kind,client_request_id,plan_version_id,
   provider_customer_id,provider_price_id,idempotency_key,request_hash
  ) values(
   selected_org,selected_account,'CHECKOUT',p_client_request_id,p_plan_version_id,
   customer_id,price_id,'kxra-checkout-'||gen_random_uuid(),expected_hash
  ) returning * into intent;
 elsif intent.request_hash<>expected_hash or intent.plan_version_id<>p_plan_version_id then
  raise exception 'Billing session replay mismatch';
 end if;
 if intent.state='REQUESTED' and intent.created_at<now()-interval '23 hours' then
  raise exception 'Billing session reconciliation required';
 end if;
 return query select intent.id,intent.state,intent.provider_customer_id,
  intent.provider_price_id,intent.idempotency_key,intent.redirect_url,intent.expires_at;
end $$;

create function kxra.request_portal_session(p_client_request_id uuid)
returns table(
 intent_id uuid,intent_state text,provider_customer_id text,provider_price_id text,
 idempotency_key text,redirect_url text,expires_at timestamptz
) language plpgsql security definer set search_path='' as $$
declare
 selected_org uuid=kxra_private.member_org();
 selected_account uuid=auth.uid();
 customer_id text;
 intent kxra.billing_session_intents;
 expected_hash text;
begin
 if selected_org is null or selected_account is null or not kxra_private.is_owner(selected_org)
  or not kxra_private.private_access_allowed(selected_org) then
  raise exception 'Billing session unavailable' using errcode='42501';
 end if;
 if not exists(select 1 from kxra.organisations o where o.id=selected_org and o.state='ACTIVE' and o.organisation_kind='CUSTOMER') then
  raise exception 'Billing session unavailable';
 end if;
 select c.provider_customer_id into customer_id from kxra.billing_customers c
 where c.org_id=selected_org and c.provider='STRIPE' and c.state='ACTIVE';
 if customer_id is null or customer_id!~'^cus_[A-Za-z0-9]{6,}$' then
  raise exception 'Billing customer unavailable';
 end if;
 expected_hash=encode(sha256(convert_to(concat_ws('|','PORTAL',selected_org,customer_id),'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtextextended(selected_org::text,17027));
 select * into intent from kxra.billing_session_intents i
 where i.org_id=selected_org and i.session_kind='PORTAL' and i.client_request_id=p_client_request_id;
 if intent.id is null then
  select * into intent from kxra.billing_session_intents i
  where i.org_id=selected_org and i.session_kind='PORTAL'
   and (i.state='REQUESTED' or (i.state='READY' and i.expires_at>now()))
  order by i.created_at desc limit 1;
 end if;
 if intent.id is null then
  insert into kxra.billing_session_intents(
   org_id,requested_by,session_kind,client_request_id,provider_customer_id,
   idempotency_key,request_hash
  ) values(
   selected_org,selected_account,'PORTAL',p_client_request_id,customer_id,
   'kxra-portal-'||gen_random_uuid(),expected_hash
  ) returning * into intent;
 elsif intent.request_hash<>expected_hash then
  raise exception 'Billing session replay mismatch';
 end if;
 if intent.state='REQUESTED' and intent.created_at<now()-interval '23 hours' then
  raise exception 'Billing session reconciliation required';
 end if;
 return query select intent.id,intent.state,intent.provider_customer_id,null::text,
  intent.idempotency_key,intent.redirect_url,intent.expires_at;
end $$;

create function kxra_private.record_stripe_billing_session(
 p_intent_id uuid,p_session_kind text,p_provider_session_id text,p_customer_id text,
 p_redirect_url text,p_expires_at timestamptz,p_livemode boolean
) returns text language plpgsql security definer set search_path='' as $$
declare intent kxra.billing_session_intents;
begin
 select * into intent from kxra.billing_session_intents i where i.id=p_intent_id for update;
 if intent.id is null or intent.session_kind<>p_session_kind or intent.provider_customer_id<>p_customer_id
  or p_livemode or p_expires_at<=now() or p_expires_at>now()+interval '25 hours' then
  raise exception 'Billing provider session unavailable';
 end if;
 if p_session_kind='CHECKOUT' then
  if p_provider_session_id!~'^cs_test_[A-Za-z0-9_]{6,}$' then raise exception 'Billing provider session unavailable';end if;
  if p_redirect_url!~'^https://checkout\.stripe\.com/' then raise exception 'Billing provider redirect unavailable';end if;
 elsif p_session_kind='PORTAL' then
  if p_provider_session_id!~'^bps_[A-Za-z0-9_]{6,}$' then raise exception 'Billing provider session unavailable';end if;
  if p_redirect_url!~'^https://billing\.stripe\.com/' then raise exception 'Billing provider redirect unavailable';end if;
 else raise exception 'Billing provider session unavailable';end if;
 if length(p_redirect_url)>4096 or p_redirect_url~'[[:space:]]' then
  raise exception 'Billing provider redirect unavailable';
 end if;
 if intent.state='READY' then
  if intent.provider_session_id<>p_provider_session_id or intent.redirect_url<>p_redirect_url
   or intent.expires_at<>p_expires_at then raise exception 'Billing provider session replay mismatch';end if;
  return 'READY';
 end if;
 if intent.state<>'REQUESTED' then raise exception 'Billing provider session unavailable';end if;
 update kxra.billing_session_intents set state='READY',provider_session_id=p_provider_session_id,
  redirect_url=p_redirect_url,expires_at=p_expires_at,updated_at=now() where id=intent.id;
 insert into kxra.audit_events(org_id,action,resource_id,metadata)
 values(intent.org_id,'billing.hosted_session_ready',intent.id,
  jsonb_build_object('session_kind',intent.session_kind,'expires_at',p_expires_at));
 return 'READY';
end $$;

revoke all on function kxra.request_checkout_session(uuid,uuid),
 kxra.request_portal_session(uuid),
 kxra_private.record_stripe_billing_session(uuid,text,text,text,text,timestamptz,boolean)
from public,anon,authenticated;
grant execute on function kxra.request_checkout_session(uuid,uuid),
 kxra.request_portal_session(uuid) to authenticated;
grant execute on function kxra_private.record_stripe_billing_session(uuid,text,text,text,text,timestamptz,boolean)
to kxra_billing_worker;

commit;
