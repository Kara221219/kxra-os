# ADR 0012 — Governed YouTube and repository pipelines

Status: Accepted for the deterministic local implementation on 24 September 2026.

## Context

PROJECT-006 needs an AI-assisted Finance Unfolded content workflow, while PROJECT-007 needs repository discovery and controlled reuse. Both domains can create irreversible external or host effects: publishing claims and media, or executing untrusted code and changing Git state. The provider, scanner and sandbox connections do not yet have staging evidence.

## Decision

Add both projects to the canonical seed and implement their planning, evidence, review and intent layers under the existing verified-identity, selected-tenant and PostgreSQL RLS boundary.

PROJECT-006 packages all source, claim, script, rights, provenance, render, QA and metadata evidence into immutable versions. A different actor reviews the exact version/hash. A current verified channel binding is required before an upload intent can exist. The local adapter is fixed to `DISABLED` and delivery to `NOT_SENT`; no provider token or upload/schedule executor is present.

PROJECT-007 pins every candidate to exact repository metadata and commit/tree hashes. Quarantine and assessment evidence records disabled hooks, submodules, lifecycle scripts, Actions, network and secrets. A different actor reviews the exact adoption proposal. The resulting implementation intent is fixed to `NOT_STARTED`; merge, release and deployment remain false. No archive reader, process runner or Git writer is present.

The two requested public repositories are seeded only as reference metadata at the reviewed commits. Their tree, licence, scan and adoption states remain unknown. Repository text is untrusted data and never becomes agent instruction.

## Consequences

- The operating workflow and authorization boundary can be tested before provider connection.
- Local synthetic verification and scan records are contract evidence, not real provider or security claims.
- YouTube OAuth/upload, archive acquisition, production scanners, disposable sandboxing, Git changes and publication require separate adapters, staging credentials and acceptance evidence.
- Database and HTTP tests must cover anonymous, unassigned, revoked, crafted-project, independent-review, exact-hash and no-side-effect cases.
