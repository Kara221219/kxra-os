-- Generated local CLI scaffold; intentionally UNNUMBERED. Release owns ordering
-- after 0113 and admission. Default-off SHADOW observations only. No paid-access,
-- policy-TTL, activation, customer identity, provider setting or credential writes.
begin;
create table kxra_private.reduced_billing_shadow_config(
 scope_id uuid primary key references kxra_private.modern_billing_execution_identity(scope_id),
 enabled boolean not null default false,
 reconcile_interval_seconds integer not null default 900 check(reconcile_interval_seconds between 900 and 86400),
 review_sha256 text not null check(review_sha256~'^[a-f0-9]{64}$'),
 read_review_sha256 text not null check(read_review_sha256~'^[a-f0-9]{64}$'),
 read_ceiling bigint not null check(read_ceiling between 7 and 1000000000)
);
create table kxra_private.reduced_billing_consents(
 scope_id uuid not null,org_id uuid not null,checkout_intent_id uuid not null,
 customer_id text not null,subscription_id text not null,checkout_session_id text not null,
 mapping_revision integer not null,policy_id uuid not null,policy_revision integer not null,terms_sha256 text not null,presentation_sha256 text not null,
 source_job_id uuid not null references kxra_private.live_paid_receipts(job_id),
 source_sha256 text not null check(source_sha256~'^[a-f0-9]{64}$'),
 consent_sha256 text not null check(consent_sha256~'^[a-f0-9]{64}$'),
 created_at timestamptz not null default now(),
 primary key(scope_id,org_id,checkout_intent_id,policy_id,policy_revision,terms_sha256,presentation_sha256),
 foreign key(scope_id,org_id) references kxra_private.live_billing_bindings(scope_id,org_id),
 foreign key(checkout_intent_id) references kxra_private.live_billing_intents(id)
);
create table kxra_private.reduced_billing_shadow_jobs(
 scope_id uuid not null,org_id uuid not null,binding_version bigint not null check(binding_version>=0),
 state text not null check(state in ('PENDING','CLAIMED','DONE','DEAD','REVIEW_REQUIRED')),
 attempts integer not null default 0 check(attempts between 0 and 5),claim_token uuid,
 lease_until timestamptz,next_attempt_at timestamptz not null default now(),
 source_job_id uuid references kxra_private.live_paid_receipts(job_id),
 updated_at timestamptz not null default now(),primary key(scope_id,org_id),
 foreign key(scope_id,org_id) references kxra_private.live_billing_bindings(scope_id,org_id),
 check(state<>'CLAIMED' or (claim_token is not null and lease_until is not null and source_job_id is not null))
);
create table kxra_private.reduced_billing_shadow_observations(
 claim_token uuid primary key,scope_id uuid not null,org_id uuid not null,binding_version bigint not null,
 outcome text not null check(outcome in ('COLLECTED','DENIED','UNVERIFIED')),
 started_at timestamptz not null,observed_at timestamptz not null,
 network_reads integer not null check(network_reads between 0 and 7),
 source_sha256 text check(source_sha256~'^[a-f0-9]{64}$'),
 consent_source_job_id uuid not null references kxra_private.live_paid_receipts(job_id),
 consent_source_sha256 text not null check(consent_source_sha256~'^[a-f0-9]{64}$'),
 entitlement_authority boolean not null default false check(not entitlement_authority),
 observation_model text not null check(observation_model='REDUCED_SHADOW_V1'),
 foreign key(scope_id,org_id) references kxra_private.live_billing_bindings(scope_id,org_id),
 check(observed_at>=started_at)
);
create index reduced_shadow_due on kxra_private.reduced_billing_shadow_jobs(scope_id,next_attempt_at,org_id) where state in ('PENDING','DONE','CLAIMED');
create index reduced_shadow_consent_lineage on kxra_private.live_paid_read_jobs(scope_id,org_id,checkout_intent_id,policy_id,policy_revision,created_at,id) where state='COMMITTED';
alter table kxra_private.reduced_billing_shadow_config enable row level security;
alter table kxra_private.reduced_billing_consents enable row level security;
alter table kxra_private.reduced_billing_shadow_jobs enable row level security;
alter table kxra_private.reduced_billing_shadow_observations enable row level security;
revoke all on kxra_private.reduced_billing_shadow_config,kxra_private.reduced_billing_consents,
 kxra_private.reduced_billing_shadow_jobs,kxra_private.reduced_billing_shadow_observations from public,anon,authenticated,kxra_billing_worker;
