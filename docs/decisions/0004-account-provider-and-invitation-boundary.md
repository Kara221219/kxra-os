# ADR 0004 — Account provider and invitation boundary

Date: 15 September 2026. Status: accepted for Final Milestone 1 local implementation. Implementation: `7cbc227bb8e03ff0b5f41d930ae8cbe1d9ece7d9`.

## Context

KXRA needs a production-shaped invitation, self-password, email-verification, MFA and session contract without using real credentials or claiming that a local fake proves Supabase behavior. Invitation tokens must survive browser/Auth returns while avoiding query-string, log and persistent-storage exposure. Fixture identity controls must not enter optimized production output.

## Decision

Keep Auth behind a provider-neutral server interface. Use a deterministic file-backed provider and fake transactional transport only in guarded local development. Resolve local provider/session/UI modules through package `development` import conditions; resolve fail-closed stubs by default for production builds. Scan the optimized artifact for forbidden fixture markers.

Deliver invitation links as `/join#token=…`. Client code removes the fragment immediately and exchanges the token once. The server stores only its digest and returns a short-lived AES-256-GCM HttpOnly join-intent cookie that binds locked email, invitation ID/version and expiry. PostgreSQL atomically rechecks verified identity and the current invitation before granting exact memberships.

Keep approved invitation grant version separate from delivery version. Resend rotates delivery/token state without silently changing approved projects/roles. Any material grant change creates a replacement invitation. Keep passwords and MFA secrets in Auth; KXRA stores lifecycle and provider-safe evidence only.

## Consequences

The complete account journey can be tested locally without an external send, credential or public registration. Raw invitation tokens avoid ordinary request URLs and persistent browser storage, while reload and auth-return behavior remains possible through the sealed cookie. Production builds fail closed if hosted Auth is unconfigured and do not contain the fixture selector/provider implementation.

Hosted Supabase email confirmation, MFA/AAL2, recovery, refresh-token invalidation and Resend delivery remain an explicit Milestone 11 staging gate. The fragment boundary still depends on trusted first-party client code and production telemetry/header verification.
