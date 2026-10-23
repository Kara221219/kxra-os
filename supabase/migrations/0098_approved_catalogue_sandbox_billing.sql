-- Empty, operator-reviewed SANDBOX mappings only. No Stripe resources, credentials,
-- enabled mappings, legacy conversions, live checkout or new commercial terms.
create table kxra.pilot_stripe_catalogue_config(
 version integer not null default 2 check(version=2),
 mode text not null default 'sandbox' check(mode='sandbox'),
 enabled boolean not null default false,
 offer_key text not null check(offer_key in ('KXRA_STARTER_V1','KXRA_TEAM_V1','KXRA_BUSINESS_V1')),
 mapping_revision integer not null check(mapping_revision>0),
 account_id text not null check(account_id~'^acct_[A-Za-z0-9]{6,}$'),
 monthly_price text not null unique check(monthly_price~'^price_[A-Za-z0-9]{6,}$'),
 monthly_product text not null check(monthly_product~'^prod_[A-Za-z0-9]{6,}$'),
 portal_config text not null check(portal_config~'^bpc_[A-Za-z0-9]{6,}$'),
 tax_behavior text not null check(tax_behavior in ('inclusive','exclusive')),
 terms_review text not null check(length(terms_review) between 10 and 200),
 primary key(offer_key,mapping_revision)
);
create unique index one_enabled_sandbox_mapping_per_offer on kxra.pilot_stripe_catalogue_config(offer_key) where enabled;
alter table kxra.pilot_stripe_catalogue_config enable row level security;
revoke all on kxra.pilot_stripe_catalogue_config from public,anon,authenticated,kxra_billing_worker;
create policy sandbox_catalogue_config_deny on kxra.pilot_stripe_catalogue_config for select to authenticated using(false);
create function kxra_private.guard_sandbox_mapping() returns trigger language plpgsql set search_path='' as $$
begin
 if (to_jsonb(new)-'enabled') is distinct from (to_jsonb(old)-'enabled') then raise exception 'Sandbox mapping identity is immutable; review a new revision';end if;
 return new;
end $$;
revoke all on function kxra_private.guard_sandbox_mapping() from public,anon,authenticated;
create trigger sandbox_mapping_immutable before update on kxra.pilot_stripe_catalogue_config for each row execute function kxra_private.guard_sandbox_mapping();
alter table kxra.pilot_stripe_bindings add column catalogue_offer_key text,add column catalogue_revision integer,
 add constraint sandbox_binding_mapping foreign key(catalogue_offer_key,catalogue_revision) references kxra.pilot_stripe_catalogue_config(offer_key,mapping_revision) match full;
alter table kxra.pilot_stripe_intents add column catalogue_offer_key text,add column catalogue_revision integer,
 add constraint sandbox_intent_mapping foreign key(catalogue_offer_key,catalogue_revision) references kxra.pilot_stripe_catalogue_config(offer_key,mapping_revision) match full;
alter table kxra.workspace_pilots drop constraint approved_catalogue_fixture_only;
alter table kxra.workspace_pilots add constraint approved_catalogue_sandbox_only
 check(offer_key='WORKSPACE_PILOT_V1' or mode in ('FIXTURE','TEST_STRIPE'));
-- Provider admissions are checked against the server-owned binding and mapping.
-- Existing rows are not converted or populated by this migration.

create or replace function kxra_private.workspace_seat_capacity(o uuid) returns integer
language sql volatile security definer set search_path='' as $$
 select case when coalesce(p.offer_key,b.catalogue_offer_key,'WORKSPACE_PILOT_V1')='WORKSPACE_PILOT_V1' then 5
 else (select (plan->>'people')::integer from jsonb_array_elements(kxra_private.approved_workspace_catalogue_v1()) plan
 where plan->>'offer_key'=coalesce(p.offer_key,b.catalogue_offer_key)) end
 from (select 1) singleton left join kxra.workspace_pilots p on p.org_id=o left join kxra.pilot_stripe_bindings b on b.org_id=o
$$;
revoke all on function kxra_private.workspace_seat_capacity(uuid) from public,anon,authenticated;

