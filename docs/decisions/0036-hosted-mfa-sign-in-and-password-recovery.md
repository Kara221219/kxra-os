# ADR 0036 — Hosted MFA sign-in and password recovery

Date: 27 September 2026  
Status: accepted

## Decision

Hosted password sign-in must inspect Supabase's current and next authenticator assurance levels before entering KXRA OS. An authenticated `aal1` session that can reach `aal2` is redirected to a dedicated challenge page. The server selects the one verified TOTP factor, preferring the exact `KXRA OS` factor, and sends only the six-digit proof to Supabase. Factor identifiers, account roles and project scope are never accepted from the browser. An ambiguous or missing eligible factor fails closed.

The application repeats the policy after KXRA account resolution: an enrolled hosted identity with a JWT below `aal2` cannot become an application actor. This protects direct private URLs and APIs as well as the ordinary login journey. PostgreSQL remains the authorization authority after authentication.

Hosted password recovery uses Supabase's PKCE code exchange and an exact callback allowlist. A successful recovery callback creates a signed, HttpOnly, same-site, ten-minute intent bound to the exact verified Auth subject. Password confirmation requires that subject and intent, rejects local reset tokens in hosted mode, checks the current KXRA account state, updates the provider password, consumes the intent and requests global provider sign-out. If the provider change succeeds but audit or sign-out does not, the response states that the password changed and requires sign-in; it never claims that the provider mutation was rolled back.

## Consequences

- A password alone cannot enter KXRA OS for an account whose KXRA profile is enrolled in hosted MFA.
- Direct private routes fail at the application actor boundary even if a login route is bypassed.
- Recovery callbacks cannot redirect to arbitrary paths, and an ordinary existing session cannot use the reset form without a bound recovery intent.
- The recovery intent contains no password, provider token or project context and is rejected after ten minutes, tampering or identity mismatch.
- The real email template, PKCE callback, assurance refresh, factor edge cases and global revocation latency still require authorized Supabase staging evidence.

