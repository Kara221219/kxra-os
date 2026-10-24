-- One immutable execution identity per database. Operator binding is separately reviewed;
-- migration leaves identity UNBOUND/DISABLED and creates no Stripe resource or secret.
create table kxra_private.modern_billing_execution_identity(
 singleton boolean primary key default true check(singleton),enabled boolean not null default false,
 scope_id uuid unique,execution_mode text check(execution_mode in ('LIVE','STAGING_SANDBOX')),
 project_ref text check(project_ref in ('jlebgsxcvhvpueuibekd','lhbgeucifxxcdoyrnesf')),
 account_id text check(account_id~'^acct_[A-Za-z0-9]{6,}$'),
 api_version text not null default '2025-07-30.basil' check(api_version='2025-07-30.basil'),
 catalogue_revision integer check(catalogue_revision>0),review_sha256 text check(review_sha256~'^[a-f0-9]{64}$'),scope_sha256 text check(scope_sha256~'^[a-f0-9]{64}$'),
 check((scope_id is null and execution_mode is null and project_ref is null and account_id is null and catalogue_revision is null and review_sha256 is null and scope_sha256 is null and not enabled)
 or (scope_id is not null and execution_mode is not null and project_ref is not null and account_id is not null and catalogue_revision is not null and review_sha256 is not null and scope_sha256 is not null)),
 check(execution_mode is null or execution_mode='LIVE' and project_ref='lhbgeucifxxcdoyrnesf' and account_id='acct_1Rv3KdC84VkhhIRz' or execution_mode='STAGING_SANDBOX' and project_ref='jlebgsxcvhvpueuibekd'),
 unique(scope_id,execution_mode,project_ref,account_id,scope_sha256)
);
insert into kxra_private.modern_billing_execution_identity(singleton) values(true);
create table kxra_private.modern_billing_scope_catalogue(
 scope_id uuid not null references kxra_private.modern_billing_execution_identity(scope_id),
 offer_key text not null check(offer_key in ('KXRA_STARTER_V1','KXRA_TEAM_V1','KXRA_BUSINESS_V1')),
 price_id text not null unique check(price_id~'^price_[A-Za-z0-9]{6,}$'),product_id text not null check(product_id~'^prod_[A-Za-z0-9]{6,}$'),
 monthly_amount_minor integer not null,people integer not null,currency text not null check(currency='gbp'),interval text not null check(interval='month'),
 primary key(scope_id,offer_key),
 check((offer_key='KXRA_STARTER_V1' and monthly_amount_minor=2900 and people=1) or (offer_key='KXRA_TEAM_V1' and monthly_amount_minor=7900 and people=5) or (offer_key='KXRA_BUSINESS_V1' and monthly_amount_minor=19900 and people=15))
);
alter table kxra_private.modern_billing_execution_identity enable row level security;
alter table kxra_private.modern_billing_scope_catalogue enable row level security;
revoke all on kxra_private.modern_billing_execution_identity,kxra_private.modern_billing_scope_catalogue from public,anon,authenticated,kxra_billing_worker;
create function kxra_private.modern_billing_expected_scope_sha() returns text language sql stable security definer set search_path='' as $$
 select encode(sha256(convert_to('scope-v1|'||c.scope_id::text||'|'||c.execution_mode||'|'||c.project_ref||'|'||c.account_id||'|'||c.api_version||'|'||c.catalogue_revision::text||'|'||c.review_sha256||'|'||
 string_agg(p.offer_key||'|'||p.price_id||'|'||p.product_id||'|'||p.monthly_amount_minor::text||'|'||p.people::text||'|gbp|month','|' order by p.offer_key collate "C"),'UTF8')),'hex')
 from kxra_private.modern_billing_execution_identity c join kxra_private.modern_billing_scope_catalogue p on p.scope_id=c.scope_id where c.singleton group by c.scope_id,c.execution_mode,c.project_ref,c.account_id,c.api_version,c.catalogue_revision,c.review_sha256
