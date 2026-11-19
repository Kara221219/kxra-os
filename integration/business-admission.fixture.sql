-- LOCAL CANDIDATE ONLY. Release owner assigns migration order after 0111 and
-- reviews overlapping billing/sign-up interfaces. No hosted execution/activation.
begin;
create table kxra_private.business_declarations (
 id uuid primary key default gen_random_uuid(), sequence bigint generated always as identity unique,
 org_id uuid not null references kxra.organisations(id), actor_id uuid not null,
 legal_name text not null check(length(legal_name) between 2 and 160 and legal_name !~ '[[:cntrl:]]'),
 country text not null check(country=any(string_to_array('AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW',' '))), region text not null check(length(region) between 1 and 120 and region !~ '[[:cntrl:]]'),
 provider text not null check(length(provider) between 2 and 80 and provider ~ '^[a-zA-Z0-9 ._-]+$'),
 business_use boolean not null check(business_use), authorised boolean not null check(authorised),
 provider_costs boolean not null check(provider_costs),
 declaration_version text not null check(declaration_version='business-byok-v1'), created_at timestamptz not null default now()
);
create index on kxra_private.business_declarations(org_id,sequence desc);
create table kxra_private.business_eligibility_policies (
 id uuid primary key default gen_random_uuid(), version text not null unique, sequence bigint generated always as identity unique,
 evidence_sha256 text not null check(evidence_sha256~'^[a-f0-9]{64}$'),
 owner_review_reference text not null check(length(owner_review_reference) between 1 and 160),
 effective_at timestamptz not null, expires_at timestamptz not null check(expires_at>effective_at),
 enabled boolean not null default false
);
create table kxra_private.business_eligibility_reviews (
 id uuid primary key default gen_random_uuid(), sequence bigint generated always as identity unique,
 org_id uuid not null references kxra.organisations(id), declaration_id uuid not null references kxra_private.business_declarations(id),
 policy_id uuid not null references kxra_private.business_eligibility_policies(id),
 scope_id uuid not null references kxra_private.modern_billing_execution_identity(scope_id),
 customer_id text not null, offer_key text not null, mapping_revision integer not null,
 terms_document_id uuid not null, terms_document_version integer not null,
 foreign key(terms_document_id,terms_document_version) references kxra.legal_documents(id,version),
 mapping_tax_sha256 text not null check(mapping_tax_sha256~'^[a-f0-9]{64}$'),
 terms_sha256 text not null check(terms_sha256~'^[a-f0-9]{64}$'),
 legal_status text not null check(legal_status in ('CLEARED','BLOCKED','REVIEW_REQUIRED')),
 payment_status text not null check(payment_status in ('CLEARED','BLOCKED','REVIEW_REQUIRED')),
 provider_status text not null check(provider_status in ('CLEARED','BLOCKED','REVIEW_REQUIRED')),
 tax_status text not null check(tax_status in ('CLEARED','BLOCKED','REVIEW_REQUIRED')),
 legal_evidence_sha256 text not null check(legal_evidence_sha256~'^[a-f0-9]{64}$'),
 payment_evidence_sha256 text not null check(payment_evidence_sha256~'^[a-f0-9]{64}$'),
 provider_evidence_sha256 text not null check(provider_evidence_sha256~'^[a-f0-9]{64}$'),
 tax_evidence_sha256 text not null check(tax_evidence_sha256~'^[a-f0-9]{64}$'),
 state text generated always as (case
 when 'BLOCKED' in (legal_status,payment_status,provider_status,tax_status) then 'BLOCKED'
 when legal_status='CLEARED' and payment_status='CLEARED' and provider_status='CLEARED' and tax_status='CLEARED' then 'ELIGIBLE'
 else 'REVIEW_REQUIRED' end) stored,
 reviewed_at timestamptz not null default now(), expires_at timestamptz not null check(expires_at>reviewed_at),
 withdrawn_at timestamptz, reviewer_reference text not null check(length(reviewer_reference) between 1 and 160)
);
create index on kxra_private.business_eligibility_reviews(org_id,sequence desc);
alter table kxra_private.business_declarations enable row level security;
alter table kxra_private.business_eligibility_policies enable row level security;
alter table kxra_private.business_eligibility_reviews enable row level security;
revoke all on kxra_private.business_declarations,kxra_private.business_eligibility_policies,kxra_private.business_eligibility_reviews from public,anon,authenticated,kxra_billing_worker;
revoke all on sequence kxra_private.business_declarations_sequence_seq,kxra_private.business_eligibility_reviews_sequence_seq,kxra_private.business_eligibility_policies_sequence_seq from public,anon,authenticated,kxra_billing_worker;

