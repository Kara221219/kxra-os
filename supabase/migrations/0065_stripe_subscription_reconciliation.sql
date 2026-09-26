begin;

do $$ begin
 if not exists(select 1 from pg_roles where rolname='kxra_billing_worker') then
  create role kxra_billing_worker nologin noinherit nobypassrls;
 end if;
end $$;

grant usage on schema kxra,kxra_private to kxra_billing_worker;

alter table kxra.billing_subscriptions
 drop constraint billing_subscriptions_state_check;
alter table kxra.billing_subscriptions
 add constraint billing_subscriptions_state_check check(state in (
  'INCOMPLETE','INCOMPLETE_EXPIRED','TRIALING','ACTIVE','PAST_DUE','PAUSED',
  'CANCELLED','UNPAID','UNKNOWN'
 ));

create table kxra.billing_provider_events(
 id uuid primary key default gen_random_uuid(),
 org_id uuid references kxra.organisations(id),
 provider text not null default 'STRIPE' check(provider='STRIPE'),
 provider_event_id text not null check(provider_event_id~'^evt_[A-Za-z0-9]{6,}$'),
 event_type text not null check(event_type in (
  'customer.subscription.created','customer.subscription.updated',
  'customer.subscription.deleted','customer.subscription.paused',
  'customer.subscription.resumed'
 )),
 provider_created_at timestamptz not null,
 livemode boolean not null,
 provider_customer_id text not null check(provider_customer_id~'^cus_[A-Za-z0-9]{6,}$'),
 provider_subscription_id text not null check(provider_subscription_id~'^sub_[A-Za-z0-9]{6,}$'),
 provider_price_id text not null check(provider_price_id~'^price_[A-Za-z0-9]{6,}$'),
 payload_hash text not null check(payload_hash~'^[a-f0-9]{64}$'),
 processing_state text not null default 'RECEIVED'
  check(processing_state in ('RECEIVED','PROCESSED','IGNORED','FAILED')),
 processing_reason text check(processing_reason is null or length(processing_reason)<=1000),
 received_at timestamptz not null default now(),
 processed_at timestamptz,
 unique(provider,provider_event_id)
);

alter table kxra.billing_provider_events enable row level security;
grant select on kxra.billing_provider_events to authenticated,anon;
create policy billing_provider_events_owner_read
 on kxra.billing_provider_events for select
 using(kxra_private.is_platform_owner());

create function kxra_private.record_stripe_subscription_event(
 p_event_id text,
 p_event_type text,
 p_created_at timestamptz,
 p_livemode boolean,
 p_customer_id text,
 p_subscription_id text,
 p_status text,
 p_period_start timestamptz,
 p_period_end timestamptz,
 p_cancel_at_period_end boolean,
 p_price_id text,
 p_item_id text,
 p_quantity bigint,
 p_payload_hash text
) returns text
language plpgsql security definer set search_path='' as $$
declare
 receipt kxra.billing_provider_events;
 customer_row kxra.billing_customers;
 subscription_row kxra.billing_subscriptions;
 price_row record;
 incoming_state text;
 expected_environment text=case when p_livemode then 'LIVE' else 'TEST' end;
 normalized jsonb;