$$;
create function kxra_private.guard_modern_billing_identity() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' or old.scope_id is not null and (to_jsonb(new)-'enabled') is distinct from (to_jsonb(old)-'enabled') then raise exception 'Modern billing execution identity is immutable';end if;
 if new.enabled and ((select count(*) from kxra_private.modern_billing_scope_catalogue where scope_id=new.scope_id)<>3 or new.scope_sha256 is distinct from kxra_private.modern_billing_expected_scope_sha()) then raise exception 'Complete reviewed scope catalogue/hash required';end if;
 return new;
end $$;
create trigger modern_billing_identity_immutable before update or delete on kxra_private.modern_billing_execution_identity for each row execute function kxra_private.guard_modern_billing_identity();
create function kxra_private.guard_modern_scope_catalogue() returns trigger language plpgsql security definer set search_path='' as $$
declare c kxra_private.modern_billing_execution_identity;
begin
 if tg_op<>'INSERT' then raise exception 'Reviewed scope catalogue is immutable';end if;
 select * into c from kxra_private.modern_billing_execution_identity where scope_id=new.scope_id;
 if not found or c.enabled then raise exception 'Only disabled bound identity accepts reviewed catalogue';end if;
 if c.execution_mode='LIVE' then
  if not ((new.offer_key='KXRA_STARTER_V1' and new.price_id='price_1UTbq7C84VkhhIRzkBHEHivV' and new.product_id='prod_VUb2kv7rUiTeiu') or (new.offer_key='KXRA_TEAM_V1' and new.price_id='price_1UTbrLC84VkhhIRzMN225zAr' and new.product_id='prod_VUb3rh9e9eNw5a') or (new.offer_key='KXRA_BUSINESS_V1' and new.price_id='price_1UTlt5C84VkhhIRzGztXl6ey' and new.product_id='prod_VUlPLWhBBf7lmP')) then raise exception 'LIVE production catalogue required';end if;
 elsif new.price_id in ('price_1UTbq7C84VkhhIRzkBHEHivV','price_1UTbrLC84VkhhIRzMN225zAr','price_1UTlt5C84VkhhIRzGztXl6ey') or new.product_id in ('prod_VUb2kv7rUiTeiu','prod_VUb3rh9e9eNw5a','prod_VUlPLWhBBf7lmP') then raise exception 'Sandbox catalogue must be distinct from production';end if;
 return new;
end $$;
create trigger modern_scope_catalogue_immutable before insert or update or delete on kxra_private.modern_billing_scope_catalogue for each row execute function kxra_private.guard_modern_scope_catalogue();
create function kxra_private.modern_billing_scope_tag() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('scope_id',scope_id,'execution_mode',execution_mode,'project_ref',project_ref,'account_id',account_id,'api_version',api_version,'catalogue_revision',catalogue_revision,'scope_sha256',scope_sha256,'livemode',execution_mode='LIVE') from kxra_private.modern_billing_execution_identity where singleton and scope_id is not null
$$;
create function kxra_private.modern_billing_scope_attestation() returns jsonb language plpgsql security definer set search_path='' as $$
declare c kxra_private.modern_billing_execution_identity;
begin
 select * into c from kxra_private.modern_billing_execution_identity where singleton and enabled for share;
 if not found or c.scope_sha256 is distinct from kxra_private.modern_billing_expected_scope_sha() then raise exception 'Modern billing scope disabled/unbound';end if;
 return jsonb_build_object('execution_scope',kxra_private.modern_billing_scope_tag(),'enabled',true,'review_sha256',c.review_sha256,'catalogue',(select jsonb_agg(to_jsonb(p)-'scope_id' order by p.offer_key) from kxra_private.modern_billing_scope_catalogue p where p.scope_id=c.scope_id));
end $$;
create function kxra_private.modern_billing_require_scope(expected text) returns void language plpgsql security definer set search_path='' as $$
declare c kxra_private.modern_billing_execution_identity;
begin
 perform kxra_private.modern_billing_scope_attestation();
 select * into c from kxra_private.modern_billing_execution_identity where singleton;
 if c.execution_mode is distinct from expected or expected not in ('LIVE','STAGING_SANDBOX') or expected='LIVE' and c.project_ref<>'lhbgeucifxxcdoyrnesf' or expected='STAGING_SANDBOX' and c.project_ref<>'jlebgsxcvhvpueuibekd' or c.project_ref='lhbgeucifxxcdoyrnesf' and expected<>'LIVE' then raise exception 'Modern billing execution scope mismatch';end if;
