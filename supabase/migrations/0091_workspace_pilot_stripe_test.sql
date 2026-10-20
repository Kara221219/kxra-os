-- Separate, empty, operator-reviewed TEST mapping. No provider writes or seeded offer.
alter table kxra.workspace_pilots drop constraint workspace_pilots_mode_check;
alter table kxra.workspace_pilots add constraint workspace_pilots_mode_check check(mode in ('FIXTURE','TEST_STRIPE'));
create table kxra.pilot_stripe_config(
 version integer primary key check(version=1),enabled boolean not null default false,
 account_id text not null check(account_id~'^acct_[A-Za-z0-9]{6,}$'),
 monthly_price text not null unique check(monthly_price~'^price_[A-Za-z0-9]{6,}$'),monthly_product text not null check(monthly_product~'^prod_[A-Za-z0-9]{6,}$'),
 setup_price text not null unique check(setup_price~'^price_[A-Za-z0-9]{6,}$'),setup_product text not null check(setup_product~'^prod_[A-Za-z0-9]{6,}$'),
 portal_config text not null check(portal_config~'^bpc_[A-Za-z0-9]{6,}$'),
 tax_behavior text not null check(tax_behavior in ('inclusive','exclusive')),
 terms_review text not null check(length(terms_review) between 10 and 200),
 check(monthly_price<>setup_price)
);
create table kxra.pilot_stripe_bindings(
 org_id uuid primary key references kxra.organisations(id),customer_id text not null unique check(customer_id~'^cus_[A-Za-z0-9]{6,}$'),
 subscription_id text unique,version integer not null default 0,last_event_at timestamptz,last_fingerprint text,
 reconcile_required boolean not null default false,terminal boolean not null default false
);
create table kxra.pilot_stripe_intents(
 id uuid primary key,org_id uuid not null references kxra.organisations(id),actor_id uuid not null references kxra.account_identities(account_id),
 kind text not null check(kind in ('CHECKOUT','PORTAL','RECONCILE')),include_setup boolean not null,
 customer_id text not null,subscription_id text,observed_version integer not null,
 state text not null default 'REQUESTED' check(state in ('REQUESTED','READY')),
 session_id text unique,redirect_url text,expires_at timestamptz,created_at timestamptz not null default now(),
 check(kind='CHECKOUT' or not include_setup)
);
create table kxra.pilot_stripe_events(
 event_id text primary key check(event_id~'^evt_[A-Za-z0-9]{6,}$'),org_id uuid not null references kxra.organisations(id),
 payload_hash text not null check(payload_hash~'^[a-f0-9]{64}$'),fingerprint text not null,
 outcome text not null check(outcome in ('APPLIED','STALE','RECONCILE_REQUIRED')),created_at timestamptz not null default now()
);
alter table kxra.pilot_stripe_config enable row level security;
alter table kxra.pilot_stripe_bindings enable row level security;
alter table kxra.pilot_stripe_intents enable row level security;
alter table kxra.pilot_stripe_events enable row level security;
revoke all on kxra.pilot_stripe_config,kxra.pilot_stripe_bindings,kxra.pilot_stripe_intents,kxra.pilot_stripe_events from public,anon,authenticated,kxra_billing_worker;
grant select on kxra.pilot_stripe_bindings,kxra.pilot_stripe_intents,kxra.pilot_stripe_events to authenticated;
create policy pilot_stripe_config_deny on kxra.pilot_stripe_config for select to authenticated using(false);
create policy pilot_stripe_binding_owner on kxra.pilot_stripe_bindings for select to authenticated using(org_id=kxra_private.member_org() and kxra_private.is_owner(org_id));
create policy pilot_stripe_intent_owner on kxra.pilot_stripe_intents for select to authenticated using(org_id=kxra_private.member_org() and kxra_private.mfa_owner(org_id) and actor_id=auth.uid());
create policy pilot_stripe_event_owner on kxra.pilot_stripe_events for select to authenticated using(org_id=kxra_private.member_org() and kxra_private.is_owner(org_id));
create function kxra.request_pilot_stripe(i uuid,k text,setup boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare o uuid=kxra_private.member_org();c kxra.pilot_stripe_config;b kxra.pilot_stripe_bindings;r kxra.pilot_stripe_intents;customer text;
begin
 if not kxra_private.mfa_owner(o) then raise insufficient_privilege;end if;
 if i is null or k is null or setup is null or k not in ('CHECKOUT','PORTAL','RECONCILE') or (setup and k<>'CHECKOUT') then raise exception 'Invalid pilot request';end if;
 select * into c from kxra.pilot_stripe_config where version=1 and enabled;
 if not found then raise exception 'Pilot provider configuration unavailable';end if;
 perform pg_advisory_xact_lock(hashtext('pilot:'||o::text));
 select * into b from kxra.pilot_stripe_bindings where org_id=o for update;
 if exists(select 1 from kxra.workspace_pilots where org_id=o and mode<>'TEST_STRIPE') then raise exception 'Fixture pilot cannot become provider billing';end if;
 select provider_customer_id into customer from kxra.billing_customers where org_id=o and provider='STRIPE' and state='ACTIVE';
 if customer is null then raise exception 'Verified billing customer required';end if;
 if b.org_id is null then
  if k<>'CHECKOUT' then raise exception 'Pilot subscription unavailable';end if;
  if kxra_private.pilot_seats(o)>5 then raise exception 'Five-person capacity exceeded';end if;
  insert into kxra.pilot_stripe_bindings(org_id,customer_id) values(o,customer) returning * into b;
 end if;
 if customer<>b.customer_id then raise exception 'Billing customer changed; reconciliation required';end if;
 select * into r from kxra.pilot_stripe_intents where id=i;
 if found then
  if r.org_id<>o or r.actor_id<>auth.uid() or r.kind<>k or r.include_setup<>setup then raise exception 'Pilot request replay conflict';end if;
 else
  if k='CHECKOUT' then
   if b.subscription_id is not null then raise exception 'Pilot subscription already bound';end if;
   -- A single pending attempt: never create another subscription after a lost response.
   if exists(select 1 from kxra.pilot_stripe_intents where org_id=o and kind='CHECKOUT') then raise exception 'Retry original request; checkout reconciliation required';end if;
  elsif b.subscription_id is null then raise exception 'Pilot subscription unavailable';end if;
  insert into kxra.pilot_stripe_intents(id,org_id,actor_id,kind,include_setup,customer_id,subscription_id,observed_version)
   values(i,o,auth.uid(),k,setup,b.customer_id,b.subscription_id,b.version) returning * into r;
 end if;
 if r.created_at<now()-interval '23 hours' then raise exception 'Pilot request expired; operator reconciliation required';end if;
 return jsonb_build_object('intent',to_jsonb(r),'config',to_jsonb(c));
end $$;
revoke all on function kxra.request_pilot_stripe(uuid,text,boolean) from public,anon;
grant execute on function kxra.request_pilot_stripe(uuid,text,boolean) to authenticated;
create function kxra_private.record_pilot_stripe_session(i uuid,customer text,sid text,url text,expiry timestamptz) returns text
language plpgsql security definer set search_path='' as $$
declare r kxra.pilot_stripe_intents;
begin
 select * into r from kxra.pilot_stripe_intents where id=i for update;
 if not found or r.customer_id is distinct from customer or expiry<=now() or r.created_at<now()-interval '23 hours' then raise exception 'Pilot session unavailable';end if;
 if r.kind='CHECKOUT' and (sid!~'^cs_test_[A-Za-z0-9_]{6,}$' or url!~'^https://checkout[.]stripe[.]com/') or r.kind='PORTAL' and (sid!~'^bps_[A-Za-z0-9_]{6,}$' or url!~'^https://billing[.]stripe[.]com/') or r.kind='RECONCILE' then raise exception 'Invalid pilot session';end if;
 if r.state='READY' then
  if (r.session_id,r.redirect_url,r.expires_at) is distinct from (sid,url,expiry) then raise exception 'Pilot session replay conflict';end if;return 'READY';
 end if;
 update kxra.pilot_stripe_intents set state='READY',session_id=sid,redirect_url=url,expires_at=expiry where id=i;return 'READY';
end $$;
revoke all on function kxra_private.record_pilot_stripe_session(uuid,text,text,text,timestamptz) from public,anon,authenticated;
grant execute on function kxra_private.record_pilot_stripe_session(uuid,text,text,text,timestamptz) to kxra_billing_worker;
create function kxra_private.record_pilot_stripe_event(e jsonb) returns text
language plpgsql security definer set search_path='' as $$
declare b kxra.pilot_stripe_bindings;c kxra.pilot_stripe_config;r kxra.pilot_stripe_intents;old kxra.pilot_stripe_events;
 event_time timestamptz;start_at timestamptz;end_at timestamptz;fingerprint text;result text='APPLIED';s text;reconcile boolean;
begin
 -- A signed, known subscription with an invalid offer can only reduce access.
 if coalesce((e->>'quarantine')::boolean,false) then
  if (e->>'livemode')::boolean is distinct from false or e->>'event_id' is null or e->>'event_id'!~'^evt_[A-Za-z0-9]{6,}$'
   or e->>'hash' is null or e->>'hash'!~'^[a-f0-9]{64}$' or e->>'created_at' is null or (e->>'created_at')::timestamptz>now()+interval '5 minutes' then raise exception 'Invalid quarantined snapshot';end if;
  select * into b from kxra.pilot_stripe_bindings where customer_id=e->>'customer' and subscription_id=e->>'subscription';
  if not found then raise exception 'Unknown pilot subscription';end if;
  perform pg_advisory_xact_lock(hashtext('pilot:'||b.org_id::text));
  select * into b from kxra.pilot_stripe_bindings where org_id=b.org_id for update;
  select * into old from kxra.pilot_stripe_events where event_id=e->>'event_id';
  if found then
   if old.payload_hash is distinct from e->>'hash' or old.org_id<>b.org_id then raise exception 'Pilot event replay conflict';end if;return old.outcome;
  end if;
  result=case when (e->>'created_at')::timestamptz<b.last_event_at then 'STALE' else 'RECONCILE_REQUIRED' end;
  if result<>'STALE' then
   update kxra.workspace_pilots set state=case when b.terminal or e->>'status'='canceled' then 'CANCELLED' else 'PAUSED' end,version=version+1,updated_at=now() where org_id=b.org_id and mode='TEST_STRIPE';
   update kxra.pilot_stripe_bindings set reconcile_required=true,version=version+1,last_event_at=greatest(last_event_at,(e->>'created_at')::timestamptz),terminal=terminal or coalesce(e->>'status'='canceled',false) where org_id=b.org_id;
  end if;
  insert into kxra.pilot_stripe_events(event_id,org_id,payload_hash,fingerprint,outcome) values(e->>'event_id',b.org_id,e->>'hash',e->>'hash',result);return result;
 end if;
 if e is null or (e->>'livemode')::boolean is distinct from false or (e->>'quantity')::integer is distinct from 1
  or e->>'currency' is distinct from 'gbp' or (e->>'amount')::integer is distinct from 4900
  or e->>'interval' is distinct from 'month' or (e->>'interval_count')::integer is distinct from 1
  or e->>'status' not in ('active','trialing','past_due','canceled','unpaid','paused','incomplete','incomplete_expired') then raise exception 'Invalid test pilot offer';end if;
 select * into c from kxra.pilot_stripe_config where version=1 and enabled;
 if not found or e->>'price' is distinct from c.monthly_price or e->>'product' is distinct from c.monthly_product
  or e->>'tax_behavior' is distinct from c.tax_behavior then raise exception 'Unreviewed pilot price';end if;
 select * into b from kxra.pilot_stripe_bindings where customer_id=e->>'customer';
 if not found or not exists(select 1 from kxra.billing_customers where org_id=b.org_id and provider='STRIPE' and state='ACTIVE' and provider_customer_id=b.customer_id) then raise exception 'Unknown or changed pilot customer';end if;
 perform pg_advisory_xact_lock(hashtext('pilot:'||b.org_id::text));
 select * into b from kxra.pilot_stripe_bindings where org_id=b.org_id for update;
 select * into old from kxra.pilot_stripe_events where event_id=e->>'event_id';
 if found then
  if old.payload_hash is distinct from e->>'hash' or old.org_id<>b.org_id then raise exception 'Pilot event replay conflict';end if;return old.outcome;
 end if;
 event_time=(e->>'created_at')::timestamptz;start_at=(e->>'period_start')::timestamptz;end_at=(e->>'period_end')::timestamptz;
 if event_time is null or event_time>now()+interval '5 minutes' or e->>'subscription'!~'^sub_[A-Za-z0-9]{6,}$' or e->>'event_id'!~'^evt_[A-Za-z0-9]{6,}$'
  or e->>'hash'!~'^[a-f0-9]{64}$' or start_at is null or end_at is null or end_at<=start_at then raise exception 'Invalid pilot snapshot';end if;
 reconcile=coalesce((e->>'reconcile')::boolean,false);
 if reconcile then
  select * into r from kxra.pilot_stripe_intents where id=(e->>'intent_id')::uuid;
  if not found or r.kind<>'RECONCILE' or r.org_id<>b.org_id or r.customer_id<>b.customer_id or r.observed_version<>b.version or r.created_at<now()-interval '5 minutes' then raise exception 'Reconciliation raced; request fresh snapshot';end if;
 else
  select * into r from kxra.pilot_stripe_intents where id=(e->>'intent_id')::uuid;
  if not found or r.kind<>'CHECKOUT' or r.org_id<>b.org_id or r.customer_id<>b.customer_id then raise exception 'Unknown pilot checkout provenance';end if;
 end if;
 if b.subscription_id is not null and b.subscription_id is distinct from e->>'subscription' then raise exception 'Subscription binding mismatch';end if;
 fingerprint=encode(sha256(convert_to((e-'event_id'-'hash'-'created_at'-'reconcile'-'intent_id')::text,'UTF8')),'hex');
 if not reconcile and b.last_event_at is not null and event_time<b.last_event_at then result='STALE';
 elsif not reconcile and (b.reconcile_required or event_time=b.last_event_at and fingerprint is distinct from b.last_fingerprint) then result='RECONCILE_REQUIRED';
 end if;
 if result<>'STALE' then
  s=case when b.terminal or e->>'status' in ('canceled','incomplete_expired') then 'CANCELLED' when result='RECONCILE_REQUIRED' then 'PAUSED'
    when e->>'status'='active' and start_at<=now() and end_at>now() and kxra_private.pilot_seats(b.org_id)<=5 then 'ACTIVE'
    when e->>'status'='paused' then 'PAUSED' else 'PAST_DUE' end;
  if exists(select 1 from kxra.workspace_pilots where org_id=b.org_id and mode<>'TEST_STRIPE') then raise exception 'Fixture pilot conflict';end if;
  insert into kxra.workspace_pilots(org_id,mode,state,period_start,period_end,cancel_at_period_end)
   values(b.org_id,'TEST_STRIPE',s,start_at,end_at,(e->>'cancel_at_end')::boolean)
   on conflict(org_id) do update set state=excluded.state,period_start=excluded.period_start,period_end=excluded.period_end,
    cancel_at_period_end=excluded.cancel_at_period_end,version=kxra.workspace_pilots.version+1,updated_at=now();
  update kxra.pilot_stripe_bindings set subscription_id=e->>'subscription',version=version+1,
   last_event_at=greatest(last_event_at,event_time),last_fingerprint=fingerprint,reconcile_required=result='RECONCILE_REQUIRED',
   terminal=terminal or e->>'status' in ('canceled','incomplete_expired') where org_id=b.org_id;
 end if;
 if reconcile then update kxra.pilot_stripe_intents set state='READY' where id=r.id;end if;
 insert into kxra.pilot_stripe_events(event_id,org_id,payload_hash,fingerprint,outcome) values(e->>'event_id',b.org_id,e->>'hash',fingerprint,result);
 return result;
end $$;
revoke all on function kxra_private.record_pilot_stripe_event(jsonb) from public,anon,authenticated;
grant execute on function kxra_private.record_pilot_stripe_event(jsonb) to kxra_billing_worker;

create or replace function kxra.workspace_pilot_event(i uuid,expected integer,kind text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare o uuid=kxra_private.member_org();p kxra.workspace_pilots;e kxra.workspace_pilot_events;receipt jsonb;
begin
 if session_user<>'kxra_app' or not kxra_private.mfa_owner(o) or current_setting('request.kxra.execution_mode',true) is distinct from 'fixture' then raise insufficient_privilege;end if;
 perform pg_advisory_xact_lock(hashtext('pilot:'||o::text));
 select * into e from kxra.workspace_pilot_events where id=i;
 if found then
  if e.org_id<>o or e.actor_id<>auth.uid() or e.action is distinct from kind or e.expected_version is distinct from expected then raise exception 'Pilot event replay conflict';end if;return e.receipt;
 end if;
 if i is null or expected is null or kind is null or kind not in ('ACTIVATE','RENEW','PAST_DUE','RECOVER','PAUSE','RESUME','CANCEL_AT_END','CANCEL_NOW','RECONCILE') then raise exception 'Invalid fixture billing event';end if;
 select * into p from kxra.workspace_pilots where org_id=o for update;
 if not found then
  if kind<>'ACTIVATE' or expected<>0 then raise exception 'Pilot unassigned';end if;
  if kxra_private.pilot_seats(o)>5 then raise exception 'Five-person capacity exceeded by existing people or held invitations';end if;
  insert into kxra.workspace_pilots(org_id,state,period_start,period_end) values(o,'ACTIVE',now(),now()+interval '1 month');
 else
  if p.mode<>'FIXTURE' then raise exception 'Provider pilot cannot use simulation';end if;
  if p.version<>expected then raise exception 'Pilot changed';end if;
  if kind='ACTIVATE' and p.state<>'CANCELLED' or kind='RENEW' and (p.state<>'ACTIVE' or p.cancel_at_period_end)
   or kind='RECOVER' and p.state<>'PAST_DUE' or kind='PAUSE' and p.state<>'ACTIVE' or kind='RESUME' and (p.state<>'PAUSED' or p.period_end<=now())
   or kind in ('PAST_DUE','CANCEL_AT_END') and p.state<>'ACTIVE' then raise exception 'Pilot transition unavailable';end if;
  if kind in ('ACTIVATE','RECOVER','RESUME') and kxra_private.pilot_seats(o)>5 then raise exception 'Five-person capacity exceeded';end if;
  update kxra.workspace_pilots set state=case when kind in ('ACTIVATE','RECOVER','RESUME') then 'ACTIVE' when kind='PAUSE' then 'PAUSED'
   when kind='PAST_DUE' then 'PAST_DUE' when kind='CANCEL_NOW' then 'CANCELLED'
   when kind='RECONCILE' and state='ACTIVE' and period_end<=now() then case when cancel_at_period_end then 'CANCELLED' else 'PAST_DUE' end else state end,
   period_start=case when kind in ('ACTIVATE','RECOVER') then now() else period_start end,
   period_end=case when kind in ('ACTIVATE','RECOVER') then now()+interval '1 month' when kind='RENEW' then greatest(period_end,now())+interval '1 month' else period_end end,
   cancel_at_period_end=case when kind='CANCEL_AT_END' then true when kind in ('ACTIVATE','RECOVER','CANCEL_NOW') then false else cancel_at_period_end end,
   version=version+1,updated_at=now() where org_id=o;
 end if;
 receipt=kxra_private.pilot_status();
 insert into kxra.workspace_pilot_events(id,org_id,actor_id,action,expected_version,receipt) values(i,o,auth.uid(),kind,expected,receipt);
 insert into kxra.audit_events(org_id,actor_id,action,resource_id,metadata) values(o,auth.uid(),'pilot.fixture_event',o,jsonb_build_object('event',i,'kind',kind));
 return receipt;
end $$;
revoke all on function kxra.workspace_pilot_event(uuid,integer,text) from public,anon;
grant execute on function kxra.workspace_pilot_event(uuid,integer,text) to authenticated;

create function kxra_private.deny_pilot_stripe_event_mutation() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'Pilot provider event receipt is immutable';end $$;
revoke all on function kxra_private.deny_pilot_stripe_event_mutation() from public,anon,authenticated;
create trigger pilot_stripe_event_immutable before update or delete on kxra.pilot_stripe_events for each row execute function kxra_private.deny_pilot_stripe_event_mutation();

-- Serialize even first assignment; do not test plan existence before the lock.
create or replace function kxra_private.guard_pilot_seats() returns trigger language plpgsql security definer set search_path='' as $$
declare before_count integer;after_count integer;account uuid;email text;
begin
 perform pg_advisory_xact_lock(hashtext('pilot:'||new.org_id::text));
 if not exists(select 1 from kxra.workspace_pilots where org_id=new.org_id) and not exists(select 1 from kxra.pilot_stripe_bindings where org_id=new.org_id) then return new;end if;
 before_count=kxra_private.pilot_seats(new.org_id);
 if tg_table_name='organisation_memberships' then
  account=case when new.state in ('ACTIVE','INVITED') and new.revoked_at is null and (new.expires_at is null or new.expires_at>now()) then new.account_id else null end;
  after_count=kxra_private.pilot_seats(new.org_id,new.id,account,null,null);
 else
  email=case when new.state in ('PENDING','SENT','DELIVERY_FAILED') and new.expires_at>now() then new.email_digest else null end;
  after_count=kxra_private.pilot_seats(new.org_id,null,null,new.id,email);
 end if;
 if after_count>5 and after_count>before_count then raise exception 'Pilot seat admission unavailable';end if;
 if not kxra_private.pilot_entitled(new.org_id) then
  if tg_table_name='organisation_memberships' and new.state='ACTIVE' and (tg_op='INSERT' or old.state<>'ACTIVE' or (old.expires_at is not null and old.expires_at<=now())) then raise exception 'Pilot seat admission unavailable';end if;
  if tg_table_name='invitations' and new.state in ('PENDING','SENT','DELIVERY_FAILED') and new.expires_at>now() and (tg_op='INSERT' or old.state not in ('PENDING','SENT','DELIVERY_FAILED') or new.expires_at>old.expires_at) then raise exception 'Pilot seat admission unavailable';end if;
  if after_count>before_count then raise exception 'Pilot seat admission unavailable';end if;
 end if;
 return new;
end $$;
revoke all on function kxra_private.guard_pilot_seats() from public,anon,authenticated;

create function kxra_private.pilot_stripe_readiness() returns jsonb language sql stable security definer set search_path='' as $$
 select case when kxra_private.is_owner(kxra_private.member_org()) then jsonb_build_object(
 'mapping_reviewed',exists(select 1 from kxra.pilot_stripe_config where version=1 and enabled),
 'customer_mapped',exists(select 1 from kxra.billing_customers where org_id=kxra_private.member_org() and provider='STRIPE' and state='ACTIVE'),
 'bound',exists(select 1 from kxra.pilot_stripe_bindings where org_id=kxra_private.member_org() and subscription_id is not null),
 'reconciliation_required',coalesce((select reconcile_required from kxra.pilot_stripe_bindings where org_id=kxra_private.member_org()),false)) else null end
$$;
revoke all on function kxra_private.pilot_stripe_readiness() from public,anon;
grant execute on function kxra_private.pilot_stripe_readiness() to authenticated;

-- Provider customer mapping remains authoritative on every subsequent admission.
create or replace function kxra_private.pilot_entitled(o uuid) returns boolean
language sql volatile security definer set search_path='' as $$
 select not exists(select 1 from kxra.workspace_pilots where org_id=o) or exists(
  select 1 from kxra.workspace_pilots p where p.org_id=o and p.period_start<=now() and kxra_private.pilot_access_at(p.state,p.period_end,now()) and
   (p.mode='FIXTURE' or exists(select 1 from kxra.pilot_stripe_bindings b join kxra.billing_customers c on c.org_id=b.org_id and c.provider='STRIPE' and c.state='ACTIVE' and c.provider_customer_id=b.customer_id
    where b.org_id=o and b.subscription_id is not null and not b.reconcile_required and not b.terminal)))
$$;
