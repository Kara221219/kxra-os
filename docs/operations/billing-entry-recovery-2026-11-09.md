# Customer billing recovery after an interrupted request

## Scope

Isolated base: `3c6907e25f8a03228e6c119f11988cc0c12fb082`. Branch: `codex/billing-entry-recovery-20261109`. The accepted source is preserved in its original checkout.

A lost CUSTOMER or CHECKOUT reservation acknowledgement left the browser's pending latch set even when a successful status refresh returned that exact original request. In the reproduced checkout case, the real component rendered Continue to secure payment but kept it disabled. Recovery required another reservation POST despite already having current status.

The new client-only helper clears that latch only for the same request ID, action and offer, in the allowed recorded customer/checkout states. Unknown, malformed, mismatched, disabled, uncertain or review-required responses preserve the original request. PORTAL and RECONCILE are deliberately excluded: a status receipt cannot recover a portal bearer URL. This is UI acknowledgement, not payment or entitlement authority.

Refresh now shares the existing synchronous in-flight guard with reservation/result delivery. One AbortController and one 35-second timer cover the entire operation, including reservation followed by status refresh. Repeated clicks cannot start overlapping refreshes. On unmount, the active operation is invalidated before its network request is aborted, preventing delayed checkout or portal responses from navigating afterward. Browser abort does not undo a server-side reservation or provider action; an uncertain request keeps its original ID for reconciliation or explicit same-ID retry.

No server identity, RLS, legal acceptance, MFA, SQL, backend operation, provider configuration, price, policy, flag or release manifest changed. Checkout and portal destinations still use the existing validated server result. No external provider call, payment, deployment, credential or hosted action occurred.

## Verification

- The original component failed the loopback browser test with Continue to secure payment disabled after matching CONSUMED status. The baseline source hash matches the accepted base; the retained failure is `/tmp/kxra-billing-ui-baseline.log`.
- 146 focused synthetic billing, portal, navigation and recovery tests pass, zero failures/skips. The new recovery matrix covers exact accepted states, all mismatch/uncertainty boundaries and exclusion of portal/reconciliation.
- 22 component browser scenarios pass at 1440 and 390 pixels. Cases include lost acknowledgements, canonical retry references, malformed/mismatched status, same-tick duplicate refresh, stalled status/reservation, the combined delayed POST plus stalled GET deadline, and late checkout/portal delivery after unmount.
- Root typecheck, changed-file formatting, 16 immutable composition regressions, all three production builds, dependency/publication/marketing-boundary checks, CSP/SRI, artifact isolation and secret scan pass. Existing budgets are unchanged: the largest OS page is 199.5 KiB against 200 KiB; marketing is 124.3 KiB against 140 KiB.
- A separate reviewer inspected the runtime, final harness and source-bound browser receipt and found no remaining substantive issue. They did not independently rerun tests.

The browser runner bundles the actual component with existing installed dependencies and a native-anchor fixture for Next Link. It uses synthetic mocked local HTTP responses, blocks external requests and creates no database or account. Therefore it proves component behavior, not Next routing, real SDK/session ordering, backend/Stripe delivery, hosted latency or full end-to-end payment acceptance. Clock control accelerates timeout cases; it is not a wall-clock service SLA. Nested cleanup attempts browser/server shutdown and writes a finite receipt even if browser closure fails.

Run: `node scripts/verify-billing-entry-browser.mjs --synthetic`. The receipt records source commit/dirty state, relevant source hashes, bundled asset hash, passed scenarios, external-request blocking and cleanup. Final exact-commit receipts remain outside tracked source to avoid changing their own source identity. Full canonical aggregate acceptance must run on the eventual composed release; focused and component checks do not replace it.

## Remaining hosted payment gates

This fix does not resolve exact current workspace terms/publication, the failed-renewal grace/recovery policy decision, private approved scope/mappings, sustainable refresh read allocation and worker capacity, actual sandbox checkout/webhook/renewal/cancellation acceptance or the complete hosted customer journey. Those remain separate source/operation gates. Do not enable checkout, make a real charge or infer launch readiness from these local results.