end $$;
create function kxra_private.modern_billing_payload_scope(e jsonb) returns void language plpgsql security definer set search_path='' as $$
begin
 -- Safe completion may need to retain an uncertain outcome after the kill switch.
 -- Bound identity is immutable; producer/entry gates separately enforce enablement.
 if kxra_private.modern_billing_scope_tag() is null or e->'execution_scope' is distinct from kxra_private.modern_billing_scope_tag() then raise exception 'Payload execution scope mismatch';end if;
end $$;
-- Every canonical modern row carries this immutable tag. No secrets/credentials in scope.
create function kxra_private.guard_modern_billing_row_scope() returns trigger language plpgsql security definer set search_path='' as $$
declare c kxra_private.modern_billing_execution_identity;v jsonb;prior jsonb;
begin
 select * into c from kxra_private.modern_billing_execution_identity where singleton and scope_id is not null;
 if not found then
  if tg_table_name in ('live_billing_activation','live_webhook_endpoint_binding') and not coalesce((to_jsonb(new)->>'enabled')::boolean,false) then return new;end if;
  raise exception 'Modern billing database identity unbound';
 end if;
 v=jsonb_build_object('scope_id',c.scope_id,'execution_mode',c.execution_mode,'scope_project_ref',c.project_ref,'scope_account_id',c.account_id,'scope_sha256',c.scope_sha256,'provider_livemode',c.execution_mode='LIVE');
 if tg_op='UPDATE' then
  prior=to_jsonb(old);
  if prior->>'scope_id' is not null and (select jsonb_object_agg(key,prior->key) from jsonb_each(v)) is distinct from v then raise exception 'Immutable canonical row scope';end if;
 end if;
 if exists(select 1 from jsonb_each(v) field where to_jsonb(new)->field.key is not null and to_jsonb(new)->field.key is distinct from 'null'::jsonb and to_jsonb(new)->field.key is distinct from field.value) then raise exception 'Provided canonical scope mismatch';end if;
 if to_jsonb(new)->>'scope_id' is not null and (select jsonb_object_agg(key,to_jsonb(new)->key) from jsonb_each(v)) is distinct from v then raise exception 'Cross-mode canonical row';end if;
 new=jsonb_populate_record(new,v);
 if to_jsonb(new) ? 'account_id' and to_jsonb(new)->>'account_id' is not null and to_jsonb(new)->>'account_id'<>c.account_id then raise exception 'Provider account scope mismatch';end if;
 if to_jsonb(new) ? 'project_ref' and to_jsonb(new)->>'project_ref' is not null and to_jsonb(new)->>'project_ref'<>c.project_ref then raise exception 'Provider project scope mismatch';end if;
 if to_jsonb(new) ? 'livemode' and (to_jsonb(new)->>'livemode')::boolean is distinct from (c.execution_mode='LIVE') then raise exception 'Provider livemode scope mismatch';end if;
 if tg_table_name='live_billing_mappings' and to_jsonb(new)->>'mode' is distinct from (case when c.execution_mode='LIVE' then 'live' else 'staging_sandbox' end) then raise exception 'Mapping mode scope mismatch';end if;
 if tg_table_name='live_billing_mappings' and not exists(select 1 from kxra_private.modern_billing_scope_catalogue p where p.scope_id=c.scope_id and p.offer_key=to_jsonb(new)->>'offer_key' and p.price_id=to_jsonb(new)->>'price_id' and p.product_id=to_jsonb(new)->>'product_id') then raise exception 'Unreviewed execution catalogue';end if;
 return new;
end $$;
revoke all on function kxra_private.modern_billing_expected_scope_sha(),kxra_private.guard_modern_billing_identity(),kxra_private.guard_modern_scope_catalogue(),kxra_private.modern_billing_scope_tag(),kxra_private.modern_billing_scope_attestation(),kxra_private.modern_billing_require_scope(text),kxra_private.modern_billing_payload_scope(jsonb),kxra_private.guard_modern_billing_row_scope() from public,anon,authenticated,kxra_billing_worker;
grant execute on function kxra_private.modern_billing_scope_attestation() to kxra_billing_worker;

