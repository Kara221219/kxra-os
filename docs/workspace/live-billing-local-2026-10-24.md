# Default-disabled live billing integration — local source only

The existing approved Stripe catalogue is reused, not recreated. Existing customers, legacy FinanceVision prices, subscriptions and bank/legal/tax settings are untouched. New source requires explicit reviewed activation, terms and tax mapping and the exact KXRA Group account/catalogue before a genuine provider operation. No keys, provider resources, checkout or hosted schema were activated.

## Source components and boundaries

- Live catalogue/session contract: fixed API/account/catalogue/GBP/month/workspace/seat identity; canonical server intent; injected bounded transport; no client authority or automatic uncertain POST retry. Session output cannot grant entitlement.
- Migration0100: default-disabled private RLS activation/mapping/binding/intent/hash-receipt/conflict ledger. One permanent checkout reservation, exact actor/tenant/MFA/legal review, once-only claim, immutable completion, event-hash conflict quarantine and reconciliation generation. No entitlement writes. Existing roles receive narrow function capabilities only when a future migration is separately authorized; no role/login/credential is created here.
- Migration0101: retains every ACTIVE mandatory legal obligation when its document is retired or wording changes. Exact approved document/current acceptance required; diagnostic count matches eligibility. Existing function signature/ACL/security/RLS remain. Explicit requirement retirement, unlike document retirement alone, removes the obligation.
- Read-only Basil invoice/payment evidence: actual fixed invoice -> allocation -> PaymentIntent -> Charge reads with account/mode/customer/catalogue/GBP/amount/period/refund/dispute checks, repeated observations and mandatory DB-generation recheck. Outputs are evidence only, not entitlement or payout authority. Multi-allocation/out-of-band/adjusted invoices are explicitly UNVERIFIED v1.

## Acceptance state at preparation

135 pure injected-transport/command tests and root typecheck pass. New SQL and real two-transaction tests are prepared for sequential owner execution in a fresh native private Unix-socket fixture; no SQL pass is claimed until its receipt. Synthetic tests hard-refuse hosted/credentialed targets and run automatically under local CI; no silent opt-in skip. Committed synthetic concurrency records remain in that disposable cluster; finally restores disabled activation/mapping without deleting immutable evidence.

Migrations101 / KXRA protected tables208 / exposed functions201 are the expected integrated inventory. Private live-billing tables add deny-all RLS and explicit no-table-grant tests. Earlier82-to97 recovery and prior99 signup acceptance do not accept100/101. The complete combined source still needs aggregate tests, exact limited-clone rehearsal and guarded hosted plan before any rollout.

## Launch gaps that remain

Fresh customers need a separate live customer-creation intent/binding and onboarding selector. Existing sandbox selection creates workspace_pilots and must not be converted or reused for live checkout. Durable reconciliation/invoice proof must be wired to authoritative entitlement/seat enforcement with generation locks; current event/session snapshots never grant access. Secure provider endpoint/secret binding, actual sandbox lifecycle/tenant acceptance, reviewed tax/terms and separate live activation remain. No income or bank-settlement guarantee is made from account status or fixtures.
