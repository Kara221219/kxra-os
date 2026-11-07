# Preserve paid-period-end cancellation

## Local correction and evidence

Base: `b763774d86c28b64b5549662feb5a20d3a509fc7`. Branch: `codex/cancellation-period-end-20261107`. This patch changes the shared modern LIVE/sandbox portal adapter only. It does not activate billing, call Stripe, change a provider configuration, make a payment, cancel a real subscription, or change the approved commercial policy.

The source previously required `features.subscription_cancel.enabled=true` but ignored `mode`. A Stripe configuration with immediate cancellation therefore passed. That conflicts with the settled end-of-paid-period cancellation promise recorded in `launch-policy-reconciliation-2026-10-30.md`. The adapter now requires the exact `at_period_end` mode before it can create a portal session. Missing, null, unknown and nonstring modes fail closed. Payment-method repair must remain enabled; plan changes must remain disabled. Existing scope, account, tenant, MFA, legal, replay, expiry and generation checks are unchanged.

The [pinned Stripe configuration schema](https://docs.stripe.com/api/customer_portal/configurations/object?api-version=2025-07-30.basil) exposes the cancellation mode separately from the enabled flag. Its [API field reference](https://docs.stripe.com/api/customer_portal/configurations/create?api-version=2025-03-31.preview) distinguishes immediate from period-end behavior. No provider default is treated as approval.

Before the source fix, the new 12-case negative matrix produced ten failures and two passes. Afterward, all 277 focused catalogue, portal, billing entry, navigation, scope, paid-access, refresh, scheduler and read-budget checks pass with zero failures or skips. The positive bounded synchronous-portal path still succeeds in both LIVE and STAGING_SANDBOX using injected synthetic transport. The negative matrix proves no POST occurs for invalid cancellation configurations. No real key or customer data is used.

Root typechecking, changed-file formatting, dependency policy, publication snapshot, marketing boundary, all three production builds, CSP/SRI, unchanged build budgets, fixture-free artifact verification and secret scanning also pass. The largest OS page remains 199.4 KiB against the unchanged 200 KiB limit.

A separate integration reviewer inspected the source/test delta and reported no relaxation or policy change. That source review is distinct from the author's test execution. The JSON receipt records source and log hashes. Full canonical CI and actual hosted customer/provider acceptance are not inferred from these focused checks.

## Integration and rollout boundary

Integrate the returned commit into a fresh reviewed composition, then run exact-source aggregate acceptance and the existing release controls. No migration, SQL policy, credential, flag, pricing, schedule, entitlement or legal text is changed. This patch intentionally makes a misconfigured or ambiguous portal unavailable; before deployment, verify the actual approved provider configuration has period-end cancellation and payment-method repair enabled. Do not silently edit Stripe settings or weaken the guard to make the check pass. Preserve support-led cancellation for customers if a portal is unavailable.

## Remaining customer launch gates confirmed during this audit

- The current source still freezes an empty `publishedWorkspaceTerms` catalogue. Exact current workspace terms approval/publication and corresponding legal/checkout mappings remain unresolved. Do not substitute the retired founding or pilot offer.
- The current monthly catalogue is Starter GBP 29 / one seat, Team GBP 79 / five seats and Business GBP 199 / fifteen seats. Historical GBP 49 pilot and GBP 290 annual instructions are not this launch offer. No VAT is to be added under the recorded owner direction.
- Seven-day failed-renewal work grace and recovery through day 30 are still a review proposal, not production SQL behavior. Do not promise them or silently replace the accepted policy; resolve the exact current terms and applicability separately.
- Existing refresh design retains a maximum 300-second proof age and approximately 20 provider reads on its successful path. Connection reuse reduces database setups, not provider reads. Real read allocation, database slots, scheduler timing and protected webhook delivery need actual receipts.
- Hosted signup, two-tenant isolation, customer-supplied AI, sandbox checkout, payment/renewal reconciliation and customer cancellation remain end-to-end acceptance gates. Synthetic adapter success does not establish any of these hosted results.

## Exact historical composition follow-up

Integration found that the original payment composition manifest pins all three changed files, and the paired composition manifest pins its payment test. Historical manifest bytes remain untouched. A new test-only helper records four explicit historical-to-reviewed SHA256 transitions, accepting only each complete reviewed file with its original exact historical hash. It is not a general normalizer, does not substitute bytes across files and grants no runtime or release authority. All other files still use the existing strict historical checks.

The overlay tests pin the raw historical payment and paired manifest hashes and reject appended bytes, truncation, one-byte changes, unknown/prototype/traversal paths, changed historical hashes and cross-file substitution. The combined payment/refresh/GitHub/portal subset passes 118 tests. The paired composition test is owned by the parallel service worker and must call this payment-specific verifier for its pinned payment test; that final combined fallback is not yet present in this isolated branch. Integration must run both coordinated changes and the final aggregate suite together.

No runtime source, historical manifest, policy, migration, hosted setting or payment activity changed in this follow-up. Root types, changed-file formatting and whitespace checks are run on this test-only candidate. Receipt: `evidence/cancellation-composition-overlay-2026-11-07.json`.