create trigger reduced_consent_immutable before update or delete on kxra_private.reduced_billing_consents
 for each row execute function kxra_private.live_billing_receipt_immutable();
create trigger reduced_observation_immutable before update or delete on kxra_private.reduced_billing_shadow_observations
 for each row execute function kxra_private.live_billing_receipt_immutable();

-- Runs INSIDE the existing verified durable inbox transaction, before HTTP ACK.
-- Existing 0106 already invalidates binding.version; this merely coalesces shadow
-- work. A failed insert rolls back ACK, and no event timestamp is an ordering key.
create function kxra_private.enqueue_reduced_billing_shadow() returns trigger
language plpgsql security definer set search_path='' as $$
declare b kxra_private.live_billing_bindings;r kxra_private.live_webhook_receipts;
begin
 if new.org_id is null or not exists(select 1 from kxra_private.reduced_billing_shadow_config c where c.scope_id=new.scope_id and c.enabled) then return new;end if;
 select * into b from kxra_private.live_billing_bindings where org_id=new.org_id and scope_id=new.scope_id;
 select * into r from kxra_private.live_webhook_receipts where event_id=new.event_id and scope_id=new.scope_id;
 if b.org_id is null or r.event_id is null then raise exception 'Shadow inbox lineage unavailable';end if;
 insert into kxra_private.reduced_billing_shadow_jobs as j(scope_id,org_id,binding_version,state)
 values(new.scope_id,new.org_id,b.version,case when new.state='QUARANTINED' or b.quarantined
  or (r.customer_id is not null and r.customer_id is distinct from b.customer_id)
  or (r.subscription_id is not null and r.subscription_id is distinct from b.subscription_id)
  then 'REVIEW_REQUIRED' else 'PENDING' end)
 on conflict(scope_id,org_id) do update set binding_version=excluded.binding_version,state=excluded.state,
  attempts=0,claim_token=null,lease_until=null,source_job_id=null,next_attempt_at=now(),updated_at=now();
 return new;
end $$;
create trigger reduced_shadow_inbox after insert on kxra_private.live_webhook_queue
 for each row execute function kxra_private.enqueue_reduced_billing_shadow();

