-- ADDITIVE, default-disabled ledger only. No provider resources, credentials, offers,
-- customer conversion, payment execution or entitlement writes. Requires migration 0097.
-- Private security-definer entry points follow the existing app/worker capability pattern:
-- authenticated caller derives identity from verified transaction claims; worker is trusted
-- only after signature/provider verification. Neither role receives table DML privileges.
create table kxra_private.live_billing_activation(
 singleton boolean primary key default true check(singleton),
 enabled boolean not null default false,
 review_sha256 text check(review_sha256~'^[a-f0-9]{64}$'),
 check(not enabled or review_sha256 is not null)
);
insert into kxra_private.live_billing_activation(singleton) values(true);
create table kxra_private.live_billing_mappings(
 offer_key text not null check(offer_key in ('KXRA_STARTER_V1','KXRA_TEAM_V1','KXRA_BUSINESS_V1')),
 revision integer not null check(revision>0),version integer not null default 1 check(version=1),
 mode text not null default 'live' check(mode='live'), enabled boolean not null default false,
 account_id text not null check(account_id='acct_1Rv3KdC84VkhhIRz'),
 price_id text not null,product_id text not null,
 portal_configuration_id text not null check(portal_configuration_id~'^bpc_[A-Za-z0-9]{6,}$'),
 activation_review_sha256 text not null check(activation_review_sha256~'^[a-f0-9]{64}$'),
 terms_review_sha256 text not null check(terms_review_sha256~'^[a-f0-9]{64}$'),
 tax_review_sha256 text not null check(tax_review_sha256~'^[a-f0-9]{64}$'),
 tax_behavior text not null check(tax_behavior in ('inclusive','exclusive')),
 automatic_tax boolean not null,payment_method text not null check(payment_method='card'),
 primary key(offer_key,revision),
 check((offer_key='KXRA_STARTER_V1' and price_id='price_1UTbq7C84VkhhIRzkBHEHivV' and product_id='prod_VUb2kv7rUiTeiu')
 or (offer_key='KXRA_TEAM_V1' and price_id='price_1UTbrLC84VkhhIRzMN225zAr' and product_id='prod_VUb3rh9e9eNw5a')
 or (offer_key='KXRA_BUSINESS_V1' and price_id='price_1UTlt5C84VkhhIRzGztXl6ey' and product_id='prod_VUlPLWhBBf7lmP'))
);
create unique index live_billing_one_enabled_mapping on kxra_private.live_billing_mappings(offer_key) where enabled;
-- Empty by default. A future separately reviewed operator must verify actual live account,
-- customer ownership and no legacy conversion before inserting an explicit tenant binding.
create table kxra_private.live_billing_bindings(
 org_id uuid primary key references kxra.organisations(id),
 customer_id text not null unique check(customer_id~'^cus_[A-Za-z0-9]{6,}$'),
 offer_key text not null, mapping_revision integer not null,
 subscription_id text unique check(subscription_id~'^sub_[A-Za-z0-9]{6,}$'),
 checkout_intent_id uuid unique,
 version bigint not null default 0 check(version>=0),
 reconcile_required boolean not null default true,quarantined boolean not null default false,
 foreign key(offer_key,mapping_revision) references kxra_private.live_billing_mappings(offer_key,revision)
);
create table kxra_private.live_billing_intents(
 id uuid primary key,org_id uuid not null references kxra_private.live_billing_bindings(org_id),
 actor_id uuid not null references kxra.account_identities(account_id),
 kind text not null check(kind in ('CHECKOUT','PORTAL','RECONCILE')),
 state text not null default 'REQUESTED' check(state in ('REQUESTED','INFLIGHT','CONSUMED','UNCERTAIN')),
 customer_id text not null,subscription_id text,
 offer_key text not null,mapping_revision integer not null,
 terms_review_sha256 text not null check(terms_review_sha256~'^[a-f0-9]{64}$'),
 observed_version bigint not null check(observed_version>=0),
 auth_time timestamptz not null,
 created_at timestamptz not null default now(),expires_at timestamptz not null default now()+interval '20 minutes',
 consumed_at timestamptz,provider_session_id text unique,result_sha256 text check(result_sha256~'^[a-f0-9]{64}$'),
 foreign key(offer_key,mapping_revision) references kxra_private.live_billing_mappings(offer_key,revision),
 check(expires_at>created_at and expires_at<=created_at+interval '30 minutes'),
 check((state='REQUESTED' and consumed_at is null) or (state<>'REQUESTED' and consumed_at is not null)),
 check(kind='CHECKOUT' or subscription_id is not null)
);
-- Permanent hold across failures/expiry: never create a replacement checkout automatically.
create unique index live_billing_one_checkout on kxra_private.live_billing_intents(org_id) where kind='CHECKOUT';
alter table kxra_private.live_billing_bindings add foreign key(checkout_intent_id) references kxra_private.live_billing_intents(id);
create table kxra_private.live_billing_event_receipts(
 event_id text primary key check(event_id~'^evt_[A-Za-z0-9]{6,}$'),
 org_id uuid not null references kxra_private.live_billing_bindings(org_id),
 payload_sha256 text not null check(payload_sha256~'^[a-f0-9]{64}$'),
 subscription_id text not null check(subscription_id~'^sub_[A-Za-z0-9]{6,}$'),
 state text not null default 'RECONCILE_REQUIRED' check(state='RECONCILE_REQUIRED'),
 created_at timestamptz not null default now()
);
create table kxra_private.live_billing_event_conflicts(
 event_id text not null references kxra_private.live_billing_event_receipts(event_id),
 org_id uuid not null references kxra_private.live_billing_bindings(org_id),
 observed_sha256 text not null check(observed_sha256~'^[a-f0-9]{64}$'),
 created_at timestamptz not null default now(),primary key(event_id,org_id,observed_sha256)
);

