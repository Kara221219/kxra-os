# LIVE workspace entry integration — local source only

Base: `53f037c10ab982332386ccfdc943ebb630e7ddad`. This isolated slice changes workspace entry presentation and adds a private read projection. It does not configure providers, dispatch work, enable checkout, alter offers or apply hosted SQL.

## Authority and compatibility

- `workspace-start.ts` reads `kxra_private.own_member_live_workspace_access()` before considering the legacy pilot presentation. Its LIVE result delegates entitlement to0104 `live_paid_entitled`; it never computes paid authority from checkout returns, client state, a Stripe status string or a missing owner report.
- Migration0108 returns exactly lane (`LIVE` or `PENDING`), entitled, reconciliation_required, quarantined and proof_valid_until. There are no request/provider/customer/price/product/session/subscription IDs, plan details or billing actions in the member projection. Every read requires trusted `kxra_app` session/current selected active membership and active account/organisation. Modern reads additionally require verified Supabase account provenance and a customer organisation. All existing tenant membership roles may see their own access outcome; billing administration remains CUSTOMER/ORG_ADMIN only.
- PENDING is a read classification, not a new billing lane or admission. It applies only to an existing verified hosted self-service ledger before a LIVE intent, excluding LEGACY lane/history. Such a tenant remains blocked by the existing104 entitlement rule. The projection never inserts a lane, binding, identity, membership or entitlement. Explicit LEGACY and local fixture behavior stays on the original pilot branch.
- Current verified billing state is independent of signup/entry-enabled GUCs. Turning off new signup cannot erase an existing member's paid/blocked outcome.
- Owner details use the actual0104 `live_paid_access_status()` result, restricted to CUSTOMER/ORG_ADMIN. A small parsed summary verifies the approved29/79/199GBP catalogue rather than rendering the old49/test offer. Members receive no summary or `/billing` action. Modern administrators receive a link to the separately disabled `/billing` flow, with no payment/dispatch success claim.
- The existing legacy billing copy, subscription/fixture checks and `WorkspacePilot` controls remain in the non-modern branch. The original result shape is retained there. Modern unpaid members see “New work is disabled”/history navigation instead of the prior `billing:null` → “Open work” assumption. Each API operation still enforces its authoritative access gate.
- Missing/expired paid-proof freshness is presented as blocked. The entry component refreshes at proof expiry; this is display behavior only and cannot extend server access.

## Verification

`node --import tsx --test tests/live-workspace-start.test.ts`:6 passing pure/rendered tests. Covers unpaid/PENDING/quarantine/reconciliation, expired or absent proof, rejection of owner fields in member DTO, approved owner catalogue, non-admin action omission, admin `/billing` navigation and separation from the preserved legacy branch. Root TypeScript check and modified-file Prettier/whitespace checks pass.

Automatic native test SOURCE, **not executed by this worker**:

- `tests/live-workspace-start.db.test.ts`: strict generated local fixture, owner-private Unix socket/runtime, credential-free explicit connection and actual no-TCP/socket verification; PENDING before first intent, LIVE unpaid after intent, prior LEGACY history/fixture null projection, forged selected tenant, anonymous/revoked/unverified denial and paused-signup GUCs. All writes are synthetic and rolled back.
- `tests/live-paid-access.db.test.ts`: all original104 assertions retained. Added member projection checks at the existing genuine synthetic Team paid-proof commit: a normal member must read entitled=true with exactly the five allowed keys, no customer ID, and no owner104 billing DTO. No authority function is mocked or replaced.

## Remaining acceptance

Merge reserved0107 before0108 and update aggregate migration count;0108 adds one private function, no exposed KXRA RPC or protected table. Owner must run the native tests against the exact combined source, including the new104 proof assertions, and then browser/API regressions for LIVE admin/member unpaid/paid/expired/reload, PENDING, LEGACY and fixture flows. This worker ran no DB, browser or application server and does not claim those results.

Production build/artifact and hosted acceptance also remain owner gates. Confirm0107 preserves the authoritative0104 helper/DTO contracts on integration. Provider execution, payment collection, commercial terms and real customer activation are not established by this UI work. Existing runtime admission flags, signup flags, database policies, live site, staging holds and source publication remain unchanged.
