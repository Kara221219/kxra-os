# Owner operating overview: 8 November 2026

## Full product intent and this change

KXRA is being developed as a complete shared AI workspace and service platform, with an effective platform-owner operating console. This change is the first safe owner-console implementation step, not a reduction to a pilot or MVP and not a claim that the full product is finished. The established main marketing landing design remains the reference and is not changed.

Base source: `7f1d1112f81a35d304a7e8810d4f68a5e4b2572c`. Worktree: `owner-operating-overview`; branch: `codex/owner-operating-overview-20261108`. The frozen marketing release candidate remains separate. Source43/database117 acceptance is not evidence for this source and is not touched by this work.

## Implemented source

- Verified KXRA owners receive grouped operating navigation and an owner-scoped cream/ink/sage theme. The palette and rounded controls follow `apps/marketing/app/reference.css`; no marketing file is imported or edited.
- Owner `/os` presents real selected-organisation enquiry, approval, task and recent-work data. Its four totals are computed independently of capped previews in one SQL statement under the existing authenticated RLS transaction. The snapshot contains no customer/revenue/provider-health claims and no enquiry contact address or message content.
- Expired or consumed approvals do not appear as pending requests. Recent activity covers the seven days ending at the database transaction time. All previews are explicitly bounded and captured time/source/organisation are visible.
- `/os/enquiries` is an owner-only latest-50 inbox using the existing table/read boundary. An explicit `?enquiry=UUID` lookup allows an older pending enquiry to remain reachable when it is outside that recent page.
- `/os/work-log?entry=UUID` is an owner-only, selected-organisation, one-row lookup so snapshot activity links survive intervening activity and pagination.
- Existing workflow task cards now have stable `task-UUID` anchors. No task mutation behavior changed.
- The original venture dashboard is retained at guarded `/os/venture-overview`. Partners, WhatsApp, portfolio and every other prior owner navigation destination remain available in secondary groups and by direct route. Non-owner navigation and permissions are retained.
- Snapshot failures render an unavailable state without zero counters, with working links to existing operating screens.
- Knowledge and Memory editors now follow the existing dynamic-import pattern for inactive workspace tabs. Their default SSR, props, data fetching and authority remain unchanged; the panel code loads when the tab is opened. This reduces real initial client bytes rather than changing the budget guard.

The new snapshot and selected-item reads use SELECT statements only. Existing destination screens may retain their historical behavior: the legacy dashboard and approvals page refresh expired approval state; Admin records an audit event and refreshes approvals. The new home does not call those loaders. Clicking an existing destination does not bypass any of its confirmation, MFA, policy, payment or release checks.

## Authority and data boundaries

`apps/os/lib/auth.ts` resolves verified principal, active membership, selected organisation, MFA and legal gate. The new adapters require `KXRA_OWNER` and `organisation_kind=KXRA`, then use `scoped`/`query` from the unchanged database boundary. Each new data query also carries explicit organisation parameters. Client navigation is presentation, not authorization.

The database distinguishes tenant `is_owner(org)` (which can include ORG_ADMIN) from `is_platform_owner()`. The selected-organisation visibility policies remain unchanged. No global organisation directory, customer-room inspection, RLS bypass, staff access or new privilege is introduced.

No source or environment activation, subscriptions, provider settings, credentials, hosted queries, website publishing, production deployment or spending is included. Synthetic fixture records are labeled as such. Configuration presence is not presented as provider health; release evidence is not described as live-site status.

## Remaining full-product owner contracts

