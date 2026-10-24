begin;
-- Default-off runner orchestration. One shared modern storage/algorithm, mode-fixed
-- wrappers. No activation/policy/catalogue seeds, roles or client entitlements.
create table kxra_private.modern_paid_refresh_leases(
 scope_id uuid not null,org_id uuid not null,claim_token uuid not null unique,
 binding_version bigint not null,lease_until timestamptz not null,next_attempt_at timestamptz not null,
 job_id uuid,primary key(scope_id,org_id),
 foreign key(scope_id,org_id) references kxra_private.live_billing_bindings(scope_id,org_id),
 foreign key(scope_id,job_id) references kxra_private.live_paid_read_jobs(scope_id,id)
);
alter table kxra_private.modern_paid_refresh_leases enable row level security;
revoke all on kxra_private.modern_paid_refresh_leases from public,anon,authenticated,kxra_billing_worker;
create function kxra_private.modern_paid_refresh_identity() returns void
language plpgsql security definer set search_path='' as $$
begin
 if session_user<>'kxra_billing_runner' or current_setting('role',true)<>'kxra_billing_worker' then raise insufficient_privilege;end if;
end $$;
create function kxra_private.modern_core_claim_live_paid_refresh(n integer,mode text) returns setof jsonb
language plpgsql security definer set search_path='' as $$
declare config jsonb;s uuid;b kxra_private.live_billing_bindings;c kxra_private.live_billing_mappings;
 q kxra_private.live_paid_policies;ck kxra_private.live_billing_intents;l kxra_private.modern_paid_refresh_leases;actor uuid;
