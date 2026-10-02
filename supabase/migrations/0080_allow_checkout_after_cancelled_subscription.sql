begin;

create or replace function kxra.request_checkout_session(
 p_plan_version_id uuid,
 p_client_request_id uuid
)
returns table(
 intent_id uuid,
 intent_state text,
 provider_customer_id text,
 provider_price_id text,
 idempotency_key text,
 redirect_url text,
 expires_at timestamptz
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
   and i.plan_version_id=p_plan_version_id
   and (
    i.state='REQUESTED'
    or (
     i.state='READY'
     and i.expires_at>now()
     and not exists(
      select 1 from kxra.billing_subscriptions s
      where s.org_id=selected_org and s.created_at>=i.created_at
     )
    )
   )
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

commit;