create function kxra_private.guard_business_evidence() returns trigger
language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' then raise exception 'Business evidence is append-only';end if;
 if tg_table_name='business_eligibility_reviews' then
  if old.withdrawn_at is not null or new.withdrawn_at is null or (to_jsonb(new)-array['withdrawn_at','state']) is distinct from (to_jsonb(old)-array['withdrawn_at','state']) then raise exception 'Review evidence is immutable; append a new review';end if;
 elsif tg_table_name='business_eligibility_policies' then
  if (to_jsonb(new)-'enabled') is distinct from (to_jsonb(old)-'enabled') then raise exception 'Policy evidence is immutable; append a new version';end if;
 else raise exception 'Business declarations are append-only';end if;
 return new;
end $$;
create trigger business_declaration_immutable before update or delete on kxra_private.business_declarations for each row execute function kxra_private.guard_business_evidence();
create trigger business_review_immutable before update or delete on kxra_private.business_eligibility_reviews for each row execute function kxra_private.guard_business_evidence();
create trigger business_policy_immutable before update or delete on kxra_private.business_eligibility_policies for each row execute function kxra_private.guard_business_evidence();
revoke all on function kxra_private.guard_business_evidence() from public,anon,authenticated,kxra_billing_worker;

-- No client may grant itself a decision. Only a separately reviewed owner/operator
-- DB operation may append evidence-backed policy/review rows. Empty configuration
-- intentionally leaves every location unresolved; there is no country ban list.
create function kxra_private.business_current_review(o uuid, customer text, scope uuid, offer text, mapping integer, terms text) returns uuid
language plpgsql security definer set search_path='' as $$
declare d kxra_private.business_declarations; r kxra_private.business_eligibility_reviews; p kxra_private.business_eligibility_policies;
begin
 select * into d from kxra_private.business_declarations where org_id=o order by sequence desc limit 1;
 if not found then return null;end if;
 select * into r from kxra_private.business_eligibility_reviews where org_id=o order by sequence desc limit 1;
 if not found or r.state<>'ELIGIBLE' or r.withdrawn_at is not null or r.reviewed_at>now() or r.expires_at<=now()
 or (r.declaration_id,r.customer_id,r.scope_id,r.offer_key,r.mapping_revision,r.terms_sha256)
 is distinct from (d.id,customer,scope,offer,mapping,terms) then return null;end if;
 select * into p from kxra_private.business_eligibility_policies where id=r.policy_id;
 if not found or not p.enabled or p.effective_at>now() or p.expires_at<=now()
 or p.id is distinct from (select id from kxra_private.business_eligibility_policies where enabled order by sequence desc limit 1) then return null;end if;
 if not exists(select 1 from kxra_private.live_billing_mappings m where m.scope_id=scope and m.offer_key=offer and m.revision=mapping and m.enabled and m.terms_review_sha256=terms and m.tax_review_sha256=r.mapping_tax_sha256) then return null;end if;
 if not exists(select 1 from kxra.legal_documents t
 join kxra_private.live_paid_policies q on q.scope_id=scope and q.offer_key=offer and q.mapping_revision=mapping and q.enabled
 and q.terms_document_id=t.id and q.terms_document_version=t.version and q.terms_review_sha256=r.terms_sha256 and q.tax_review_sha256=r.mapping_tax_sha256
 where t.id=r.terms_document_id and t.version=r.terms_document_version
 and t.document_type='TERMS' and t.audience in ('CUSTOMER','ALL') and t.content_sha256=r.terms_sha256 and t.status='APPROVED' and t.effective_at<=now()
 and t.owner_approval_reference is not null and t.owner_approved_at is not null) then return null;end if;
 return r.id;
end $$;
revoke all on function kxra_private.business_current_review(uuid,text,uuid,text,integer,text) from public,anon,authenticated,kxra_billing_worker;

