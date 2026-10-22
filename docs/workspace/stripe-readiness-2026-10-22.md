# KXRA Group Stripe — read-only inspection

22October2026, existing Safari session. Fresh final observation confirms signed in and selected **KXRA Group**, acct_1Rv3KdC84VkhhIRz. Initial PassPack account acct_1TtbSfEQpGaUiI7r was switched through the existing account menu; it is not KXRA Group.

- Account status: **Payments Active; Payouts Active; “No active tasks to complete.”** Cartes Bancaires payments separately Paused. Source: https://dashboard.stripe.com/acct_1Rv3KdC84VkhhIRz/account/status . Displayed UI status, not an independently fetched Account API boolean.
- Live-account UI context offers “Switch to sandbox”; Workbench says “Switch to a sandbox to set up a local listener.” No sandbox was selected or created.
- All-products catalogue displayed one row with previous/next disabled: **FinanceVision.Pro Professional**, Active, **£499 GBP/month**, product prod_T3Xj4sD8SJFRIa.
- Default price price_1S7QeGC84VkhhIRzqXACqsv1: flat rate, GBP, £499/month, tax behaviour **“Default (inferred by currency)”**, no other currency options. Source: https://dashboard.stripe.com/acct_1Rv3KdC84VkhhIRz/prices/price_1S7QeGC84VkhhIRzqXACqsv1 . It was not altered/reused as the proposed £49 workspace/optional£199 setup offer.
- Workbench → Event destinations displayed headers and no destination rows. Add destination/import-endpoints were not used. No delivery history/signing secret was opened. Successful KXRA webhook delivery remains unverified; do not infer that every legacy endpoint is absent.

No bank values, credentials, API/signing secrets, private payment/customer records, new account/login grants, settings changes, charges or messages. Current Safari sign-in succeeded; no repeat sign-in is needed.

Account-level active payments/payouts does not establish website checkout, approved plan/tax/portal mapping, secure runtime configuration, signed webhook delivery/reconciliation or real sandbox/card/3DS/renewal/refund acceptance. Those remain separately approved configuration and acceptance work. Recovery also needs fresh backup/restore/configuration and exact current rollout authority, beyond the three-record exclusion.

## Existing-customer impact and catalogue proposal

Further read-only observation in the same account:

- Customers list aggregate: **1–2 of 2 results**. Two customer records exist. Names, emails, bank/payment details and individual records were not opened or copied.
- The existing default price displays **0 active** subscriptions. The active-subscriptions page displays its onboarding empty state, rather than subscription rows. This does not establish that no historical, cancelled or otherwise filtered subscriptions exist.
- Payment links displays its onboarding empty state, with no link rows. No link was created.
- Product detail shows description, marketing feature list and attributes as em dashes, with tax category **General – Electronically Supplied Services**, `txcd_10000000`.
- The product edit form exposes name, description, image, product tax category, statement descriptor, unit label, metadata and marketing feature list, plus price controls. No field was changed. The form was cancelled, returning to the original product detail. Metadata values were not inspected, and API/event request bodies were not opened.

Non-disruptive proposal, pending exact catalogue and commercial approval: create separate KXRA Starter, Team and Business products/prices and explicit server-owned mappings. Keep the legacy FinanceVision product, £499 price, customer records and historical billing objects intact. Do not rename an existing invoice/receipt-facing product or migrate subscribers on the assumption that the visible active count proves there is no historical use. Any legacy rebrand, archive or migration needs separately specified scope after impact is established.

Parent's proposed new terms are **£29 / £79 / £199 per workspace per month**, with **1 / 5 / 15 users** respectively. These are **not approved or activated**. Proposed credit ceilings/budgets are also unapproved and not evidence of measured margins. No Stripe writes, checkout activation, subscription/customer changes or legal/tax/bank changes were performed. Existing public service offers remain unchanged.