begin
 perform kxra_private.modern_paid_refresh_identity();
 perform kxra_private.modern_billing_require_scope(mode);
 config=kxra_private.modern_billing_scope_attestation();s=(config->'execution_scope'->>'scope_id')::uuid;
 if n is null or n not between 1 and 20 then raise exception 'Invalid bounded refresh limit';end if;
 -- Lock only bounded binding rows, skipping another worker. No provider HTTP here.
 for b in select binding.* from kxra_private.live_billing_bindings binding
 left join kxra_private.live_paid_access a on a.org_id=binding.org_id and a.scope_id=binding.scope_id
 left join kxra_private.modern_paid_refresh_leases lease on lease.org_id=binding.org_id and lease.scope_id=binding.scope_id
 where binding.scope_id=s and not binding.quarantined and binding.subscription_id is not null
 and exists(select 1 from kxra_private.live_billing_mappings mapping where mapping.scope_id=s and mapping.offer_key=binding.offer_key and mapping.revision=binding.mapping_revision and mapping.enabled)
 and exists(select 1 from kxra_private.live_paid_policies policy where policy.scope_id=s and policy.offer_key=binding.offer_key and policy.mapping_revision=binding.mapping_revision and policy.enabled
  and kxra_private.live_paid_policy_current(policy.id,policy.revision,binding.org_id))
 and exists(select 1 from kxra_private.live_billing_intents checkout where checkout.scope_id=s and checkout.id=binding.checkout_intent_id and checkout.org_id=binding.org_id
  and checkout.state='CONSUMED' and checkout.kind='CHECKOUT' and checkout.customer_id=binding.customer_id and checkout.provider_session_id is not null)
 and kxra_private.live_paid_org_actor(binding.org_id) is not null
 and (lease.org_id is null or (lease.lease_until<=now() and lease.next_attempt_at<=now()))
 and (binding.reconcile_required or a.org_id is null or a.valid_until<=now()+interval '60 seconds'
  or a.binding_version<>binding.version)
 order by coalesce(a.valid_until,'-infinity'::timestamptz),binding.org_id
 for update of binding skip locked limit n loop
  actor=kxra_private.live_paid_org_actor(b.org_id);if actor is null then continue;end if;
  select * into c from kxra_private.live_billing_mappings where scope_id=s and offer_key=b.offer_key and revision=b.mapping_revision and enabled;
  if not found then continue;end if;
  select * into q from kxra_private.live_paid_policies where scope_id=s and offer_key=b.offer_key and mapping_revision=b.mapping_revision and enabled;
  if not found or not kxra_private.live_paid_policy_current(q.id,q.revision,b.org_id) then continue;end if;
  select * into ck from kxra_private.live_billing_intents where scope_id=s and id=b.checkout_intent_id;
  if not found or ck.state<>'CONSUMED' or ck.kind<>'CHECKOUT' or ck.org_id<>b.org_id or ck.customer_id<>b.customer_id
   or ck.offer_key<>b.offer_key or ck.mapping_revision<>b.mapping_revision or ck.terms_review_sha256<>q.terms_review_sha256
   or ck.provider_session_id is null then continue;end if;
  insert into kxra_private.modern_paid_refresh_leases as current_lease(scope_id,org_id,claim_token,binding_version,lease_until,next_attempt_at)
  values(s,b.org_id,gen_random_uuid(),b.version,now()+interval '2 minutes',now()+interval '2 minutes')
  on conflict(scope_id,org_id) do update set claim_token=excluded.claim_token,binding_version=excluded.binding_version,
   lease_until=excluded.lease_until,next_attempt_at=excluded.next_attempt_at,job_id=null
   -- The discovery SELECT snapshot can predate another committed claim even after
   -- its binding row lock has ended. Recheck the conflicting lease atomically.
   where current_lease.lease_until<=now() and current_lease.next_attempt_at<=now()
   returning * into l;
  if not found then continue;end if;
  -- Superseded wakeups are handed to due discovery, never forged into DONE.
  update kxra_private.live_webhook_queue set state='SUPERSEDED',updated_at=now()
   where scope_id=s and org_id=b.org_id and binding_version<>b.version and state in ('PENDING','CLAIMED');
  return next jsonb_build_object('execution_scope',config->'execution_scope','org_id',b.org_id,'claim_token',l.claim_token,
   'binding_version',b.version,'customer_id',b.customer_id,'subscription_id',b.subscription_id,'checkout_intent_id',ck.id,
   'checkout_session_id',ck.provider_session_id,'checkout_actor_id',ck.actor_id,'actor_id',actor,'offer_key',b.offer_key,
   'mapping_revision',b.mapping_revision,'mapping',kxra_private.modern_billing_inner_dto(to_jsonb(c)),'policy',kxra_private.modern_billing_inner_dto(to_jsonb(q)),'lease_until',floor(extract(epoch from l.lease_until))::bigint);
 end loop;
end $$;
create function kxra_private.modern_core_live_paid_refresh_current(o uuid,token uuid,mode text) returns boolean
language plpgsql security definer set search_path='' as $$
declare s uuid;
begin
 perform kxra_private.modern_paid_refresh_identity();perform kxra_private.modern_billing_require_scope(mode);
 s=(kxra_private.modern_billing_scope_attestation()->'execution_scope'->>'scope_id')::uuid;
 return exists(select 1 from kxra_private.modern_paid_refresh_leases l
 join kxra_private.live_billing_bindings b on b.scope_id=l.scope_id and b.org_id=l.org_id
 join kxra_private.live_billing_intents ck on ck.scope_id=b.scope_id and ck.id=b.checkout_intent_id
 join kxra_private.live_paid_policies q on q.scope_id=b.scope_id and q.offer_key=b.offer_key and q.mapping_revision=b.mapping_revision and q.enabled
 where l.scope_id=s and l.org_id=o and l.claim_token=token and l.lease_until>now() and l.binding_version=b.version and not b.quarantined
 and ck.state='CONSUMED' and ck.kind='CHECKOUT' and ck.customer_id=b.customer_id
 and kxra_private.live_paid_org_actor(o) is not null and kxra_private.live_paid_policy_current(q.id,q.revision,o));
