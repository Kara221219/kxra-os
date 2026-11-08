# Platform-owner customer metadata directory

Base: `7f1d1112f81a35d304a7e8810d4f68a5e4b2572c`. The isolated TypeScript contract is `78b5cc1b48dd480a4ba854613bbcee9610e06d11`. This is local preparation for the owner's administration dashboard, not a connected customer-management feature or launch acceptance.

## Scope and evidence

The owner asked to operate the website and manage customers from the owner login, without specifying customer fields or lifecycle mutation actions. This slice therefore prepares a minimal read-only customer workspace directory. It does not infer permission to inspect private room contents, impersonate customers, change accounts, suspend memberships, change billing, delete data or broaden existing tenant RLS.

A workspace means a row in `kxra.organisations` with `organisation_kind='CUSTOMER'`. It does not mean a team room. The public projection contains only:

- `organisation_id`
- `name`
- `slug`
- `relationship_type`
- `organisation_state`
- `updated_at`

The internal database response must additionally carry the literal `organisation_kind='CUSTOMER'`; the adapter validates and removes it. Account/member lists, contact details, email digests, Auth subjects, room names, messages, prompts, files, provider credentials, billing fields and counts are excluded. Any unexpected response field causes rejection, including fields on the hidden lookahead row.

The accepted schema has no organisation `created_at`. This contract does not manufacture one from member, account or project timestamps. Names and slugs are labels, not URLs or trusted markup. A later UI must render them as escaped text.

## Lifecycle meaning

`ACTIVE`, `SUSPENDED` and `CLOSED` are stored organisation administrative states. They are not account or membership states, payment status, current entitlement, live-service availability or proof that data was deleted. `CUSTOMER` organisation kind can have `PARTNER` or `CLIENT` relationship; it is not a claim that the workspace is a paying customer. Modern billing and legacy subscription records remain separate and are not combined into global revenue or customer totals.

## Pagination contract

`readCustomerDirectory` accepts a strict version-1 request with page size 1–50 (default 25), optional stored organisation-state filter and optional opaque bookmark. Sort/search/offset/identity/role/action/room fields are not accepted. UUID ascending order is the immutable keyset. The backend asks for at most page size plus one row, validates every row, returns only page size and uses the last exposed UUID as the next boundary.

Bookmarks are unsigned canonical base64url JSON. Their purpose, version, age, actor/session/context and normalized filter/page-size digest catch inconsistent reuse; they are not tamper-evidence, credentials or authority. A caller can construct a different valid bookmark. Every page must independently pass fresh server and database authorization.

Responses identify `consistency='LIVE'` and a database `sampled_at` time. This is not a stable snapshot or historical export. Inserts before the current UUID, or rows entering a state filter behind it, require a refresh to discover. Names and states may change between pages. No global total count is asserted.

## Server adapter and dormant behavior

`packages/workspace/customer-admin-contract.ts` uses the existing server identity and authenticated transaction patterns through narrow trusted composition ports. The identity port must use the real server `actor()` flow. The query port must use `packages/db.query` or the equivalent `scoped` authenticated transaction, never an unscoped/service-role/browser connector. The ports are backend test seams, not customer APIs.

The adapter accepts only server-resolved Supabase AAL2 identity in a selected KXRA organisation, INTERNAL KXRA_OWNER membership, ACTIVE account, recent MFA and matching account/provider session epochs with an original provider-session ID. It snapshots allowed identity primitives before further awaits. Those prechecks are necessary but are not the database authority proof.

`KXRA_OWNER_CUSTOMER_DIRECTORY_ENABLED` defaults off. No route, UI, environment default or activation is added. The flag is rechecked after awaited identity and query work. Disabled/denied/missing/malformed surfaces fail closed; there is no ordinary-table SELECT, cached customer data or privileged fallback. SQL/provider error detail is not disclosed.

The one parameterized CASE statement references these separately reviewed signatures:

- `kxra_owner_metadata.customer_directory_authorized_v1(uuid, integer, integer) returns boolean`
- `kxra_owner_metadata.customer_directory_page_v1(uuid, integer, integer, jsonb) returns jsonb`

