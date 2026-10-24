-- Source-only, default-disabled LIVE proof/seat bridge. Requires owner-integrated0100-0103.
-- NO policy/terms/activation seed, new role/credential, provider mutation or legacy conversion.
create table kxra_private.live_paid_policies(
 id uuid not null,revision integer not null check(revision>0),enabled boolean not null default false,
 offer_key text not null,mapping_revision integer not null,
 terms_document_id uuid not null,terms_document_version integer not null,
 terms_url text not null check(length(terms_url)<=1500),message text not null check(length(message) between 1 and 1200),
 activation_review_sha256 text not null check(activation_review_sha256~'^[a-f0-9]{64}$'),
 terms_review_sha256 text not null check(terms_review_sha256~'^[a-f0-9]{64}$'),presentation_sha256 text not null check(presentation_sha256~'^[a-f0-9]{64}$'),
 tax_review_sha256 text not null check(tax_review_sha256~'^[a-f0-9]{64}$'),cancellation_review_sha256 text not null check(cancellation_review_sha256~'^[a-f0-9]{64}$'),
 grace_review_sha256 text not null check(grace_review_sha256~'^[a-f0-9]{64}$'),refund_review_sha256 text not null check(refund_review_sha256~'^[a-f0-9]{64}$'),
 trial_review_sha256 text not null check(trial_review_sha256~'^[a-f0-9]{64}$'),ai_review_sha256 text not null check(ai_review_sha256~'^[a-f0-9]{64}$'),
 access_rule text not null check(access_rule='CURRENT_COLLECTED_ACTIVE_ONLY'),
 cancellation_mode text not null check(cancellation_mode in ('END_OF_PAID_PERIOD','DENY_WHEN_SCHEDULED')),
 grace_seconds integer not null check(grace_seconds=0),refund_mode text not null check(refund_mode='DENY_ANY_REFUND'),
 trial_access boolean not null check(not trial_access),past_due_access boolean not null check(not past_due_access),
 proof_ttl_seconds integer not null check(proof_ttl_seconds between 1 and 300),
 primary key(id,revision),foreign key(offer_key,mapping_revision) references kxra_private.live_billing_mappings(offer_key,revision),
 foreign key(terms_document_id,terms_document_version) references kxra.legal_documents(id,version)
);
create unique index live_paid_one_enabled_policy on kxra_private.live_paid_policies(offer_key,mapping_revision) where enabled;
create trigger live_paid_policy_immutable before update or delete on kxra_private.live_paid_policies for each row execute function kxra_private.live_billing_mapping_immutable();
create table kxra_private.live_paid_read_jobs(
 id uuid primary key,org_id uuid not null references kxra_private.live_billing_bindings(org_id),
 actor_id uuid not null references kxra.account_identities(account_id),checkout_actor_id uuid not null references kxra.account_identities(account_id),
 binding_version bigint not null,mapping_revision integer not null,offer_key text not null,policy_id uuid not null,policy_revision integer not null,
 checkout_intent_id uuid not null references kxra_private.live_billing_intents(id),checkout_session_id text not null,
 customer_id text not null,subscription_id text not null,invoice_id text not null check(invoice_id~'^in_[A-Za-z0-9]{6,}$'),
 subscription_item_id text not null check(subscription_item_id~'^si_[A-Za-z0-9]{6,}$'),
 period_start bigint not null,period_end bigint not null,expected_total_minor integer not null check(expected_total_minor>0),
 state text not null default 'CLAIMED' check(state in ('CLAIMED','COMMITTED','STALE')),created_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '5 minutes',
 foreign key(policy_id,policy_revision) references kxra_private.live_paid_policies(id,revision),check(period_end>period_start)
);
create function kxra_private.guard_live_paid_read_identity() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' or (to_jsonb(new)-'state') is distinct from (to_jsonb(old)-'state') or old.state<>'CLAIMED' then raise exception 'Live read identity/consumption is immutable';end if;
 return new;
