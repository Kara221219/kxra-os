begin;

-- A confirmed Supabase identity can exist briefly before invitation redemption
-- creates its KXRA profile. Permit password recovery in that narrow state only
-- when the provider-authenticated identity still matches an active invitation
-- that passed the one-use signup hook.
create function kxra_private.active_invited_password_recovery()
returns boolean
language sql stable security definer set search_path='' as $$
 select
  (select auth.uid()) is not null
  and coalesce(
   (current_setting('request.jwt.claims',true)::jsonb->>'email_verified')::boolean,
   false
  )
  and not exists(
   select 1 from kxra.profiles profile
   where profile.user_id=(select auth.uid())
  )
  and exists(
   select 1
   from kxra.invitations invitation
   join kxra.auth_signup_challenges challenge
    on challenge.invitation_id=invitation.id
    and challenge.org_id=invitation.org_id
    and challenge.email_digest=invitation.email_digest
   where invitation.email_digest=encode(sha256(convert_to(
    lower(trim(current_setting('request.jwt.claims',true)::jsonb->>'email')),
    'UTF8'
   )),'hex')
    and invitation.state in ('PENDING','SENT','DELIVERY_FAILED')
    and invitation.expires_at>now()
    and invitation.redeemed_by is null
    and invitation.revoked_at is null
    and challenge.consumed_at is not null
  )
$$;

revoke all on function kxra_private.active_invited_password_recovery() from public,anon;
grant execute on function kxra_private.active_invited_password_recovery() to authenticated;

commit;