1. **Cross-customer metadata directory and lifecycle.** Define minimally identifying organisation/workspace metadata, onboarding/provisioning status and the exact owner/staff read scope. Add bounded, paginated platform-owner contracts and audited lifecycle actions with tenant/role negatives. Do not relabel legacy profile/project-membership counts as customers. Customer workspace content remains private unless an independently authorized support workflow permits access.
2. **Modern billing and usage.** Add authoritative platform-owner read models for live billing, usage, reconciliation and uncertain outcomes, separating legacy, pilot/test and live lanes. Financial aggregates must use server/database arithmetic, preserve currency and minor units, and distinguish collection, refunds and entitlement. Existing CUSTOMER/ORG_ADMIN own-billing APIs are not global owner APIs. Legacy subscription rows are not proof of live revenue.
3. **Website content management.** Define draft/review/version/preview/audience/approval contracts for editable public content, including rollback and legal-copy restrictions. Content editing and publication are distinct authorities. Current source snapshots do not provide an owner CMS.
4. **Deployment and publication telemetry.** Add verified source/deployment identity, environment, observed time, health and last successful publication/recovery metadata. Release manifests, attestations and configured flags alone cannot show whether a website is live or healthy. Publishing, domains and deployment controls require separately governed actions.
5. **Support and enquiry workflow.** Extend the existing enquiries/request records with reviewed assignment, status transitions, response history and service-time definitions. Public submissions stay unverified until reviewed. Viewing an email address does not authorize sending a response.
6. **Platform operational visibility.** Define safe metadata-only aggregates for job backlog, uncertain outcomes, integration authorization freshness and failures. Respect private rooms, personal connections and existing review grants. Do not expose secrets or infer health from configuration presence.
7. **End-to-end journey consistency.** The private app's unauthenticated `/` (`apps/os/app/page.tsx`) remains an older partner-oriented landing, reachable through the login wordmark's `/` link. It is distinct from the accepted main marketing landing. Login, onboarding, tenant-owner/member labels and standalone guarded pages need a subsequent cohesive journey pass. In particular, non-owner CUSTOMER/CLIENT/admin/member contexts still show the unchanged “Partner workspace” and “Assigned projects” labels even though verified relationship metadata can distinguish them. This owner-shell change does not claim end-to-end customer UX completion.

These require explicit contract and action-scope decisions, not weakening existing policies. Customer lifecycle authority and the distinction between content drafts versus publishing/domain/deployment operations are the essential unresolved scope questions.

## Source integrity

Historical application/session manifests remain byte-identical. The changed catch-all route has an explicit source transition record in `packages/release/owner-overview-source-transition-v1.json`; the corresponding verifier, self-pinned composition test and TeamWorkspace import transition are also bound to exact prior and new hashes. The overlay is limited to four paths, rejects changed bytes/anchors, and grants no release authority. All unrelated pins continue through their existing verifier.

## React and Next review

Read the installed Next server/client-component and CSS-module guides under `apps/os/AGENTS.md` requirements. Applied the React checklist: sensitive snapshot work stays server-side; one database statement avoids dependent read waterfalls; static navigation labels/groups stay server-rendered; the small client wrapper handles only menu state/events; no client secret/data cache or new dependency; typed bounded data rather than `any`; stable UUID keys; native links/disclosures, labeled menu toggle and Escape focus restoration. Runtime keyboard, history, reflow and source-bound build verification are separate acceptance checks.

## Verification status

Focused pure checks: 16/16 pass, including rendered honest/empty/unavailable states, role rejection before DB access, bounded SQL structure, legacy navigation retention, exact source transitions and unchanged historical manifests. Typecheck passed. Independent review identified and corrected task-anchor, paginated-activity-link and test disclosure-state defects, then independently passed the original 15 checks. The later TeamWorkspace transition adds another exact-byte negative case.

Final application evidence: `/private/tmp/kxra-owner-overview-4zCSFp/`.

