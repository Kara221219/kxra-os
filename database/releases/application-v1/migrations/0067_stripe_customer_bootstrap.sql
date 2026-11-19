begin;

create table kxra.billing_customer_intents(
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null references kxra.organisations(id),
 requested_by uuid not null references kxra.account_identities(account_id),
 client_request_id uuid not null,
 organisation_name text not null check(length(organisation_name) between 1 and 240),
 idempotency_key text not null unique check(idempotency_key~'^kxra-customer-[0-9a-f-]{36}$'),
 request_hash text not null check(request_hash~'^[a-f0-9]{64}$'),
 state text not null default 'REQUESTED' check(state in ('REQUESTED','READY','FAILED')),
 provider_customer_id text unique check(provider_customer_id is null or provider_customer_id~'^cus_[A-Za-z0-9]{6,}$'),
 provider_created_at timestamptz,
 failure_code text check(failure_code is null or failure_code~'^[A-Z0-9_]{3,80}$'),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(org_id),
 unique(org_id,client_request_id),
 check(state<>'READY' or (provider_customer_id is not null and provider_created_at is not null))
);

alter table kxra.billing_customer_intents enable row level security;
grant select on kxra.billing_customer_intents to authenticated,anon;
create policy billing_customer_intents_admin_read
 on kxra.billing_customer_intents for select using(
  kxra_private.is_owner(org_id) or kxra_private.is_platform_owner()
 );

create function kxra.request_billing_customer(p_client_request_id uuid)
returns table(
 intent_id uuid,intent_state text,organisation_name text,
 idempotency_key text,provider_customer_id text,provider_created_at timestamptz
) language plpgsql security definer set search_path='' as $$
declare
 selected_org uuid=kxra_private.member_org();
 selected_account uuid=auth.uid();
 organisation kxra.organisations;
 intent kxra.billing_customer_intents;
 customer kxra.billing_customers;
 expected_hash text;
begin
 if p_client_request_id is null or selected_org is null or selected_account is null
  or not kxra_private.is_owner(selected_org)
  or not kxra_private.private_access_allowed(selected_org) then
  raise exception 'Billing customer unavailable' using errcode='42501';
 end if;
 select * into organisation from kxra.organisations o
 where o.id=selected_org and o.state='ACTIVE' and o.organisation_kind='CUSTOMER';
 if organisation.id is null then raise exception 'Billing customer unavailable';end if;
 perform pg_advisory_xact_lock(hashtextextended(selected_org::text,17028));
 select * into intent from kxra.billing_customer_intents i where i.org_id=selected_org;
 select * into customer from kxra.billing_customers c
 where c.org_id=selected_org and c.provider='STRIPE';
 if customer.id is not null then
  if intent.id is not null and intent.state='READY'
   and intent.provider_customer_id=customer.provider_customer_id
   and customer.state='ACTIVE' then
   return query select intent.id,intent.state,intent.organisation_name,
    intent.idempotency_key,intent.provider_customer_id,intent.provider_created_at;
   return;
  end if;
  raise exception 'Billing customer already exists';
 end if;
 if intent.id is not null and intent.state='READY' then
  raise exception 'Billing customer reconciliation required';
 end if;
 if intent.id is null then
  expected_hash=encode(sha256(convert_to(concat_ws('|','STRIPE_CUSTOMER',selected_org,organisation.name),'UTF8')),'hex');
  insert into kxra.billing_customer_intents(
   org_id,requested_by,client_request_id,organisation_name,idempotency_key,request_hash
  ) values(
   selected_org,selected_account,p_client_request_id,organisation.name,
   'kxra-customer-'||gen_random_uuid(),expected_hash
  ) returning * into intent;
 end if;
 if intent.state='REQUESTED' and intent.created_at<now()-interval '23 hours' then
  raise exception 'Billing customer reconciliation required';
 end if;
 return query select intent.id,intent.state,intent.organisation_name,
  intent.idempotency_key,intent.provider_customer_id,intent.provider_created_at;
end $$;

create function kxra_private.record_stripe_billing_customer(
 p_intent_id uuid,p_provider_customer_id text,p_provider_created_at timestamptz,
 p_livemode boolean
) returns text language plpgsql security definer set search_path='' as $$
declare
 intent kxra.billing_customer_intents;
 existing kxra.billing_customers;
begin
 select * into intent from kxra.billing_customer_intents i where i.id=p_intent_id for update;
 if intent.id is null or p_livemode or p_provider_customer_id!~'^cus_[A-Za-z0-9]{6,}$'
  or p_provider_created_at is null or p_provider_created_at>now()+interval '5 minutes'
  or p_provider_created_at<intent.created_at-interval '5 minutes' then
  raise exception 'Billing provider customer unavailable';
 end if;
 perform pg_advisory_xact_lock(hashtextextended(intent.org_id::text,17028));
 if intent.state='READY' then
  if intent.provider_customer_id<>p_provider_customer_id
   or intent.provider_created_at<>p_provider_created_at then
   raise exception 'Billing provider customer replay mismatch';
  end if;
  return 'READY';
 end if;
 if intent.state<>'REQUESTED' then raise exception 'Billing provider customer unavailable';end if;
 select * into existing from kxra.billing_customers c
 where c.org_id=intent.org_id and c.provider='STRIPE' for update;
 if existing.id is not null and existing.provider_customer_id<>p_provider_customer_id then
  raise exception 'Billing provider customer scope mismatch';
 end if;
 if existing.id is null then
  insert into kxra.billing_customers(org_id,provider_customer_id,state)
  values(intent.org_id,p_provider_customer_id,'ACTIVE');
 elsif existing.state<>'ACTIVE' then
  raise exception 'Billing provider customer unavailable';
 end if;
 update kxra.billing_customer_intents set state='READY',
  provider_customer_id=p_provider_customer_id,provider_created_at=p_provider_created_at,
  updated_at=now() where id=intent.id;
 insert into kxra.audit_events(org_id,action,resource_id,metadata)
 values(intent.org_id,'billing.customer_linked',intent.id,
  jsonb_build_object('provider','STRIPE'));
 return 'READY';
end $$;

revoke all on function kxra.request_billing_customer(uuid),
 kxra_private.record_stripe_billing_customer(uuid,text,timestamptz,boolean)
from public,anon,authenticated;
grant execute on function kxra.request_billing_customer(uuid) to authenticated;
grant execute on function kxra_private.record_stripe_billing_customer(uuid,text,timestamptz,boolean)
to kxra_billing_worker;

commit;
