-- Additive review payload AFTER paired setup/options and original-session attestation.
-- No session backfill, activation, provider calls, credentials or private-helper grants.
begin;
-- Preserve the original predicate OID, owner and ACL so existing RLS and definer
-- callers receive the original-session check, including direct setup RPC calls.
create or replace function kxra_paired_admission.setup_human(o uuid,u uuid,r uuid,sv integer,mv integer) returns boolean
language sql volatile security definer set search_path='' as $$
 select coalesce(session_user='kxra_app' and auth.uid()=u and kxra_private.member_org()=o
 and kxra_private.custom_app_original_session_current()
 and kxra_private.mfa_owner(o) and kxra_private.can_team_room(r,true)
 and (auth.jwt()->>'auth_time')~'^[0-9]{1,12}$'
 and to_timestamp((auth.jwt()->>'auth_time')::double precision) between clock_timestamp()-interval '15 minutes' and clock_timestamp()+interval '1 minute'
 and exists(select 1 from kxra.account_identities a join kxra.organisation_memberships m on m.account_id=a.account_id
  join kxra.organisations org on org.id=m.org_id join kxra.team_rooms room on room.org_id=org.id
  join kxra.team_room_members rm on rm.room_id=room.id and rm.account_id=a.account_id and rm.active
  where a.account_id=u and a.state='ACTIVE' and a.email_verified_at is not null
  and a.session_version=sv and sv=(auth.jwt()->>'session_version')::integer
  and m.org_id=o and m.version=mv and m.state='ACTIVE' and m.security_role='ORG_ADMIN' and m.relationship_type='CUSTOMER'
  and m.starts_at<=clock_timestamp() and(m.expires_at is null or m.expires_at>clock_timestamp()) and m.revoked_at is null
  and org.state='ACTIVE' and org.organisation_kind='CUSTOMER' and room.id=r),false)
$$;
-- Runtime preflight only. Mutation RPCs independently recheck setup_human AFTER
-- acquiring the paired policy fence; this boolean must never replace that gate.
create function kxra_paired_admission.hosted_setup_session_current() returns boolean
language plpgsql volatile security definer set search_path='' as $$
begin
 if session_user<>'kxra_app' then return false;end if;
 -- Exclusive from the start: REQUEST/CANCEL need this same lock, so a shared
 -- preflight would create lock-upgrade deadlocks between concurrent requests.
 perform pg_advisory_xact_lock(hashtextextended('kxra-paired-policy-v1',0));
 return coalesce(kxra_private.custom_app_original_session_current(),false);
end $$;
revoke all on function kxra_paired_admission.hosted_setup_session_current() from public,anon,authenticated,kxra_app,kxra_billing_worker,kxra_ai_worker,supabase_auth_admin;
grant execute on function kxra_paired_admission.hosted_setup_session_current() to authenticated;
-- Auth writers take custom-app then paired authority, before modifying rows.
-- setup_human deliberately takes NO custom-app lock while holding the paired
-- fence: taking it in reverse order could deadlock with provider session writes.
create trigger b00_paired_setup_session_authority before insert or update or delete on auth.sessions for each statement execute function kxra_paired_admission.policy_writer();
commit;
