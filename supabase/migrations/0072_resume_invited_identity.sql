begin;

-- A verified identity may outlive the short browser join intent while email
-- verification or password recovery is completed. Resume only the exact
-- invitation that was already authorized by the one-use Auth signup hook.
create function kxra_private.resume_invited_identity()
returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 identity uuid=auth.uid();
 normalized_email text=lower(trim(auth.jwt()->>'email'));
 email_hash text;
 invite kxra.invitations;
 eligible_count integer;
 result jsonb;
begin
 if identity is null
  or coalesce(auth.jwt()->>'email_verified','')<>'true'
  or normalized_email!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  or exists(select 1 from kxra.profiles profile where profile.user_id=identity)
 then raise exception 'Invitation unavailable';end if;

 email_hash=encode(sha256(convert_to(normalized_email,'UTF8')),'hex');
 select count(*) into eligible_count
 from kxra.invitations invitation
 where invitation.email_digest=email_hash
  and invitation.state in ('PENDING','SENT','DELIVERY_FAILED')
  and invitation.expires_at>now()
  and invitation.redeemed_by is null
  and invitation.revoked_at is null
  and exists(
   select 1 from kxra.auth_signup_challenges challenge
   where challenge.invitation_id=invitation.id
    and challenge.org_id=invitation.org_id
    and challenge.email_digest=invitation.email_digest
    and challenge.consumed_at is not null
  );
 if eligible_count<>1 then raise exception 'Invitation unavailable';end if;

 select * into invite from kxra.invitations invitation
 where invitation.email_digest=email_hash
  and invitation.state in ('PENDING','SENT','DELIVERY_FAILED')
  and invitation.expires_at>now()
  and invitation.redeemed_by is null
  and invitation.revoked_at is null
  and exists(
   select 1 from kxra.auth_signup_challenges challenge
   where challenge.invitation_id=invitation.id
    and challenge.org_id=invitation.org_id
    and challenge.email_digest=invitation.email_digest
    and challenge.consumed_at is not null
  )
 for update;

 perform kxra.register_invited_profile(invite.id,invite.version,invite.token_digest);
 perform kxra.mark_current_email_verified();
 result=kxra.redeem_invitation_version(invite.id,invite.version,invite.token_digest);
 return result;
end $$;

revoke all on function kxra_private.resume_invited_identity() from public,anon;
grant execute on function kxra_private.resume_invited_identity() to authenticated;

commit;
