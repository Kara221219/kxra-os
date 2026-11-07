begin;

-- Read-only member projection. No lane/entitlement mutation or provider details.
create function kxra_private.own_member_live_workspace_access() returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare
 o uuid=kxra_private.requested_org();member_provider text;verified_at timestamptz;
 organisation_kind text;modern boolean;pending boolean;
begin
 if session_user<>'kxra_app' or o is null or auth.uid() is null then raise insufficient_privilege;end if;
 select a.auth_provider,a.email_verified_at,organisation.organisation_kind into member_provider,verified_at,organisation_kind
 from kxra.organisation_memberships m join kxra.account_identities a on a.account_id=m.account_id
 join kxra.organisations organisation on organisation.id=m.org_id
 where m.org_id=o and m.account_id=auth.uid() and m.state='ACTIVE' and m.starts_at<=now()
 and m.revoked_at is null and (m.expires_at is null or m.expires_at>now())
 and a.state='ACTIVE' and organisation.state='ACTIVE';
 if not found then raise insufficient_privilege;end if;
 modern=kxra_private.is_live_billing_lane(o);
 pending=not modern and exists(select 1 from kxra.self_service_workspaces s where s.org_id=o and s.auth_provider='SUPABASE')
 and not exists(select 1 from kxra_private.billing_admission_lanes l where l.org_id=o and l.lane='LEGACY')
 and not exists(select 1 from kxra.workspace_pilots where org_id=o)
 and not exists(select 1 from kxra.pilot_stripe_bindings where org_id=o)
 and not exists(select 1 from kxra.billing_customers where org_id=o)
 and not exists(select 1 from kxra.billing_subscriptions where org_id=o);
 if not modern and not pending then return null;end if;
 if member_provider<>'SUPABASE' or verified_at is null or organisation_kind<>'CUSTOMER' then raise insufficient_privilege;end if;
 -- No admission/entry-enabled GUC: pausing new signup cannot erase current access.
 return jsonb_build_object('lane',case when modern then 'LIVE' else 'PENDING' end,
  'entitled',case when modern then kxra_private.live_paid_entitled(o) else false end,
  'reconciliation_required',case when modern then coalesce((select b.reconcile_required from kxra_private.live_billing_bindings b where b.org_id=o),true) else true end,
  'quarantined',coalesce((select b.quarantined from kxra_private.live_billing_bindings b where b.org_id=o),false)
   or coalesce((select i.state='QUARANTINED' from kxra_private.live_customer_intents i where i.org_id=o),false),
  'proof_valid_until',(select p.valid_until from kxra_private.live_paid_access p where p.org_id=o));
end $$;
revoke all on function kxra_private.own_member_live_workspace_access() from public,anon,kxra_billing_worker;
grant execute on function kxra_private.own_member_live_workspace_access() to authenticated;

commit;