create function kxra.business_admission_status() returns jsonb
language plpgsql security definer set search_path='' as $$
declare o uuid=kxra_private.member_org(); b kxra_private.live_billing_bindings; r kxra_private.business_eligibility_reviews; current_id uuid;
begin
 if session_user<>'kxra_app' or auth.uid() is null or not coalesce(kxra_private.mfa_owner(o),false)
 or not exists(select 1 from kxra.organisation_memberships m join kxra.account_identities a on a.account_id=m.account_id where m.org_id=o and m.account_id=auth.uid() and m.security_role='ORG_ADMIN' and m.relationship_type='CUSTOMER' and a.state='ACTIVE' and a.email_verified_at is not null)
 or not exists(select 1 from kxra.organisations where id=o and organisation_kind='CUSTOMER' and state='ACTIVE') then raise insufficient_privilege;end if;
 select * into b from kxra_private.live_billing_bindings where org_id=o;
 select * into r from kxra_private.business_eligibility_reviews where org_id=o order by sequence desc limit 1;
 select kxra_private.business_current_review(o,b.customer_id,b.scope_id,b.offer_key,b.mapping_revision,m.terms_review_sha256) into current_id
 from kxra_private.live_billing_mappings m where m.offer_key=b.offer_key and m.revision=b.mapping_revision and m.enabled;
 return jsonb_build_object('state',case when current_id is not null then 'ELIGIBLE'
 when r.state='BLOCKED' and r.withdrawn_at is null and r.reviewed_at<=now() and r.expires_at>now()
 and (r.customer_id,r.scope_id,r.offer_key,r.mapping_revision) is not distinct from (b.customer_id,b.scope_id,b.offer_key,b.mapping_revision)
 and exists(select 1 from kxra_private.business_eligibility_policies p where p.id=r.policy_id and p.enabled and p.effective_at<=now() and p.expires_at>now() and p.id=(select id from kxra_private.business_eligibility_policies where enabled order by sequence desc limit 1))
 and exists(select 1 from kxra_private.live_billing_mappings m where m.offer_key=b.offer_key and m.revision=b.mapping_revision and m.enabled and m.terms_review_sha256=r.terms_sha256 and m.tax_review_sha256=r.mapping_tax_sha256)
 and r.declaration_id=(select id from kxra_private.business_declarations where org_id=o order by sequence desc limit 1) then 'BLOCKED'
 else 'REVIEW_REQUIRED' end,'declaration_version','business-byok-v1',
 'declaration_id',(select id from kxra_private.business_declarations where org_id=o order by sequence desc limit 1),
 'decision_id',r.id,'policy_version',(select version from kxra_private.business_eligibility_policies where id=r.policy_id),
 'reviewed_at',r.reviewed_at,'expires_at',r.expires_at,'entitlement_authority',false);
