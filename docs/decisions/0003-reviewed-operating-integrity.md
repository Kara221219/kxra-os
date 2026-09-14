# ADR 0003 — Reviewed operating integrity

Date: 14 September 2026. Status: accepted for the local KXRA OS foundation. Implementation: `0c20de47fe1f6cb38646db51c4a90650679aacd7`.

## Context

The 13 September review reproduced stale membership authority, incomplete approval hashing, truncated finance totals, SQL-null finance acceptance, mutable evidence classification, incomplete history, unintended upload sharing and non-atomic positional seed import. It also found no enforceable idea-to-decision lifecycle or evidence-backed project gates.

## Decision

Use additive PostgreSQL migrations to repair data and make PostgreSQL enforce the operating contract. Approval digests bind the complete action envelope and executors lock current target state. Evidence and workflow relations cite exact immutable record versions. Experiments, decisions, tasks and system runs cannot be created as generic records. Seed IDs derive from source codes; complete source envelopes are hashed and imported atomically with migrations.

Project-gate policies are stored as versioned data, while typed SQL validates each required claim. An accepted evidence packet plus a separate exact owner approval may create only a `local_only` authorization. Gate authority never changes live-execution, product-creation or publication flags.

Local invitations use one-use token hashes and verified email identity. Consequential actions require a current owner with AAL2 issued within 15 minutes. Hosted identity remains a separate staging gate.

## Consequences

The first complete operating loop and Projects 002/003/005 gate contracts are inspectable and testable. Accepted evidence cannot be silently edited, stale grants cannot restore revoked access, and page size cannot change finance totals. The design adds tables and narrow RPCs but avoids an execution engine, external provider or release authority. Future document, AI, routine, WhatsApp and public-build slices must extend the all-table access matrix and acceptance ledger before they can be marked complete.