begin
 if p_event_id!~'^evt_[A-Za-z0-9]{6,}$'
  or p_event_type not in (
   'customer.subscription.created','customer.subscription.updated',
   'customer.subscription.deleted','customer.subscription.paused',
   'customer.subscription.resumed'
  ) or p_created_at is null or p_created_at>now()+interval '5 minutes'
  or p_customer_id!~'^cus_[A-Za-z0-9]{6,}$'
  or p_subscription_id!~'^sub_[A-Za-z0-9]{6,}$'
  or p_price_id!~'^price_[A-Za-z0-9]{6,}$'
  or p_item_id!~'^si_[A-Za-z0-9]{6,}$'
  or p_quantity is null or p_quantity<1 or p_quantity>1000000
  or p_payload_hash!~'^[a-f0-9]{64}$'
 then raise exception 'Stripe subscription event unavailable';end if;

 incoming_state=case
  when p_event_type='customer.subscription.deleted' then 'CANCELLED'
  when lower(p_status)='canceled' then 'CANCELLED'
  else upper(p_status)
 end;
 if incoming_state not in (
  'INCOMPLETE','INCOMPLETE_EXPIRED','TRIALING','ACTIVE','PAST_DUE','PAUSED',
  'CANCELLED','UNPAID'
 ) then raise exception 'Stripe subscription state unavailable';end if;
 if incoming_state in ('ACTIVE','TRIALING') and (
  p_period_start is null or p_period_end is null or p_period_end<=p_period_start
 ) then raise exception 'Stripe subscription period unavailable';end if;

 select * into receipt from kxra.billing_provider_events value
 where value.provider='STRIPE' and value.provider_event_id=p_event_id;
 if receipt.id is not null then
  if receipt.event_type<>p_event_type or receipt.provider_created_at<>p_created_at
   or receipt.livemode<>p_livemode or receipt.provider_customer_id<>p_customer_id
   or receipt.provider_subscription_id<>p_subscription_id
   or receipt.provider_price_id<>p_price_id or receipt.payload_hash<>p_payload_hash
  then raise exception 'Stripe subscription event replay mismatch';end if;
  if receipt.processing_state<>'FAILED' or receipt.processing_reason not in (
   'UNKNOWN_CUSTOMER','UNKNOWN_OR_INACTIVE_PRICE'
  ) then return receipt.processing_state;end if;
  update kxra.billing_provider_events set processing_state='RECEIVED',
   processing_reason=null,processed_at=null where id=receipt.id;
 else
  insert into kxra.billing_provider_events(
   provider_event_id,event_type,provider_created_at,livemode,
   provider_customer_id,provider_subscription_id,provider_price_id,payload_hash
  ) values(
   p_event_id,p_event_type,p_created_at,p_livemode,
   p_customer_id,p_subscription_id,p_price_id,p_payload_hash
  ) returning * into receipt;
 end if;

 select * into customer_row from kxra.billing_customers value
 where value.provider='STRIPE' and value.provider_customer_id=p_customer_id;
 if customer_row.id is null then
  update kxra.billing_provider_events set processing_state='FAILED',
   processing_reason='UNKNOWN_CUSTOMER',processed_at=now() where id=receipt.id;
  return 'FAILED';
 end if;
 update kxra.billing_provider_events set org_id=customer_row.org_id where id=receipt.id;

 select * into subscription_row from kxra.billing_subscriptions value
 where value.provider='STRIPE' and value.provider_subscription_id=p_subscription_id
 for update;
 if subscription_row.id is not null and (
  subscription_row.org_id<>customer_row.org_id
  or subscription_row.billing_customer_id<>customer_row.id
 ) then raise exception 'Stripe subscription scope mismatch';end if;
 if subscription_row.id is not null and
  (p_created_at,p_event_id)<=(subscription_row.provider_event_created_at,subscription_row.provider_event_id)
 then
  update kxra.billing_provider_events set processing_state='IGNORED',
   processing_reason='OUT_OF_ORDER',processed_at=now() where id=receipt.id;
  return 'IGNORED';
 end if;

 select reference.plan_version_id,version.policy_version
 into price_row
 from kxra.price_references reference
 join kxra.plan_versions version on version.id=reference.plan_version_id
 join kxra.plans plan on plan.id=version.plan_id
 where reference.provider='STRIPE' and reference.provider_price_id=p_price_id
  and reference.environment=expected_environment and reference.state='ACTIVE'
  and version.state='ACTIVE' and plan.state='ACTIVE';
 if price_row.plan_version_id is null then
  update kxra.billing_provider_events set processing_state='FAILED',
   processing_reason='UNKNOWN_OR_INACTIVE_PRICE',processed_at=now() where id=receipt.id;
  return 'FAILED';
 end if;

 insert into kxra.billing_subscriptions(
  org_id,billing_customer_id,provider_subscription_id,plan_version_id,state,
  current_period_start,current_period_end,grace_until,cancel_at_period_end,
  provider_event_created_at,provider_event_id
 ) values(
  customer_row.org_id,customer_row.id,p_subscription_id,price_row.plan_version_id,
  incoming_state,p_period_start,p_period_end,null,coalesce(p_cancel_at_period_end,false),
  p_created_at,p_event_id
 ) on conflict(provider,provider_subscription_id) do update set
  plan_version_id=excluded.plan_version_id,state=excluded.state,
  current_period_start=excluded.current_period_start,
  current_period_end=excluded.current_period_end,grace_until=null,
  cancel_at_period_end=excluded.cancel_at_period_end,
  provider_event_created_at=excluded.provider_event_created_at,
  provider_event_id=excluded.provider_event_id,updated_at=now()
 returning * into subscription_row;

 delete from kxra.billing_subscription_items where subscription_id=subscription_row.id;
 insert into kxra.billing_subscription_items(
  org_id,subscription_id,provider_item_id,quantity
 ) values(customer_row.org_id,subscription_row.id,p_item_id,p_quantity);

 update kxra.entitlement_effective_periods set
  effective_until=greatest(p_created_at,effective_from+interval '1 microsecond')
 where source_type='SUBSCRIPTION' and source_id=subscription_row.id
  and effective_until is null;
 if incoming_state in ('ACTIVE','TRIALING') then
  insert into kxra.entitlement_effective_periods(
   org_id,feature_key,source_type,source_id,quantity_limit,usage_window,
   policy_version,effective_from,effective_until
  )
  select customer_row.org_id,feature.feature_key,'SUBSCRIPTION',subscription_row.id,
   feature.quantity_limit,feature.usage_window,price_row.policy_version,
   greatest(p_created_at,p_period_start),p_period_end
  from kxra.plan_features feature
  where feature.plan_version_id=price_row.plan_version_id
   and p_period_end>greatest(p_created_at,p_period_start);
 end if;

 normalized=jsonb_build_object(
  'customer_id',p_customer_id,'subscription_id',p_subscription_id,
  'price_id',p_price_id,'item_id',p_item_id,'quantity',p_quantity,
  'status',incoming_state,'period_start',p_period_start,'period_end',p_period_end,
  'cancel_at_period_end',coalesce(p_cancel_at_period_end,false),'livemode',p_livemode
 );
 insert into kxra.billing_events(
  org_id,provider_event_id,event_type,provider_created_at,signature_verified,
  payload_hash,payload,processing_state,processed_at
 ) values(
  customer_row.org_id,p_event_id,p_event_type,p_created_at,true,p_payload_hash,
  normalized,'PROCESSED',now()
 );
 update kxra.billing_provider_events set processing_state='PROCESSED',
  processed_at=now() where id=receipt.id;
 insert into kxra.audit_events(org_id,action,resource_id,metadata)
 values(customer_row.org_id,'billing.subscription_reconciled',subscription_row.id,
  jsonb_build_object('state',incoming_state,'event_id',p_event_id));
 return 'PROCESSED';
end $$;

revoke all on function kxra_private.record_stripe_subscription_event(
 text,text,timestamptz,boolean,text,text,text,timestamptz,timestamptz,
 boolean,text,text,bigint,text
) from public,authenticated,anon;
grant execute on function kxra_private.record_stripe_subscription_event(
 text,text,timestamptz,boolean,text,text,text,timestamptz,timestamptz,
 boolean,text,text,bigint,text
) to kxra_billing_worker;

commit;
