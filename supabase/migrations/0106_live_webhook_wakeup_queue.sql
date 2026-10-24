begin;
-- Default-disabled endpoint binding. No keys, provider setup, roles or activation.
create table kxra_private.live_webhook_endpoint_binding(
 singleton boolean primary key default true check(singleton),enabled boolean not null default false,
 project_ref text check(project_ref in ('jlebgsxcvhvpueuibekd','lhbgeucifxxcdoyrnesf')),
 review_sha256 text check(review_sha256~'^[a-f0-9]{64}$'),
 check(not enabled or (project_ref is not null and review_sha256 is not null))
);
alter table kxra_private.live_webhook_endpoint_binding
 add column scope_id uuid,add column execution_mode text,add column scope_project_ref text,add column scope_account_id text,add column scope_sha256 text,add column provider_livemode boolean,
 add constraint live_webhook_endpoint_binding_execution_scope_fk foreign key(scope_id,execution_mode,scope_project_ref,scope_account_id,scope_sha256)
 references kxra_private.modern_billing_execution_identity(scope_id,execution_mode,project_ref,account_id,scope_sha256) match full,
 add check((scope_id is null and provider_livemode is null) or (scope_id is not null and provider_livemode is not null and provider_livemode=(execution_mode='LIVE')));
create trigger a00_execution_scope before insert or update on kxra_private.live_webhook_endpoint_binding for each row execute function kxra_private.guard_modern_billing_row_scope();
alter table kxra_private.live_webhook_endpoint_binding add check(not enabled or scope_id is not null);

insert into kxra_private.live_webhook_endpoint_binding(singleton) values(true);
create table kxra_private.live_webhook_receipts(
 event_id text primary key check(event_id~'^evt_[A-Za-z0-9]{6,124}$'),
 event_type text not null check(event_type=any(array['checkout.session.completed','checkout.session.async_payment_succeeded','checkout.session.async_payment_failed','checkout.session.expired','customer.subscription.created','customer.subscription.updated','customer.subscription.deleted','customer.subscription.paused','customer.subscription.resumed','customer.subscription.pending_update_applied','customer.subscription.pending_update_expired','customer.subscription.trial_will_end','invoice.created','invoice.updated','invoice.finalized','invoice.paid','invoice.payment_succeeded','invoice.payment_failed','invoice.payment_action_required','invoice.voided','invoice.marked_uncollectible','payment_intent.succeeded','payment_intent.payment_failed','payment_intent.canceled','payment_intent.processing','payment_intent.requires_action','charge.succeeded','charge.failed','charge.refunded','charge.updated','charge.dispute.created','charge.dispute.updated','charge.dispute.closed','charge.dispute.funds_withdrawn','charge.dispute.funds_reinstated','refund.created','refund.updated','refund.failed'])),
 payload_sha256 text not null check(payload_sha256~'^[a-f0-9]{64}$'),
 customer_id text check(customer_id~'^cus_[A-Za-z0-9]{6,124}$'),
 subscription_id text check(subscription_id~'^sub_[A-Za-z0-9]{6,124}$'),
 invoice_id text check(invoice_id~'^in_[A-Za-z0-9]{6,125}$'),
 account_id text not null check(account_id~'^acct_[A-Za-z0-9]{6,}$'),
 project_ref text not null check(project_ref in ('jlebgsxcvhvpueuibekd','lhbgeucifxxcdoyrnesf')),
 api_version text not null check(api_version='2025-07-30.basil'),
 livemode boolean not null,received_at timestamptz not null default now()
);
alter table kxra_private.live_webhook_receipts
 add column scope_id uuid not null,add column execution_mode text not null,add column scope_project_ref text not null,add column scope_account_id text not null,add column scope_sha256 text not null,add column provider_livemode boolean not null,
 add constraint live_webhook_receipts_execution_scope_fk foreign key(scope_id,execution_mode,scope_project_ref,scope_account_id,scope_sha256)
 references kxra_private.modern_billing_execution_identity(scope_id,execution_mode,project_ref,account_id,scope_sha256) match full,
 add check((scope_id is null and provider_livemode is null) or (scope_id is not null and provider_livemode is not null and provider_livemode=(execution_mode='LIVE')));
