# ADR 0041: Park mandatory NDA acceptance

Status: accepted by the owner on 29 September 2026.

## Decision

KXRA OS does not require an NDA during signup, onboarding or current private access. Active NDA requirements are retired, legacy NDA records are no longer required, and NDA is removed from the deterministic customer-release document set.

The versioned legal-document, presentation and immutable acceptance-evidence system remains in place. An agreement can gate access later only when KXRA explicitly activates an approved exact version. Unapproved placeholders never gate access and are never recorded as accepted agreements.

## Consequences

- A person with a valid invitation, active membership and assigned project can complete onboarding when no approved agreement is active.
- Existing acceptance evidence is preserved; no historical record is deleted or rewritten.
- A future approved required agreement reopens onboarding at Access Review and must be accepted before private access resumes.
- Project membership, PostgreSQL RLS, MFA, tenant selection and retrieval authorization are unchanged.
- Terms, Privacy, Cookie, Data Processing and Custom Project documents remain separate release inputs. Their legal and commercial approval is still outstanding.
- KXRA may reconsider an NDA after qualified advice or a demonstrated commercial need.