end $$;
create trigger live_paid_read_immutable before update or delete on kxra_private.live_paid_read_jobs for each row execute function kxra_private.guard_live_paid_read_identity();
create table kxra_private.live_paid_receipts(
 job_id uuid primary key references kxra_private.live_paid_read_jobs(id),org_id uuid not null,
 evidence_sha256 text not null check(evidence_sha256~'^[a-f0-9]{64}$'),outcome text not null check(outcome in ('ELIGIBLE','DENIED','STALE')),
 safe_evidence jsonb not null check(jsonb_typeof(safe_evidence)='object'),created_at timestamptz not null default now()
);
create table kxra_private.live_paid_conflicts(job_id uuid not null references kxra_private.live_paid_read_jobs(id),evidence_sha256 text not null check(evidence_sha256~'^[a-f0-9]{64}$'),primary key(job_id,evidence_sha256));
create table kxra_private.live_paid_access(
 org_id uuid primary key references kxra_private.live_billing_bindings(org_id),job_id uuid not null unique references kxra_private.live_paid_receipts(job_id),
 binding_version bigint not null,mapping_revision integer not null,offer_key text not null,policy_id uuid not null,policy_revision integer not null,
 customer_id text not null,subscription_id text not null,invoice_id text not null,payment_intent_id text not null,charge_id text not null,
 checkout_intent_id uuid not null,checkout_session_id text not null,terms_review_sha256 text not null,presentation_sha256 text not null,
 period_start timestamptz not null,period_end timestamptz not null,valid_until timestamptz not null,
 cancel_at_period_end boolean not null,checked_at timestamptz not null,
 foreign key(policy_id,policy_revision) references kxra_private.live_paid_policies(id,revision),check(period_end>period_start)
);
alter table kxra_private.live_paid_policies enable row level security;
alter table kxra_private.live_paid_read_jobs enable row level security;
alter table kxra_private.live_paid_receipts enable row level security;
alter table kxra_private.live_paid_conflicts enable row level security;
alter table kxra_private.live_paid_access enable row level security;
revoke all on kxra_private.live_paid_policies,kxra_private.live_paid_read_jobs,kxra_private.live_paid_receipts,kxra_private.live_paid_conflicts,kxra_private.live_paid_access from public,anon,authenticated,kxra_billing_worker;
create trigger live_paid_receipt_immutable before update or delete on kxra_private.live_paid_receipts for each row execute function kxra_private.live_billing_receipt_immutable();
create trigger live_paid_conflict_immutable before update or delete on kxra_private.live_paid_conflicts for each row execute function kxra_private.live_billing_receipt_immutable();

create function kxra_private.is_live_billing_lane(o uuid) returns boolean language sql volatile security definer set search_path='' as $$
 select exists(select 1 from kxra_private.billing_admission_lanes where org_id=o and lane='LIVE')
 or exists(select 1 from kxra_private.live_customer_intents where org_id=o)
 or exists(select 1 from kxra_private.live_billing_bindings where org_id=o)
$$;
-- Eligibility for READ-only renewals is current tenant authority + historical checkout consent,
-- not a forged fresh auth_time for the original actor. Actual operations still enforce user RLS.
create function kxra_private.live_paid_org_actor(o uuid) returns uuid language sql volatile security definer set search_path='' as $$
 select m.account_id from kxra.organisation_memberships m join kxra.account_identities a on a.account_id=m.account_id
 join kxra.organisations organisation on organisation.id=m.org_id
 where m.org_id=o and m.security_role='ORG_ADMIN' and m.relationship_type='CUSTOMER' and m.state='ACTIVE'
 and m.starts_at<=now() and m.revoked_at is null and (m.expires_at is null or m.expires_at>now())
 and a.auth_provider='SUPABASE' and a.state='ACTIVE' and a.email_verified_at is not null and organisation.state='ACTIVE'
 and kxra_private.live_billing_legal_allowed(o,m.account_id) order by m.account_id limit 1
$$;
create function kxra_private.live_paid_policy_current(p uuid,v integer,o uuid) returns boolean language sql volatile security definer set search_path='' as $$
 select exists(select 1 from kxra_private.live_paid_policies q join kxra_private.live_billing_bindings b on b.org_id=o and b.offer_key=q.offer_key and b.mapping_revision=q.mapping_revision
 join kxra_private.live_billing_mappings c on c.offer_key=q.offer_key and c.revision=q.mapping_revision and c.enabled
 join kxra_private.live_billing_activation a on a.singleton and a.enabled and a.review_sha256=c.activation_review_sha256 and a.review_sha256=q.activation_review_sha256
 join kxra.legal_documents d on d.id=q.terms_document_id and d.version=q.terms_document_version and d.content_sha256=q.terms_review_sha256
 where q.id=p and q.revision=v and q.enabled and q.terms_review_sha256=c.terms_review_sha256 and q.tax_review_sha256=c.tax_review_sha256
 and d.status='APPROVED' and d.effective_at<=now() and d.owner_approval_reference is not null and d.owner_approved_at is not null)
