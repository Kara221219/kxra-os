-- LOCAL UNNUMBERED CORRECTION. Release owns migration order and native window.
-- No provider calls, new association, customer/tenant creation, entitlement,
-- activation, policy, proof-expiry or financial write is introduced here.
begin;

-- Association evidence is a verified stored customer/subscription reference,
-- never metadata, a caller argument or a queue pointer left by the old repair.
create function kxra_private.webhook_association_recorded(i text,o uuid,s uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from kxra_private.live_webhook_receipts r
 join kxra_private.live_billing_bindings b on b.scope_id=r.scope_id and b.org_id=o
 where r.event_id=i and r.scope_id=s
 and (r.customer_id=b.customer_id or (r.subscription_id is not null and r.subscription_id=b.subscription_id))
 and (r.customer_id is null or r.customer_id=b.customer_id)
 and (r.subscription_id is null or b.subscription_id is null or r.subscription_id=b.subscription_id))
$$;
revoke all on function kxra_private.webhook_association_recorded(text,uuid,uuid) from public,anon,authenticated,kxra_billing_worker;

create function kxra_private.guard_webhook_reconciliation_association() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.org_id is not null and not kxra_private.webhook_association_recorded(new.event_id,new.org_id,new.scope_id) then
  new.state='QUARANTINED';
 end if;
 return new;
end $$;
revoke all on function kxra_private.guard_webhook_reconciliation_association() from public,anon,authenticated,kxra_billing_worker;
create trigger z90_webhook_association before insert or update on kxra_private.live_webhook_queue
 for each row execute function kxra_private.guard_webhook_reconciliation_association();
-- Preserve all receipt bytes/digests, queue association pointers, ACK evidence
-- and bindings for review. Only unsafe queue processing is stopped.
update kxra_private.live_webhook_queue q set state='QUARANTINED',updated_at=now()
 where q.org_id is not null and q.state<>'QUARANTINED'
 and not kxra_private.webhook_association_recorded(q.event_id,q.org_id,q.scope_id);

-- HELD + org_id NULL is the existing unmatched quarantine: discovery cannot
-- claim it. A supplied customer ID is not verified event/resource lineage.
-- Retain the legacy signature only for safe confirmation of a SERVER-RECORDED
-- association. Unmatched repair requires a separately reviewed proof mechanism.
create or replace function kxra_private.modern_core_resolve_unmatched_live_wakeup(i text,verified_customer text) returns text
language plpgsql security definer set search_path='' as $$
declare q kxra_private.live_webhook_queue;b kxra_private.live_billing_bindings;s uuid;
begin
 s=(kxra_private.modern_billing_scope_attestation()->'execution_scope'->>'scope_id')::uuid;
 if i is null or i!~'^evt_[A-Za-z0-9]{6,124}$' or verified_customer is null or verified_customer!~'^cus_[A-Za-z0-9]{6,124}$'
 then raise exception 'Invalid reconciliation reference';end if;
 -- Keep the original receipt -> event -> binding -> queue lock order.
 perform pg_advisory_xact_lock(hashtext('live-receipts'));
 perform pg_advisory_xact_lock(hashtext('live-wakeup:'||i));
 select * into q from kxra_private.live_webhook_queue where event_id=i and scope_id=s;
 if not found then raise exception 'Unknown scoped wakeup';end if;
 if q.org_id is null then return 'REVIEW_REQUIRED';end if;
 perform pg_advisory_xact_lock(hashtext('live-billing:'||q.org_id::text));
 select * into b from kxra_private.live_billing_bindings where org_id=q.org_id and scope_id=s for update;
 if not found or b.quarantined or b.customer_id is distinct from verified_customer then return 'REVIEW_REQUIRED';end if;
 select * into q from kxra_private.live_webhook_queue where event_id=i and scope_id=s for update;
 if q.org_id is distinct from b.org_id or q.state not in ('PENDING','CLAIMED','DONE','SUPERSEDED')
 or not kxra_private.webhook_association_recorded(i,b.org_id,s) then return 'REVIEW_REQUIRED';end if;
 return 'MATCHED';
 -- Deliberately no UPDATE/INSERT: cannot infer or assign ownership from the
 -- parameter, metadata, operator guess, event timestamp or payment boolean.
end $$;
revoke all on function kxra_private.modern_core_resolve_unmatched_live_wakeup(text,text) from public,anon,authenticated,kxra_billing_worker;