create function kxra_private.modern_billing_inner_dto(v jsonb) returns jsonb language sql immutable set search_path='' as $$
 select v-array['scope_id','execution_mode','scope_project_ref','scope_account_id','scope_sha256','provider_livemode']
$$;
create function kxra_private.modern_billing_scope_ready() returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((select enabled and scope_id is not null and scope_sha256=kxra_private.modern_billing_expected_scope_sha() from kxra_private.modern_billing_execution_identity where singleton),false)
$$;
create function kxra_private.modern_billing_require_bound_scope(expected text) returns void language plpgsql security definer set search_path='' as $$
declare actual text;
begin
 select execution_mode into actual from kxra_private.modern_billing_execution_identity where singleton;
 if actual is null or actual is distinct from expected then raise exception 'Bound execution identity required';end if;
end $$;
revoke all on function kxra_private.modern_billing_require_bound_scope(text) from public,anon,authenticated,kxra_billing_worker;
-- Status reads can expose DISABLED while unbound; no provider operation can do so.
create function kxra_private.modern_billing_require_view_scope(expected text) returns void language plpgsql security definer set search_path='' as $$
declare actual text;
begin
 select execution_mode into actual from kxra_private.modern_billing_execution_identity where singleton;
 if actual is not null and actual is distinct from expected then raise exception 'Modern billing status scope mismatch';end if;
end $$;
revoke all on function kxra_private.modern_billing_inner_dto(jsonb),kxra_private.modern_billing_scope_ready(),kxra_private.modern_billing_require_view_scope(text) from public,anon,authenticated,kxra_billing_worker;

create function kxra_private.modern_billing_checkout_id_ok(v text) returns boolean language sql stable security definer set search_path='' as $$
 select case when kxra_private.modern_billing_scope_tag()->>'execution_mode'='LIVE' then coalesce(v~'^cs_live_[A-Za-z0-9_]{6,}$',false) else coalesce(v~'^cs_test_[A-Za-z0-9_]{6,}$',false) end
$$;
revoke all on function kxra_private.modern_billing_checkout_id_ok(text) from public,anon,authenticated,kxra_billing_worker;

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
alter table kxra_private.live_billing_activation
 add column scope_id uuid,add column execution_mode text,add column scope_project_ref text,add column scope_account_id text,add column scope_sha256 text,add column provider_livemode boolean,
 add constraint live_billing_activation_execution_scope_fk foreign key(scope_id,execution_mode,scope_project_ref,scope_account_id,scope_sha256)
 references kxra_private.modern_billing_execution_identity(scope_id,execution_mode,project_ref,account_id,scope_sha256) match full,
 add check((scope_id is null and provider_livemode is null) or (scope_id is not null and provider_livemode is not null and provider_livemode=(execution_mode='LIVE')));
create trigger a00_execution_scope before insert or update on kxra_private.live_billing_activation for each row execute function kxra_private.guard_modern_billing_row_scope();
alter table kxra_private.live_billing_activation add check(not enabled or scope_id is not null);