-- Trusted historical assent only, not historical money authorization. The full
-- original packet is immutable and its original JS digest is checked by worker.
create function kxra_private.reduced_shadow_consent_source(o uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 select jsonb_build_object('source_job_id',j.id,'source_sha256',r.evidence_sha256,'proof',r.safe_evidence) into result
 from kxra_private.live_billing_bindings b
 join kxra_private.live_billing_intents ck on ck.scope_id=b.scope_id and ck.id=b.checkout_intent_id and ck.org_id=b.org_id
 join kxra_private.live_paid_policies q on q.scope_id=b.scope_id and q.offer_key=b.offer_key and q.mapping_revision=b.mapping_revision and q.enabled
 join kxra_private.live_paid_read_jobs j on j.scope_id=b.scope_id and j.org_id=b.org_id and j.checkout_intent_id=ck.id
  and j.customer_id=b.customer_id and j.subscription_id=b.subscription_id and j.mapping_revision=b.mapping_revision and j.policy_id=q.id and j.policy_revision=q.revision and j.state='COMMITTED'
 join kxra_private.live_paid_receipts r on r.scope_id=j.scope_id and r.job_id=j.id and r.org_id=b.org_id and r.outcome='ELIGIBLE'
 where b.org_id=o and not b.quarantined and ck.kind='CHECKOUT' and ck.state='CONSUMED'
 and ck.customer_id=b.customer_id and ck.provider_session_id is not null
 and r.safe_evidence->>'checkout_session_id'=ck.provider_session_id
 and r.safe_evidence->>'terms_review_sha256'=q.terms_review_sha256
 and r.safe_evidence->>'presentation_sha256'=q.presentation_sha256
 and r.safe_evidence->>'consent_state'='VERIFIED' and r.safe_evidence->>'payment_state'='COLLECTED'
 and r.safe_evidence->>'eligibility'='ELIGIBLE' and r.safe_evidence->>'evidence_sha256'=r.evidence_sha256
 and kxra_private.live_paid_policy_current(q.id,q.revision,o) and kxra_private.live_paid_org_actor(o) is not null
 order by j.created_at,j.id limit 1;
 return result;
end $$;

create function kxra_private.claim_reduced_billing_shadow(n integer,mode text) returns setof jsonb
language plpgsql security definer set search_path='' as $$
declare s uuid;config jsonb;b kxra_private.live_billing_bindings;ck kxra_private.live_billing_intents;
 m kxra_private.live_billing_mappings;q kxra_private.live_paid_policies;l kxra_private.reduced_billing_shadow_jobs;
 pin kxra_private.reduced_billing_consents;source jsonb;actor uuid;
begin
 perform kxra_private.modern_paid_refresh_identity();perform kxra_private.modern_billing_require_scope(mode);
 config=kxra_private.modern_billing_scope_attestation();s=(config->'execution_scope'->>'scope_id')::uuid;
 if n is null or n not between 1 and 3 then raise exception 'Invalid shadow limit';end if;
 if not exists(select 1 from kxra_private.reduced_billing_shadow_config where scope_id=s and enabled) then return;end if;
 with exhausted as(select scope_id,org_id from kxra_private.reduced_billing_shadow_jobs
  where scope_id=s and state='CLAIMED' and attempts=5 and lease_until<=now()
  order by updated_at,org_id for update skip locked limit n)
 update kxra_private.reduced_billing_shadow_jobs j set state='DEAD',updated_at=now()
 from exhausted e where j.scope_id=e.scope_id and j.org_id=e.org_id;

 for b in select binding.* from kxra_private.live_billing_bindings binding
 left join kxra_private.reduced_billing_shadow_jobs job on job.scope_id=binding.scope_id and job.org_id=binding.org_id
 where binding.scope_id=s and not binding.quarantined and binding.subscription_id is not null
 and kxra_private.reduced_shadow_consent_source(binding.org_id) is not null
 and (job.org_id is null or (job.state<>'REVIEW_REQUIRED' and (job.binding_version<>binding.version
  or (job.state in ('PENDING','DONE','CLAIMED') and job.attempts<5 and job.next_attempt_at<=now() and coalesce(job.lease_until,'-infinity'::timestamptz)<=now()))))
 order by coalesce(job.next_attempt_at,'-infinity'::timestamptz),binding.org_id
 for update of binding skip locked limit n loop
  select * into ck from kxra_private.live_billing_intents where scope_id=s and id=b.checkout_intent_id;
  select * into m from kxra_private.live_billing_mappings where scope_id=s and offer_key=b.offer_key and revision=b.mapping_revision and enabled;
  select * into q from kxra_private.live_paid_policies where scope_id=s and offer_key=b.offer_key and mapping_revision=b.mapping_revision and enabled;
  actor=kxra_private.live_paid_org_actor(b.org_id);source=kxra_private.reduced_shadow_consent_source(b.org_id);
  if m.offer_key is null or q.id is null or actor is null or source is null then continue;end if;
  insert into kxra_private.reduced_billing_consents(scope_id,org_id,checkout_intent_id,customer_id,subscription_id,checkout_session_id,mapping_revision,policy_id,policy_revision,terms_sha256,presentation_sha256,source_job_id,source_sha256,consent_sha256)
  values(s,b.org_id,ck.id,b.customer_id,b.subscription_id,ck.provider_session_id,b.mapping_revision,q.id,q.revision,q.terms_review_sha256,q.presentation_sha256,
   (source->>'source_job_id')::uuid,source->>'source_sha256',source->'proof'->>'consent_sha256') on conflict do nothing;
  select * into pin from kxra_private.reduced_billing_consents where scope_id=s and org_id=b.org_id and checkout_intent_id=ck.id
   and policy_id=q.id and policy_revision=q.revision and terms_sha256=q.terms_review_sha256 and presentation_sha256=q.presentation_sha256;
  if (pin.customer_id,pin.subscription_id,pin.mapping_revision,pin.checkout_session_id) is distinct from (b.customer_id,b.subscription_id,b.mapping_revision,ck.provider_session_id) then continue;end if;
  select jsonb_build_object('source_job_id',r.job_id,'source_sha256',r.evidence_sha256,'proof',r.safe_evidence) into source
   from kxra_private.live_paid_receipts r where r.job_id=pin.source_job_id and r.scope_id=s and r.org_id=b.org_id
   and r.outcome='ELIGIBLE' and r.evidence_sha256=pin.source_sha256 and r.safe_evidence->>'consent_sha256'=pin.consent_sha256;
  if source is null then continue;end if;
  insert into kxra_private.reduced_billing_shadow_jobs as job(scope_id,org_id,binding_version,state,attempts,claim_token,lease_until,next_attempt_at,source_job_id)
  values(s,b.org_id,b.version,'CLAIMED',1,gen_random_uuid(),now()+interval '60 seconds',now()+interval '60 seconds',pin.source_job_id)
  on conflict(scope_id,org_id) do update set binding_version=excluded.binding_version,state='CLAIMED',
   attempts=case when job.binding_version<>excluded.binding_version or job.state='DONE' then 1 else job.attempts+1 end,
   claim_token=excluded.claim_token,lease_until=excluded.lease_until,next_attempt_at=excluded.next_attempt_at,source_job_id=excluded.source_job_id,updated_at=now()
   where job.state<>'REVIEW_REQUIRED' and (job.binding_version<>excluded.binding_version or
    (job.state in ('PENDING','DONE','CLAIMED') and job.attempts<5 and job.next_attempt_at<=now() and coalesce(job.lease_until,'-infinity'::timestamptz)<=now())) returning * into l;
  if not found then continue;end if;
  return next jsonb_build_object('subject',jsonb_build_object('execution_scope',config->'execution_scope','org_id',b.org_id,'claim_token',l.claim_token,
   'binding_version',b.version,'customer_id',b.customer_id,'subscription_id',b.subscription_id,'checkout_intent_id',ck.id,
   'checkout_session_id',ck.provider_session_id,'checkout_actor_id',ck.actor_id,'actor_id',actor,'offer_key',b.offer_key,
   'mapping_revision',b.mapping_revision,'mapping',kxra_private.modern_billing_inner_dto(to_jsonb(m)),
   'policy',kxra_private.modern_billing_inner_dto(to_jsonb(q)),'lease_until',floor(extract(epoch from l.lease_until))::bigint),'consent',source);
 end loop;
end $$;

create function kxra_private.reduced_billing_shadow_current(o uuid,token uuid,mode text) returns boolean
language plpgsql security definer set search_path='' as $$
declare s uuid;
begin
 perform kxra_private.modern_paid_refresh_identity();perform kxra_private.modern_billing_require_scope(mode);
 s=(kxra_private.modern_billing_scope_attestation()->'execution_scope'->>'scope_id')::uuid;
 return exists(select 1 from kxra_private.reduced_billing_shadow_jobs j
 join kxra_private.live_billing_bindings b on b.scope_id=j.scope_id and b.org_id=j.org_id
 join kxra_private.reduced_billing_shadow_config c on c.scope_id=j.scope_id and c.enabled
 join kxra_private.live_billing_intents ck on ck.scope_id=b.scope_id and ck.id=b.checkout_intent_id and ck.org_id=b.org_id
 join kxra_private.live_paid_policies q on q.scope_id=b.scope_id and q.offer_key=b.offer_key and q.mapping_revision=b.mapping_revision and q.enabled
 join kxra_private.reduced_billing_consents pin on pin.scope_id=j.scope_id and pin.org_id=j.org_id and pin.source_job_id=j.source_job_id
  and pin.checkout_intent_id=ck.id and pin.customer_id=b.customer_id and pin.subscription_id=b.subscription_id
  and pin.mapping_revision=b.mapping_revision and pin.checkout_session_id=ck.provider_session_id
  and pin.policy_id=q.id and pin.policy_revision=q.revision and pin.terms_sha256=q.terms_review_sha256 and pin.presentation_sha256=q.presentation_sha256
 join kxra_private.live_paid_receipts r on r.scope_id=j.scope_id and r.org_id=j.org_id and r.job_id=pin.source_job_id
  and r.outcome='ELIGIBLE' and r.evidence_sha256=pin.source_sha256 and r.safe_evidence->>'consent_sha256'=pin.consent_sha256
 where j.scope_id=s and j.org_id=o and j.claim_token=token and j.state='CLAIMED' and j.lease_until>now()
 and j.binding_version=b.version and not b.quarantined and ck.kind='CHECKOUT' and ck.state='CONSUMED'
 and ck.customer_id=b.customer_id and kxra_private.live_paid_org_actor(o) is not null
 and kxra_private.live_paid_policy_current(q.id,q.revision,o));
end $$;

create function kxra_private.finish_reduced_billing_shadow(o uuid,token uuid,e jsonb,mode text) returns text
language plpgsql security definer set search_path='' as $$
declare s uuid;l kxra_private.reduced_billing_shadow_jobs;pin kxra_private.reduced_billing_consents;cadence integer;delay_seconds integer;
begin
 perform kxra_private.modern_paid_refresh_identity();perform kxra_private.modern_billing_require_scope(mode);
 s=(kxra_private.modern_billing_scope_attestation()->'execution_scope'->>'scope_id')::uuid;
 perform pg_advisory_xact_lock(hashtext('live-billing:'||o::text));
 perform 1 from kxra_private.live_billing_bindings where org_id=o and scope_id=s for update;
 select * into l from kxra_private.reduced_billing_shadow_jobs where scope_id=s and org_id=o for update;
 if not found or not kxra_private.reduced_billing_shadow_current(o,token,mode) then return 'STALE';end if;
 if e is null or jsonb_typeof(e)<>'object' or not(e ?& array['outcome','started_at','observed_at','reads','retry_after_seconds','source_sha256','consent_source_sha256','entitlement_authority','observation_model'])
 or e-'outcome'-'started_at'-'observed_at'-'reads'-'retry_after_seconds'-'source_sha256'-'consent_source_sha256'-'entitlement_authority'-'observation_model'<>'{}'::jsonb
 or e->>'outcome' not in ('COLLECTED','DENIED','UNVERIFIED') or e->'entitlement_authority'<>'false'::jsonb
 or e->>'observation_model'<>'REDUCED_SHADOW_V1' or e->>'consent_source_sha256'!~'^[a-f0-9]{64}$'
 or (e->>'source_sha256' is not null and e->>'source_sha256'!~'^[a-f0-9]{64}$')
 or jsonb_typeof(e->'reads')<>'number' or (e->>'reads')::numeric not between 0 and 7 or (e->>'reads')::numeric<>trunc((e->>'reads')::numeric)
 or jsonb_typeof(e->'retry_after_seconds')<>'number' or (e->>'retry_after_seconds')::numeric not between 0 and 3600
 or (e->>'started_at')::numeric<>(e->>'started_at')::bigint or (e->>'observed_at')::numeric<>(e->>'observed_at')::bigint
 or to_timestamp((e->>'started_at')::bigint)>clock_timestamp()+interval '5 seconds'
 or to_timestamp((e->>'observed_at')::bigint)>clock_timestamp()+interval '5 seconds'
 or (e->>'observed_at')::bigint<(e->>'started_at')::bigint
 or clock_timestamp()-to_timestamp((e->>'started_at')::bigint)>interval '55 seconds'
 or (e->>'outcome'='COLLECTED' and (e->>'source_sha256' is null or (e->>'reads')::integer<>7)) then raise exception 'Invalid non-authoritative shadow observation';end if;
 select * into pin from kxra_private.reduced_billing_consents where scope_id=s and org_id=o and source_job_id=l.source_job_id;
 if not found or pin.source_sha256 is distinct from e->>'consent_source_sha256' then raise exception 'Shadow consent source changed';end if;
 insert into kxra_private.reduced_billing_shadow_observations(claim_token,scope_id,org_id,binding_version,outcome,started_at,observed_at,network_reads,source_sha256,consent_source_job_id,consent_source_sha256,entitlement_authority,observation_model)
 values(token,s,o,l.binding_version,e->>'outcome',to_timestamp((e->>'started_at')::bigint),to_timestamp((e->>'observed_at')::bigint),(e->>'reads')::integer,e->>'source_sha256',pin.source_job_id,pin.source_sha256,false,'REDUCED_SHADOW_V1');
 select reconcile_interval_seconds into cadence from kxra_private.reduced_billing_shadow_config where scope_id=s and enabled;
 delay_seconds=greatest(30,least(3600,power(2,l.attempts)::integer*30),(e->>'retry_after_seconds')::integer);
 update kxra_private.reduced_billing_shadow_jobs set state=case when e->>'outcome'='UNVERIFIED' then case when attempts>=5 then 'DEAD' else 'PENDING' end else 'DONE' end,
  next_attempt_at=clock_timestamp()+make_interval(secs=>case when e->>'outcome'='UNVERIFIED' then delay_seconds else cadence end),lease_until=null,updated_at=now()
 where scope_id=s and org_id=o and claim_token=token;
 -- No production binding/proof/queue ACK, access or expiry write occurs here.
 return 'RECORDED';
end $$;

-- Exactly SEVEN permits per attempt, not the scheduler's 32-credit batch. Unused
-- permits stay charged after errors/crash. Same atomic scope/month/rolling lock
-- and counters as 0113 so old and new workers cannot overspend separate budgets.
create function kxra_private.reserve_reduced_shadow_reads(review text,ceiling bigint) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s uuid;period date;today date;rolling bigint;b kxra_private.modern_scheduler_read_budgets;
begin
 perform kxra_private.modern_paid_refresh_identity();
 s=(kxra_private.modern_billing_scope_attestation()->'execution_scope'->>'scope_id')::uuid;
 if review is null or review!~'^[a-f0-9]{64}$' or ceiling is null or ceiling not between 7 and 1000000000
 or not exists(select 1 from kxra_private.reduced_billing_shadow_config c where c.scope_id=s and c.enabled and c.read_review_sha256=review and c.read_ceiling=ceiling)
 then return jsonb_build_object('state','UNAVAILABLE');end if;
 period=date_trunc('month',clock_timestamp() at time zone 'UTC')::date;today=(clock_timestamp() at time zone 'UTC')::date;
 perform pg_advisory_xact_lock(hashtextextended('billing-scheduler-read:'||s::text,0));
 select * into b from kxra_private.modern_scheduler_read_budgets budget where budget.scope_id=s and budget.period_start=period and budget.enabled
 and budget.review_sha256=review and budget.limit_reads<=ceiling and budget.expires_at>clock_timestamp() and budget.used_reads<=budget.limit_reads-7 for update;
 if not found then return jsonb_build_object('state','UNAVAILABLE');end if;
 select coalesce(sum(d.used_reads),0) into rolling from kxra_private.modern_scheduler_read_days d where d.scope_id=s and d.day>=today-30;
 if rolling>b.limit_reads-7 then return jsonb_build_object('state','UNAVAILABLE');end if;
 update kxra_private.modern_scheduler_read_budgets set used_reads=used_reads+7 where scope_id=s and period_start=period;
 insert into kxra_private.modern_scheduler_read_days as day_count(scope_id,day,used_reads) values(s,today,7)
 on conflict(scope_id,day) do update set used_reads=day_count.used_reads+7;
 return jsonb_build_object('state','GRANTED','reserved_reads',7,
 'valid_until',floor(extract(epoch from least(b.expires_at,clock_timestamp()+interval '55 seconds')))::bigint);
end $$;
revoke all on function kxra_private.enqueue_reduced_billing_shadow(),kxra_private.reduced_shadow_consent_source(uuid),
 kxra_private.claim_reduced_billing_shadow(integer,text),kxra_private.reduced_billing_shadow_current(uuid,uuid,text),
 kxra_private.finish_reduced_billing_shadow(uuid,uuid,jsonb,text),kxra_private.reserve_reduced_shadow_reads(text,bigint)
 from public,anon,authenticated,kxra_billing_worker;
grant execute on function kxra_private.claim_reduced_billing_shadow(integer,text),kxra_private.reduced_billing_shadow_current(uuid,uuid,text),
 kxra_private.finish_reduced_billing_shadow(uuid,uuid,jsonb,text),kxra_private.reserve_reduced_shadow_reads(text,bigint) to kxra_billing_worker;
commit;
