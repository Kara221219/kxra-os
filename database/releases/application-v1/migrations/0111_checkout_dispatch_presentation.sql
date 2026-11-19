begin;

-- Read-only worker preflight for one canonical checkout. No new settings,
-- customer/consent writes, URLs containing provider tokens, or table grants.
create function kxra_private.modern_core_checkout_dispatch_presentation(i uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r kxra_private.live_billing_intents;b kxra_private.live_billing_bindings;
 c kxra_private.live_billing_mappings;q kxra_private.live_paid_policies;
begin
 if i is null then raise exception 'Canonical checkout presentation unavailable';end if;
 select * into r from kxra_private.live_billing_intents where id=i;
 if not found or r.kind<>'CHECKOUT' or r.state not in ('REQUESTED','INFLIGHT') or r.expires_at<=now()
 or r.auth_time<now()-interval '15 minutes' or r.auth_time>now()+interval '1 minute'
 then raise exception 'Canonical checkout presentation unavailable';end if;
 select * into b from kxra_private.live_billing_bindings where org_id=r.org_id;
 if not found or b.quarantined or b.subscription_id is not null or r.subscription_id is not null
 or b.checkout_intent_id is distinct from r.id or r.observed_version is distinct from b.version
 or (b.customer_id,b.offer_key,b.mapping_revision,b.scope_id,b.execution_mode,b.scope_sha256)
 is distinct from (r.customer_id,r.offer_key,r.mapping_revision,r.scope_id,r.execution_mode,r.scope_sha256)
 then raise exception 'Canonical checkout presentation unavailable';end if;
 select * into c from kxra_private.live_billing_mappings where offer_key=r.offer_key and revision=r.mapping_revision and enabled;
 if not found or c.terms_review_sha256 is distinct from r.terms_review_sha256
 then raise exception 'Canonical checkout presentation unavailable';end if;
 -- Original intent actor only. A worker does not invent new MFA or replace the
 -- customer administrator that authorized this consequential operation.
 if not exists(select 1 from kxra.organisation_memberships m
  join kxra.account_identities a on a.account_id=m.account_id join kxra.organisations o on o.id=m.org_id
  where m.org_id=r.org_id and m.account_id=r.actor_id and m.security_role='ORG_ADMIN' and m.relationship_type='CUSTOMER'
   and m.state='ACTIVE' and m.starts_at<=now() and m.revoked_at is null and (m.expires_at is null or m.expires_at>now())
   and a.auth_provider='SUPABASE' and a.state='ACTIVE' and a.email_verified_at is not null
   and o.state='ACTIVE' and o.organisation_kind='CUSTOMER')
 or not coalesce(kxra_private.live_billing_legal_allowed(r.org_id,r.actor_id),false)
 then raise insufficient_privilege;end if;
 select * into q from kxra_private.live_paid_policies where offer_key=r.offer_key and mapping_revision=r.mapping_revision and enabled;
 if not found or not coalesce(kxra_private.live_paid_policy_current(q.id,q.revision,r.org_id),false)
 then raise exception 'Explicit reviewed checkout policy unavailable';end if;
 -- An INFLIGHT request additionally retains100's authoritative dispatch fence.
 if r.state='INFLIGHT' and not coalesce(kxra_private.modern_core_current_live_billing_intent(i),false)
 then raise exception 'Claimed checkout presentation changed';end if;
 return jsonb_build_object('request_id',r.id,'presentation',jsonb_build_object(
  'terms_review_sha256',q.terms_review_sha256,'presentation_sha256',q.presentation_sha256,'terms_url',q.terms_url,'message',q.message));
end $$;
revoke all on function kxra_private.modern_core_checkout_dispatch_presentation(uuid) from public,anon,authenticated,kxra_billing_worker;

create function kxra_private.live_checkout_dispatch_presentation(i uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 perform kxra_private.modern_billing_require_scope('LIVE');
 return kxra_private.modern_core_checkout_dispatch_presentation(i)||jsonb_build_object('execution_scope',kxra_private.modern_billing_scope_tag());
end $$;
create function kxra_private.staging_sandbox_live_checkout_dispatch_presentation(i uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 perform kxra_private.modern_billing_require_scope('STAGING_SANDBOX');
 return kxra_private.modern_core_checkout_dispatch_presentation(i)||jsonb_build_object('execution_scope',kxra_private.modern_billing_scope_tag());
end $$;
revoke all on function kxra_private.live_checkout_dispatch_presentation(uuid),kxra_private.staging_sandbox_live_checkout_dispatch_presentation(uuid)
 from public,anon,authenticated,kxra_billing_worker;
grant execute on function kxra_private.live_checkout_dispatch_presentation(uuid),kxra_private.staging_sandbox_live_checkout_dispatch_presentation(uuid) to kxra_billing_worker;
commit;
