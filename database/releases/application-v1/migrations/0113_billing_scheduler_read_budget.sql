begin;
-- CLI-generated scaffold adapted to this repository's contiguous migration names.
-- No budget/activation is seeded. Only an existing genuine runner may consume
-- an operator-reviewed UTC-month budget in its immutable database scope.
create table kxra_private.modern_scheduler_read_budgets(
 scope_id uuid not null references kxra_private.modern_billing_execution_identity(scope_id),
 period_start date not null check(extract(day from period_start)=1),
 enabled boolean not null default false,
 review_sha256 text not null check(review_sha256~'^[a-f0-9]{64}$'),
 limit_reads bigint not null check(limit_reads between 1 and 1000000000),
 used_reads bigint not null default 0 check(used_reads>=0 and used_reads<=limit_reads),
 expires_at timestamptz not null,
 primary key(scope_id,period_start),
 check(expires_at>(period_start::timestamp at time zone 'UTC')
  and expires_at<=((period_start+interval '1 month')::timestamp at time zone 'UTC'))
);
alter table kxra_private.modern_scheduler_read_budgets enable row level security;
revoke all on kxra_private.modern_scheduler_read_budgets from public,anon,authenticated,kxra_billing_worker;
-- Keep31 UTC day buckets so the count is conservative for ANY rolling30 days,
-- including a month boundary or replacement of the operator's monthly row.
create table kxra_private.modern_scheduler_read_days(
 scope_id uuid not null references kxra_private.modern_billing_execution_identity(scope_id),
 day date not null,used_reads bigint not null check(used_reads>=0),primary key(scope_id,day)
);
alter table kxra_private.modern_scheduler_read_days enable row level security;
revoke all on kxra_private.modern_scheduler_read_days from public,anon,authenticated,kxra_billing_worker;

create function kxra_private.reserve_modern_scheduler_reads(review text,ceiling bigint) returns jsonb
language plpgsql security definer set search_path='' as $$
declare config jsonb;s uuid;period date;today date;rolling bigint;b kxra_private.modern_scheduler_read_budgets;
begin
 perform kxra_private.modern_paid_refresh_identity();
 config=kxra_private.modern_billing_scope_attestation();
 s=(config->'execution_scope'->>'scope_id')::uuid;
 period=date_trunc('month',clock_timestamp() at time zone 'UTC')::date;
 today=(clock_timestamp() at time zone 'UTC')::date;
 if review is null or review!~'^[a-f0-9]{64}$' or ceiling is null or ceiling not between 1 and 1000000000 then
  return jsonb_build_object('state','UNAVAILABLE');end if;
 perform pg_advisory_xact_lock(hashtextextended('billing-scheduler-read:'||s::text,0));
 select * into b from kxra_private.modern_scheduler_read_budgets budget
 where budget.scope_id=s and budget.period_start=period and budget.enabled
  and budget.review_sha256=review and budget.limit_reads<=ceiling
  and budget.expires_at>clock_timestamp() and budget.used_reads<=budget.limit_reads-32
 for update;
 if not found then return jsonb_build_object('state','UNAVAILABLE');end if;
 select coalesce(sum(d.used_reads),0) into rolling from kxra_private.modern_scheduler_read_days d
 where d.scope_id=s and d.day>=today-30;
 if rolling>b.limit_reads-32 then return jsonb_build_object('state','UNAVAILABLE');end if;
 -- Reserve32 permits atomically; unused/cancelled permits remain charged.
 update kxra_private.modern_scheduler_read_budgets budget set used_reads=used_reads+32
 where budget.scope_id=s and budget.period_start=period;
 insert into kxra_private.modern_scheduler_read_days as current_day(scope_id,day,used_reads) values(s,today,32)
 on conflict(scope_id,day) do update set used_reads=current_day.used_reads+32;
 return jsonb_build_object('state','GRANTED','reserved_reads',32,
  'remaining_reads',least(b.limit_reads-b.used_reads-32,b.limit_reads-rolling-32),
  'valid_until',floor(extract(epoch from least(b.expires_at,clock_timestamp()+interval '55 seconds')))::bigint);
end $$;
revoke all on function kxra_private.reserve_modern_scheduler_reads(text,bigint) from public,anon,authenticated,kxra_billing_worker;
grant execute on function kxra_private.reserve_modern_scheduler_reads(text,bigint) to kxra_billing_worker;
commit;
