# Customer first-use presentation candidate

## Scope

Prepared locally from frozen `b78cedcbc1af87be789b8b20e2b89c992e6612e3` in a separate worktree and branch. The accepted source is untouched. This is a presentation/navigation slice, not release authorization.

- The OS public root is now a workspace entry with sign-in and the same server-owned hosted signup availability gate used by sign-in. The separate marketing app is unchanged.
- Onboarding copy comes from the verified selected membership returned by `account()`. CUSTOMER and CLIENT workspaces are described as workspaces, not partner ventures. All nine persisted steps, submitted payloads, required project checks, security acknowledgement and exact approved agreement review remain. WhatsApp retains SKIP and CONNECT_LATER, labelled optional and currently unavailable. Ambiguous organisation selection redirects to the existing selector. The step key resets local form state when navigating back between steps.
- Verified CUSTOMER/CLIENT relationships in CUSTOMER organisations enter the existing `/os/workspace` from `/os`; `?tour=1` is retained. Owner overview and true partner home are unchanged. This classification is presentation only and creates no authority.
- Room creation links and form require the existing server-returned writable-project list. With no writable project, the interface explains the restriction and offers existing support. Server-rendered access/support links avoid adding client bundle strings; billing remains behind the existing `/os/start` checks.
- Business Tools promotes the current team workspace and retains older discussions. Unavailable WhatsApp is removed from CUSTOMER/CLIENT main navigation only. Its direct route and partner features remain. General production connections remain unavailable and no link is added to them.

## Source integrity

All historical release JSON files, numbered migrations, backend authority and payment checks remain byte-identical. The successor map covers only the pinned catch-all page and TeamWorkspace. Hardcoded predecessor and successor digests must match the complete new map. The original owner manifest is byte-pinned before either old or successor acceptance, preventing a matching altered-manifest/altered-source bypass. Composed-chain tests exercise this failure mode, as well as changed, truncated, appended, empty, swapped and unexpected-path input.

`docs/operations/progress.md` and `handover.md` retain their complete frozen prefixes; this slice only appends.

## Offline verification at source freeze

- 84 focused pure, SSR, authority-contract and composition tests passed across customer-first-use, customer-first-use-source-transition, owner-overview-source-transition, production-apps-composition, production-session-composition, customer-directory-ui, customer-admin-contract, hosted-self-service-contract, live-workspace-start, account-contracts, live-billing-entry and hosted-team-operations-contract suites.
- Root no-emit TypeScript and full formatting checks passed. Publication snapshot and marketing source boundary checks passed. Git whitespace validation passed.
- SSR tests cover enabled/disabled signup presentation and every onboarding step for CUSTOMER/CLIENT admin/member, including legal review and optional WhatsApp. The entire existing onboarding submit function is unchanged.

## Prepared runtime verification, not yet executed

`tests/e2e/customer-first-use.spec.ts` uses an actual fixture identity and database membership selection, not display-only injected roles. It covers CUSTOMER/CLIENT admin/member, mixed-tenant onboarding recovery, no writable projects, access/support Back/reload, narrow write denial, a real separate private room with creator-positive and customer-negative API/page reads, and return to the original PARTNER membership. The public root is checked on desktop/mobile. Existing self-service coverage now checks profile save, Back, reload, repeated completed steps and the actual customer workspace landing. Existing owner, partner, account and self-service suites remain required.

Build, bundle budget, native/database, browser and aggregate CI acceptance have not run on this candidate at source freeze. Their receipts must identify the exact committed tree and remain separate from these source notes. No hosted service, provider, real authentication credential, payment, deployment or publication was used or activated. The customer metadata directory remains default-off. No source-disclosure or real Safari acceptance is claimed.

## Fixture cleanup successor after the 6ee60db focused run

The first whole-tree-bound focused run on `6ee60dba4f172b4c77b12a654bb62a1c23444eb4` passed build/budget checks and seven native tests. Its desktop first-use browser case reached the customer/private-room/write-denial/tenant-switch and original partner-return assertions, then failed when teardown tried to delete a membership referenced by selection audit history. The browser result is a failure, not completed acceptance; later browser cases and canonical CI had not run. The coordinator verified process/database/lease cleanup. Receipt: `/tmp/kxra-customer-first-use-verification-6ee60db/focused-receipt.json`.

This isolated successor changes only test fixture cleanup and review notes. It revokes the exact generated membership using membership, organisation, account and fixture grant-source checks, increments its version on first retirement, and preserves both timestamps/version on repeated cleanup. It does not delete the organisation, membership or context events. Migration31 requires a revocation timestamp for REVOKED state; the membership seat trigger does not admit a new seat on revocation. No account or session state is changed. The original PARTNER membership and selected context are verified after successful cleanup. The database connection closes in a nested finally even when cleanup fails.

Three new offline cleanup regressions pass; the combined focused offline set passes 87 tests, and full types/formatting pass. The browser fixture now also asserts unchanged audit events, repeated cleanup idempotence, inactive membership exclusion, original membership preservation and partner reload. Those new database/browser assertions still require a fresh whole-tree-bound runtime run. Old build/native receipts are not acceptance for this successor. Application source, source transitions, historical manifests, authority, migrations and all prior browser security assertions are unchanged.
