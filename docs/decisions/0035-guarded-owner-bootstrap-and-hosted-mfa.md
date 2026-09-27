# ADR 0035 — Guarded staging owner bootstrap and hosted MFA

Date: 27 September 2026  
Status: accepted

## Decision

The first KXRA staging owner is established only through the guarded `KXRA-STAGING-OWNER-V1` operator after the exact migration, canonical-seed and restricted-runtime-role profiles pass. The operator binds a confirmed Supabase Auth UUID and normalized email to one KXRA owner, rejects another owner or partial/conflicting identity state, records a non-secret operator event and verifies the resulting normalized and compatibility records.

Preparation may create the active staging owner before TOTP exists solely so that the same verified Auth subject can open Profile and enroll through Supabase Auth. The owner then scans the one-time QR code, proves the six-digit TOTP and runs `staging:owner:verify`. Final verification requires a verified provider factor and matching KXRA factor reference. The interval between preparation and verification is a bounded staging-only read window: keep the preview private, perform the steps in one operator session and do not treat preparation as acceptance.

Hosted MFA uses Supabase enrollment, factor listing, challenge-and-verify and unenrollment APIs. Interrupted KXRA enrollment factors are reconciled before restart. Only a signed `aal2` JWT with a current `totp` authentication-method timestamp satisfies the 15-minute owner step-up rule. Owner factor removal is blocked in the ordinary UI/API and requires a separately reviewed recovery process. Supabase global sign-out must succeed before KXRA records provider-confirmed session revocation.

## Consequences

- No SQL file can silently manufacture a provider identity, email confirmation or MFA factor.
- A dirty or unpushed branch, wrong project, wrong operator role, seed/role drift, owner conflict, event mismatch or absent final TOTP fails closed.
- QR data and TOTP secrets exist only in the authenticated response and browser state; KXRA PostgreSQL stores only the provider factor reference and lifecycle evidence.
- Supabase recovery behavior, email/password flows, session-token expiry and the complete operator sequence still require authorized staging evidence.
- The retired manual SQL file always raises an error and points to the guarded operator.