end $$;
create function kxra.submit_business_declaration(v jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare o uuid=kxra_private.member_org(); d kxra_private.business_declarations; country text=upper(trim(v->>'country'));
begin
 perform kxra.business_admission_status();
 perform pg_advisory_xact_lock(hashtext('live-billing:'||o::text));
 if jsonb_typeof(v) is distinct from 'object' or jsonb_typeof(v->'legal_name') is distinct from 'string' or jsonb_typeof(v->'country') is distinct from 'string' or jsonb_typeof(v->'region') is distinct from 'string' or jsonb_typeof(v->'provider') is distinct from 'string' or (v-array['legal_name','country','region','provider','business_use','authorised','provider_costs','declaration_version'])<>'{}'::jsonb
 or v->'business_use' is distinct from 'true'::jsonb or v->'authorised' is distinct from 'true'::jsonb or v->'provider_costs' is distinct from 'true'::jsonb
 or v->>'declaration_version' is distinct from 'business-byok-v1' then raise exception 'Business declaration required';end if;
 -- ISO_COUNTRY_CHECK
 if country is null or not country=any(string_to_array('AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW',' ')) then raise exception 'Business location required';end if;
 if not kxra.consume_rate_limit('business-declaration',encode(sha256(convert_to(o::text||':'||auth.uid()::text,'UTF8')),'hex'),8,900) then raise exception 'Business declaration temporarily unavailable';end if;
 select * into d from kxra_private.business_declarations where org_id=o order by sequence desc limit 1;
 if not found or (d.legal_name,d.country,d.region,d.provider,d.actor_id) is distinct from (trim(v->>'legal_name'),country,trim(v->>'region'),trim(v->>'provider'),auth.uid()) then
 insert into kxra_private.business_declarations(org_id,actor_id,legal_name,country,region,provider,business_use,authorised,provider_costs,declaration_version)
 values(o,auth.uid(),trim(v->>'legal_name'),country,trim(v->>'region'),trim(v->>'provider'),true,true,true,'business-byok-v1');
 end if;
 return kxra.business_admission_status();
end $$;
revoke all on function kxra.business_admission_status(),kxra.submit_business_declaration(jsonb) from public,anon,kxra_billing_worker;
grant execute on function kxra.business_admission_status(),kxra.submit_business_declaration(jsonb) to authenticated;

alter table kxra_private.live_billing_intents add column business_eligibility_review_id uuid references kxra_private.business_eligibility_reviews(id);
create function kxra_private.business_checkout_current(i uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare r kxra_private.live_billing_intents; current_id uuid;
begin
 select * into r from kxra_private.live_billing_intents where id=i;
 if not found then return false;end if;
 if r.kind<>'CHECKOUT' then return true;end if;
 current_id=kxra_private.business_current_review(r.org_id,r.customer_id,r.scope_id,r.offer_key,r.mapping_revision,r.terms_review_sha256);
 return current_id is not null and r.business_eligibility_review_id is not distinct from current_id;
end $$;
create function kxra_private.guard_checkout_business_review() returns trigger
language plpgsql security definer set search_path='' as $$
declare current_id uuid;
begin
 if new.kind<>'CHECKOUT' then return new;end if;
 if tg_op='INSERT' then
 current_id=kxra_private.business_current_review(new.org_id,new.customer_id,new.scope_id,new.offer_key,new.mapping_revision,new.terms_review_sha256);
 if current_id is null then raise exception 'BUSINESS_ELIGIBILITY_REVIEW_REQUIRED';end if;
 -- Always resolve from DB; a forged supplied ID cannot grant eligibility.
 new.business_eligibility_review_id=current_id;
 elsif new.business_eligibility_review_id is distinct from old.business_eligibility_review_id then raise exception 'Immutable business eligibility binding';
 elsif new.state='INFLIGHT' and not coalesce(kxra_private.business_checkout_current(new.id),false) then raise exception 'BUSINESS_ELIGIBILITY_REVIEW_REQUIRED';end if;
 return new;
end $$;
create trigger a10_business_review before insert or update on kxra_private.live_billing_intents for each row execute function kxra_private.guard_checkout_business_review();
revoke all on function kxra_private.business_checkout_current(uuid),kxra_private.guard_checkout_business_review() from public,anon,authenticated,kxra_billing_worker;

-- Wrap existing core interfaces; do not change their MFA, recovery, scope,
-- legal, price/seat, tax, ledger or entitlement behavior. Portal remains available.
alter function kxra_private.modern_core_request_live_billing_intent(uuid,text,text) rename to business_previous_request_intent;
create function kxra_private.modern_core_request_live_billing_intent(i uuid,k text,offer text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 result=kxra_private.business_previous_request_intent(i,k,offer);
 if k='CHECKOUT' and not coalesce(kxra_private.business_checkout_current(i),false) then raise exception 'BUSINESS_ELIGIBILITY_REVIEW_REQUIRED';end if;
 return result;
end $$;
alter function kxra_private.modern_core_current_live_billing_intent(uuid) rename to business_previous_current_intent;
create function kxra_private.modern_core_current_live_billing_intent(i uuid) returns boolean
language sql security definer set search_path='' as $$ select kxra_private.business_previous_current_intent(i) and kxra_private.business_checkout_current(i) $$;
alter function kxra_private.modern_core_checkout_dispatch_presentation(uuid) rename to business_previous_dispatch_presentation;
create function kxra_private.modern_core_checkout_dispatch_presentation(i uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if not coalesce(kxra_private.business_checkout_current(i),false) then raise exception 'BUSINESS_ELIGIBILITY_REVIEW_REQUIRED';end if;
 return kxra_private.business_previous_dispatch_presentation(i);
end $$;
alter function kxra_private.checkout_result_context(uuid,text) rename to business_previous_result_context;
create function kxra_private.checkout_result_context(i uuid,expected_mode text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 -- Authenticate and scope before applying the additional eligibility fence.
 result=kxra_private.business_previous_result_context(i,expected_mode);
 if not coalesce(kxra_private.business_checkout_current(i),false) then raise exception 'BUSINESS_ELIGIBILITY_REVIEW_REQUIRED';end if;
 return result;
end $$;
revoke all on function kxra_private.modern_core_request_live_billing_intent(uuid,text,text),kxra_private.modern_core_current_live_billing_intent(uuid),kxra_private.modern_core_checkout_dispatch_presentation(uuid),kxra_private.checkout_result_context(uuid,text),
 kxra_private.business_previous_request_intent(uuid,text,text),kxra_private.business_previous_current_intent(uuid),kxra_private.business_previous_dispatch_presentation(uuid),kxra_private.business_previous_result_context(uuid,text) from public,anon,authenticated,kxra_billing_worker;
commit;
