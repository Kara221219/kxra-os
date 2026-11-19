begin;

drop policy profiles_read on kxra.profiles;
create policy profiles_read on kxra.profiles for select using(
 (user_id=auth.uid() and account_state not in ('SUSPENDED','REVOKED'))
 or kxra_private.is_owner(org_id)
);

drop policy onboarding_read on kxra.onboarding_progress;
create policy onboarding_read on kxra.onboarding_progress for select using(
 kxra_private.is_owner(org_id) or exists(
  select 1 from kxra.profiles profile where profile.user_id=auth.uid()
   and profile.user_id=onboarding_progress.user_id
   and profile.account_state in ('REGISTERED','EMAIL_VERIFIED','ONBOARDING','ACTIVE')
 )
);

drop policy preferences_read on kxra.user_preferences;
create policy preferences_read on kxra.user_preferences for select using(
 kxra_private.is_owner(org_id) or exists(
  select 1 from kxra.profiles profile where profile.user_id=auth.uid()
   and profile.user_id=user_preferences.user_id
   and profile.account_state in ('REGISTERED','EMAIL_VERIFIED','ONBOARDING','ACTIVE')
 )
);

drop policy invitation_grants_read on kxra.invitation_project_grants;
create policy invitation_grants_read on kxra.invitation_project_grants for select using(
 kxra_private.is_owner(org_id) or exists(
  select 1 from kxra.invitations invitation
  join kxra.profiles profile on profile.user_id=invitation.redeemed_by
   and profile.org_id=invitation.org_id
  where invitation.id=invitation_project_grants.invitation_id
   and invitation.redeemed_by=auth.uid()
   and profile.account_state in ('ONBOARDING','ACTIVE')
 )
);

drop policy agreement_acceptances_read on kxra.agreement_acceptances;
create policy agreement_acceptances_read on kxra.agreement_acceptances for select using(
 kxra_private.is_owner(org_id) or exists(
  select 1 from kxra.profiles profile where profile.user_id=auth.uid()
   and profile.user_id=agreement_acceptances.user_id
   and profile.account_state in ('REGISTERED','EMAIL_VERIFIED','ONBOARDING','ACTIVE')
 )
);

drop policy session_revocations_read on kxra.session_revocations;
create policy session_revocations_read on kxra.session_revocations for select using(
 kxra_private.is_owner(org_id) or exists(
  select 1 from kxra.profiles profile where profile.user_id=auth.uid()
   and profile.user_id=session_revocations.user_id
   and profile.account_state in ('REGISTERED','EMAIL_VERIFIED','ONBOARDING','ACTIVE')
 )
);

drop policy security_events_read on kxra.account_security_events;
create policy security_events_read on kxra.account_security_events for select using(
 kxra_private.is_owner(org_id) or exists(
  select 1 from kxra.profiles profile where profile.user_id=auth.uid()
   and profile.user_id=account_security_events.user_id
   and profile.account_state in ('REGISTERED','EMAIL_VERIFIED','ONBOARDING','ACTIVE')
 )
);

commit;