-- Existing authority attestation takes FOR SHARE; do not call it from a genuine
-- READ ONLY diagnostic. This independently validates the immutable scope digest
-- without row locks and grants no execution/entitlement capability.
create function kxra_private.webhook_reconciliation_scope_attestation() returns jsonb
language plpgsql security definer set search_path='' as $$
declare c kxra_private.modern_billing_execution_identity;
begin
 perform kxra_private.modern_paid_refresh_identity();
 select * into c from kxra_private.modern_billing_execution_identity where singleton and enabled;
 if not found or c.scope_sha256 is distinct from kxra_private.modern_billing_expected_scope_sha() then raise exception 'Diagnostic scope disabled/unbound';end if;
 return jsonb_build_object('execution_scope',kxra_private.modern_billing_scope_tag(),'enabled',true,'review_sha256',c.review_sha256,
  'catalogue',(select jsonb_agg(to_jsonb(p)-'scope_id' order by p.offer_key) from kxra_private.modern_billing_scope_catalogue p where p.scope_id=c.scope_id));
end $$;
revoke all on function kxra_private.webhook_reconciliation_scope_attestation() from public,anon,authenticated,kxra_billing_worker;
grant execute on function kxra_private.webhook_reconciliation_scope_attestation() to kxra_billing_worker;

create function kxra_private.modern_core_webhook_reconciliation_summary(mode text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s uuid;tag jsonb;result jsonb;
begin
 tag=kxra_private.webhook_reconciliation_scope_attestation()->'execution_scope';
 if mode is null or mode not in ('LIVE','STAGING_SANDBOX') or tag->>'execution_mode' is distinct from mode
 or (mode='LIVE' and tag->>'project_ref'<>'lhbgeucifxxcdoyrnesf') or (mode='STAGING_SANDBOX' and tag->>'project_ref'<>'jlebgsxcvhvpueuibekd')
 then raise exception 'Diagnostic execution scope mismatch';end if;
 s=(tag->>'scope_id')::uuid;
 select jsonb_build_object('execution_scope',kxra_private.modern_billing_scope_tag(),
  'unmatched_quarantined',least(count(*) filter(where q.org_id is null and q.state<>'QUARANTINED'),2147483647)::integer,
  'quarantined',least(count(*) filter(where q.state='QUARANTINED'),2147483647)::integer,
  'conflict_quarantined',least(count(*) filter(where q.state='QUARANTINED' and exists(select 1 from kxra_private.live_webhook_conflicts c where c.scope_id=q.scope_id and c.event_id=q.event_id)),2147483647)::integer,
  'unproven_associations',least(count(*) filter(where q.org_id is not null and not kxra_private.webhook_association_recorded(q.event_id,q.org_id,q.scope_id)),2147483647)::integer,
  'operator_held',least(count(*) filter(where q.state='HELD' and q.org_id is not null),2147483647)::integer,
  'exhausted',least(count(*) filter(where q.state='HELD' and q.org_id is not null and q.attempts=5),2147483647)::integer,
  'pending',least(count(*) filter(where q.state='PENDING'),2147483647)::integer,
  'claimed',least(count(*) filter(where q.state='CLAIMED'),2147483647)::integer,
  'completed',least(count(*) filter(where q.state='DONE'),2147483647)::integer,
  'superseded',least(count(*) filter(where q.state='SUPERSEDED'),2147483647)::integer,
  'oldest_quarantine_age_seconds',least(2147483647,greatest(0,coalesce(floor(max(extract(epoch from clock_timestamp()-r.received_at)) filter(where q.org_id is null or q.state in ('HELD','QUARANTINED') or not kxra_private.webhook_association_recorded(q.event_id,q.org_id,q.scope_id))),0)))::integer,
  'automatic_resolution',false,'entitlement_authority',false,'version','WEBHOOK_RECONCILIATION_V1') into result
 from kxra_private.live_webhook_queue q join kxra_private.live_webhook_receipts r on r.event_id=q.event_id and r.scope_id=q.scope_id
 where q.scope_id=s;
 return result;
end $$;
revoke all on function kxra_private.modern_core_webhook_reconciliation_summary(text) from public,anon,authenticated,kxra_billing_worker;
create function kxra_private.webhook_reconciliation_summary() returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 return kxra_private.modern_core_webhook_reconciliation_summary('LIVE');
end $$;
create function kxra_private.staging_sandbox_webhook_reconciliation_summary() returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 return kxra_private.modern_core_webhook_reconciliation_summary('STAGING_SANDBOX');
end $$;
revoke all on function kxra_private.webhook_reconciliation_summary(),kxra_private.staging_sandbox_webhook_reconciliation_summary() from public,anon,authenticated,kxra_billing_worker;
grant execute on function kxra_private.webhook_reconciliation_summary(),kxra_private.staging_sandbox_webhook_reconciliation_summary() to kxra_billing_worker;
commit;