create trigger a00_execution_scope before insert or update on kxra_private.live_webhook_receipts for each row execute function kxra_private.guard_modern_billing_row_scope();

create table kxra_private.live_webhook_conflicts(
 event_id text not null references kxra_private.live_webhook_receipts(event_id),
 observed_sha256 text not null check(observed_sha256~'^[a-f0-9]{64}$'),
 received_at timestamptz not null default now(),primary key(event_id,observed_sha256)
);
alter table kxra_private.live_webhook_conflicts
 add column scope_id uuid not null,add column execution_mode text not null,add column scope_project_ref text not null,add column scope_account_id text not null,add column scope_sha256 text not null,add column provider_livemode boolean not null,
 add constraint live_webhook_conflicts_execution_scope_fk foreign key(scope_id,execution_mode,scope_project_ref,scope_account_id,scope_sha256)
 references kxra_private.modern_billing_execution_identity(scope_id,execution_mode,project_ref,account_id,scope_sha256) match full,
 add check((scope_id is null and provider_livemode is null) or (scope_id is not null and provider_livemode is not null and provider_livemode=(execution_mode='LIVE')));
create trigger a00_execution_scope before insert or update on kxra_private.live_webhook_conflicts for each row execute function kxra_private.guard_modern_billing_row_scope();

create table kxra_private.live_webhook_queue(
 event_id text primary key references kxra_private.live_webhook_receipts(event_id),
 org_id uuid references kxra_private.live_billing_bindings(org_id),binding_version bigint check(binding_version>=0),
 state text not null check(state in ('HELD','PENDING','CLAIMED','DONE','SUPERSEDED','QUARANTINED')),
 attempts integer not null default 0 check(attempts between 0 and 5),claim_token uuid,lease_until timestamptz,
 acknowledged_job_id uuid references kxra_private.live_paid_read_jobs(id),updated_at timestamptz not null default now(),
 check((org_id is null)=(binding_version is null)),
 check(state<>'CLAIMED' or (org_id is not null and claim_token is not null and lease_until is not null))
);
alter table kxra_private.live_webhook_queue
 add column scope_id uuid not null,add column execution_mode text not null,add column scope_project_ref text not null,add column scope_account_id text not null,add column scope_sha256 text not null,add column provider_livemode boolean not null,
 add constraint live_webhook_queue_execution_scope_fk foreign key(scope_id,execution_mode,scope_project_ref,scope_account_id,scope_sha256)
 references kxra_private.modern_billing_execution_identity(scope_id,execution_mode,project_ref,account_id,scope_sha256) match full,
 add check((scope_id is null and provider_livemode is null) or (scope_id is not null and provider_livemode is not null and provider_livemode=(execution_mode='LIVE')));
create trigger a00_execution_scope before insert or update on kxra_private.live_webhook_queue for each row execute function kxra_private.guard_modern_billing_row_scope();

alter table kxra_private.live_webhook_endpoint_binding enable row level security;
alter table kxra_private.live_webhook_receipts enable row level security;
alter table kxra_private.live_webhook_conflicts enable row level security;
alter table kxra_private.live_webhook_queue enable row level security;
revoke all on kxra_private.live_webhook_endpoint_binding,kxra_private.live_webhook_receipts,
 kxra_private.live_webhook_conflicts,kxra_private.live_webhook_queue from public,anon,authenticated,kxra_billing_worker;
create trigger live_webhook_receipt_immutable before update or delete on kxra_private.live_webhook_receipts
 for each row execute function kxra_private.live_billing_receipt_immutable();
create trigger live_webhook_conflict_immutable before update or delete on kxra_private.live_webhook_conflicts
 for each row execute function kxra_private.live_billing_receipt_immutable();

