-- Approved catalogue and local fixture seat contract only. No Stripe bindings,
-- live checkout, existing-plan conversion, AI credits or new trial/tax/refund terms.
create function kxra_private.approved_workspace_catalogue_v1() returns jsonb
language sql immutable set search_path='' as $$
 select '[{"offer_key":"KXRA_STARTER_V1","version":1,"name":"KXRA Starter","currency":"GBP","monthly_amount_minor":2900,"people":1,"billing_unit":"WORKSPACE","interval":"month","live_charges":false,"checkout_enabled":false,"tax_behavior":"UNSPECIFIED","ai_credit_budget":null,"trial_terms":null,"refund_terms":null},{"offer_key":"KXRA_TEAM_V1","version":1,"name":"KXRA Team","currency":"GBP","monthly_amount_minor":7900,"people":5,"billing_unit":"WORKSPACE","interval":"month","live_charges":false,"checkout_enabled":false,"tax_behavior":"UNSPECIFIED","ai_credit_budget":null,"trial_terms":null,"refund_terms":null},{"offer_key":"KXRA_BUSINESS_V1","version":1,"name":"KXRA Business","currency":"GBP","monthly_amount_minor":19900,"people":15,"billing_unit":"WORKSPACE","interval":"month","live_charges":false,"checkout_enabled":false,"tax_behavior":"UNSPECIFIED","ai_credit_budget":null,"trial_terms":null,"refund_terms":null}]'::jsonb
$$;
revoke all on function kxra_private.approved_workspace_catalogue_v1() from public,anon,authenticated;

alter table kxra.workspace_pilots drop constraint workspace_pilots_offer_key_check;
alter table kxra.workspace_pilots add constraint workspace_pilots_offer_key_check
 check(offer_key in ('WORKSPACE_PILOT_V1','KXRA_STARTER_V1','KXRA_TEAM_V1','KXRA_BUSINESS_V1'));
alter table kxra.workspace_pilots drop constraint workspace_pilots_state_check;
alter table kxra.workspace_pilots add constraint workspace_pilots_state_check
 check(state in ('PENDING','ACTIVE','PAST_DUE','PAUSED','CANCELLED'));
alter table kxra.workspace_pilots add constraint approved_catalogue_fixture_only
 check(offer_key='WORKSPACE_PILOT_V1' or mode='FIXTURE');
alter table kxra.workspace_pilot_events drop constraint workspace_pilot_events_action_check;
alter table kxra.workspace_pilot_events add constraint workspace_pilot_events_action_check
 check(action in ('CATALOGUE_SELECT','ACTIVATE','RENEW','PAST_DUE','RECOVER','PAUSE','RESUME','CANCEL_AT_END','CANCEL_NOW','RECONCILE'));

create function kxra_private.workspace_seat_capacity(o uuid) returns integer
language sql volatile security definer set search_path='' as $$
 select case when p.offer_key='WORKSPACE_PILOT_V1' or p.offer_key is null then 5
 else (select (plan->>'people')::integer from jsonb_array_elements(kxra_private.approved_workspace_catalogue_v1()) plan
 where plan->>'offer_key'=p.offer_key and (plan->>'version')::integer=p.offer_version) end
 from (select 1) singleton left join kxra.workspace_pilots p on p.org_id=o
$$;
revoke all on function kxra_private.workspace_seat_capacity(uuid) from public,anon,authenticated;

create or replace function kxra_private.pilot_status() returns jsonb
language sql volatile security definer set search_path='' as $$
 select case when kxra_private.is_owner(kxra_private.member_org()) then jsonb_build_object(
 'offer',coalesce((select plan from jsonb_array_elements(kxra_private.approved_workspace_catalogue_v1()) plan
 join kxra.workspace_pilots p on p.org_id=kxra_private.member_org() and plan->>'offer_key'=p.offer_key),kxra_private.pilot_offer_v1()),
 'approved_catalogue',kxra_private.approved_workspace_catalogue_v1(),
 'seat_capacity',kxra_private.workspace_seat_capacity(kxra_private.member_org()),
 'subscription',(select to_jsonb(p) from kxra.workspace_pilots p where p.org_id=kxra_private.member_org()),
 'seats_reserved',kxra_private.pilot_seats(kxra_private.member_org()),'entitled',kxra_private.pilot_entitled(kxra_private.member_org()),
 'assigned',exists(select 1 from kxra.workspace_pilots where org_id=kxra_private.member_org())) else null end
$$;
revoke all on function kxra_private.pilot_status() from public,anon;
grant execute on function kxra_private.pilot_status() to authenticated;