$$;
create function kxra_private.reserve_live_paid_read(i uuid,o uuid,gross integer,invoice text,item text,start_at bigint,end_at bigint) returns jsonb
language plpgsql security definer set search_path='' as $$
declare b kxra_private.live_billing_bindings;c kxra_private.live_billing_mappings;q kxra_private.live_paid_policies;ck kxra_private.live_billing_intents;j kxra_private.live_paid_read_jobs;actor uuid;amount integer;
begin
 perform kxra_private.live_billing_gate();
 if i is null or o is null or gross is null or invoice is null or invoice!~'^in_[A-Za-z0-9]{6,}$' or item is null or item!~'^si_[A-Za-z0-9]{6,}$'
 or start_at is null or end_at is null or end_at<=start_at then raise exception 'Canonical provider read scope required';end if;
 perform pg_advisory_xact_lock(hashtext('pilot:'||o::text));perform pg_advisory_xact_lock(hashtext('live-billing:'||o::text));
 select * into b from kxra_private.live_billing_bindings where org_id=o for update;
 if not found or not kxra_private.is_live_billing_lane(o) or b.quarantined or b.subscription_id is null then raise exception 'Live binding unavailable';end if;
 actor=kxra_private.live_paid_org_actor(o);if actor is null then raise insufficient_privilege;end if;
 select * into c from kxra_private.live_billing_mappings where offer_key=b.offer_key and revision=b.mapping_revision and enabled for share;
 select * into q from kxra_private.live_paid_policies where offer_key=b.offer_key and mapping_revision=b.mapping_revision and enabled for share;
 if not found or not kxra_private.live_paid_policy_current(q.id,q.revision,o) then raise exception 'Explicit reviewed live policy required';end if;
 select (p->>'monthly_amount_minor')::integer into amount from jsonb_array_elements(kxra_private.approved_workspace_catalogue_v1()) p where p->>'offer_key'=b.offer_key;
 if amount is null or gross<amount or (c.tax_behavior='inclusive' and gross<>amount) then raise exception 'Reviewed deterministic tax total required';end if;
 select * into ck from kxra_private.live_billing_intents where id=b.checkout_intent_id for share;
 if not found or ck.org_id<>o or ck.kind<>'CHECKOUT' or ck.state<>'CONSUMED' or ck.customer_id<>b.customer_id
 or ck.offer_key<>b.offer_key or ck.mapping_revision<>b.mapping_revision or ck.terms_review_sha256<>c.terms_review_sha256
 or ck.provider_session_id is null or ck.provider_session_id!~'^cs_live_[A-Za-z0-9_]{6,}$' then raise exception 'Claimed completed checkout provenance required';end if;
 -- Original checkout expiry is deliberately not checked: completed consent is historical.
 select * into j from kxra_private.live_paid_read_jobs where id=i;
 if found then
  if (j.org_id,j.expected_total_minor,j.invoice_id,j.subscription_item_id,j.period_start,j.period_end) is distinct from (o,gross,invoice,item,start_at,end_at)
  then raise exception 'Live read request replay conflict';end if;
  if j.state<>'CLAIMED' or j.expires_at<=now() or j.binding_version<>b.version or (j.policy_id,j.policy_revision) is distinct from (q.id,q.revision) then
   return jsonb_build_object('reconciliation_id',j.id,'state',case when j.state='CLAIMED' then 'STALE' else j.state end,'entitlement_authority',false);
  end if;
 else
 insert into kxra_private.live_paid_read_jobs(id,org_id,actor_id,checkout_actor_id,binding_version,mapping_revision,offer_key,policy_id,policy_revision,checkout_intent_id,checkout_session_id,customer_id,subscription_id,invoice_id,subscription_item_id,period_start,period_end,expected_total_minor)
 values(i,o,actor,ck.actor_id,b.version,b.mapping_revision,b.offer_key,q.id,q.revision,ck.id,ck.provider_session_id,b.customer_id,b.subscription_id,invoice,item,start_at,end_at,gross) returning * into j;
 end if;
 return jsonb_build_object('context',jsonb_build_object('reconciliation_id',j.id,'org_id',j.org_id,'actor_id',j.actor_id,'binding_version',j.binding_version,'offer_key',j.offer_key,'mapping_revision',j.mapping_revision,
 'policy_id',j.policy_id,'policy_revision',j.policy_revision,'customer_id',j.customer_id,'subscription_id',j.subscription_id,'invoice_id',j.invoice_id,'price_id',c.price_id,'product_id',c.product_id,
 'checkout_intent_id',j.checkout_intent_id,'checkout_session_id',j.checkout_session_id,'period_start',j.period_start,'period_end',j.period_end,'expected_total_minor',j.expected_total_minor,
 'created_at',floor(extract(epoch from j.created_at))::bigint,'expires_at',floor(extract(epoch from j.expires_at))::bigint),
 'subscription_item_id',j.subscription_item_id,'checkout_actor_id',j.checkout_actor_id,'mapping',to_jsonb(c),'policy',to_jsonb(q),'entitlement_authority',false,'provider_mutation_authority',false);