create function kxra_private.modern_core_record_live_billing_wakeup(e jsonb) returns text
language plpgsql security definer set search_path='' as $$
declare prior kxra_private.live_webhook_receipts;q kxra_private.live_webhook_queue;
 target uuid;other uuid;affected uuid;generation bigint;new_conflict boolean;ambiguous boolean=false;
begin
 perform kxra_private.modern_billing_payload_scope(e);
 e=e-'execution_scope';
 if e is null or jsonb_typeof(e)<>'object' or not(e ?& array['event_id','event_type','payload_sha256','customer_id','subscription_id','invoice_id','account_id','project_ref','api_version','livemode'])
 or e-'event_id'-'event_type'-'payload_sha256'-'customer_id'-'subscription_id'-'invoice_id'-'account_id'-'project_ref'-'api_version'-'livemode'<>'{}'::jsonb
 or coalesce(e->>'event_id','')!~'^evt_[A-Za-z0-9]{6,124}$' or coalesce(e->>'payload_sha256','')!~'^[a-f0-9]{64}$'
 or not coalesce(e->>'event_type'=any(array['checkout.session.completed','checkout.session.async_payment_succeeded','checkout.session.async_payment_failed','checkout.session.expired','customer.subscription.created','customer.subscription.updated','customer.subscription.deleted','customer.subscription.paused','customer.subscription.resumed','customer.subscription.pending_update_applied','customer.subscription.pending_update_expired','customer.subscription.trial_will_end','invoice.created','invoice.updated','invoice.finalized','invoice.paid','invoice.payment_succeeded','invoice.payment_failed','invoice.payment_action_required','invoice.voided','invoice.marked_uncollectible','payment_intent.succeeded','payment_intent.payment_failed','payment_intent.canceled','payment_intent.processing','payment_intent.requires_action','charge.succeeded','charge.failed','charge.refunded','charge.updated','charge.dispute.created','charge.dispute.updated','charge.dispute.closed','charge.dispute.funds_withdrawn','charge.dispute.funds_reinstated','refund.created','refund.updated','refund.failed']),false)
 or (e->>'customer_id' is not null and e->>'customer_id'!~'^cus_[A-Za-z0-9]{6,124}$')
 or (e->>'subscription_id' is not null and e->>'subscription_id'!~'^sub_[A-Za-z0-9]{6,124}$')
 or (e->>'invoice_id' is not null and e->>'invoice_id'!~'^in_[A-Za-z0-9]{6,125}$')
 or e->>'account_id' is distinct from (kxra_private.modern_billing_scope_tag()->>'account_id') or e->>'api_version' is distinct from '2025-07-30.basil'
 or e->'livemode' is distinct from (kxra_private.modern_billing_scope_tag()->'livemode') then raise exception 'Invalid safe live wakeup';end if;
 perform 1 from kxra_private.live_webhook_endpoint_binding where singleton and enabled and project_ref=e->>'project_ref' for share;
 if not found then raise exception 'Reviewed live webhook endpoint is disabled';end if;
 -- Same receipt-global -> tenant order as0100; never acquire pilot after live.
 perform pg_advisory_xact_lock(hashtext('live-receipts'));
 perform pg_advisory_xact_lock(hashtext('live-wakeup:'||(e->>'event_id')));
 select * into prior from kxra_private.live_webhook_receipts where event_id=e->>'event_id';
 if found and prior.payload_sha256=e->>'payload_sha256' then return 'DUPLICATE';end if;
 select org_id into target from kxra_private.live_billing_bindings where customer_id=e->>'customer_id';
 select org_id into other from kxra_private.live_billing_bindings where subscription_id=e->>'subscription_id';
 if target is null then target=other;other=null;
 elsif other is distinct from target and other is not null then ambiguous=true;
 else other=null;end if;
 select * into q from kxra_private.live_webhook_queue where event_id=e->>'event_id';
 if prior.event_id is not null then
  insert into kxra_private.live_webhook_conflicts(event_id,observed_sha256) values(prior.event_id,e->>'payload_sha256')
  on conflict do nothing returning true into new_conflict;
  if not coalesce(new_conflict,false) then return 'CONFLICT';end if;
  for affected in select distinct value from unnest(array[q.org_id,target,other]) as candidate(value) where value is not null order by value loop
   perform pg_advisory_xact_lock(hashtext('live-billing:'||affected::text));
   update kxra_private.live_billing_bindings set quarantined=true,reconcile_required=true,version=version+1 where org_id=affected;
  end loop;
  update kxra_private.live_webhook_queue set state='QUARANTINED',updated_at=now() where event_id=prior.event_id;
  return 'CONFLICT';
 end if;
 insert into kxra_private.live_webhook_receipts(event_id,event_type,payload_sha256,customer_id,subscription_id,invoice_id,account_id,project_ref,api_version,livemode)
 values(e->>'event_id',e->>'event_type',e->>'payload_sha256',e->>'customer_id',e->>'subscription_id',e->>'invoice_id',e->>'account_id',e->>'project_ref',e->>'api_version',(e->>'livemode')::boolean);
 if target is not null then
  for affected in select distinct value from unnest(array[target,other]) as candidate(value) where value is not null order by value loop
   perform pg_advisory_xact_lock(hashtext('live-billing:'||affected::text));
   update kxra_private.live_billing_bindings set reconcile_required=true,version=version+1,quarantined=quarantined or ambiguous where org_id=affected;
  end loop;
  select version into generation from kxra_private.live_billing_bindings where org_id=target;
 end if;
 insert into kxra_private.live_webhook_queue(event_id,org_id,binding_version,state)
 values(e->>'event_id',target,generation,case when ambiguous then 'QUARANTINED' when target is null then 'HELD' else 'PENDING' end);
 return case when ambiguous then 'QUARANTINED' when target is null then 'UNMATCHED' else 'QUEUED' end;
