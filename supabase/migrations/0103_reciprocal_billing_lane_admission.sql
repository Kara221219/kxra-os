begin;

-- Additive reciprocal admission fence. Existing histories/customer rows are not
-- rewritten. Permanent per-org lane evidence also closes stale-snapshot races:
-- a conflicting unique-row upsert returns its actual lane or raises serialization.
-- DDL locks cover seeding + trigger installation atomically; an overlap aborts
-- this entire migration rather than converting or selecting a winning customer.
lock table kxra.billing_customer_intents,
 kxra.billing_customers,
 kxra.billing_events,
 kxra.billing_provider_events,
 kxra.billing_session_intents,
 kxra.billing_subscriptions,
 kxra.pilot_stripe_bindings,
 kxra.pilot_stripe_events,
 kxra.pilot_stripe_intents,
 kxra.workspace_pilot_events,
 kxra.workspace_pilots,
 kxra_private.live_billing_bindings,
 kxra_private.live_customer_intents in share row exclusive mode;

create table kxra_private.billing_admission_lanes(
 org_id uuid primary key references kxra.organisations(id),
 lane text not null check(lane in ('LEGACY','LIVE')),
 created_at timestamptz not null default now()
);
alter table kxra_private.billing_admission_lanes enable row level security;
revoke all on kxra_private.billing_admission_lanes from public,anon,authenticated,kxra_billing_worker;

do $$
begin
 if exists(
  select 1 from (
 select org_id from kxra.workspace_pilots
 union
 select org_id from kxra.pilot_stripe_bindings
 union
 select org_id from kxra.pilot_stripe_intents
 union
 select org_id from kxra.billing_customers
 union
 select org_id from kxra.billing_subscriptions
 union
 select org_id from kxra.billing_customer_intents
 union
 select org_id from kxra.billing_session_intents
 union
 select org_id from kxra.billing_events
 union
 select org_id from kxra.billing_provider_events where org_id is not null
 union
 select org_id from kxra.workspace_pilot_events
 union
 select org_id from kxra.pilot_stripe_events
  ) legacy join (
 select org_id from kxra_private.live_customer_intents
 union
 select org_id from kxra_private.live_billing_bindings
  ) live using(org_id)
 ) then raise exception 'Preexisting LEGACY/LIVE billing overlap requires explicit reconciliation';end if;
 insert into kxra_private.billing_admission_lanes(org_id,lane)
 select org_id,'LEGACY' from (
 select org_id from kxra.workspace_pilots
 union
 select org_id from kxra.pilot_stripe_bindings
 union
 select org_id from kxra.pilot_stripe_intents
 union
 select org_id from kxra.billing_customers
 union
 select org_id from kxra.billing_subscriptions
 union
 select org_id from kxra.billing_customer_intents
 union
 select org_id from kxra.billing_session_intents
 union
 select org_id from kxra.billing_events
 union
 select org_id from kxra.billing_provider_events where org_id is not null
 union
 select org_id from kxra.workspace_pilot_events
 union
 select org_id from kxra.pilot_stripe_events
 ) legacy;
 insert into kxra_private.billing_admission_lanes(org_id,lane)
 select org_id,'LIVE' from (
 select org_id from kxra_private.live_customer_intents
 union
 select org_id from kxra_private.live_billing_bindings
 ) live;
end $$;

create function kxra_private.guard_billing_admission_lane_identity() returns trigger
language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' or new is distinct from old then
  raise exception 'Billing admission lane is immutable' using errcode='42501';
 end if;
 return new;
end $$;
create trigger billing_admission_lane_immutable before update or delete
on kxra_private.billing_admission_lanes for each row
execute function kxra_private.guard_billing_admission_lane_identity();

create function kxra_private.guard_billing_admission_lane() returns trigger
language plpgsql security definer set search_path='' as $$
declare requested_lane text;reserved_lane text;
begin
 -- Unassigned legacy provider receipts are not tenant admission. Their later
 -- NULL -> org assignment is covered by UPDATE OF org_id below.
 if new.org_id is null then return new;end if;
 if tg_op='UPDATE' and new.org_id is not distinct from old.org_id then return new;end if;
 requested_lane=case when tg_table_schema='kxra_private' then 'LIVE' else 'LEGACY' end;
 -- Fresh request/claim paths already use pilot -> live-billing. Legacy writers
 -- reciprocate. A live-binding writer may already hold live-billing (0100), so
 -- it must NEVER acquire pilot here: live-billing -> registry only.
 if tg_table_name<>'live_billing_bindings' or tg_table_schema<>'kxra_private' then
  perform pg_advisory_xact_lock(hashtext('pilot:'||new.org_id::text));
 end if;
 perform pg_advisory_xact_lock(hashtext('live-billing:'||new.org_id::text));
 -- Registry row lock is always last. A no-op UPDATE is intentional: under
 -- READ COMMITTED it returns the conflicting lane even when not in the query
 -- snapshot; REPEATABLE READ/SERIALIZABLE instead fail safely with 40001.
 insert into kxra_private.billing_admission_lanes(org_id,lane)
 values(new.org_id,requested_lane)
 on conflict(org_id) do update set org_id=excluded.org_id
 returning lane into reserved_lane;
 if reserved_lane is distinct from requested_lane then
  raise exception 'Organisation reserved for another billing lane' using errcode='42501';
 end if;
 return new;
end $$;
revoke all on function kxra_private.guard_billing_admission_lane_identity(),
 kxra_private.guard_billing_admission_lane() from public,anon,authenticated,kxra_billing_worker;

create trigger billing_admission_lane_guard before insert or update of org_id
on kxra.workspace_pilots for each row execute function kxra_private.guard_billing_admission_lane();
create trigger billing_admission_lane_guard before insert or update of org_id
on kxra.pilot_stripe_bindings for each row execute function kxra_private.guard_billing_admission_lane();
create trigger billing_admission_lane_guard before insert or update of org_id
on kxra.pilot_stripe_intents for each row execute function kxra_private.guard_billing_admission_lane();
create trigger billing_admission_lane_guard before insert or update of org_id
on kxra.billing_customers for each row execute function kxra_private.guard_billing_admission_lane();
create trigger billing_admission_lane_guard before insert or update of org_id
on kxra.billing_subscriptions for each row execute function kxra_private.guard_billing_admission_lane();
create trigger billing_admission_lane_guard before insert or update of org_id
on kxra.billing_customer_intents for each row execute function kxra_private.guard_billing_admission_lane();
create trigger billing_admission_lane_guard before insert or update of org_id
on kxra.billing_session_intents for each row execute function kxra_private.guard_billing_admission_lane();
create trigger billing_admission_lane_guard before insert or update of org_id
on kxra.billing_events for each row execute function kxra_private.guard_billing_admission_lane();
create trigger billing_admission_lane_guard before insert or update of org_id
on kxra.billing_provider_events for each row execute function kxra_private.guard_billing_admission_lane();
create trigger billing_admission_lane_guard before insert or update of org_id
on kxra.workspace_pilot_events for each row execute function kxra_private.guard_billing_admission_lane();
create trigger billing_admission_lane_guard before insert or update of org_id
on kxra.pilot_stripe_events for each row execute function kxra_private.guard_billing_admission_lane();
create trigger billing_admission_lane_guard before insert or update of org_id
on kxra_private.live_customer_intents for each row execute function kxra_private.guard_billing_admission_lane();
create trigger billing_admission_lane_guard before insert or update of org_id
on kxra_private.live_billing_bindings for each row execute function kxra_private.guard_billing_admission_lane();

commit;