insert into kxra_private.live_billing_activation(singleton) values(true);
create table kxra_private.live_billing_mappings(
 offer_key text not null check(offer_key in ('KXRA_STARTER_V1','KXRA_TEAM_V1','KXRA_BUSINESS_V1')),
 revision integer not null check(revision>0),version integer not null default 1 check(version=1),
 mode text not null default 'live' check(mode in ('live','staging_sandbox')), enabled boolean not null default false,
 account_id text not null check(account_id~'^acct_[A-Za-z0-9]{6,}$'),
 price_id text not null,product_id text not null,
 portal_configuration_id text not null check(portal_configuration_id~'^bpc_[A-Za-z0-9]{6,}$'),
 activation_review_sha256 text not null check(activation_review_sha256~'^[a-f0-9]{64}$'),
 terms_review_sha256 text not null check(terms_review_sha256~'^[a-f0-9]{64}$'),
 tax_review_sha256 text not null check(tax_review_sha256~'^[a-f0-9]{64}$'),
 tax_behavior text not null check(tax_behavior in ('inclusive','exclusive')),
 automatic_tax boolean not null,payment_method text not null check(payment_method='card'),
 primary key(offer_key,revision),
 check(mode<>'live' or ((offer_key='KXRA_STARTER_V1' and price_id='price_1UTbq7C84VkhhIRzkBHEHivV' and product_id='prod_VUb2kv7rUiTeiu')
 or (offer_key='KXRA_TEAM_V1' and price_id='price_1UTbrLC84VkhhIRzMN225zAr' and product_id='prod_VUb3rh9e9eNw5a')
 or (offer_key='KXRA_BUSINESS_V1' and price_id='price_1UTlt5C84VkhhIRzGztXl6ey' and product_id='prod_VUlPLWhBBf7lmP')))
);
alter table kxra_private.live_billing_mappings
 add column scope_id uuid not null,add column execution_mode text not null,add column scope_project_ref text not null,add column scope_account_id text not null,add column scope_sha256 text not null,add column provider_livemode boolean not null,
 add constraint live_billing_mappings_execution_scope_fk foreign key(scope_id,execution_mode,scope_project_ref,scope_account_id,scope_sha256)
 references kxra_private.modern_billing_execution_identity(scope_id,execution_mode,project_ref,account_id,scope_sha256) match full,
 add check((scope_id is null and provider_livemode is null) or (scope_id is not null and provider_livemode is not null and provider_livemode=(execution_mode='LIVE')));
create trigger a00_execution_scope before insert or update on kxra_private.live_billing_mappings for each row execute function kxra_private.guard_modern_billing_row_scope();

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
alter table kxra_private.live_billing_bindings
 add column scope_id uuid not null,add column execution_mode text not null,add column scope_project_ref text not null,add column scope_account_id text not null,add column scope_sha256 text not null,add column provider_livemode boolean not null,
 add constraint live_billing_bindings_execution_scope_fk foreign key(scope_id,execution_mode,scope_project_ref,scope_account_id,scope_sha256)
 references kxra_private.modern_billing_execution_identity(scope_id,execution_mode,project_ref,account_id,scope_sha256) match full,
 add check((scope_id is null and provider_livemode is null) or (scope_id is not null and provider_livemode is not null and provider_livemode=(execution_mode='LIVE')));
create trigger a00_execution_scope before insert or update on kxra_private.live_billing_bindings for each row execute function kxra_private.guard_modern_billing_row_scope();

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
 consumed_at timestamptz,completion_requested_outcome text check(completion_requested_outcome in ('CONSUMED','UNCERTAIN')),provider_session_id text unique,result_sha256 text check(result_sha256~'^[a-f0-9]{64}$'),
 foreign key(offer_key,mapping_revision) references kxra_private.live_billing_mappings(offer_key,revision),
 check(expires_at>created_at and expires_at<=created_at+interval '30 minutes'),
 check((state='REQUESTED' and consumed_at is null) or (state<>'REQUESTED' and consumed_at is not null)),
 check(kind='CHECKOUT' or subscription_id is not null)
);
alter table kxra_private.live_billing_intents
 add column scope_id uuid not null,add column execution_mode text not null,add column scope_project_ref text not null,add column scope_account_id text not null,add column scope_sha256 text not null,add column provider_livemode boolean not null,
 add constraint live_billing_intents_execution_scope_fk foreign key(scope_id,execution_mode,scope_project_ref,scope_account_id,scope_sha256)
 references kxra_private.modern_billing_execution_identity(scope_id,execution_mode,project_ref,account_id,scope_sha256) match full,
 add check((scope_id is null and provider_livemode is null) or (scope_id is not null and provider_livemode is not null and provider_livemode=(execution_mode='LIVE')));
create trigger a00_execution_scope before insert or update on kxra_private.live_billing_intents for each row execute function kxra_private.guard_modern_billing_row_scope();

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
alter table kxra_private.live_billing_event_receipts
 add column scope_id uuid not null,add column execution_mode text not null,add column scope_project_ref text not null,add column scope_account_id text not null,add column scope_sha256 text not null,add column provider_livemode boolean not null,
 add constraint live_billing_event_receipts_execution_scope_fk foreign key(scope_id,execution_mode,scope_project_ref,scope_account_id,scope_sha256)
 references kxra_private.modern_billing_execution_identity(scope_id,execution_mode,project_ref,account_id,scope_sha256) match full,
 add check((scope_id is null and provider_livemode is null) or (scope_id is not null and provider_livemode is not null and provider_livemode=(execution_mode='LIVE')));