end $$;

create function kxra_private.modern_core_list_unmatched_live_wakeups(n integer) returns setof jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if n is null or n not between 1 and 20 then raise exception 'Invalid bounded wakeup limit';end if;
 return query select jsonb_build_object('event_id',r.event_id,'event_type',r.event_type,'customer_id',r.customer_id,'subscription_id',r.subscription_id,'invoice_id',r.invoice_id)
 from kxra_private.live_webhook_queue q join kxra_private.live_webhook_receipts r using(event_id)
 where q.state='HELD' and q.org_id is null order by r.received_at,r.event_id limit n;
end $$;

-- Trusted worker must read the provider event first. This only matches an existing
-- binding; never creates a customer, tenant, subscription or entitlement.
create function kxra_private.modern_core_resolve_unmatched_live_wakeup(i text,verified_customer text) returns text
language plpgsql security definer set search_path='' as $$
declare q kxra_private.live_webhook_queue;b kxra_private.live_billing_bindings;generation bigint;
begin
 if verified_customer is null or verified_customer!~'^cus_[A-Za-z0-9]{6,124}$' then raise exception 'Invalid verified customer reference';end if;
 perform pg_advisory_xact_lock(hashtext('live-receipts'));
 perform pg_advisory_xact_lock(hashtext('live-wakeup:'||i));
 select * into b from kxra_private.live_billing_bindings where customer_id=verified_customer;
 if not found then return 'UNMATCHED';end if;
 perform pg_advisory_xact_lock(hashtext('live-billing:'||b.org_id::text));
 perform 1 from kxra_private.live_billing_bindings where org_id=b.org_id for update;
 select * into q from kxra_private.live_webhook_queue where event_id=i for update;
 if not found then raise exception 'Unknown live wakeup';end if;
 if q.org_id is not null then
  if q.org_id<>b.org_id then raise exception 'Wakeup already matched elsewhere';end if;
  return 'MATCHED';
 end if;
 if q.state<>'HELD' then raise exception 'Wakeup cannot be matched';end if;
 update kxra_private.live_billing_bindings set reconcile_required=true,version=version+1 where org_id=b.org_id returning version into generation;
 update kxra_private.live_webhook_queue set org_id=b.org_id,binding_version=generation,state='PENDING',updated_at=now() where event_id=i;
 return 'MATCHED';