- Native database/HTTP: 7/7 pass. The snapshot executes in a real READ ONLY transaction; pending counts exclude expired/consumed approvals; old enquiry/activity targets survive more than 50 later rows; task anchors resolve; GETs preserve audit, approval, task, enquiry and work state. Anonymous, partner, viewer, revoked, tenant admin/member, cross-organisation and inactive-owner cases fail closed at the relevant HTTP and RLS boundaries.
- Chromium: 25 pass, one deliberate skip of the duplicate mobile responsive matrix. Includes owner keyboard/menu/Escape focus, browser Back/Forward, all populated preview targets, legacy routes, nested messages/tabs/history, direct Knowledge/Memory URLs and reloads, and existing knowledge/memory/revocation/refresh workflows. No hydration warnings were recorded.
- Visual evidence: 36 screenshots. Matrix viewports are 1440/768/390/320 × 1000 pixels, plus 640 × 1000 with CSS zoom 200%. Captures cover overview, workspace, approvals, tasks, Admin, partners and enquiries; nested-room captures use desktop 1280 × 720 and mobile 390 × 664 Chromium emulation. This is not real Safari acceptance. The installed WebKit cache does not match the repository's required engine; nothing was installed and Safari was not opened.
- Production builds succeeded for OS, marketing and email-worker. Unchanged asset checks pass: OS largest 203,758/204,800 bytes, catch-all 200,494/204,800; marketing 35 pages under 140 KiB. CSP/SRI passes for 93 static routes and 795 script references. Artifact scan excludes 42 fixture/identity/secret markers and enforces 12 source-boundary classes. See `production-os-build.log`, `budgets.log`, `csp.log` and `artifact.log`.
- `report.json` binds 28 app/contract/harness/test SHA256s and confirms they were unchanged during acceptance. Normal cleanup: database stop exit 0, database status 3, no server process group, no HTTP response, shared lease released. The frozen candidate remains clean at 7f1d111.
- After the healthy run, only the runner's never-started cleanup branch was corrected. Its normal-run hash is therefore superseded, not silently reused. An actual asynchronous ENOENT launch fault passed in `/private/tmp/kxra-owner-overview-0bsmiT/report.json`: no child PID, no PostgreSQL directory, lease released, source unchanged. `startup-failure-check.json` records the final runner SHA256 a858bae3ab6bd29a3dc65bf4e949f36d7385da18bea97315ad25b08fb53a017c. The composed candidate must rerun its final acceptance with that corrected runner.

The first budget attempt failed; inactive Knowledge/Memory deferral reduced the largest initial route by 2,608 bytes, with the 200 KiB guard unchanged. Earlier harness/locator/seed assumptions and the pre-hydration menu issue were corrected and retested; those earlier runs are not the final acceptance evidence. No hosted queries, real providers, Safari, publication, payments or deployment occurred. Combined branding/source acceptance and the full product contracts remain separate.

## Source map for the next owner-console work

- Owner shell and unchanged partner branch: `apps/os/components/Shell.tsx:32`; grouped destinations: `packages/workspace/owner-navigation.ts`; server-rendered groups: `apps/os/components/OwnerNavigation.tsx`; mobile keyboard/disclosure behavior: `apps/os/components/OwnerMenuDisclosure.tsx`.
- New owner landing and inbox routing: `apps/os/app/os/[[...segments]]/page.tsx:278` and `:291`; retained venture screen: `:317`; selected activity routing: `:1525`.
- Exact selected-organisation authority/read adapters: `apps/os/lib/owner-overview.ts`; bounded single-statement snapshot: `packages/workspace/owner-overview-contract.ts:29`; presentation: `apps/os/components/OwnerOverview.tsx`.
- Existing inbox read contract: `apps/os/lib/control-plane.ts:102`. Historical mutating loaders remain at `:457` (venture dashboard) and `:771` (Admin); they are not the new overview loader.
- Preserved public design reference: `apps/marketing/app/reference.css`. Owner adaptation is isolated in `apps/os/components/OwnerOperations.module.css`; overview rules are separated in `OwnerOverview.module.css`. The Next manifest still includes these assets in related routes; measured budget compliance comes from deferring inactive Knowledge/Memory editor code, not excluding assets from the check.
- Remaining older private-root journey: `apps/os/app/page.tsx:11` and `:85`; login link into it: `apps/os/app/login/page.tsx:30`.
- Repeatable disposable acceptance entry: `node scripts/verify-owner-overview.mjs`. The DB/HTTP seed suite lives under `tests/acceptance/owner-overview.native.ts`, outside the general service-test glob, and never shares its fixture with unrelated suites. Screenshot/navigation acceptance is `tests/e2e/owner-overview.spec.ts`.