create function kxra.request_catalogue_stripe(i uuid,k text,offer text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare o uuid=kxra_private.member_org();c kxra.pilot_stripe_catalogue_config;b kxra.pilot_stripe_bindings;r kxra.pilot_stripe_intents;customer text;plan jsonb;
begin
 if not kxra_private.mfa_owner(o) then raise insufficient_privilege;end if;
 if i is null or k is null or k not in ('CHECKOUT','PORTAL','RECONCILE') or (k<>'CHECKOUT' and offer is not null) then raise exception 'Invalid sandbox catalogue request';end if;
 perform pg_advisory_xact_lock(hashtext('pilot:'||o::text));
 select * into b from kxra.pilot_stripe_bindings where org_id=o for update;
 if b.org_id is not null and b.catalogue_offer_key is null then
  if k='CHECKOUT' then raise exception 'Existing legacy plan cannot be converted';end if;
  return kxra.request_pilot_stripe(i,k,false);
 end if;
 if k='CHECKOUT' then
  select * into c from kxra.pilot_stripe_catalogue_config where offer_key=offer and enabled for share;
 else
  select * into c from kxra.pilot_stripe_catalogue_config where offer_key=b.catalogue_offer_key and mapping_revision=b.catalogue_revision and enabled for share;
 end if;
 if c.offer_key is null then raise exception 'Approved sandbox mapping unavailable';end if;
 select value into plan from jsonb_array_elements(kxra_private.approved_workspace_catalogue_v1()) where value->>'offer_key'=c.offer_key;
 if plan is null then raise exception 'Approved catalogue plan required';end if;
 select provider_customer_id into customer from kxra.billing_customers where org_id=o and provider='STRIPE' and state='ACTIVE';
 if customer is null then raise exception 'Verified billing customer required';end if;
 if exists(select 1 from kxra.workspace_pilots where org_id=o and (mode<>'TEST_STRIPE' or offer_key<>c.offer_key)) then raise exception 'Existing workspace plan cannot be converted';end if;
 if exists(select 1 from kxra.pilot_stripe_intents where org_id=o and catalogue_offer_key is null) then raise exception 'Existing legacy request cannot be converted';end if;
 if b.org_id is null then
  if k<>'CHECKOUT' then raise exception 'Sandbox subscription unavailable';end if;
  if kxra_private.pilot_seats(o)>(plan->>'people')::integer then raise exception 'Recorded plan seat capacity exceeded';end if;
  insert into kxra.pilot_stripe_bindings(org_id,customer_id,catalogue_offer_key,catalogue_revision)
   values(o,customer,c.offer_key,c.mapping_revision) returning * into b;
 end if;
 if customer<>b.customer_id or b.catalogue_offer_key<>c.offer_key or b.catalogue_revision<>c.mapping_revision then raise exception 'Sandbox binding changed; explicit reconciliation required';end if;
 select * into r from kxra.pilot_stripe_intents where id=i;
 if found then
  if r.org_id<>o or r.actor_id<>auth.uid() or r.kind<>k or r.include_setup or r.catalogue_offer_key is distinct from c.offer_key or r.catalogue_revision is distinct from c.mapping_revision then raise exception 'Catalogue request replay conflict';end if;
 else
  if k='CHECKOUT' then
   if b.subscription_id is not null then raise exception 'Sandbox subscription already bound';end if;
   if exists(select 1 from kxra.pilot_stripe_intents where org_id=o and kind='CHECKOUT') then raise exception 'Retry original request; checkout reconciliation required';end if;
  elsif b.subscription_id is null then raise exception 'Sandbox subscription unavailable';end if;
  insert into kxra.pilot_stripe_intents(id,org_id,actor_id,kind,include_setup,customer_id,subscription_id,observed_version,catalogue_offer_key,catalogue_revision)
   values(i,o,auth.uid(),k,false,b.customer_id,b.subscription_id,b.version,c.offer_key,c.mapping_revision) returning * into r;
 end if;
 if r.created_at<now()-interval '23 hours' then raise exception 'Sandbox request expired; operator reconciliation required';end if;
 return jsonb_build_object('intent',to_jsonb(r),'config',to_jsonb(c));
end $$;
revoke all on function kxra.request_catalogue_stripe(uuid,text,text) from public,anon;
grant execute on function kxra.request_catalogue_stripe(uuid,text,text) to authenticated;

-- Legacy subscriptions remain bound to their original contract. No new legacy assignment.
create or replace function kxra.request_pilot_stripe(i uuid,k text,setup boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare o uuid=kxra_private.member_org();c kxra.pilot_stripe_config;b kxra.pilot_stripe_bindings;r kxra.pilot_stripe_intents;customer text;
begin
 if not kxra_private.mfa_owner(o) then raise insufficient_privilege;end if;
 if i is null or k is null or setup is null or k not in ('CHECKOUT','PORTAL','RECONCILE') or (setup and k<>'CHECKOUT') then raise exception 'Invalid pilot request';end if;
 select * into c from kxra.pilot_stripe_config where version=1 and enabled;
 if not found then raise exception 'Pilot provider configuration unavailable';end if;
 perform pg_advisory_xact_lock(hashtext('pilot:'||o::text));
 select * into b from kxra.pilot_stripe_bindings where org_id=o for update;
 if b.org_id is null then raise exception 'New legacy checkout closed; approved catalogue mapping required';end if;
 if b.catalogue_offer_key is not null then raise exception 'Catalogue binding requires its sandbox contract';end if;
 if exists(select 1 from kxra.workspace_pilots where org_id=o and mode<>'TEST_STRIPE') then raise exception 'Fixture pilot cannot become provider billing';end if;
 select provider_customer_id into customer from kxra.billing_customers where org_id=o and provider='STRIPE' and state='ACTIVE';
 if customer is null then raise exception 'Verified billing customer required';end if;
 if b.org_id is null then
  if k<>'CHECKOUT' then raise exception 'Pilot subscription unavailable';end if;
  if kxra_private.pilot_seats(o)>5 then raise exception 'Five-person capacity exceeded';end if;
  insert into kxra.pilot_stripe_bindings(org_id,customer_id) values(o,customer) returning * into b;
 end if;
 if customer<>b.customer_id then raise exception 'Billing customer changed; reconciliation required';end if;
 select * into r from kxra.pilot_stripe_intents where id=i;
 if found then
  if r.org_id<>o or r.actor_id<>auth.uid() or r.kind<>k or r.include_setup<>setup then raise exception 'Pilot request replay conflict';end if;
 else
  if k='CHECKOUT' then
   if b.subscription_id is not null then raise exception 'Pilot subscription already bound';end if;
   -- A single pending attempt: never create another subscription after a lost response.
   if exists(select 1 from kxra.pilot_stripe_intents where org_id=o and kind='CHECKOUT') then raise exception 'Retry original request; checkout reconciliation required';end if;
  elsif b.subscription_id is null then raise exception 'Pilot subscription unavailable';end if;
  insert into kxra.pilot_stripe_intents(id,org_id,actor_id,kind,include_setup,customer_id,subscription_id,observed_version)
   values(i,o,auth.uid(),k,setup,b.customer_id,b.subscription_id,b.version) returning * into r;
 end if;
 if r.created_at<now()-interval '23 hours' then raise exception 'Pilot request expired; operator reconciliation required';end if;
 return jsonb_build_object('intent',to_jsonb(r),'config',to_jsonb(c));
end $$;
revoke all on function kxra.request_pilot_stripe(uuid,text,boolean) from public,anon;
grant execute on function kxra.request_pilot_stripe(uuid,text,boolean) to authenticated;
alter function kxra_private.record_pilot_stripe_event(jsonb) rename to record_legacy_pilot_stripe_event;
revoke all on function kxra_private.record_legacy_pilot_stripe_event(jsonb) from public,anon,authenticated,kxra_billing_worker;
create function kxra_private.quarantine_catalogue_snapshot(e jsonb) returns text
language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from kxra.pilot_stripe_bindings where customer_id=e->>'customer' and subscription_id=e->>'subscription' and catalogue_offer_key is not null) then raise exception 'Unbound sandbox snapshot rejected';end if;
 return kxra_private.record_legacy_pilot_stripe_event(e||'{"quarantine":true}'::jsonb);
end $$;
revoke all on function kxra_private.quarantine_catalogue_snapshot(jsonb) from public,anon,authenticated,kxra_billing_worker;
create function kxra_private.record_pilot_stripe_event(e jsonb) returns text
language plpgsql security definer set search_path='' as $$
declare b kxra.pilot_stripe_bindings;c kxra.pilot_stripe_catalogue_config;plan jsonb;r kxra.pilot_stripe_intents;old kxra.pilot_stripe_events;
 event_time timestamptz;start_at timestamptz;end_at timestamptz;fingerprint text;result text='APPLIED';s text;reconcile boolean;
begin
 if coalesce((e->>'quarantine')::boolean,false) then return kxra_private.record_legacy_pilot_stripe_event(e);end if;
 select * into b from kxra.pilot_stripe_bindings where customer_id=e->>'customer';
 if b.catalogue_offer_key is null then return kxra_private.record_legacy_pilot_stripe_event(e);end if;
 select * into c from kxra.pilot_stripe_catalogue_config where offer_key=b.catalogue_offer_key and mapping_revision=b.catalogue_revision and enabled for share;
 if not found then raise exception 'Approved sandbox mapping unavailable';end if;
 select value into plan from jsonb_array_elements(kxra_private.approved_workspace_catalogue_v1()) where value->>'offer_key'=b.catalogue_offer_key;
 if plan is null or e->>'catalogue_offer_key' is distinct from b.catalogue_offer_key or (e->>'catalogue_revision')::integer is distinct from b.catalogue_revision
  or (e->>'account' is not null and e->>'account' is distinct from c.account_id) then return kxra_private.quarantine_catalogue_snapshot(e);end if;

 if e is null or (e->>'livemode')::boolean is distinct from false or (e->>'quantity')::integer is distinct from 1
  or e->>'currency' is distinct from 'gbp' or (e->>'amount')::integer is distinct from (plan->>'monthly_amount_minor')::integer
  or e->>'interval' is distinct from 'month' or (e->>'interval_count')::integer is distinct from 1
  or e->>'status' not in ('active','trialing','past_due','canceled','unpaid','paused','incomplete','incomplete_expired') then return kxra_private.quarantine_catalogue_snapshot(e);end if;
 if e->>'price' is distinct from c.monthly_price or e->>'product' is distinct from c.monthly_product
  or e->>'tax_behavior' is distinct from c.tax_behavior then return kxra_private.quarantine_catalogue_snapshot(e);end if;
 select * into b from kxra.pilot_stripe_bindings where customer_id=e->>'customer';
 if not found or not exists(select 1 from kxra.billing_customers where org_id=b.org_id and provider='STRIPE' and state='ACTIVE' and provider_customer_id=b.customer_id) then raise exception 'Unknown or changed pilot customer';end if;
 perform pg_advisory_xact_lock(hashtext('pilot:'||b.org_id::text));
 select * into b from kxra.pilot_stripe_bindings where org_id=b.org_id for update;
 if b.catalogue_offer_key is distinct from c.offer_key or b.catalogue_revision is distinct from c.mapping_revision then raise exception 'Sandbox binding changed';end if;
 select * into old from kxra.pilot_stripe_events where event_id=e->>'event_id';
 if found then
  if old.payload_hash is distinct from e->>'hash' or old.org_id<>b.org_id then raise exception 'Pilot event replay conflict';end if;return old.outcome;
 end if;
 event_time=(e->>'created_at')::timestamptz;start_at=(e->>'period_start')::timestamptz;end_at=(e->>'period_end')::timestamptz;
 if event_time is null or event_time>now()+interval '5 minutes' or e->>'subscription'!~'^sub_[A-Za-z0-9]{6,}$' or e->>'event_id'!~'^evt_[A-Za-z0-9]{6,}$'
  or e->>'hash'!~'^[a-f0-9]{64}$' or start_at is null or end_at is null or end_at<=start_at then raise exception 'Invalid pilot snapshot';end if;
 reconcile=coalesce((e->>'reconcile')::boolean,false);
 if reconcile then
  select * into r from kxra.pilot_stripe_intents where id=(e->>'intent_id')::uuid;
  if not found or r.kind<>'RECONCILE' or r.org_id<>b.org_id or r.customer_id<>b.customer_id or r.catalogue_offer_key is distinct from b.catalogue_offer_key or r.catalogue_revision is distinct from b.catalogue_revision or r.observed_version<>b.version or r.created_at<now()-interval '5 minutes' then raise exception 'Reconciliation raced; request fresh snapshot';end if;
 else
  select * into r from kxra.pilot_stripe_intents where id=(e->>'intent_id')::uuid;
  if not found or r.kind<>'CHECKOUT' or r.catalogue_offer_key is distinct from b.catalogue_offer_key or r.catalogue_revision is distinct from b.catalogue_revision or r.org_id<>b.org_id or r.customer_id<>b.customer_id then raise exception 'Unknown pilot checkout provenance';end if;
 end if;
 if b.subscription_id is not null and b.subscription_id is distinct from e->>'subscription' then raise exception 'Subscription binding mismatch';end if;
 fingerprint=encode(sha256(convert_to((e-'event_id'-'hash'-'created_at'-'reconcile'-'intent_id')::text,'UTF8')),'hex');
 if not reconcile and b.last_event_at is not null and event_time<b.last_event_at then result='STALE';
 elsif not reconcile and (b.reconcile_required or event_time=b.last_event_at and fingerprint is distinct from b.last_fingerprint) then result='RECONCILE_REQUIRED';
 end if;
 if result<>'STALE' then
  s=case when b.terminal or e->>'status' in ('canceled','incomplete_expired') then 'CANCELLED' when result='RECONCILE_REQUIRED' then 'PAUSED'
    when e->>'status'='active' and start_at<=now() and end_at>now() and kxra_private.pilot_seats(b.org_id)<=(plan->>'people')::integer then 'ACTIVE'
    when e->>'status'='paused' then 'PAUSED' else 'PAST_DUE' end;
  if exists(select 1 from kxra.workspace_pilots where org_id=b.org_id and (mode<>'TEST_STRIPE' or offer_key<>b.catalogue_offer_key)) then raise exception 'Existing plan cannot be converted';end if;
  insert into kxra.workspace_pilots(org_id,mode,offer_key,offer_version,state,period_start,period_end,cancel_at_period_end)
   values(b.org_id,'TEST_STRIPE',b.catalogue_offer_key,1,s,start_at,end_at,(e->>'cancel_at_end')::boolean)
   on conflict(org_id) do update set state=excluded.state,period_start=excluded.period_start,period_end=excluded.period_end,
    cancel_at_period_end=excluded.cancel_at_period_end,version=kxra.workspace_pilots.version+1,updated_at=now();
  update kxra.pilot_stripe_bindings set subscription_id=e->>'subscription',version=version+1,
   last_event_at=greatest(last_event_at,event_time),last_fingerprint=fingerprint,reconcile_required=result='RECONCILE_REQUIRED',
   terminal=terminal or e->>'status' in ('canceled','incomplete_expired') where org_id=b.org_id;
 end if;
 if reconcile then update kxra.pilot_stripe_intents set state='READY' where id=r.id;end if;
 insert into kxra.pilot_stripe_events(event_id,org_id,payload_hash,fingerprint,outcome) values(e->>'event_id',b.org_id,e->>'hash',fingerprint,result);
 return result;
end $$;
revoke all on function kxra_private.record_pilot_stripe_event(jsonb) from public,anon,authenticated;
grant execute on function kxra_private.record_pilot_stripe_event(jsonb) to kxra_billing_worker;

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
     and (b.catalogue_offer_key is null or (p.offer_key=b.catalogue_offer_key and exists(
      select 1 from kxra.pilot_stripe_catalogue_config m where m.offer_key=b.catalogue_offer_key and m.mapping_revision=b.catalogue_revision and m.enabled and m.mode='sandbox'
     )))
   ))
 )