end $$;

create function kxra_private.modern_core_claim_live_billing_wakeups(n integer) returns setof jsonb
language plpgsql security definer set search_path='' as $$
begin
 if n is null or n not between 1 and 20 then raise exception 'Invalid bounded wakeup limit';end if;
 -- Queue row locks only, with ordinary MVCC reads of bindings: no queue->binding inversion.
 with stale as(
  select q.event_id from kxra_private.live_webhook_queue q join kxra_private.live_billing_bindings b on b.org_id=q.org_id
  where q.state in ('PENDING','CLAIMED') and q.binding_version<>b.version order by q.updated_at,q.event_id for update of q skip locked limit n
 ) update kxra_private.live_webhook_queue q set state='SUPERSEDED',updated_at=now() from stale s where q.event_id=s.event_id;
 with exhausted as(
  select event_id from kxra_private.live_webhook_queue where attempts=5 and state='CLAIMED' and lease_until<=now()
  order by updated_at,event_id for update skip locked limit n
 ) update kxra_private.live_webhook_queue q set state='HELD',updated_at=now() from exhausted e where q.event_id=e.event_id;
 return query with candidates as(
  select event_id from kxra_private.live_webhook_queue where org_id is not null and attempts<5
   and (state='PENDING' or (state='CLAIMED' and lease_until<=now())) order by updated_at,event_id for update skip locked limit n
 ),claimed as(
  update kxra_private.live_webhook_queue q set state='CLAIMED',attempts=attempts+1,claim_token=gen_random_uuid(),lease_until=now()+interval '2 minutes',updated_at=now()
  from candidates c where q.event_id=c.event_id returning q.*
 ) select jsonb_build_object('event_id',c.event_id,'org_id',c.org_id,'binding_version',c.binding_version,'claim_token',c.claim_token,
   'customer_id',r.customer_id,'subscription_id',r.subscription_id,'invoice_id',r.invoice_id)
 from claimed c join kxra_private.live_webhook_receipts r using(event_id);
end $$;

create function kxra_private.modern_core_ack_live_billing_wakeup(i text,token uuid,job uuid) returns text
language plpgsql security definer set search_path='' as $$
declare q kxra_private.live_webhook_queue;
begin
 select * into q from kxra_private.live_webhook_queue where event_id=i for update;
 if not found or token is null or q.claim_token is distinct from token then raise exception 'Invalid wakeup claim';end if;
 if q.state='DONE' and q.acknowledged_job_id=job then return 'DONE';end if;
 if q.state<>'CLAIMED' or q.lease_until<=now() then raise exception 'Expired wakeup claim';end if;
 if not exists(select 1 from kxra_private.live_paid_read_jobs j join kxra_private.live_paid_receipts r on r.job_id=j.id and r.org_id=j.org_id
  join kxra_private.live_billing_bindings b on b.org_id=j.org_id
  where j.id=job and j.org_id=q.org_id and j.binding_version=q.binding_version and j.state='COMMITTED'
   and r.outcome in ('ELIGIBLE','DENIED') and b.version=j.binding_version+1)
 then raise exception 'Proof does not acknowledge this wakeup generation';end if;
 update kxra_private.live_webhook_queue set state='DONE',acknowledged_job_id=job,updated_at=now() where event_id=i;
 -- NEVER clears reconcile_required, changes binding.version or grants paid access.
 return 'DONE';
end $$;
revoke all on function kxra_private.modern_core_record_live_billing_wakeup(jsonb),kxra_private.modern_core_list_unmatched_live_wakeups(integer),
 kxra_private.modern_core_resolve_unmatched_live_wakeup(text,text),kxra_private.modern_core_claim_live_billing_wakeups(integer),kxra_private.modern_core_ack_live_billing_wakeup(text,uuid,uuid)
 from public,anon,authenticated,kxra_billing_worker;

commit;