alter table kxra_private.live_billing_activation enable row level security;
alter table kxra_private.live_billing_mappings enable row level security;
alter table kxra_private.live_billing_bindings enable row level security;
alter table kxra_private.live_billing_intents enable row level security;
alter table kxra_private.live_billing_event_receipts enable row level security;
alter table kxra_private.live_billing_event_conflicts enable row level security;
revoke all on kxra_private.live_billing_activation,kxra_private.live_billing_mappings,kxra_private.live_billing_bindings,
 kxra_private.live_billing_intents,kxra_private.live_billing_event_receipts,kxra_private.live_billing_event_conflicts
 from public,anon,authenticated,kxra_billing_worker;

create function kxra_private.live_billing_mapping_immutable() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' or (to_jsonb(new)-'enabled') is distinct from (to_jsonb(old)-'enabled') then
  raise exception 'Live mapping identity is immutable; review a new revision';end if;
 return new;
end $$;
create trigger live_billing_mapping_immutable before update or delete on kxra_private.live_billing_mappings
 for each row execute function kxra_private.live_billing_mapping_immutable();
create function kxra_private.live_billing_binding_immutable() returns trigger language plpgsql set search_path='' as $$
begin
 if (to_jsonb(new)-'subscription_id'-'checkout_intent_id'-'version'-'reconcile_required'-'quarantined') is distinct from
 (to_jsonb(old)-'subscription_id'-'checkout_intent_id'-'version'-'reconcile_required'-'quarantined')
 or (old.subscription_id is not null and new.subscription_id is distinct from old.subscription_id)
 or (old.checkout_intent_id is not null and new.checkout_intent_id is distinct from old.checkout_intent_id)
 or new.version<old.version or (old.quarantined and not new.quarantined) then raise exception 'Live binding identity is immutable';end if;
 return new;
end $$;
create trigger live_billing_binding_immutable before update on kxra_private.live_billing_bindings
 for each row execute function kxra_private.live_billing_binding_immutable();
create function kxra_private.live_billing_receipt_immutable() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'Live billing receipt is immutable';end $$;
create trigger live_billing_receipt_immutable before update or delete on kxra_private.live_billing_event_receipts
 for each row execute function kxra_private.live_billing_receipt_immutable();
create trigger live_billing_conflict_immutable before update or delete on kxra_private.live_billing_event_conflicts
 for each row execute function kxra_private.live_billing_receipt_immutable();

create function kxra_private.live_billing_gate() returns void language plpgsql security definer set search_path='' as $$
begin
 perform 1 from kxra_private.live_billing_activation where singleton and enabled and review_sha256 is not null for share;
 if not found then
  raise exception 'Live billing is disabled';end if;
end $$;

