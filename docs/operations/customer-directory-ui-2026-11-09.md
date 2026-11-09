# Customer directory UI and factual workspace labels

Local source only, based on `ec6d97ed6aa07b815cff646473d802c056e2fd0e`, tree `e170761e6dda2add6995cb51a1afe4191ebb2463`, in the isolated `customer-admin-journey-20261109` worktree. The frozen owner metadata candidate, original marketing landing, legacy routes, auth/db boundaries, numbered migrations, release manifests, grants and payment code are unchanged.

## What is prepared

- Shell labels derive from server-resolved `organisation_kind`, `security_role` and `relationship_type`, never the historical coarse owner/partner role. Actual PARTNER relationships remain Partner workspace; CUSTOMER, CLIENT and INTERNAL show Customer, Client and Team workspace. Non-owner topbars say Your workspace rather than implying assigned projects.
- The owner navigation includes Customer directory, with prefetch disabled. The new server-rendered `/os/customer-directory` route requires a selected KXRA / INTERNAL / KXRA_OWNER context. It does not replace the existing catch-all route or remove legacy partner operations.
- `apps/os/lib/customer-directory.ts` is server-only and directly composes the existing `actor` and `query` ports. No new authentication or claim-forwarding layer was introduced.
- The flag remains absent/default-off. Disabled, denied, invalid and unavailable reads show no table or invented zero count. No write controls, customer detail links, private-room data, account/contact information, billing or totals are exposed.
- Successful future metadata reads are limited to 25 rows per page, with state filter, fresh keyset continuation and refresh. Filter submission discards the cursor. Values render as escaped text. Tables have captions and row/column headers; navigation is labelled; all page links suppress prefetch. There is no client component or editor import.

## Real authority and activation boundary

`resolveVerifiedSupabasePrincipal` checks both getUser and verified getClaims, and extracts original provider session ID/version from top-level verified claims, never user metadata. `account` and `actor` preserve those fields while selecting current membership and account epoch. `scoped` sets the authenticated transaction role, selected organisation and verified provider claims. The contract resolves actor again for each enabled directory read and rejects fixture/fake-provider sources, stale MFA, wrong membership/kind/relationship or mismatched epochs.

These prechecks are not authority. The separate unpromoted SQL proposal must be installed and independently reviewed/granted before any successful real read is possible. It checks the original login, authenticated role, current original Auth session, current account/membership/organisation/legal/MFA authority and holds the writer fence through transaction completion. No SQL, grants or environment defaults were changed here. A flag alone is insufficient. Missing or denied RPCs fail closed without a fallback. The UI is not global customer management, launch acceptance or hosted proof.

## Verification

Focused unit/render/source checks: 46 passed, including existing metadata contract/SQL structure, owner source-transition and owner overview cases. Existing verified-session tests also passed 3/3. Root TypeScript and repository-wide formatting passed using resident pinned dependencies. These tests do not prove real Next/Auth/SQL composition. No native fixture, build, server or browser has been started by this worker, pending the parent's serial resource window. Actual client/server artifact impact and visual/HTTP verification remain unmeasured; the unchanged 204800-byte budget must be checked on final source. Frozen-baseline native/browser evidence is not re-labelled as evidence for this new tree.

Independent source review found no blocking defect and independently passed 28 contract/UI tests. Its cache-test weakness was corrected: the prepared HTTP test now requires a no-store directive, rather than accepting private caching alone. The existing OS route header is private, no-store. The new responsive metadata table adds explicit mobile field labels and long-text wrapping; browser visual evidence remains pending. Historical source-transition anchors and manifests remain unchanged; the catch-all page and TeamWorkspace are untouched.
