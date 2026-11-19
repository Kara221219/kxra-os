-- REVIEW-ONLY: separate durable failure/restore domain, never the application DB.
-- Provision kxra_gh_rate separately as LOGIN NOINHERIT NOSUPERUSER NOCREATEDB
-- NOCREATEROLE NOREPLICATION NOBYPASSRLS, without memberships or other grants.
-- This file deliberately seeds no realm, target, activation, reset, or resume API.
-- Before restoring, operators must fence/stop workers OUTSIDE this store and
-- advance their externally pinned epoch. Restoring an old ACTIVE backup erases
-- an in-store HOLD; this store cannot detect its own rollback. Keep restored realms
-- HOLD until lost/uncertain history is reconciled and reactivation is reviewed.
-- Bounds below are conservative policy, not a GitHub secondary-limit guarantee.
begin;
do $$begin
 if not exists(select 1 from pg_catalog.pg_roles where rolname='kxra_gh_rate'
   and not rolsuper and not rolinherit and not rolcreatedb and not rolcreaterole
   and not rolreplication and not rolbypassrls)
   or exists(select 1 from pg_catalog.pg_auth_members m join pg_catalog.pg_roles r on r.oid=m.member where r.rolname='kxra_gh_rate')
 then raise exception 'Separately provisioned restricted rate runtime role required';end if;
end $$;
create schema kxra_github_rate;
revoke all on schema kxra_github_rate from public;
create table kxra_github_rate.realms(
 id uuid primary key,
 epoch bigint not null check(epoch between 1 and 9007199254740991),
 phase text not null default 'HOLD' check(phase in('ACTIVE','HOLD')),
 last_seen timestamptz,
 not_before timestamptz,
 min_spacing_ms integer not null default 1000 check(min_spacing_ms between 1000 and 86400000),
 requests_60s integer not null default 60 check(requests_60s between 1 and 60),
 requests_3600s integer not null default 3000 check(requests_3600s between 1 and 3000),
 comments_60s integer not null default 1 check(comments_60s=1),
 comments_3600s integer not null default 30 check(comments_3600s between 1 and 30),
 check(last_seen is null or isfinite(last_seen)),
 check(not_before is null or isfinite(not_before))
);
create table kxra_github_rate.targets(
 realm uuid not null references kxra_github_rate.realms,
 app_id bigint not null check(app_id between 1 and 9007199254740991),
 installation_id bigint not null check(installation_id between 1 and 9007199254740991),
 account_id bigint not null check(account_id between 1 and 9007199254740991),
 enabled boolean not null default false,
 primary key(realm,app_id,installation_id,account_id)
);
create table kxra_github_rate.reservations(
 reservation_id uuid primary key,
 realm uuid not null references kxra_github_rate.realms,
 epoch bigint not null check(epoch between 1 and 9007199254740991),
 subject jsonb not null check(jsonb_typeof(subject)='object'),
 kind text not null check(kind in('READ','COMMENT')),
 reserved_at timestamptz not null check(isfinite(reserved_at)),
 completed_at timestamptz check(isfinite(completed_at)),
 completion jsonb,
 completion_held boolean,
 check((completed_at is null and completion is null and completion_held is null)
   or (completed_at is not null and completion is not null and completion_held is not null))
);
-- There is no lease expiry. Even an ancient outstanding request blocks the realm.
create unique index rate_one_outstanding on kxra_github_rate.reservations(realm) where completed_at is null;
create index rate_rolling_requests on kxra_github_rate.reservations(realm,(greatest(reserved_at,completed_at)));
create index rate_rolling_comments on kxra_github_rate.reservations(realm,(greatest(reserved_at,completed_at))) where kind='COMMENT';
create function kxra_github_rate.immutable() returns trigger language plpgsql set search_path='' as $$begin
 if tg_op='UPDATE' and old.completed_at is null and new.completed_at is not null
   and new.completion is not null and new.completion_held is not null
   and (to_jsonb(new)-array['completed_at','completion','completion_held'])=(to_jsonb(old)-array['completed_at','completion','completion_held'])
 then return new;end if;
 raise exception 'Rate reservation history is immutable';