end $$;

-- Existing worker capability can fence READ adapters without direct table privileges.
create function kxra_private.live_paid_read_current(i uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare j kxra_private.live_paid_read_jobs;b kxra_private.live_billing_bindings;ck kxra_private.live_billing_intents;
begin
 select * into j from kxra_private.live_paid_read_jobs where id=i;if not found then return false;end if;
 perform pg_advisory_xact_lock(hashtext('pilot:'||j.org_id::text));perform pg_advisory_xact_lock(hashtext('live-billing:'||j.org_id::text));
 select * into j from kxra_private.live_paid_read_jobs where id=i;
 select * into b from kxra_private.live_billing_bindings where org_id=j.org_id;
 select * into ck from kxra_private.live_billing_intents where id=j.checkout_intent_id;
 return coalesce(j.state='CLAIMED' and j.expires_at>now() and b.version=j.binding_version and not b.quarantined
 and kxra_private.is_live_billing_lane(j.org_id) and kxra_private.live_paid_policy_current(j.policy_id,j.policy_revision,j.org_id)
 and kxra_private.live_paid_org_actor(j.org_id) is not null
 and (b.customer_id,b.subscription_id,b.offer_key,b.mapping_revision,b.checkout_intent_id)=(j.customer_id,j.subscription_id,j.offer_key,j.mapping_revision,j.checkout_intent_id)
 and ck.state='CONSUMED' and ck.kind='CHECKOUT' and ck.provider_session_id=j.checkout_session_id and ck.customer_id=b.customer_id,false);
end $$;

create function kxra_private.commit_live_paid_proof(i uuid,e jsonb) returns text
language plpgsql security definer set search_path='' as $$
declare j kxra_private.live_paid_read_jobs;b kxra_private.live_billing_bindings;q kxra_private.live_paid_policies;c kxra_private.live_billing_mappings;
 old kxra_private.live_paid_receipts;ck kxra_private.live_billing_intents;allowed text[]=array['reconciliation_id','org_id','binding_version','mapping_revision','offer_key','policy_id','policy_revision','customer_id','subscription_id','invoice_id','price_id','product_id','checkout_intent_id','checkout_session_id','period_start','period_end','currency','quantity','monthly_amount_minor','expected_total_minor','collected_minor','refunded_minor','payment_intent_id','charge_id','payment_state','consent_state','subscription_status','cancel_at_period_end','terms_review_sha256','presentation_sha256','payment_sha256','consent_sha256','checked_at','eligibility','reason','entitlement_authority','evidence_sha256'];new_conflict boolean;eligible boolean;outcome text;next_version bigint;amount integer;checked timestamptz;
begin
 if e is null or jsonb_typeof(e)<>'object' or length(e::text)>20000 or not(e ?& allowed) or e-allowed<>'{}'::jsonb
 or e->>'reason' is null or e->>'reason'!~'^[A-Z_]{3,100}$' or e->>'eligibility' is null or e->>'eligibility' not in ('ELIGIBLE','DENY')
 or e->>'payment_state' is null or e->>'payment_state' not in ('COLLECTED','PENDING','FAILED','CANCELLED','REFUNDED','DISPUTED','MISMATCHED','UNVERIFIED','VERSION_RACE')
 or e->>'consent_state' is null or e->>'consent_state' not in ('VERIFIED','UNVERIFIED')
 or (e->>'payment_intent_id' is not null and e->>'payment_intent_id'!~'^pi_[A-Za-z0-9]{6,}$') or (e->>'charge_id' is not null and e->>'charge_id'!~'^ch_[A-Za-z0-9]{6,}$') or e->>'evidence_sha256' is null or e->>'evidence_sha256'!~'^[a-f0-9]{64}$'
 or e->'entitlement_authority' is distinct from 'false'::jsonb then raise exception 'Safe worker evidence required';end if;
 select * into j from kxra_private.live_paid_read_jobs where id=i;if not found then raise exception 'Unknown canonical live read';end if;
 perform pg_advisory_xact_lock(hashtext('pilot:'||j.org_id::text));perform pg_advisory_xact_lock(hashtext('live-billing:'||j.org_id::text));
 select * into b from kxra_private.live_billing_bindings where org_id=j.org_id for update;
 select * into j from kxra_private.live_paid_read_jobs where id=i for update;
 if e->>'reconciliation_id' is distinct from i::text or e->>'org_id' is distinct from j.org_id::text or e->>'binding_version' is distinct from j.binding_version::text
 or e->>'mapping_revision' is distinct from j.mapping_revision::text or e->>'offer_key' is distinct from j.offer_key or e->>'policy_id' is distinct from j.policy_id::text or e->>'policy_revision' is distinct from j.policy_revision::text
 or e->>'customer_id' is distinct from j.customer_id or e->>'subscription_id' is distinct from j.subscription_id or e->>'invoice_id' is distinct from j.invoice_id
 or e->>'checkout_intent_id' is distinct from j.checkout_intent_id::text or e->>'checkout_session_id' is distinct from j.checkout_session_id
 or e->>'period_start' is distinct from j.period_start::text or e->>'period_end' is distinct from j.period_end::text or e->>'expected_total_minor' is distinct from j.expected_total_minor::text
 then raise exception 'Live evidence canonical binding mismatch';end if;
 select * into old from kxra_private.live_paid_receipts where job_id=i;
 if found then
  if old.safe_evidence=e then return old.outcome;end if;
  insert into kxra_private.live_paid_conflicts(job_id,evidence_sha256) values(i,e->>'evidence_sha256') on conflict do nothing returning true into new_conflict;
  if coalesce(new_conflict,false) then update kxra_private.live_billing_bindings set quarantined=true,reconcile_required=true,version=version+1 where org_id=j.org_id;end if;
  return 'CONFLICT';
 end if;
 if j.state<>'CLAIMED' or j.expires_at<=now() or b.version<>j.binding_version or b.quarantined
 or (b.customer_id,b.subscription_id,b.offer_key,b.mapping_revision,b.checkout_intent_id) is distinct from (j.customer_id,j.subscription_id,j.offer_key,j.mapping_revision,j.checkout_intent_id)
 then outcome='STALE';
 else
  -- Match reservation's mapping -> policy lock order.
  select * into c from kxra_private.live_billing_mappings where offer_key=j.offer_key and revision=j.mapping_revision for share;
  select * into q from kxra_private.live_paid_policies where id=j.policy_id and revision=j.policy_revision for share;
  select * into ck from kxra_private.live_billing_intents where id=j.checkout_intent_id for share;
  select (p->>'monthly_amount_minor')::integer into amount from jsonb_array_elements(kxra_private.approved_workspace_catalogue_v1()) p where p->>'offer_key'=j.offer_key;
  checked=case when e->>'checked_at'~'^[0-9]{1,12}$' then to_timestamp((e->>'checked_at')::double precision) else null end;
  eligible=coalesce(e->>'eligibility'='ELIGIBLE' and kxra_private.live_paid_policy_current(q.id,q.revision,j.org_id)
   and kxra_private.live_paid_org_actor(j.org_id) is not null and not b.quarantined
   and ck.state='CONSUMED' and ck.kind='CHECKOUT' and ck.customer_id=b.customer_id and ck.provider_session_id=j.checkout_session_id
   and e->>'currency'='GBP' and e->>'quantity'='1' and e->>'monthly_amount_minor'=amount::text and e->>'price_id'=c.price_id and e->>'product_id'=c.product_id
   and e->>'terms_review_sha256'=c.terms_review_sha256 and e->>'terms_review_sha256'=q.terms_review_sha256 and e->>'presentation_sha256'=q.presentation_sha256
   and e->>'payment_sha256'~'^[a-f0-9]{64}$' and e->>'consent_sha256'~'^[a-f0-9]{64}$'
   and e->>'payment_state'='COLLECTED' and e->>'consent_state'='VERIFIED' and e->>'collected_minor'=j.expected_total_minor::text and e->>'refunded_minor'='0'
   and e->>'payment_intent_id'~'^pi_[A-Za-z0-9]{6,}$' and e->>'charge_id'~'^ch_[A-Za-z0-9]{6,}$' and e->>'subscription_status'='active'
   and e->'cancel_at_period_end' in ('true'::jsonb,'false'::jsonb) and (e->'cancel_at_period_end'='false'::jsonb or q.cancellation_mode='END_OF_PAID_PERIOD')
   and checked<=now()+interval '30 seconds' and checked>=j.created_at-interval '1 second' and checked>now()-make_interval(secs=>q.proof_ttl_seconds)
   and to_timestamp(j.period_start)<=now() and to_timestamp(j.period_end)>now()
   and kxra_private.pilot_seats(j.org_id)<=kxra_private.workspace_seat_capacity(j.org_id),false);
  outcome=case when eligible then 'ELIGIBLE' else 'DENIED' end;
 end if;
 insert into kxra_private.live_paid_receipts(job_id,org_id,evidence_sha256,outcome,safe_evidence) values(i,j.org_id,e->>'evidence_sha256',outcome,e);
 if outcome<>'STALE' then
  next_version=b.version+1;
  update kxra_private.live_billing_bindings set version=next_version,reconcile_required=outcome<>'ELIGIBLE' where org_id=j.org_id;
  if outcome='ELIGIBLE' then
   insert into kxra_private.live_paid_access(org_id,job_id,binding_version,mapping_revision,offer_key,policy_id,policy_revision,customer_id,subscription_id,invoice_id,payment_intent_id,charge_id,checkout_intent_id,checkout_session_id,terms_review_sha256,presentation_sha256,period_start,period_end,valid_until,cancel_at_period_end,checked_at)
   values(j.org_id,i,next_version,j.mapping_revision,j.offer_key,j.policy_id,j.policy_revision,j.customer_id,j.subscription_id,j.invoice_id,e->>'payment_intent_id',e->>'charge_id',j.checkout_intent_id,j.checkout_session_id,c.terms_review_sha256,q.presentation_sha256,to_timestamp(j.period_start),to_timestamp(j.period_end),least(to_timestamp(j.period_end),checked+make_interval(secs=>q.proof_ttl_seconds),now()+make_interval(secs=>q.proof_ttl_seconds)),(e->>'cancel_at_period_end')::boolean,checked)
   on conflict(org_id) do update set job_id=excluded.job_id,binding_version=excluded.binding_version,mapping_revision=excluded.mapping_revision,offer_key=excluded.offer_key,policy_id=excluded.policy_id,policy_revision=excluded.policy_revision,customer_id=excluded.customer_id,subscription_id=excluded.subscription_id,invoice_id=excluded.invoice_id,payment_intent_id=excluded.payment_intent_id,charge_id=excluded.charge_id,checkout_intent_id=excluded.checkout_intent_id,checkout_session_id=excluded.checkout_session_id,terms_review_sha256=excluded.terms_review_sha256,presentation_sha256=excluded.presentation_sha256,period_start=excluded.period_start,period_end=excluded.period_end,valid_until=excluded.valid_until,cancel_at_period_end=excluded.cancel_at_period_end,checked_at=excluded.checked_at;
  end if;
 end if;
 update kxra_private.live_paid_read_jobs set state=case when outcome='STALE' then 'STALE' else 'COMMITTED' end where id=i;
 return outcome;
end $$;

create function kxra_private.live_paid_entitled(o uuid) returns boolean language sql volatile security definer set search_path='' as $$
 select exists(select 1 from kxra_private.live_billing_bindings b join kxra_private.live_paid_access p on p.org_id=b.org_id
 join kxra_private.live_paid_policies q on q.id=p.policy_id and q.revision=p.policy_revision
 join kxra_private.live_paid_receipts r on r.job_id=p.job_id and r.outcome='ELIGIBLE'
 where b.org_id=o and kxra_private.is_live_billing_lane(o) and not b.quarantined and not b.reconcile_required and b.version=p.binding_version
 and (b.customer_id,b.subscription_id,b.offer_key,b.mapping_revision,b.checkout_intent_id)=(p.customer_id,p.subscription_id,p.offer_key,p.mapping_revision,p.checkout_intent_id)
 and kxra_private.live_paid_policy_current(q.id,q.revision,o) and kxra_private.live_paid_org_actor(o) is not null
 and p.period_start<=now() and p.period_end>now() and p.valid_until>now() and p.checked_at<=now()+interval '30 seconds'
 and p.checked_at>now()-make_interval(secs=>q.proof_ttl_seconds) and p.terms_review_sha256=q.terms_review_sha256 and p.presentation_sha256=q.presentation_sha256
 and (not p.cancel_at_period_end or q.cancellation_mode='END_OF_PAID_PERIOD')
 and kxra_private.pilot_seats(o)<=kxra_private.workspace_seat_capacity(o))
$$;
-- Preserve0098's exact legacy branch. LIVE authority always overrides its grandfather fallback.
create or replace function kxra_private.pilot_entitled(o uuid) returns boolean language sql volatile security definer set search_path='' as $$
 select case when kxra_private.is_live_billing_lane(o) then kxra_private.live_paid_entitled(o) else (
(
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
 ) end
$$;
create or replace function kxra_private.workspace_seat_capacity(o uuid) returns integer language sql volatile security definer set search_path='' as $$
 select case when kxra_private.is_live_billing_lane(o) then coalesce((select (plan->>'people')::integer from jsonb_array_elements(kxra_private.approved_workspace_catalogue_v1()) plan
 join (select coalesce(b.offer_key,i.offer_key) offer_key,coalesce(b.mapping_revision,i.mapping_revision) revision from (select 1) singleton left join kxra_private.live_billing_bindings b on b.org_id=o left join kxra_private.live_customer_intents i on i.org_id=o) chosen on chosen.offer_key=plan->>'offer_key'
 join kxra_private.live_billing_mappings c on c.offer_key=chosen.offer_key and c.revision=chosen.revision and c.enabled),0)
 else (select case when coalesce(p.offer_key,b.catalogue_offer_key,'WORKSPACE_PILOT_V1')='WORKSPACE_PILOT_V1' then 5
 else (select (plan->>'people')::integer from jsonb_array_elements(kxra_private.approved_workspace_catalogue_v1()) plan where plan->>'offer_key'=coalesce(p.offer_key,b.catalogue_offer_key)) end
 from (select 1) singleton left join kxra.workspace_pilots p on p.org_id=o left join kxra.pilot_stripe_bindings b on b.org_id=o) end
$$;
create or replace function kxra_private.guard_pilot_seats() returns trigger language plpgsql security definer set search_path='' as $$
declare before_count integer;after_count integer;account uuid;email text;
begin
 perform pg_advisory_xact_lock(hashtext('pilot:'||new.org_id::text));
 if not exists(select 1 from kxra.workspace_pilots where org_id=new.org_id) and not exists(select 1 from kxra.pilot_stripe_bindings where org_id=new.org_id) and not kxra_private.is_live_billing_lane(new.org_id) then return new;end if;
 before_count=kxra_private.pilot_seats(new.org_id);
 if tg_table_name='organisation_memberships' then
  account=case when new.state in ('ACTIVE','INVITED') and new.revoked_at is null and (new.expires_at is null or new.expires_at>now()) then new.account_id else null end;
  after_count=kxra_private.pilot_seats(new.org_id,new.id,account,null,null);
 else
  email=case when new.state in ('PENDING','SENT','DELIVERY_FAILED') and new.expires_at>now() then new.email_digest else null end;
  after_count=kxra_private.pilot_seats(new.org_id,null,null,new.id,email);
 end if;
 if after_count>kxra_private.workspace_seat_capacity(new.org_id) and after_count>before_count then raise exception 'Pilot seat admission unavailable';end if;
 if not kxra_private.pilot_entitled(new.org_id) then
  if tg_table_name='organisation_memberships' and new.state='ACTIVE' and (tg_op='INSERT' or old.state<>'ACTIVE' or (old.expires_at is not null and old.expires_at<=now())) then raise exception 'Pilot seat admission unavailable';end if;
  if tg_table_name='invitations' and new.state in ('PENDING','SENT','DELIVERY_FAILED') and new.expires_at>now() and (tg_op='INSERT' or old.state not in ('PENDING','SENT','DELIVERY_FAILED') or new.expires_at>old.expires_at) then raise exception 'Pilot seat admission unavailable';end if;
  if after_count>before_count then raise exception 'Pilot seat admission unavailable';end if;
 end if;
 return new;
end $$;
revoke all on function kxra_private.guard_live_paid_read_identity(),kxra_private.is_live_billing_lane(uuid),kxra_private.live_paid_org_actor(uuid),kxra_private.live_paid_policy_current(uuid,integer,uuid),kxra_private.reserve_live_paid_read(uuid,uuid,integer,text,text,bigint,bigint),kxra_private.live_paid_read_current(uuid),kxra_private.commit_live_paid_proof(uuid,jsonb),kxra_private.live_paid_entitled(uuid),kxra_private.pilot_entitled(uuid),kxra_private.workspace_seat_capacity(uuid),kxra_private.guard_pilot_seats() from public,anon,authenticated,kxra_billing_worker;
grant execute on function kxra_private.reserve_live_paid_read(uuid,uuid,integer,text,text,bigint,bigint),kxra_private.live_paid_read_current(uuid),kxra_private.commit_live_paid_proof(uuid,jsonb) to kxra_billing_worker;

-- Safe onboarding/billing read: derives the selected verified owner tenant, never accepts org IDs.
-- Do not use pilot_status's legacy offer fallback to display modern LIVE commercial state.
create function kxra_private.live_paid_access_status() returns jsonb language plpgsql security definer set search_path='' as $$
declare o uuid=kxra_private.member_org();b kxra_private.live_billing_bindings;i kxra_private.live_customer_intents;q kxra_private.live_paid_policies;plan jsonb;
begin
 if session_user<>'kxra_app' or o is null or not coalesce(kxra_private.is_owner(o),false) or not kxra_private.is_live_billing_lane(o) then return null;end if;
 select * into b from kxra_private.live_billing_bindings where org_id=o;
 select * into i from kxra_private.live_customer_intents where org_id=o;
 select value into plan from jsonb_array_elements(kxra_private.approved_workspace_catalogue_v1()) where value->>'offer_key'=coalesce(b.offer_key,i.offer_key);
 select * into q from kxra_private.live_paid_policies where offer_key=b.offer_key and mapping_revision=b.mapping_revision and enabled;
 return jsonb_build_object('lane','LIVE','offer',plan,'customer_state',i.state,'customer_bound',b.org_id is not null,'subscription_bound',b.subscription_id is not null,
 'entitled',kxra_private.live_paid_entitled(o),'policy_ready',coalesce(kxra_private.live_paid_policy_current(q.id,q.revision,o),false),
 'reconciliation_required',coalesce(b.reconcile_required,true),'quarantined',coalesce(b.quarantined,false) or coalesce(i.state='QUARANTINED',false),
 'seat_capacity',kxra_private.workspace_seat_capacity(o),'seats_reserved',kxra_private.pilot_seats(o),'consent_required',true,
 'proof_valid_until',(select valid_until from kxra_private.live_paid_access where org_id=o));
end $$;
revoke all on function kxra_private.live_paid_access_status() from public,anon,authenticated,kxra_billing_worker;
grant execute on function kxra_private.live_paid_access_status() to authenticated;