end $$;
create function kxra_private.modern_core_reserve_live_paid_refresh(o uuid,token uuid,i uuid,gross integer,invoice text,item text,start_at bigint,end_at bigint,mode text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 -- Match 0104 lock order before fencing the lease; locks end before HTTP.
 perform pg_advisory_xact_lock(hashtext('pilot:'||o::text));perform pg_advisory_xact_lock(hashtext('live-billing:'||o::text));
 perform 1 from kxra_private.live_billing_bindings where org_id=o for update;
 if not kxra_private.modern_core_live_paid_refresh_current(o,token,mode) then raise exception 'Refresh claim superseded';end if;
 if exists(select 1 from kxra_private.modern_paid_refresh_leases where org_id=o and claim_token=token and job_id is not null and job_id<>i) then raise exception 'Refresh already reserved';end if;
 if mode='LIVE' then result=kxra_private.reserve_live_paid_read(i,o,gross,invoice,item,start_at,end_at);
 else result=kxra_private.staging_sandbox_reserve_live_paid_read(i,o,gross,invoice,item,start_at,end_at);end if;
 update kxra_private.modern_paid_refresh_leases set job_id=i where org_id=o and claim_token=token;
 return result;
end $$;
create function kxra_private.modern_core_commit_live_paid_refresh(o uuid,token uuid,i uuid,e jsonb,mode text) returns text
language plpgsql security definer set search_path='' as $$
declare result text;
begin
 perform pg_advisory_xact_lock(hashtext('pilot:'||o::text));perform pg_advisory_xact_lock(hashtext('live-billing:'||o::text));
 perform 1 from kxra_private.live_billing_bindings where org_id=o for update;
 if not kxra_private.modern_core_live_paid_refresh_current(o,token,mode) or not exists(
  select 1 from kxra_private.modern_paid_refresh_leases where org_id=o and claim_token=token and job_id=i) then return 'STALE';end if;
 if mode='LIVE' then result=kxra_private.commit_live_paid_proof(i,e);
 else result=kxra_private.staging_sandbox_commit_live_paid_proof(i,e);end if;
 update kxra_private.modern_paid_refresh_leases set lease_until=now(),next_attempt_at=now()+interval '30 seconds' where org_id=o and claim_token=token;
 return result;
end $$;
create function kxra_private.claim_live_paid_refresh(n integer) returns setof jsonb
language sql volatile security definer set search_path='' as $$
 select * from kxra_private.modern_core_claim_live_paid_refresh(n,'LIVE')
$$;
revoke all on function kxra_private.claim_live_paid_refresh(integer) from public,anon,authenticated,kxra_billing_worker;
grant execute on function kxra_private.claim_live_paid_refresh(integer) to kxra_billing_worker;
create function kxra_private.staging_sandbox_claim_live_paid_refresh(n integer) returns setof jsonb
language sql volatile security definer set search_path='' as $$
 select * from kxra_private.modern_core_claim_live_paid_refresh(n,'STAGING_SANDBOX')
$$;
revoke all on function kxra_private.staging_sandbox_claim_live_paid_refresh(integer) from public,anon,authenticated,kxra_billing_worker;
grant execute on function kxra_private.staging_sandbox_claim_live_paid_refresh(integer) to kxra_billing_worker;
revoke all on function kxra_private.modern_core_claim_live_paid_refresh(integer,text) from public,anon,authenticated,kxra_billing_worker;
create function kxra_private.live_paid_refresh_current(o uuid,token uuid) returns boolean
language sql volatile security definer set search_path='' as $$
 select * from kxra_private.modern_core_live_paid_refresh_current(o,token,'LIVE')
$$;
revoke all on function kxra_private.live_paid_refresh_current(uuid,uuid) from public,anon,authenticated,kxra_billing_worker;
grant execute on function kxra_private.live_paid_refresh_current(uuid,uuid) to kxra_billing_worker;
create function kxra_private.staging_sandbox_live_paid_refresh_current(o uuid,token uuid) returns boolean
language sql volatile security definer set search_path='' as $$
 select * from kxra_private.modern_core_live_paid_refresh_current(o,token,'STAGING_SANDBOX')
$$;
revoke all on function kxra_private.staging_sandbox_live_paid_refresh_current(uuid,uuid) from public,anon,authenticated,kxra_billing_worker;
grant execute on function kxra_private.staging_sandbox_live_paid_refresh_current(uuid,uuid) to kxra_billing_worker;
revoke all on function kxra_private.modern_core_live_paid_refresh_current(uuid,uuid,text) from public,anon,authenticated,kxra_billing_worker;
create function kxra_private.reserve_live_paid_refresh(o uuid,token uuid,i uuid,gross integer,invoice text,item text,start_at bigint,end_at bigint) returns jsonb
language sql volatile security definer set search_path='' as $$
 select * from kxra_private.modern_core_reserve_live_paid_refresh(o,token,i,gross,invoice,item,start_at,end_at,'LIVE')
$$;
revoke all on function kxra_private.reserve_live_paid_refresh(uuid,uuid,uuid,integer,text,text,bigint,bigint) from public,anon,authenticated,kxra_billing_worker;
grant execute on function kxra_private.reserve_live_paid_refresh(uuid,uuid,uuid,integer,text,text,bigint,bigint) to kxra_billing_worker;
create function kxra_private.staging_sandbox_reserve_live_paid_refresh(o uuid,token uuid,i uuid,gross integer,invoice text,item text,start_at bigint,end_at bigint) returns jsonb
language sql volatile security definer set search_path='' as $$
 select * from kxra_private.modern_core_reserve_live_paid_refresh(o,token,i,gross,invoice,item,start_at,end_at,'STAGING_SANDBOX')
$$;
revoke all on function kxra_private.staging_sandbox_reserve_live_paid_refresh(uuid,uuid,uuid,integer,text,text,bigint,bigint) from public,anon,authenticated,kxra_billing_worker;
grant execute on function kxra_private.staging_sandbox_reserve_live_paid_refresh(uuid,uuid,uuid,integer,text,text,bigint,bigint) to kxra_billing_worker;
revoke all on function kxra_private.modern_core_reserve_live_paid_refresh(uuid,uuid,uuid,integer,text,text,bigint,bigint,text) from public,anon,authenticated,kxra_billing_worker;
create function kxra_private.commit_live_paid_refresh(o uuid,token uuid,i uuid,e jsonb) returns text
language sql volatile security definer set search_path='' as $$
 select * from kxra_private.modern_core_commit_live_paid_refresh(o,token,i,e,'LIVE')
$$;
revoke all on function kxra_private.commit_live_paid_refresh(uuid,uuid,uuid,jsonb) from public,anon,authenticated,kxra_billing_worker;
grant execute on function kxra_private.commit_live_paid_refresh(uuid,uuid,uuid,jsonb) to kxra_billing_worker;
create function kxra_private.staging_sandbox_commit_live_paid_refresh(o uuid,token uuid,i uuid,e jsonb) returns text
language sql volatile security definer set search_path='' as $$
 select * from kxra_private.modern_core_commit_live_paid_refresh(o,token,i,e,'STAGING_SANDBOX')
$$;
revoke all on function kxra_private.staging_sandbox_commit_live_paid_refresh(uuid,uuid,uuid,jsonb) from public,anon,authenticated,kxra_billing_worker;
grant execute on function kxra_private.staging_sandbox_commit_live_paid_refresh(uuid,uuid,uuid,jsonb) to kxra_billing_worker;
revoke all on function kxra_private.modern_core_commit_live_paid_refresh(uuid,uuid,uuid,jsonb,text) from public,anon,authenticated,kxra_billing_worker;
revoke all on function kxra_private.modern_paid_refresh_identity() from public,anon,authenticated,kxra_billing_worker;
commit;