$$;
revoke all on function kxra_private.pilot_entitled(uuid) from public,anon,authenticated;


create or replace function kxra_private.pilot_stripe_readiness() returns jsonb language sql stable security definer set search_path='' as $$
 select case when kxra_private.is_owner(kxra_private.member_org()) then jsonb_build_object(
 'mapping_reviewed',exists(select 1 from kxra.pilot_stripe_catalogue_config where enabled) or (
  exists(select 1 from kxra.pilot_stripe_config where version=1 and enabled) and exists(select 1 from kxra.pilot_stripe_bindings where org_id=kxra_private.member_org() and catalogue_offer_key is null)),
 'customer_mapped',exists(select 1 from kxra.billing_customers where org_id=kxra_private.member_org() and provider='STRIPE' and state='ACTIVE'),
 'bound',exists(select 1 from kxra.pilot_stripe_bindings where org_id=kxra_private.member_org() and subscription_id is not null),
 'pending_binding',exists(select 1 from kxra.pilot_stripe_bindings where org_id=kxra_private.member_org() and subscription_id is null),
 'reconciliation_required',coalesce((select reconcile_required from kxra.pilot_stripe_bindings where org_id=kxra_private.member_org()),false)) else null end
$$;
revoke all on function kxra_private.pilot_stripe_readiness() from public,anon;
grant execute on function kxra_private.pilot_stripe_readiness() to authenticated;