-- Unlike the legacy shared gate, evaluate EVERY active mandatory requirement first.
-- A retired/missing/drifted document cannot disappear through an inner APPROVED join.
create function kxra_private.live_billing_legal_allowed(o uuid,actor uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select o is not null and actor is not null and not exists(
 select 1 from kxra.organisation_memberships m
 join kxra.legal_document_requirements q on q.org_id=m.org_id and q.state='ACTIVE' and q.mandatory
 and (q.membership_id is null or q.membership_id=m.id) and (q.relationship_type is null or q.relationship_type=m.relationship_type)
 where m.org_id=o and m.account_id=actor and m.state='ACTIVE'
 and not exists(select 1 from kxra.legal_documents d
 join kxra.legal_acceptances a on a.org_id=q.org_id and a.account_id=m.account_id and a.membership_id=m.id and a.requirement_id=q.id
 and a.document_id=q.document_id and a.document_version=q.document_version and a.document_sha256=q.document_sha256 and a.response='ACCEPTED'
 where d.org_id=q.org_id and d.id=q.document_id and d.version=q.document_version and d.content_sha256=q.document_sha256 and d.status='APPROVED')
 )
$$;

create function kxra_private.request_live_billing_intent(i uuid,k text,offer text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare o uuid=kxra_private.member_org();b kxra_private.live_billing_bindings;c kxra_private.live_billing_mappings;r kxra_private.live_billing_intents;
begin
 if session_user<>'kxra_app' or not coalesce(kxra_private.mfa_owner(o),false) then raise insufficient_privilege;end if;
 perform kxra_private.live_billing_gate();
 if not kxra_private.live_billing_legal_allowed(o,auth.uid()) then raise insufficient_privilege;end if;
 if i is null or k is null or k not in ('CHECKOUT','PORTAL','RECONCILE') then raise exception 'Invalid live intent';end if;
 perform pg_advisory_xact_lock(hashtext('live-billing:'||o::text));
 select * into b from kxra_private.live_billing_bindings where org_id=o for update;
 if not found or b.quarantined then raise exception 'Reviewed live binding unavailable';end if;
 if exists(select 1 from kxra.workspace_pilots where org_id=o) or exists(select 1 from kxra.pilot_stripe_bindings where org_id=o)
 or exists(select 1 from kxra.billing_subscriptions where org_id=o) then raise exception 'Existing billing cannot be converted';end if;
 select * into c from kxra_private.live_billing_mappings where offer_key=b.offer_key and revision=b.mapping_revision and enabled for share;
 if not found or c.offer_key is distinct from offer or not exists(select 1 from kxra_private.live_billing_activation where singleton and enabled and review_sha256=c.activation_review_sha256)
 then raise exception 'Reviewed live mapping unavailable';end if;
 select * into r from kxra_private.live_billing_intents where id=i;
 if found then
  if (r.org_id,r.actor_id,r.kind,r.offer_key,r.mapping_revision) is distinct from (o,auth.uid(),k,c.offer_key,c.revision)
  then raise exception 'Live intent replay conflict';end if;
  return jsonb_build_object('id',r.id,'state',r.state,'entitlement_authority',false);
 end if;
 if k='CHECKOUT' and (b.subscription_id is not null or b.checkout_intent_id is not null)
 or k<>'CHECKOUT' and b.subscription_id is null then raise exception 'Live intent unavailable; reconcile original request';end if;
 if k='CHECKOUT' and kxra_private.pilot_seats(o)>(select (p->>'people')::integer from jsonb_array_elements(kxra_private.approved_workspace_catalogue_v1()) p where p->>'offer_key'=c.offer_key)
 then raise exception 'Approved seat capacity exceeded';end if;
 insert into kxra_private.live_billing_intents(id,org_id,actor_id,kind,customer_id,subscription_id,offer_key,mapping_revision,terms_review_sha256,observed_version,auth_time)
 values(i,o,auth.uid(),k,b.customer_id,b.subscription_id,c.offer_key,c.revision,c.terms_review_sha256,b.version,to_timestamp((auth.jwt()->>'auth_time')::double precision)) returning * into r;
 if k='CHECKOUT' then update kxra_private.live_billing_bindings set checkout_intent_id=i where org_id=o;end if;
 return jsonb_build_object('id',r.id,'state',r.state,'entitlement_authority',false);
end $$;

-- Worker functions have no public/authenticated execute privilege. No new role/login is created.
create function kxra_private.claim_live_billing_intent(i uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r kxra_private.live_billing_intents;b kxra_private.live_billing_bindings;c kxra_private.live_billing_mappings;
begin
 perform kxra_private.live_billing_gate();
 select * into r from kxra_private.live_billing_intents where id=i;
 if not found then raise exception 'Live intent unavailable';end if;
 perform pg_advisory_xact_lock(hashtext('live-billing:'||r.org_id::text));
 select * into b from kxra_private.live_billing_bindings where org_id=r.org_id for update;
 select * into r from kxra_private.live_billing_intents where id=i for update;
 select * into c from kxra_private.live_billing_mappings where offer_key=r.offer_key and revision=r.mapping_revision and enabled for share;
 if not found or not exists(select 1 from kxra_private.live_billing_activation where singleton and enabled and review_sha256=c.activation_review_sha256)
 or b.quarantined or r.auth_time<now()-interval '15 minutes' or r.auth_time>now()+interval '1 minute' or r.state<>'REQUESTED' or r.expires_at<=now() or r.observed_version<>b.version
 or (r.customer_id,r.subscription_id,r.offer_key,r.mapping_revision) is distinct from (b.customer_id,b.subscription_id,b.offer_key,b.mapping_revision)
 or r.terms_review_sha256<>c.terms_review_sha256 then raise exception 'Live intent changed, consumed or expired';end if;
 -- Recheck authorization after queue delays/revocation; no cached owner claim suffices.
 if not exists(select 1 from kxra.organisation_memberships m join kxra.account_identities a on a.account_id=m.account_id
 where m.org_id=r.org_id and m.account_id=r.actor_id and m.state='ACTIVE' and m.revoked_at is null and m.starts_at<=now()
 and (m.expires_at is null or m.expires_at>now()) and m.security_role in ('KXRA_OWNER','ORG_ADMIN') and a.state='ACTIVE' and a.email_verified_at is not null
 and exists(select 1 from kxra.organisations o where o.id=r.org_id and o.state='ACTIVE'))
 then raise insufficient_privilege;end if;
 if not kxra_private.live_billing_legal_allowed(r.org_id,r.actor_id) then raise insufficient_privilege;end if;
 update kxra_private.live_billing_intents set state='INFLIGHT',consumed_at=now() where id=i;
 return jsonb_build_object('intent',jsonb_build_object('id',r.id,'org_id',r.org_id,'actor_id',r.actor_id,'kind',r.kind,'state','REQUESTED',
 'customer_id',r.customer_id,'subscription_id',r.subscription_id,'offer_key',r.offer_key,'mapping_revision',r.mapping_revision,'terms_review_sha256',r.terms_review_sha256,
 'created_at',floor(extract(epoch from r.created_at))::bigint,'expires_at',floor(extract(epoch from r.expires_at))::bigint),
 'mapping',to_jsonb(c),'observed_version',b.version,'entitlement_authority',false);
end $$;

create function kxra_private.finish_live_billing_intent(i uuid,outcome text,sid text,result_hash text) returns text
language plpgsql security definer set search_path='' as $$
declare r kxra_private.live_billing_intents;
begin
 perform kxra_private.live_billing_gate();
 select * into r from kxra_private.live_billing_intents where id=i for update;
 if not found or outcome is null or outcome not in ('CONSUMED','UNCERTAIN') or result_hash is null or result_hash!~'^[a-f0-9]{64}$'
 or (r.kind='RECONCILE' and sid is not null) or (sid is not null and
 ((r.kind='CHECKOUT' and sid!~'^cs_live_[A-Za-z0-9_]{6,}$') or (r.kind='PORTAL' and sid!~'^bps_[A-Za-z0-9]{6,}$')))
 or (outcome='CONSUMED' and r.kind<>'RECONCILE' and sid is null) then raise exception 'Invalid live intent completion';end if;
 if r.state in ('CONSUMED','UNCERTAIN') then
  if (r.state,r.provider_session_id,r.result_sha256) is distinct from (outcome,sid,result_hash) then raise exception 'Live completion replay conflict';end if;
  return r.state;
 end if;
 if r.state<>'INFLIGHT' then raise exception 'Live intent not claimed';end if;
 update kxra_private.live_billing_intents set state=outcome,provider_session_id=sid,result_sha256=result_hash where id=i;
 -- Neither completion nor a successful session changes binding/entitlement state.
 return outcome;
end $$;

create function kxra_private.record_live_billing_event(e jsonb) returns text
language plpgsql security definer set search_path='' as $$
declare b kxra_private.live_billing_bindings;r kxra_private.live_billing_event_receipts;c kxra_private.live_billing_mappings;new_conflict boolean;
begin
 perform kxra_private.live_billing_gate();
 if e is null or jsonb_typeof(e)<>'object' or e-'event_id'-'payload_sha256'-'account_id'-'mode'-'customer_id'-'subscription_id'-'checkout_intent_id'-'offer_key'-'mapping_revision'<>'{}'::jsonb
 or e->>'event_id' is null or e->>'event_id'!~'^evt_[A-Za-z0-9]{6,}$' or e->>'payload_sha256' is null or e->>'payload_sha256'!~'^[a-f0-9]{64}$'
 or e->>'account_id' is distinct from 'acct_1Rv3KdC84VkhhIRz' or e->>'mode' is distinct from 'live'
 or e->>'subscription_id' is null or e->>'subscription_id'!~'^sub_[A-Za-z0-9]{6,}$' then raise exception 'Invalid verified live receipt';end if;
 -- Global receipt lock then event-ID then tenant lock: conflicting cross-tenant IDs cannot deadlock each other. No created-time ordering.
 perform pg_advisory_xact_lock(hashtext('live-receipts'));
 perform pg_advisory_xact_lock(hashtext('live-event:'||(e->>'event_id')));
 select * into b from kxra_private.live_billing_bindings where customer_id=e->>'customer_id';
 if not found then raise exception 'Unknown live customer';end if;
 perform pg_advisory_xact_lock(hashtext('live-billing:'||b.org_id::text));
 select * into b from kxra_private.live_billing_bindings where org_id=b.org_id for update;
 select * into c from kxra_private.live_billing_mappings where offer_key=b.offer_key and revision=b.mapping_revision and enabled for share;
 if not found or not exists(select 1 from kxra_private.live_billing_activation where singleton and enabled and review_sha256=c.activation_review_sha256)
 or e->>'offer_key' is distinct from b.offer_key or e->>'mapping_revision' is distinct from b.mapping_revision::text
 or e->>'checkout_intent_id' is distinct from b.checkout_intent_id::text
 or (b.subscription_id is not null and b.subscription_id is distinct from e->>'subscription_id') then raise exception 'Live receipt binding mismatch';end if;
 select * into r from kxra_private.live_billing_event_receipts where event_id=e->>'event_id';
 if found then
  if r.org_id=b.org_id and r.payload_sha256=e->>'payload_sha256' and r.subscription_id=e->>'subscription_id' then return 'DUPLICATE';end if;
  insert into kxra_private.live_billing_event_conflicts(event_id,org_id,observed_sha256) values(r.event_id,b.org_id,e->>'payload_sha256') on conflict do nothing returning true into new_conflict;
  if coalesce(new_conflict,false) then
   update kxra_private.live_billing_bindings set quarantined=true,reconcile_required=true,version=version+1 where org_id in (b.org_id,r.org_id);
  end if;
  return 'CONFLICT';
 end if;
 if b.checkout_intent_id is null or not exists(select 1 from kxra_private.live_billing_intents where id=b.checkout_intent_id and org_id=b.org_id and kind='CHECKOUT' and state in ('INFLIGHT','CONSUMED','UNCERTAIN'))
 then raise exception 'Unclaimed live checkout provenance';end if;
 insert into kxra_private.live_billing_event_receipts(event_id,org_id,payload_sha256,subscription_id) values(e->>'event_id',b.org_id,e->>'payload_sha256',e->>'subscription_id');
 update kxra_private.live_billing_bindings set subscription_id=coalesce(subscription_id,e->>'subscription_id'),reconcile_required=true,version=version+1 where org_id=b.org_id;
 return 'RECONCILE_REQUIRED';
end $$;

revoke all on function kxra_private.live_billing_mapping_immutable(),kxra_private.live_billing_binding_immutable(),kxra_private.live_billing_receipt_immutable(),kxra_private.live_billing_gate(),
 kxra_private.live_billing_legal_allowed(uuid,uuid),kxra_private.request_live_billing_intent(uuid,text,text),kxra_private.claim_live_billing_intent(uuid),
 kxra_private.finish_live_billing_intent(uuid,text,text,text),kxra_private.record_live_billing_event(jsonb) from public,anon,authenticated,kxra_billing_worker;
grant execute on function kxra_private.request_live_billing_intent(uuid,text,text) to authenticated;
grant execute on function kxra_private.claim_live_billing_intent(uuid),kxra_private.finish_live_billing_intent(uuid,text,text,text),
 kxra_private.record_live_billing_event(jsonb) to kxra_billing_worker;
