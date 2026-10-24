-- ADDITIVE source-only fresh-customer admission. Depends0100, including owner-reviewed
-- current-wording live_billing_legal_allowed. No activation, mapping/customer seed or entitlement.
create table kxra_private.live_customer_intents(
 id uuid primary key,org_id uuid not null unique references kxra.organisations(id),
 actor_id uuid not null references kxra.account_identities(account_id),offer_key text not null,mapping_revision integer not null,
 version integer not null default 1 check(version>0),state text not null default 'REQUESTED' check(state in ('REQUESTED','INFLIGHT','BOUND','UNCERTAIN','QUARANTINED')),
 terms_review_sha256 text not null check(terms_review_sha256~'^[a-f0-9]{64}$'),auth_time timestamptz not null,
 created_at timestamptz not null default now(),expires_at timestamptz not null default now()+interval '5 minutes',consumed_at timestamptz,
 customer_id text unique check(customer_id~'^cus_[A-Za-z0-9]{6,}$'),
 foreign key(offer_key,mapping_revision) references kxra_private.live_billing_mappings(offer_key,revision),
 check(expires_at>created_at and expires_at<=created_at+interval '5 minutes'),
 check((state='REQUESTED' and consumed_at is null) or (state<>'REQUESTED' and consumed_at is not null)),
 check(state<>'BOUND' or customer_id is not null)
);
create table kxra_private.live_customer_receipts(
 intent_id uuid primary key references kxra_private.live_customer_intents(id),
 outcome text not null check(outcome in ('BOUND','UNCERTAIN','QUARANTINED')),
 decision_reason text not null check(decision_reason~'^[A-Z_]{3,100}$'),
 result_sha256 text not null check(result_sha256~'^[a-f0-9]{64}$'),
 customer_id text check(customer_id~'^cus_[A-Za-z0-9]{6,}$'),safe_result jsonb not null check(jsonb_typeof(safe_result)='object'),
 created_at timestamptz not null default now()
);
create table kxra_private.live_customer_conflicts(
 intent_id uuid not null references kxra_private.live_customer_intents(id),
 result_sha256 text not null check(result_sha256~'^[a-f0-9]{64}$'),created_at timestamptz not null default now(),primary key(intent_id,result_sha256)
);
alter table kxra_private.live_customer_intents enable row level security;
alter table kxra_private.live_customer_receipts enable row level security;
alter table kxra_private.live_customer_conflicts enable row level security;
revoke all on kxra_private.live_customer_intents,kxra_private.live_customer_receipts,kxra_private.live_customer_conflicts from public,anon,authenticated,kxra_billing_worker;
create trigger live_customer_receipt_immutable before update or delete on kxra_private.live_customer_receipts
 for each row execute function kxra_private.live_billing_receipt_immutable();
create trigger live_customer_conflict_immutable before update or delete on kxra_private.live_customer_conflicts
 for each row execute function kxra_private.live_billing_receipt_immutable();
create function kxra_private.guard_live_customer_intent() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' or (to_jsonb(new)-'state'-'version'-'consumed_at'-'customer_id') is distinct from (to_jsonb(old)-'state'-'version'-'consumed_at'-'customer_id')
 or new.version<old.version or (old.customer_id is not null and new.customer_id is distinct from old.customer_id)
 or (old.state<>'REQUESTED' and new.state='REQUESTED') then raise exception 'Live customer intent identity/reservation is immutable';end if;
 return new;
end $$;
create trigger live_customer_intent_immutable before update or delete on kxra_private.live_customer_intents for each row execute function kxra_private.guard_live_customer_intent();

