# ADR 0040: Invitation-only Supabase Auth signup

Status: accepted locally; hosted activation pending.

## Decision

KXRA keeps email account creation invitation-only without placing a Supabase secret or service-role key in the OS application. After the server validates the encrypted join intent, current invitation snapshot and rate limit, it creates a random five-minute challenge through the explicitly granted private function `kxra_private.prepare_invited_signup`. Only the challenge digest is stored. The raw challenge is passed to Supabase Auth as signup metadata and is accepted only by the `kxra_private.before_user_created` hook when the email digest, invitation, current token digest, expiry and unused state all match atomically.

The hook runs as `supabase_auth_admin` with narrow schema, column and function grants. It does not infer a role or project grant from metadata. KXRA still creates the profile, memberships and project access through the existing invitation redemption path after Auth verifies the identity. A missing, stale, replayed, rotated, revoked, expired or wrong-email challenge is rejected with one generic response.

Hosted activation requires migration 0070, then configuring the Before User Created Postgres hook, then enabling email signup. Enabling signup before the hook is active is a hard stop.

## Consequences

- Direct public Supabase signup remains rejected even though the provider's email signup switch is enabled.
- The web application receives no privileged Auth credential.
- A challenge is useful once for at most five minutes and does not confer KXRA project authority.
- Supabase hook configuration becomes a required, separately verified staging and production control.
- Existing Auth users continue through sign-in and invitation redemption rather than duplicate account creation.
