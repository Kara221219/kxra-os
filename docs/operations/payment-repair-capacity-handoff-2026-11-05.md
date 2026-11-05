# Payment repair correction and billing-capacity remediation

Base: `041d2009ea5258c9e5806c98360168f2b8f4e800`. Isolated branch `codex/billing-payment-repair-20261105`, checkout `/Users/kara/Documents/Codex/2026-10-30/task/kxra-payment-repair-20261105`. No source/release checkout, hosted schedule, account, provider, credential or deployment was changed. Existing dependencies were copied locally with matching lockfile; no install/download/provider call was needed.

## Implemented payment repair guard

`packages/integrations/live-catalogue-stripe.ts` now requires `features.payment_method_update.enabled === true` on the exact existing portal configuration before creating a modern PORTAL session. Both LIVE and STAGING_SANDBOX use this shared boundary. Existing requirements remain: subscription updates disabled, cancellation enabled, exact configuration/account/mode/customer, current authority and bounded transport. Missing, false, null, incorrectly typed or malformed payment-update configuration fails before a provider POST. No settings are changed automatically and there is no fallback configuration.

Tests exercise the actual shared adapter with injected synthetic transport in both modes, preserve the positive five-call flow, and deny malformed/unusable repair settings before another POST. Separate paid-access regressions use the real proof builders and portal authoriser: a verified admin with current MFA/legal authority can request billing repair while `past_due` proof remains DENY before and after; the portal result has `entitlement_authority:false`. This does not grant paid capabilities, bypass membership/MFA/legal controls or claim successful hosted card repair. No SQL, grace, TTL, cancellation policy, plan changes, price, refund or renewal behavior changes.

One existing positive portal fixture omitted the now-required feature. The first broader run passed 233/234 and exposed that stale fixture; it was updated to declare the supported repair feature, without weakening validation. Preserve the first TAP file as a failed receipt. The final source is verified separately below.

**Hosted follow-through:** privately inspect the existing portal configuration in a separately authorised read window. If payment-method updates are off, this correction intentionally refuses portal creation until an explicitly authorised operator configures the intended repair path. This local fix does not authorise that Stripe account mutation. End-period cancellation and plan changes OFF remain settled. No new commercial policy decision is required by the guard; unresolved hosted configuration/repair evidence remains.

## Capacity diagnosis — offline projection, not observed hosted performance

`payment-repair-capacity-2026-11-05.json` is executable-planner output from the existing pure functions, using the committed non-secret example. It reads no environment/configuration values or provider state, starts no scheduler, and returns activation_authority:false.

| Scenario | Due-discovery window | Projected completion | Headroom |
| --- | ---: | ---: | ---: |
| Example 16 due / 16 concurrent, 1s poll, 1s initial claim/fanout bound, 1s jitter | 60s | 58s | 2s |
| Same, proof TTL 300s instead of 120s | 60s | 58s | 2s |
| Same, first claim delay 4s | 60s | 61s | -1s; denied |
| Same 16 due, 8 concurrent/two waves | 60s | 115s | -55s; denied |

The code admits refresh only within 60s of proof expiry and retains 30s completion cooldown (migration0110). Each occupied invocation can consume 55s including its bounded receipt. Therefore longer proof TTL alone does not enlarge the discovery window, and “more parallel workers” cannot remove claim latency, network tails, database contention or aggregate pacing. The current planner deliberately reserves queued waves and unknown latency; preserve that fail-closed behavior.

There is a separate allocation blocker: the strict successful path needs 20 GETs. Even ideal just-before-expiry 300s renewal requires at least 172,780 GETs/workspace over 30 days under the existing planner; 16 need 2,764,480. The example's 10,000 allocation minus 2,000 other reserve leaves 8,000. Its repeated 32,000-read/hour run ceiling projects 23,040,000/month and also fails admission. These are source arithmetic, not a finding about the actual Stripe account or a per-GET price. Do not raise a JSON number, buy capacity or assume an exception to make the example pass. Actual due-window renewals and retries can consume more than the ideal lower bound.

## Recommended staged remediation design — not implemented/enabled here

### A. Preserve authority, first improve bounded execution efficiency

Keep zero grace, proof age at most 300s, paid-period end, signature/account/mode/tenant mapping, consent and generation-CAS fences unchanged. Continue fail-closed expiry on unverifiable/outage state. Use verified webhook receipt as prompt invalidation/wakeup, not as proof of payment. Never promise instantaneous detection of a missing/delayed event.

Build a per-account/scope bounded coordinator with one explicit leadership/epoch and durable claims; keep global GET pacing across the selected topology, not 16 starts/sec per independently scaling process. Coalesce redundant work by tenant/binding revision; prioritise earliest actual `valid_until`, changed/restrictive events and missing initial proof. Duplicate wakeups must not create duplicate concurrent refreshes. Cancellation/revocation must invalidate queued and running commits. Keep reads/permits scoped and account-wide durable counters conservative across restart. Measure database queue/claim, permit wait, each provider phase and receipt completion separately without identifiers/secrets in public telemetry.

Do not run provider IO under database locks. Reserve receipt time independently of the provider deadline; timeout must leave authority denied/unchanged and a safe retry state, never extend `valid_until`. Existing 45s provider/ 55s receipt bounds remain until a separately tested change is reviewed.