end $$;
create trigger immutable before update or delete on kxra_github_rate.reservations for each row execute function kxra_github_rate.immutable();
create function kxra_github_rate.runtime(r uuid,e bigint,action text,v jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 c kxra_github_rate.realms;
 w kxra_github_rate.reservations;
 t timestamptz;
 nb timestamptz;
 rate jsonb;
 k text;
 rid uuid;
 stale boolean:=false;
 held boolean;
 count_min bigint;
 count_hour bigint;
 comment_min bigint;
 comment_hour bigint;
 latest timestamptz;
begin
 if session_user<>'kxra_gh_rate' or r is null or e is null or e not between 1 and 9007199254740991
   or action is null or action not in('RESERVE','COMPLETE')
   or v is null or jsonb_typeof(v)<>'object' or octet_length(v::text)>2000
 then raise insufficient_privilege;end if;
 if (select count(*) from jsonb_object_keys(v))<>(case when action='RESERVE' then 7 else 3 end)
   or (action='RESERVE' and (v-array['reservation_id','app_id','installation_id','account_id','binding_sha256','operation_sha256','kind'])<>'{}'::jsonb)
   or (action='COMPLETE' and (v-array['reservation_id','rate','settlement'])<>'{}'::jsonb)
 then raise exception 'Invalid rate request shape';end if;
 if jsonb_typeof(v->'reservation_id') is distinct from 'string'
   or coalesce(v->>'reservation_id','')!~'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 then raise exception 'Invalid reservation identity';end if;
 rid=(v->>'reservation_id')::uuid;
 if action='RESERVE' then
  foreach k in array array['app_id','installation_id','account_id'] loop
   if jsonb_typeof(v->k) is distinct from 'number' or coalesce(v->>k,'')!~'^[1-9][0-9]{0,15}$' or (v->>k)::numeric>9007199254740991 then raise exception 'Invalid rate target';end if;
  end loop;
  foreach k in array array['binding_sha256','operation_sha256'] loop
   if jsonb_typeof(v->k) is distinct from 'string' or coalesce(v->>k,'')!~'^[a-f0-9]{64}$' then raise exception 'Invalid rate digest';end if;
  end loop;
  if jsonb_typeof(v->'kind') is distinct from 'string' or v->>'kind' not in('READ','COMMENT') then raise exception 'Invalid rate kind';end if;
 else
  if jsonb_typeof(v->'settlement') is distinct from 'string' or v->>'settlement' not in('CONFIRMED','UNCONFIRMED') then raise exception 'Invalid settlement';end if;
  rate=v->'rate';
  if jsonb_typeof(rate) is distinct from 'object' then raise exception 'Invalid completion shape';end if;
  if (select count(*) from jsonb_object_keys(rate))<>3 or (rate-array['stop','not_before','reason'])<>'{}'::jsonb
    or jsonb_typeof(rate->'stop') is distinct from 'boolean'
    or jsonb_typeof(rate->'not_before') not in('string','null')
    or jsonb_typeof(rate->'reason') is distinct from 'string'
    or rate->>'reason' not in('NONE','RATE_LIMIT','RATE_CONTROL_INVALID')
    or ((rate->>'reason'='NONE') is distinct from (rate->>'stop'='false'))
    or (rate->>'stop'='false' and rate->'not_before'<>'null'::jsonb)
  then raise exception 'Invalid completion evidence';end if;
 end if;
 -- clock_timestamp MUST follow the lock: a blocked caller cannot use a stale clock.
 select * into c from kxra_github_rate.realms where id=r for update;
 if not found or c.epoch is distinct from e then raise insufficient_privilege;end if;
 t=clock_timestamp();
 if c.last_seen is not null and t<c.last_seen then raise exception 'Rate clock regressed' using errcode='42501';end if;
 if action='RESERVE' then
  if c.phase<>'ACTIVE' or c.not_before>t then raise exception 'Rate realm unavailable' using errcode='42501';end if;
  if not exists(select 1 from kxra_github_rate.targets x where x.realm=r and x.app_id=(v->>'app_id')::bigint and x.installation_id=(v->>'installation_id')::bigint and x.account_id=(v->>'account_id')::bigint and x.enabled)
  then raise exception 'Rate target not enabled' using errcode='42501';end if;
  if exists(select 1 from kxra_github_rate.reservations x where x.reservation_id=rid or (x.realm=r and x.completed_at is null))
  then raise exception 'Rate reservation already consumed or outstanding' using errcode='42501';end if;
  select count(*) filter(where greatest(x.reserved_at,x.completed_at)>t-interval '60 seconds'),count(*) filter(where greatest(x.reserved_at,x.completed_at)>t-interval '1 hour'),
    count(*) filter(where x.kind='COMMENT' and greatest(x.reserved_at,x.completed_at)>t-interval '60 seconds'),count(*) filter(where x.kind='COMMENT' and greatest(x.reserved_at,x.completed_at)>t-interval '1 hour')
    into count_min,count_hour,comment_min,comment_hour from kxra_github_rate.reservations x where x.realm=r and greatest(x.reserved_at,x.completed_at)>t-interval '1 hour';
  select greatest(x.reserved_at,x.completed_at) into latest from kxra_github_rate.reservations x where x.realm=r order by greatest(x.reserved_at,x.completed_at) desc limit 1;
  if latest>t or latest+ c.min_spacing_ms * interval '1 millisecond'>t
    or count_min>=c.requests_60s or count_hour>=c.requests_3600s
    or (v->>'kind'='COMMENT' and (comment_min>=c.comments_60s or comment_hour>=c.comments_3600s))
  then raise exception 'Rate budget unavailable' using errcode='42501';end if;
  insert into kxra_github_rate.reservations(reservation_id,realm,epoch,subject,kind,reserved_at) values(rid,r,e,v,v->>'kind',t);
  update kxra_github_rate.realms set last_seen=t where id=r;
  return v || jsonb_build_object('realm',r,'epoch',e,'reserved',true);
 end if;
 select * into w from kxra_github_rate.reservations where reservation_id=rid and realm=r for update;
 if not found or w.epoch is distinct from e then raise insufficient_privilege;end if;
 if w.completed_at is not null then
  if w.completion is distinct from (v-'reservation_id') then raise exception 'Contradictory rate completion' using errcode='42501';end if;
  return jsonb_build_object('realm',r,'epoch',e,'reservation_id',rid,'completed',true,'held',w.completion_held);
 end if;
 if rate->>'stop'='true' then
  if rate->>'reason'='RATE_CONTROL_INVALID' or jsonb_typeof(rate->'not_before')='null' then stale=true;
  elsif (rate->>'not_before')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$' then stale=true;
  else
   begin
    nb=(rate->>'not_before')::timestamptz;
    if not isfinite(nb) or to_char(nb at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')<>rate->>'not_before' or nb<t-interval '5 minutes' then stale=true;end if;
   exception when datetime_field_overflow or invalid_datetime_format then stale=true;end;
  end if;
  if stale then update kxra_github_rate.realms set phase='HOLD' where id=r;
  else update kxra_github_rate.realms set not_before=greatest(not_before,nb,t+interval '60 seconds') where id=r;end if;
 end if;
 if v->>'settlement'='UNCONFIRMED' then update kxra_github_rate.realms set phase='HOLD' where id=r;end if;
 select phase='HOLD' into held from kxra_github_rate.realms where id=r;
 update kxra_github_rate.reservations set completed_at=t,completion=v-'reservation_id',completion_held=held where reservation_id=rid;
 update kxra_github_rate.realms set last_seen=t where id=r;
 return jsonb_build_object('realm',r,'epoch',e,'reservation_id',rid,'completed',true,'held',held);
end $$;
alter table kxra_github_rate.realms enable row level security;
alter table kxra_github_rate.targets enable row level security;
alter table kxra_github_rate.reservations enable row level security;
revoke all on all tables in schema kxra_github_rate from public,kxra_gh_rate;
revoke all on all functions in schema kxra_github_rate from public,kxra_gh_rate;
grant usage on schema kxra_github_rate to kxra_gh_rate;
grant execute on function kxra_github_rate.runtime(uuid,bigint,text,jsonb) to kxra_gh_rate;
commit;