create trigger a00_execution_scope before insert or update on kxra_private.live_billing_event_receipts for each row execute function kxra_private.guard_modern_billing_row_scope();

create table kxra_private.live_billing_event_conflicts(
 event_id text not null references kxra_private.live_billing_event_receipts(event_id),
 org_id uuid not null references kxra_private.live_billing_bindings(org_id),
 observed_sha256 text not null check(observed_sha256~'^[a-f0-9]{64}$'),
 created_at timestamptz not null default now(),primary key(event_id,org_id,observed_sha256)
);
alter table kxra_private.live_billing_event_conflicts
 add column scope_id uuid not null,add column execution_mode text not null,add column scope_project_ref text not null,add column scope_account_id text not null,add column scope_sha256 text not null,add column provider_livemode boolean not null,
 add constraint live_billing_event_conflicts_execution_scope_fk foreign key(scope_id,execution_mode,scope_project_ref,scope_account_id,scope_sha256)
 references kxra_private.modern_billing_execution_identity(scope_id,execution_mode,project_ref,account_id,scope_sha256) match full,
 add check((scope_id is null and provider_livemode is null) or (scope_id is not null and provider_livemode is not null and provider_livemode=(execution_mode='LIVE')));
create trigger a00_execution_scope before insert or update on kxra_private.live_billing_event_conflicts for each row execute function kxra_private.guard_modern_billing_row_scope();


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
 perform kxra_private.modern_billing_scope_attestation();
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
 and a.acceptance_wording=q.acceptance_wording and a.acceptance_wording_version=q.acceptance_wording_version and a.acceptance_wording_sha256=q.acceptance_wording_sha256
 where d.org_id=q.org_id and d.id=q.document_id and d.version=q.document_version and d.content_sha256=q.document_sha256 and d.status='APPROVED')
 )
$$;

create function kxra_private.modern_core_request_live_billing_intent(i uuid,k text,offer text) returns jsonb
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
create function kxra_private.modern_core_claim_live_billing_intent(i uuid) returns jsonb
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
 'mapping',kxra_private.modern_billing_inner_dto(to_jsonb(c)),'observed_version',b.version,'entitlement_authority',false);
end $$;