create function kxra.workspace_catalogue_select(i uuid,offer text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare o uuid=kxra_private.member_org();selected jsonb;e kxra.workspace_pilot_events;receipt jsonb;
begin
 if session_user<>'kxra_app' or current_setting('request.kxra.execution_mode',true) is distinct from 'fixture' or not kxra_private.mfa_owner(o) then raise insufficient_privilege;end if;
 select plan into selected from jsonb_array_elements(kxra_private.approved_workspace_catalogue_v1()) plan where plan->>'offer_key'=offer;
 if i is null or selected is null then raise exception 'Approved catalogue plan required';end if;
 perform pg_advisory_xact_lock(hashtext('pilot:'||o::text));
 select * into e from kxra.workspace_pilot_events where id=i;
 if found then
  if e.org_id<>o or e.actor_id<>auth.uid() or e.action<>'CATALOGUE_SELECT' or e.receipt->'offer'->>'offer_key' is distinct from offer then raise exception 'Catalogue request replay conflict';end if;
  return e.receipt;
 end if;
 if exists(select 1 from kxra.workspace_pilots where org_id=o) or exists(select 1 from kxra.pilot_stripe_bindings where org_id=o) then raise exception 'Existing workspace plan cannot be converted';end if;
 if kxra_private.pilot_seats(o)>(selected->>'people')::integer then raise exception 'Catalogue seat capacity exceeded';end if;
 insert into kxra.workspace_pilots(org_id,mode,offer_key,offer_version,state,period_start,period_end)
 values(o,'FIXTURE',offer,1,'PENDING',now(),now()+interval '1 month');
 receipt=kxra_private.pilot_status();
 insert into kxra.workspace_pilot_events(id,org_id,actor_id,action,expected_version,receipt) values(i,o,auth.uid(),'CATALOGUE_SELECT',0,receipt);
 insert into kxra.audit_events(org_id,actor_id,action,resource_id,metadata) values(o,auth.uid(),'catalogue.fixture_selected',o,jsonb_build_object('request',i,'offer_key',offer));
 return receipt;
end $$;
revoke all on function kxra.workspace_catalogue_select(uuid,text) from public,anon;
grant execute on function kxra.workspace_catalogue_select(uuid,text) to authenticated;

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
  if kxra_private.pilot_seats(o)>kxra_private.workspace_seat_capacity(o) then raise exception 'Recorded plan seat capacity exceeded by existing people or held invitations';end if;
  insert into kxra.workspace_pilots(org_id,state,period_start,period_end) values(o,'ACTIVE',now(),now()+interval '1 month');
 else
  if p.mode<>'FIXTURE' then raise exception 'Provider pilot cannot use simulation';end if;
  if p.version<>expected then raise exception 'Pilot changed';end if;
  if kind='ACTIVATE' and p.state not in ('CANCELLED','PENDING') or kind='RENEW' and (p.state<>'ACTIVE' or p.cancel_at_period_end)
   or kind='RECOVER' and p.state<>'PAST_DUE' or kind='PAUSE' and p.state<>'ACTIVE' or kind='RESUME' and (p.state<>'PAUSED' or p.period_end<=now())
   or kind in ('PAST_DUE','CANCEL_AT_END') and p.state<>'ACTIVE' then raise exception 'Pilot transition unavailable';end if;
  if kind in ('ACTIVATE','RECOVER','RESUME') and kxra_private.pilot_seats(o)>kxra_private.workspace_seat_capacity(o) then raise exception 'Recorded plan seat capacity exceeded';end if;
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
 if after_count>kxra_private.workspace_seat_capacity(new.org_id) and after_count>before_count then raise exception 'Pilot seat admission unavailable';end if;
 if not kxra_private.pilot_entitled(new.org_id) then
  if tg_table_name='organisation_memberships' and new.state='ACTIVE' and (tg_op='INSERT' or old.state<>'ACTIVE' or (old.expires_at is not null and old.expires_at<=now())) then raise exception 'Pilot seat admission unavailable';end if;
  if tg_table_name='invitations' and new.state in ('PENDING','SENT','DELIVERY_FAILED') and new.expires_at>now() and (tg_op='INSERT' or old.state not in ('PENDING','SENT','DELIVERY_FAILED') or new.expires_at>old.expires_at) then raise exception 'Pilot seat admission unavailable';end if;
  if after_count>before_count then raise exception 'Pilot seat admission unavailable';end if;
 end if;
 return new;
end $$;
revoke all on function kxra_private.guard_pilot_seats() from public,anon,authenticated;

