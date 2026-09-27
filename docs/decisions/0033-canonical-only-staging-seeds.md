# ADR 0033 — Canonical-only staging seeds

Date: 27 September 2026  
Status: accepted

## Decision

The first hosted staging import uses the versioned `KXRA-CANONICAL-SEEDS-V1` profile. It imports only the public, source-backed Genesis registers required to establish the KXRA organization, seven project records, project gates, project modules and classified operating records.

The profile stops before every local executable/test contract. It does not create fixture identities, members, agreement acceptances, legal placeholders, local model or budget policies, approved Ask manifests, routine service identities, entitlements, active product catalogue entries, billing state or provider state.

The operator binds every included register file to SHA-256, requires the complete hash-bound schema first, rejects unmanaged or changed history, serializes apply, commits the import and tracking row atomically, and verifies exact project/record provenance. Application roles cannot access seed history.

## Consequences

- Staging receives the minimum operating context without inheriting local test authority.
- Owner bootstrap, legal documents, runtime identities, product activation and provider configuration remain separate reviewed steps.
- A changed register set requires a new reviewed seed profile rather than silently replacing an applied profile.
- The canonical profile is idempotent and may be verified repeatedly; it cannot authorize production release.