-- Fresh current-state fence for a once-claimed customer/session intent. No URL storage.
create function kxra_private.modern_core_current_live_billing_intent(i uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare r kxra_private.live_billing_intents;b kxra_private.live_billing_bindings;c kxra_private.live_billing_mappings;
begin
 select * into r from kxra_private.live_billing_intents where id=i;if not found then return false;end if;
 perform pg_advisory_xact_lock(hashtext('live-billing:'||r.org_id::text));
 select * into r from kxra_private.live_billing_intents where id=i;
 select * into b from kxra_private.live_billing_bindings where org_id=r.org_id;
 select * into c from kxra_private.live_billing_mappings where offer_key=r.offer_key and revision=r.mapping_revision and enabled for share;
 if not found or not kxra_private.modern_billing_scope_ready() or r.state<>'INFLIGHT' or r.expires_at<=now()
 or r.auth_time<now()-interval '15 minutes' or r.auth_time>now()+interval '1 minute' or b.quarantined or r.observed_version<>b.version
 or (r.customer_id,r.subscription_id,r.offer_key,r.mapping_revision) is distinct from (b.customer_id,b.subscription_id,b.offer_key,b.mapping_revision)
 or r.terms_review_sha256<>c.terms_review_sha256 or not exists(select 1 from kxra_private.live_billing_activation where singleton and enabled and review_sha256=c.activation_review_sha256)
 then return false;end if;
 return exists(select 1 from kxra.organisation_memberships m join kxra.account_identities a on a.account_id=m.account_id join kxra.organisations o on o.id=m.org_id
 where m.org_id=r.org_id and m.account_id=r.actor_id and m.state='ACTIVE' and m.revoked_at is null and m.starts_at<=now()
 and (m.expires_at is null or m.expires_at>now()) and m.security_role in ('KXRA_OWNER','ORG_ADMIN') and a.state='ACTIVE' and a.email_verified_at is not null and o.state='ACTIVE')
 and kxra_private.live_billing_legal_allowed(r.org_id,r.actor_id);
end $$;
revoke all on function kxra_private.modern_core_current_live_billing_intent(uuid) from public,anon,authenticated;


create function kxra_private.modern_core_finish_live_billing_intent(i uuid,outcome text,sid text,result_hash text) returns text
language plpgsql security definer set search_path='' as $$
declare r kxra_private.live_billing_intents;resolved text;
begin
 select * into r from kxra_private.live_billing_intents where id=i;
 if not found then raise exception 'Unknown once-claimed billing intent';end if;
 -- Match claim/event order: tenant advisory lock BEFORE intent row lock.
 perform pg_advisory_xact_lock(hashtext('live-billing:'||r.org_id::text));
 select * into r from kxra_private.live_billing_intents where id=i for update;
 if outcome is null or outcome not in ('CONSUMED','UNCERTAIN') or result_hash is null or result_hash!~'^[a-f0-9]{64}$'
 or (r.kind='RECONCILE' and sid is not null) or (sid is not null and
 ((r.kind='CHECKOUT' and not kxra_private.modern_billing_checkout_id_ok(sid)) or (r.kind='PORTAL' and sid!~'^bps_[A-Za-z0-9]{6,}$')))
 or (outcome='CONSUMED' and r.kind<>'RECONCILE' and sid is null) then raise exception 'Invalid billing intent completion';end if;
 if r.state in ('CONSUMED','UNCERTAIN') then
  if (coalesce(r.completion_requested_outcome,r.state),r.provider_session_id,r.result_sha256) is distinct from (outcome,sid,result_hash) then raise exception 'Billing completion replay conflict';end if;
  return r.state;
 end if;
 if r.state<>'INFLIGHT' then raise exception 'Billing intent not claimed';end if;
 resolved=case when outcome='CONSUMED' and not kxra_private.modern_core_current_live_billing_intent(i) then 'UNCERTAIN' else outcome end;
 -- An already attempted result survives activation/authority loss, but never becomes
 -- CONSUMED or a new session binding unless the canonical current fence still passes.
 update kxra_private.live_billing_intents set state=resolved,completion_requested_outcome=outcome,provider_session_id=sid,result_sha256=result_hash where id=i;
 return resolved;
end $$;

create function kxra_private.modern_core_record_live_billing_event(e jsonb) returns text
language plpgsql security definer set search_path='' as $$
declare b kxra_private.live_billing_bindings;r kxra_private.live_billing_event_receipts;c kxra_private.live_billing_mappings;new_conflict boolean;
begin
 perform kxra_private.modern_billing_payload_scope(e);
 e=e-'execution_scope';
 perform kxra_private.live_billing_gate();
 if e is null or jsonb_typeof(e)<>'object' or e-'event_id'-'payload_sha256'-'account_id'-'mode'-'customer_id'-'subscription_id'-'checkout_intent_id'-'offer_key'-'mapping_revision'<>'{}'::jsonb
 or e->>'event_id' is null or e->>'event_id'!~'^evt_[A-Za-z0-9]{6,}$' or e->>'payload_sha256' is null or e->>'payload_sha256'!~'^[a-f0-9]{64}$'
 or e->>'account_id' is distinct from (kxra_private.modern_billing_scope_tag()->>'account_id') or e->>'mode' is distinct from (case when kxra_private.modern_billing_scope_tag()->>'execution_mode'='LIVE' then 'live' else 'staging_sandbox' end)
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
 kxra_private.live_billing_legal_allowed(uuid,uuid),kxra_private.modern_core_request_live_billing_intent(uuid,text,text),kxra_private.modern_core_claim_live_billing_intent(uuid),
 kxra_private.modern_core_finish_live_billing_intent(uuid,text,text,text),kxra_private.modern_core_record_live_billing_event(jsonb) from public,anon,authenticated,kxra_billing_worker;
