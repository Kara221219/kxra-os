# ADR 0009 — Private objects, trusted processing and revocation-safe evidence

Date: 20 September 2026. Status: accepted and implemented with deterministic local adapters; hosted providers remain blocked.

## Context

The earlier file route stored quarantine metadata but did not provide a trusted byte lifecycle, extraction, indexed evidence, authorized download or object reconciliation. Making those bytes searchable without a complete authorization chain would allow unscanned content, stale project grants or cross-tenant evidence to reach Ask KXRA. Giving browsers permanent object URLs or a storage service key would also bypass current PostgreSQL authority.

The local environment needs executable acceptance evidence without claiming that a static fixture scanner is production antivirus. Hosted Supabase Storage and a production scanner/extractor cannot be activated before their exact staging configuration is reviewed.

## Decision

PostgreSQL owns file metadata, immutable versions, lifecycle state, processing jobs, derived chunks, query attempts and delivery decisions. Object storage holds bytes only. The lifecycle is `UPLOADING → QUARANTINED → SCANNING → CLEAN → EXTRACTING → EXTRACTED → INDEXING → INDEXED`, with explicit `REJECTED`, `FAILED` and `NEEDS_REVIEW` states.

The server creates an idempotent upload intent and opaque tenant/project/object/version key. The browser cannot choose a key or processing state. Bytes are written with create-only semantics; a retry can reuse the intent only when project, audience, filename, MIME, size and SHA-256 match exactly. Processing begins only after the server finalizes the private object.

A separate `kxra_worker` role can claim leased jobs and invoke private completion/reconciliation functions. Browser roles cannot claim work or promote lifecycle state. The local worker checks size, dangerous extensions, executable signatures, EICAR, MIME/magic, macro/active PDF content, archive policy and UTF-8/JSON validity, then creates deterministic versioned chunks with offsets and hashes. This adapter is a test double and fails closed outside guarded fixture mode.

Chunks retain tenant, project, record, file/version, record version, extraction adapter/version, classification, audience, offsets and normalized text hash. RLS follows the current parent record and current indexed version. Search includes only authorized indexed chunks.

Downloads have no raw or permanent object URL. The server first creates an authorization event under RLS, reads the private object, verifies size and SHA-256, rechecks the current membership/version/project/record/lifecycle state, then streams a private `no-store` response. Ask KXRA records a redacted query run, validates every record/chunk ID and version and repeats authorization immediately before delivery. Changed authority or evidence withholds the result and clears stored evidence references.

Object reconciliation compares the complete expected manifest with private storage, verifies hashes, recovers an exact orphan by hash, marks missing/mismatched versions failed and moves unknown objects into a reconciliation quarantine. Restart verification rehashes every registered private object and compares file, chunk and job state.

## Consequences

- Supabase Storage needs one private bucket and a server-only secret; clients never receive that secret or a permanent object URL.
- Production processing remains unavailable until a trusted malware scanner and disposable no-network extraction worker are connected and pass staging. The deterministic adapter cannot run in production or Vercel.
- The worker database identity is separate from the application identity and receives only the private worker functions required for processing and reconciliation.
- PDFs without active content currently stop at `FAILED / EXTRACTOR_UNAVAILABLE`; images produce verified metadata evidence only, not invented semantic descriptions.
- Empty-target database-plus-object restore remains a later production-quality gate. Local restart integrity and object reconciliation are executable now.