The first three arguments are expected server-derived membership ID/version and account epoch. They are hints that must match current database authority, not new credentials. The fourth argument is exactly version 1, an optional UUID boundary, optional organisation-state filter and bounded lookahead limit. The database envelope is exactly version, sampled_at, items and has_more, with full UTC timestamps and no private additions.

## Database implementation and review boundary

Existing migration 0035 deliberately limits ordinary organisation reads to the selected tenant. `is_owner` includes tenant ORG_ADMIN and cannot authorize this global surface. The new source-only SQL proposal is separate from immutable application126 and must not be concatenated into its migrations or installed by bypassing release checks.

Both the preflight and direct page reader must independently require:

- Original session login `kxra_app`, selected role `authenticated`, hosted execution and READ COMMITTED isolation.
- Current active verified SUPABASE account and exact account/session epoch.
- Exact selected ACTIVE KXRA organisation and current INTERNAL KXRA_OWNER membership, including ID/version, start/expiry/revocation.
- Current mandatory legal acceptance and recent AAL2 proof.
- The original immutable Supabase session binding, matching live Auth session and account/provider epochs. A refreshed signed JWT must not restore a revoked original session.

The reader takes the shared side of the existing custom-app authority fence before checking current rows. The genuine 0124/0125/0126 cohort provides the corresponding statement-level exclusive writer ordering for account/profile/organisation/membership/legal/Auth changes. The reader must use fresh post-wait snapshots, hold the fence through read and COMMIT, and recheck time-bound authority before returning. It takes no paired-policy or authority-row locks and must not be composed with unrelated writes or lock upgrades.

This is a deliberately narrow SECURITY DEFINER read boundary because existing selected-tenant RLS cannot enumerate customer organisations. Installation must verify the reviewed existing owner and writer dependencies. New schema/function ACLs must be owner-only, removing inherited default grants including unrelated roles. Existing policies, data, roles and private-helper grants remain unchanged. Application/anonymous/Auth/worker roles receive no new runtime grant from the proposal. Do not expose the new schema through the Data API.

A later reviewed grant can authorize only the exact schema usage and RPC signatures required by the verified server runtime. It cannot grant direct table or original-session helper access. Before that decision, require exact source/catalog review, role and default-ACL attestation, native negative/concurrency evidence and a new release/migration plan. Live original-Auth-session ordering remains a separate acceptance gate.

## Required verification and integration

The contract's pure tests exercise preflight denial, immutable capture, unsigned bookmark semantics, bounded ordering/filter/lookahead, lifecycle labels, strict privacy allowlists, missing/denied RPCs, generic failures and late-disable suppression. Fake query ports do not prove PostgreSQL authorization.

The concrete source-only proposal is `database/proposals/customer-directory-metadata-v1.sql`, with `scripts/verify-customer-directory-metadata-native.mjs` as the local-only native entry point. Neither applies to an existing target. Native acceptance must cover direct RPC bypass, anonymous/staff/tenant-admin/partner/customer access, changed owner scope/version, revoked/expired account/member/session/legal/MFA, hostile default ACLs, unsafe installer identity, malformed source metadata, strict pagination, and authority-writer/read races in both winner orders. Native runs require the shared fixture lease and must not overlap the owner UI or canonical integration lane.

The TypeScript author passed 23 new contract tests and a 42-case related pure cohort, focused typechecking and formatting. Exact final source-bound SQL/native and independent-review results belong in the completion evidence; the pure-test counts are not a substitute for those stages.

Next integration steps are to review the combined SQL/native evidence, rerun canonical acceptance, review a new migration/grant plan, then wire a private no-store owner UI/API. The UI must distinguish unavailable/denied from an empty customer list, preserve recent-MFA/original-session behavior and offer refresh for live traversal. Customer lifecycle mutations remain undefined and unimplemented.

No hosted mutation, credential access, privilege expansion on an existing database, provider call, deployment, publication or spending is performed by this local preparation.