create function kxra_private.assert_fresh_live_customer_org(o uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if o is null or exists(select 1 from kxra.workspace_pilots where org_id=o)
 or exists(select 1 from kxra.pilot_stripe_bindings where org_id=o) or exists(select 1 from kxra.pilot_stripe_intents where org_id=o)
 or exists(select 1 from kxra.billing_customers where org_id=o) or exists(select 1 from kxra.billing_subscriptions where org_id=o)
 or exists(select 1 from kxra.billing_customer_intents where org_id=o) or exists(select 1 from kxra.billing_session_intents where org_id=o)
 or exists(select 1 from kxra.billing_events where org_id=o) or exists(select 1 from kxra.billing_provider_events where org_id=o)
 or exists(select 1 from kxra.workspace_pilot_events where org_id=o) or exists(select 1 from kxra.pilot_stripe_events where org_id=o)
 or exists(select 1 from kxra_private.live_billing_bindings where org_id=o)
 then raise exception 'Existing billing state cannot become a fresh live customer';end if;
end $$;
create function kxra_private.assert_live_customer_authority(o uuid,actor uuid,at_time timestamptz) returns void
language plpgsql security definer set search_path='' as $$
begin
 if at_time is null or at_time<now()-interval '15 minutes' or at_time>now()+interval '1 minute'
 or not coalesce(kxra_private.live_billing_legal_allowed(o,actor),false) then raise insufficient_privilege;end if;
-- Existing membership triggers acquire pilot locks after tuple locks. Keep this
 -- authority recheck read-only; taking membership row locks here would invert that order.
 perform 1 from kxra.organisation_memberships m join kxra.account_identities a on a.account_id=m.account_id
 join kxra.organisations organisation on organisation.id=m.org_id
 where m.org_id=o and m.account_id=actor and m.security_role='ORG_ADMIN' and m.relationship_type='CUSTOMER'
 and m.state='ACTIVE' and m.starts_at<=now() and m.revoked_at is null and (m.expires_at is null or m.expires_at>now())
 and a.auth_provider='SUPABASE' and a.state='ACTIVE' and a.email_verified_at is not null and organisation.state='ACTIVE';
 if not found then raise insufficient_privilege;end if;
end $$;

create function kxra_private.request_live_customer_intent(i uuid,offer text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare o uuid=kxra_private.member_org();c kxra_private.live_billing_mappings;r kxra_private.live_customer_intents;auth_at timestamptz;
begin
 if session_user<>'kxra_app' or not coalesce(kxra_private.mfa_owner(o),false) then raise insufficient_privilege;end if;
 perform kxra_private.live_billing_gate();
 auth_at=to_timestamp((auth.jwt()->>'auth_time')::double precision);
 perform kxra_private.assert_live_customer_authority(o,auth.uid(),auth_at);
 if i is null or offer is null then raise exception 'Reviewed fresh customer request required';end if;
 -- Always pilot -> live-billing. Existing pilot paths never acquire these in reverse order.
 perform pg_advisory_xact_lock(hashtext('pilot:'||o::text));
 perform pg_advisory_xact_lock(hashtext('live-billing:'||o::text));
 select * into c from kxra_private.live_billing_mappings where offer_key=offer and enabled for share;
 if not found or not exists(select 1 from kxra_private.live_billing_activation where singleton and enabled and review_sha256=c.activation_review_sha256)
 then raise exception 'Reviewed live mapping unavailable';end if;
 select * into r from kxra_private.live_customer_intents where id=i;
 if found then
  if (r.org_id,r.actor_id,r.offer_key,r.mapping_revision,r.terms_review_sha256) is distinct from (o,auth.uid(),c.offer_key,c.revision,c.terms_review_sha256)
  then raise exception 'Live customer replay conflict';end if;
  return jsonb_build_object('intent_id',r.id,'state',r.state,'version',r.version,'entitlement_authority',false);
 end if;
 perform kxra_private.assert_fresh_live_customer_org(o);
 if exists(select 1 from kxra_private.live_customer_intents where org_id=o) then raise exception 'Original permanent customer intent requires reconciliation';end if;
 if kxra_private.pilot_seats(o)>(select (p->>'people')::integer from jsonb_array_elements(kxra_private.approved_workspace_catalogue_v1()) p where p->>'offer_key'=c.offer_key)
 then raise exception 'Approved seat capacity exceeded';end if;
 insert into kxra_private.live_customer_intents(id,org_id,actor_id,offer_key,mapping_revision,terms_review_sha256,auth_time)
 values(i,o,auth.uid(),c.offer_key,c.revision,c.terms_review_sha256,auth_at) returning * into r;
 return jsonb_build_object('intent_id',r.id,'state',r.state,'version',r.version,'entitlement_authority',false);
end $$;

create function kxra_private.claim_live_customer_intent(i uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r kxra_private.live_customer_intents;c kxra_private.live_billing_mappings;
begin
 perform kxra_private.live_billing_gate();
 select * into r from kxra_private.live_customer_intents where id=i;
 if not found then raise exception 'Live customer intent unavailable';end if;
 perform pg_advisory_xact_lock(hashtext('pilot:'||r.org_id::text));
 perform pg_advisory_xact_lock(hashtext('live-billing:'||r.org_id::text));
 select * into r from kxra_private.live_customer_intents where id=i for update;
 if r.state<>'REQUESTED' or r.version<>1 or r.expires_at<=now() then raise exception 'Live customer intent consumed or expired';end if;
 perform kxra_private.assert_live_customer_authority(r.org_id,r.actor_id,r.auth_time);
 perform kxra_private.assert_fresh_live_customer_org(r.org_id);
 select * into c from kxra_private.live_billing_mappings where offer_key=r.offer_key and revision=r.mapping_revision and enabled for share;
 if not found or r.terms_review_sha256 is distinct from c.terms_review_sha256
 or not exists(select 1 from kxra_private.live_billing_activation where singleton and enabled and review_sha256=c.activation_review_sha256)
 then raise exception 'Live customer mapping changed';end if;
 if kxra_private.pilot_seats(r.org_id)>(select (p->>'people')::integer from jsonb_array_elements(kxra_private.approved_workspace_catalogue_v1()) p where p->>'offer_key'=c.offer_key)
 then raise exception 'Approved seat capacity exceeded';end if;
 update kxra_private.live_customer_intents set state='INFLIGHT',consumed_at=now() where id=i;
 return jsonb_build_object('intent',jsonb_build_object('id',r.id,'org_id',r.org_id,'actor_id',r.actor_id,'offer_key',r.offer_key,'mapping_revision',r.mapping_revision,
 'version',r.version,'state','REQUESTED','terms_review_sha256',r.terms_review_sha256,'auth_time',floor(extract(epoch from r.auth_time))::bigint,
 'created_at',floor(extract(epoch from r.created_at))::bigint,'expires_at',floor(extract(epoch from r.expires_at))::bigint),'mapping',to_jsonb(c),'entitlement_authority',false);
end $$;

-- Read-only worker recheck used immediately before/after the one provider POST.
create function kxra_private.live_customer_intent_current(i uuid,expected integer) returns boolean
language plpgsql security definer set search_path='' as $$
declare r kxra_private.live_customer_intents;c kxra_private.live_billing_mappings;
begin
 begin
  perform kxra_private.live_billing_gate();
  select * into r from kxra_private.live_customer_intents where id=i;
  if not found or expected is null or r.version<>expected or r.state<>'INFLIGHT' or r.expires_at<=now() then return false;end if;
  perform pg_advisory_xact_lock(hashtext('pilot:'||r.org_id::text));
  perform pg_advisory_xact_lock(hashtext('live-billing:'||r.org_id::text));
  select * into r from kxra_private.live_customer_intents where id=i;
  if not found or r.version<>expected or r.state<>'INFLIGHT' or r.expires_at<=now() then return false;end if;
  perform kxra_private.assert_live_customer_authority(r.org_id,r.actor_id,r.auth_time);
  perform kxra_private.assert_fresh_live_customer_org(r.org_id);
  select * into c from kxra_private.live_billing_mappings where offer_key=r.offer_key and revision=r.mapping_revision and enabled for share;
  if not found or r.terms_review_sha256 is distinct from c.terms_review_sha256
  or not exists(select 1 from kxra_private.live_billing_activation where singleton and enabled and review_sha256=c.activation_review_sha256)
  then return false;end if;
  return kxra_private.pilot_seats(r.org_id)<=(select (p->>'people')::integer from jsonb_array_elements(kxra_private.approved_workspace_catalogue_v1()) p where p->>'offer_key'=c.offer_key);
 exception when insufficient_privilege or raise_exception then return false;
 end;
end $$;

create function kxra_private.finish_live_customer_intent(i uuid,e jsonb) returns text
language plpgsql security definer set search_path='' as $$
declare r kxra_private.live_customer_intents;c kxra_private.live_billing_mappings;old kxra_private.live_customer_receipts;metadata jsonb;outcome text;decision_reason text;new_conflict boolean;
begin
 if e is null or jsonb_typeof(e)<>'object' or not(e ?& array['intent_id','org_id','actor_id','offer_key','mapping_revision','intent_version','account_id','livemode','outcome','customer_id','metadata','reason','result_sha256','entitlement_authority']) or e-'intent_id'-'org_id'-'actor_id'-'offer_key'-'mapping_revision'-'intent_version'-'account_id'-'livemode'-'outcome'-'customer_id'-'metadata'-'reason'-'result_sha256'-'entitlement_authority'<>'{}'::jsonb
 or e->>'result_sha256' is null or e->>'result_sha256'!~'^[a-f0-9]{64}$' or e->>'reason' is null or e->>'reason'!~'^[A-Z_]{3,100}$'
 or e->>'account_id' is distinct from 'acct_1Rv3KdC84VkhhIRz' or e->'livemode' is distinct from 'true'::jsonb
 or e->'entitlement_authority' is distinct from 'false'::jsonb or e->>'outcome' is null or e->>'outcome' not in ('BOUND','UNCERTAIN','QUARANTINED')
 or (e->>'customer_id' is not null and e->>'customer_id'!~'^cus_[A-Za-z0-9]{6,}$') then raise exception 'Invalid safe live customer receipt';end if;
 select * into r from kxra_private.live_customer_intents where id=i;
 if not found then raise exception 'Unknown live customer intent';end if;
 perform pg_advisory_xact_lock(hashtext('pilot:'||r.org_id::text));
 perform pg_advisory_xact_lock(hashtext('live-billing:'||r.org_id::text));
 select * into r from kxra_private.live_customer_intents where id=i for update;
 if e->>'intent_id' is distinct from r.id::text or e->>'org_id' is distinct from r.org_id::text or e->>'actor_id' is distinct from r.actor_id::text
 or e->>'offer_key' is distinct from r.offer_key or e->>'mapping_revision' is distinct from r.mapping_revision::text or e->>'intent_version' is distinct from r.version::text
 then raise exception 'Live customer receipt identity mismatch';end if;
 metadata=jsonb_build_object('kxra_customer_intent',r.id,'kxra_org',r.org_id,'kxra_actor',r.actor_id,'kxra_offer',r.offer_key,
 'kxra_mapping_revision',r.mapping_revision::text,'kxra_intent_version',r.version::text,'kxra_terms_sha256',r.terms_review_sha256);
 if e->>'outcome'='BOUND' and (e->>'customer_id' is null or e->'metadata' is distinct from metadata) then raise exception 'Live customer provenance mismatch';end if;
 if e->>'outcome'<>'BOUND' and e->'metadata' is distinct from 'null'::jsonb then raise exception 'Unverified customer metadata prohibited';end if;
 select * into old from kxra_private.live_customer_receipts where intent_id=i;
 if found then
  if old.safe_result=e then return r.state;end if;
  insert into kxra_private.live_customer_conflicts(intent_id,result_sha256) values(i,e->>'result_sha256') on conflict do nothing returning true into new_conflict;
  if coalesce(new_conflict,false) then
   update kxra_private.live_customer_intents set state='QUARANTINED' where id=i;
   update kxra_private.live_billing_bindings set quarantined=true,reconcile_required=true,version=version+1 where org_id=r.org_id and customer_id=r.customer_id;
  end if;
  return 'QUARANTINED';
 end if;
 if r.state<>'INFLIGHT' then raise exception 'Live customer intent not claimed';end if;
 outcome=e->>'outcome';decision_reason=e->>'reason';
 if outcome='BOUND' then
  -- Recheck AFTER provider read. A late revocation/legacy write cannot silently bind a customer.
  begin
   perform kxra_private.live_billing_gate();
   if r.expires_at<=now() then raise exception 'Expired canonical customer';end if;
   perform kxra_private.assert_live_customer_authority(r.org_id,r.actor_id,r.auth_time);
   perform kxra_private.assert_fresh_live_customer_org(r.org_id);
   select * into c from kxra_private.live_billing_mappings where offer_key=r.offer_key and revision=r.mapping_revision and enabled for share;
   if not found or c.terms_review_sha256 is distinct from r.terms_review_sha256
   or not exists(select 1 from kxra_private.live_billing_activation where singleton and enabled and review_sha256=c.activation_review_sha256)
   then raise exception 'Mapping changed';end if;
   if kxra_private.pilot_seats(r.org_id)>(select (p->>'people')::integer from jsonb_array_elements(kxra_private.approved_workspace_catalogue_v1()) p where p->>'offer_key'=c.offer_key)
   then raise exception 'Approved seat capacity exceeded';end if;
   insert into kxra_private.live_billing_bindings(org_id,customer_id,offer_key,mapping_revision)
   values(r.org_id,e->>'customer_id',r.offer_key,r.mapping_revision);
  exception when insufficient_privilege or raise_exception or unique_violation then
   outcome='QUARANTINED';decision_reason='POST_READ_ADMISSION_CHANGED';
  end;
 end if;
 insert into kxra_private.live_customer_receipts(intent_id,outcome,decision_reason,result_sha256,customer_id,safe_result)
 values(i,outcome,decision_reason,e->>'result_sha256',e->>'customer_id',e);
 -- An unverified observed ID stays in the safe receipt, never in the unique owned-customer column.
 update kxra_private.live_customer_intents set state=outcome,customer_id=case when outcome='BOUND' then e->>'customer_id' else customer_id end where id=i;
 -- Binding starts reconcile_required; no checkout session, subscription, entitlement or seat grant.
 return outcome;
end $$;

revoke all on function kxra_private.guard_live_customer_intent(),kxra_private.assert_fresh_live_customer_org(uuid),
 kxra_private.assert_live_customer_authority(uuid,uuid,timestamptz),kxra_private.request_live_customer_intent(uuid,text),
 kxra_private.claim_live_customer_intent(uuid),kxra_private.live_customer_intent_current(uuid,integer),kxra_private.finish_live_customer_intent(uuid,jsonb) from public,anon,authenticated,kxra_billing_worker;
grant execute on function kxra_private.request_live_customer_intent(uuid,text) to authenticated;
grant execute on function kxra_private.claim_live_customer_intent(uuid),kxra_private.live_customer_intent_current(uuid,integer),kxra_private.finish_live_customer_intent(uuid,jsonb) to kxra_billing_worker;