### B. Reduced-read authoritative candidate, default off until accepted

Existing seven-GET shadow code proves an independent comparison path, not replacement paid authority. Reuse only its validated immutable original consent and exact scope/customer/subscription/price/terms/policy lineage. Split reviewed static catalogue auditing from current financial verification. Coalesce repeated identical reads within an attempt, but **do not blindly promote the shadow cache**: it removes repeated-observation race detection. Retain fresh critical subscription/invoice/payment/charge/refund/dispute consistency checks immediately before a generation-fenced commit. Enumerate the exact endpoint/read ledger for the candidate and measure its actual reads; a hoped-for7 GETs or assumed9 GETs is not evidence.

No global stale provider cache, webhook-only paid grant, unknown/new-purchase grant or fallback service role. Paid initial purchase still requires complete current strict evidence and exact assent. Negative/unknown state cannot extend access; refunds and disputes must concern the actual evidence payment. Race tests must cover restrictive changes between early and final observations, not only the happy-path read count.

Target for engineering evaluation, **not an operating setting or claim**: a refresh-specific provider budget 15s and total receipt 20s, with an admitted synchronized cohort no larger than 4 at first and measured one-account pacing. At the existing 16 GET starts/sec, 4×20 strict GETs need at least 5s for starts alone; 16×20 need 20s before latency and cannot fit that 15s target. Reduce the demonstrated cohort/read count or retain denial; do not claim all 16 workspaces fit. Initial measured claim/poll/jitter targets of 1s each give a one-wave planning envelope 23s and 37s discovery headroom under a separately adapted 20s receipt planner. Implement refresh-specific constants/planning inputs rather than accidentally reducing checkout dispatch budgets. If tests cannot sustain it, do not activate the candidate.

### C. Admission/capacity guard and SQL due-window option

Admit a new paying workspace only if an exact reviewed account allocation, process/DB concurrency, synchronized cohort and worst-case retry reserve fit both timing and durable read budgets. Compute caps from measured/pinned bounds and enforce them server-side; never turn a capacity planner result into entitlement authority. Preserve portal/webhook/refresh for existing customers while pausing new checkout when capacity is insufficient.

If an earlier discovery window is needed, propose it as an additive local SQL change to `claim_live_paid_refresh` with matching planner and boundary tests, not a deployed schedule tweak. Its lead must fit the actual selected policy TTL minus cooldown and safety margin; do not change existing TTL rows merely because the cap permits 300s. For an already-reviewed 300s policy, lead 180s gives room for two 58s attempts plus 30s cooldown (146s total, 34s margin), but successful renewal every 120s increases strict baseline reads to roughly 432,000/workspace/30days before retries. Earlier discovery alone therefore worsens allocation. Reject this as the sole fix. Do not use first-failure grace, 24-hour age or stale-proof extension to mask insufficient transport capacity.

### D. Exact local acceptance before any hosted request

Use virtual clocks and synthetic delayed/hung/429 transports to test: simultaneous cohort, staggered expiry, delayed first claim, slow budget reservation/receipt, leadership loss, two coordinators, restrictive webhook during reads, duplicate/reordered events, cross-account/tenant, crash before/after proof commit, lease/CAS conflicts and budget exhaustion across restart. No rejected/expired task may dispatch a queued provider read later. Native fixture windows must be separately coordinated under the shared lease, with fresh owned stores; no unrelated cleanup.

Compare strict/candidate decisions over the same synthetic corpus; explicitly test refund/subscription races that shadow caching loses. Require measured endpoint count and conservative monthly budget, then latency tails and full deadline behavior at the admitted cohort. Target at least 30s remaining discovery margin after the declared worst-case envelope; this is an engineering review criterion, not a customer SLA. Distinguish budgeted worst-case from observed percentiles. A bounded external outage still denies; no finite headroom promises uninterrupted service.

## Required later facts/approvals and policy boundary

No new pricing/grace/renewal decision is needed for this patch. Existing code could accept `DENY_WHEN_SCHEDULED`, but current reviewed mapping must keep END_OF_PAID_PERIOD; this change does not select another policy. Actual refund remedies and international eligibility remain separate existing review work.

Still required before activation: exact hosted payment-update/cancellation configuration and authorised repair test; measured timing/DB/pacing topology; actual provider-read allocation and reviewed operating caps; current terms/consent/mapping/admission versions; action-specific worker/scheduler deployment and rollback permission. Any provider/account setting mutation, new host/credential, spending or live charge needs its own explicit scope. No recommendation here changes a deployed schedule or permits real provider tests.

## Final local verification receipt

`docs/operations/evidence/payment-repair-local-2026-11-05.json` binds the four changed source/test file hashes, unchanged dependency lock and final TAP hash. Final focused billing/portal/paid-access/mode/checkout/HTTP/scheduler/budget suite: 234 passed, 0 failed, 0 skipped. Root typecheck, scoped Prettier, publication/secret scan (1,267 files) and diff checks pass. No native PostgreSQL cohort or application service was started; these are synthetic module/domain/transport checks, not SQL/hosted/provider acceptance. No full-platform CI or production build is claimed for this narrow server-schema change. Retained first failed fixture result is not relabelled a pass.
