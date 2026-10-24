begin;

-- Read capability only. No activation, provider identifiers, secret values,
-- entitlement writes or table grants. 0104 is reserved for worker dispatch.
create function kxra_private.own_live_billing_status() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare
 o uuid=kxra_private.requested_org();
 b kxra_private.live_billing_bindings;
 c kxra_private.live_customer_intents;
 r kxra_private.live_billing_intents;
 state text='FRESH';actions jsonb='[]'::jsonb;billing_enabled boolean=false;
begin
 if session_user<>'kxra_app' or o is null or auth.uid() is null then raise insufficient_privilege;end if;
 -- Derive tenant and actor solely from the verified server transaction context.
 perform 1 from kxra.organisation_memberships m
 join kxra.account_identities a on a.account_id=m.account_id
 join kxra.organisations organisation on organisation.id=m.org_id
 where m.org_id=o and m.account_id=auth.uid() and m.security_role='ORG_ADMIN'
 and m.relationship_type='CUSTOMER' and m.state='ACTIVE' and m.starts_at<=now()
 and m.revoked_at is null and (m.expires_at is null or m.expires_at>now())
 and a.auth_provider='SUPABASE' and a.state='ACTIVE' and a.email_verified_at is not null
 and organisation.state='ACTIVE' and organisation.organisation_kind='CUSTOMER';
 if not found then raise insufficient_privilege;end if;

 select exists(select 1 from kxra_private.live_billing_activation a where a.singleton and a.enabled and a.review_sha256 is not null) into billing_enabled;
 select * into b from kxra_private.live_billing_bindings where org_id=o;
 select * into c from kxra_private.live_customer_intents where org_id=o;
 select * into r from kxra_private.live_billing_intents where org_id=o order by created_at desc,id desc limit 1;
 if not billing_enabled then state='DISABLED';
 elsif coalesce(b.quarantined,false) or c.state in ('UNCERTAIN','QUARANTINED') or r.state='UNCERTAIN'
 or exists(select 1 from kxra.workspace_pilots where org_id=o)
 or exists(select 1 from kxra.pilot_stripe_bindings where org_id=o)
 or exists(select 1 from kxra.billing_customers where org_id=o)
 or exists(select 1 from kxra.billing_subscriptions where org_id=o)
 or exists(select 1 from kxra.pilot_stripe_intents where org_id=o)
 or exists(select 1 from kxra.billing_customer_intents where org_id=o)
 or exists(select 1 from kxra.billing_session_intents where org_id=o)
 or exists(select 1 from kxra.billing_events where org_id=o)
 or exists(select 1 from kxra.billing_provider_events where org_id=o)
 or exists(select 1 from kxra.workspace_pilot_events where org_id=o)
 or exists(select 1 from kxra.pilot_stripe_events where org_id=o)
 then state='REVIEW_REQUIRED';
 elsif b.org_id is not null then
  state=case when r.state in ('REQUESTED','INFLIGHT') then 'REQUEST_PENDING' else 'BOUND' end;
  if state='BOUND' then
   if b.subscription_id is not null then actions='["PORTAL","RECONCILE"]'::jsonb;
   elsif b.checkout_intent_id is null then actions='["CHECKOUT"]'::jsonb;end if;
  end if;
 elsif c.org_id is not null then state='CUSTOMER_PENDING';
 else actions='["CUSTOMER"]'::jsonb;
 end if;
 return jsonb_build_object('state',state,'offer_key',coalesce(b.offer_key,c.offer_key),
  'request_id',coalesce(r.id,c.id),'kind',case when r.id is not null then r.kind when c.id is not null then 'CUSTOMER' else null end,
  'request_state',coalesce(r.state,c.state),'available_actions',actions,
  'dispatch_ready',false,'entitlement_authority',false);
end $$;
revoke all on function kxra_private.own_live_billing_status() from public,anon,kxra_billing_worker;
grant execute on function kxra_private.own_live_billing_status() to authenticated;

commit;
