# ADR 0050: Guarded release-evidence finalization

Date: 3 October 2026  
Status: Accepted

## Context

The founding private-launch candidate was intentionally blocked until three independent evidence classes existed: a provider-backed hosted backup and isolated restore, an owner accessibility attestation and an owner security attestation. All three now exist for the exact staging candidate.

Finalization must bind that evidence without deploying code, publishing the marketing site, enabling live Stripe, granting customer access or merging `main`. It must reject a changed candidate, substituted evidence, incomplete reviews, an unapproved target or an unpushed working tree.

## Decision

KXRA records one immutable `kxra.release_finalizations` row for the exact manifest. It stores the pre-finalization candidate SHA-256, the hash and bounded contents of the hosted recovery evidence, both immutable review-attestation identifiers and the guarded operator reference.

The staging finalization operator requires the exact Supabase staging target over verified TLS, a clean pushed `codex/phase-2-completion` head and an apply phrase containing the project, release version and recovery-evidence SHA-256. It verifies the blocked manifest against source, checks both review types and their exact evidence hashes, rechecks the candidate digest, appends only the hash-bound `BACKUP_RESTORE` provider evidence, copies only attributable review metadata into the manifest, and requires `release_manifest_check` to return ready with no blockers in the same transaction.

The resulting manifest state is `READY`. `READY` is evidence status only. It provides no deployment, publication, production, payment, access-grant or merge authority.

## Consequences

- Release evidence is attributable, immutable and bound to the exact pre-finalization candidate.
- The operator is idempotent for the exact finalized state and rejects takeover or drift.
- The recovery evidence records that database backups exclude Storage objects and other provider configuration, so those assets retain separate recovery procedures.
- Production and live billing remain disabled pending a separate explicit production decision.
