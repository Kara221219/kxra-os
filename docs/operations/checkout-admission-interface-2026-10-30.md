# Checkout/admission integration boundary

Proposed interface for the separate admission engineer and release owner. Scheduler/billing owns dispatch, payment evidence, consent and paid-access authority; admission owns business declarations, jurisdiction/provider/tax review and its private storage. No114 migration or country allowlist is introduced by this billing candidate. This interface is not yet wired and is a required pre-activation integration gate.

## Worker contract

Before claiming a new CHECKOUT UUID and immediately before its provider POST, billing needs an existing-worker RPC, fixed by server mode, for example `kxra_private.checkout_sale_eligibility(uuid)` and its `staging_sandbox_` facade. Proposed private DTO:

```ts
{
  execution_scope: ModernScopeTag;
  request_id: string; // canonical CHECKOUT UUID
  org_id: string; // canonical intent/binding tenant, never HTTP input
  state: "ELIGIBLE" | "BLOCKED" | "REVIEW_REQUIRED";
  review_token: string; // SHA256 binding profile/review/source/tax versions
  valid_until: number; // server UTC epoch seconds
}
```

The RPC must read the canonical intent/customer/scope and actual review authority, never trust a caller-provided tenant, country, clearance or token. It must return non-ELIGIBLE for missing/expired/future/mismatched evidence, changed business profile, unresolved ownership/control/subnational or tax facts, and unsupported provider/payment/legal cases. Keep raw business/identity/evidence data out of this DTO and logs. A stored tax identifier or self-declaration alone cannot clear eligibility.

Billing will validate scope/request/org against canonical claim output, require ELIGIBLE, bind the review token to the original dispatch context and re-read it in `stillCurrent` before/after provider work. Changed/expired authority must stop dispatch/result delivery without replacing an uncertain UUID or inventing a successful charge. Permit fresh eligibility review before claim so a blocked case does not consume the checkout UUID. Existing provider-response/ledger/generation/terms gates remain.

## HTTP and existing-customer boundaries

Admission should expose own-tenant status only to the verified customer identity and require current MFA/legal authority for consequential declarations. New CHECKOUT requests need a mandatory server-owned eligibility predicate; missing predicate/evidence must deny, with a finite BLOCKED or REVIEW_REQUIRED response. Do not add a default-allow shim to make tests pass. Coordinate the exact DTO/RPC/ports before changing billing files.

Do not gate cancellation portal delivery, existing own-billing reads or lawful recovery/support on eligibility for a new sale. A sanctioned/unsupported renewal may also require a specifically authorized provider cancellation/hold process; blocking the UI or denying work alone does not stop Stripe's automatic renewal. No such provider mutation is performed by this source handoff. Already-issued hosted checkout sessions need an explicit expiry/revocation operating procedure; do not claim a later UI gate can recall a bearer URL already delivered to Stripe.

## Confirmed owner direction and copy

30October owner direction is customer-owned AI-provider accounts/costs and worldwide business-customer intent, subject to actual legal/payment/provider restrictions. GBP prices, seats and no-added-VAT direction remain; unresolved foreign tax treatment must block/review before charging, not silently add tax or claim global tax exemption. Admission must assess the actual supported providers/endpoints/models, not infer coverage from BYOK or a provider's logo.

The separate billing follow-up adds `customerAiPolicy` copy at plan selection and connection creation: provider credit is not included, the customer pays their selected provider directly, and authorised context transits KXRA to that provider. New real connections require a cost-responsibility acknowledgement; synthetic fixtures remain separate. Exact current workspace terms/checkout consent text must be reviewed/published and hash-bound by the legal/release owner. These product disclosures do not populate the empty public terms catalogue.

A fresh source check found Anthropic's current public supported-regions page labelled effective12November2026, later than the current30October task date. Do not apply that future-labelled version as today's policy without establishing the currently effective version. Store source/effective/review dates and test future-version rejection. [Anthropic source](https://www.anthropic.com/legal/supported-regions). Other primary-source restrictions and tax evidence are in the parent's legal/admission packet; no guessed geopolitical list is supplied here.
