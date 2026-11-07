-- An explicit pending checkout is not an unassigned legacy workspace.
-- Existing workspaces without any pilot/binding retain their prior access.
-- No new grants, provider configuration or commercial offer change.
create or replace function kxra_private.pilot_entitled(o uuid) returns boolean
language sql volatile security definer set search_path='' as $$
 select (
  not exists(select 1 from kxra.workspace_pilots where org_id=o)
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
   ))
 )
$$;
revoke all on function kxra_private.pilot_entitled(uuid) from public,anon,authenticated;

-- Fixture lifecycle controls cannot replace a pending provider subscription.
create or replace function kxra.workspace_pilot_event(i uuid,expected integer,kind text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare o uuid=kxra_private.member_org();p kxra.workspace_pilots;e kxra.workspace_pilot_events;receipt jsonb;
begin
 if session_user<>'kxra_app' or not kxra_private.mfa_owner(o) or current_setting('request.kxra.execution_mode',true) is distinct from 'fixture' then raise insufficient_privilege;end if;
 perform pg_advisory_xact_lock(hashtext('pilot:'||o::text));
 if exists(select 1 from kxra.pilot_stripe_bindings where org_id=o) then raise exception 'Provider pilot cannot use fixture simulation';end if;
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


create or replace function kxra_private.pilot_stripe_readiness() returns jsonb language sql stable security definer set search_path='' as $$
 select case when kxra_private.is_owner(kxra_private.member_org()) then jsonb_build_object(
 'mapping_reviewed',exists(select 1 from kxra.pilot_stripe_config where version=1 and enabled),
 'customer_mapped',exists(select 1 from kxra.billing_customers where org_id=kxra_private.member_org() and provider='STRIPE' and state='ACTIVE'),
 'bound',exists(select 1 from kxra.pilot_stripe_bindings where org_id=kxra_private.member_org() and subscription_id is not null),
 'pending_binding',exists(select 1 from kxra.pilot_stripe_bindings where org_id=kxra_private.member_org() and subscription_id is null),
 'reconciliation_required',coalesce((select reconcile_required from kxra.pilot_stripe_bindings where org_id=kxra_private.member_org()),false)) else null end
$$;
revoke all on function kxra_private.pilot_stripe_readiness() from public,anon;
grant execute on function kxra_private.pilot_stripe_readiness() to authenticated;
