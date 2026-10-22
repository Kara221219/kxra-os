# Operational case apps: local acceptance

22 October 2026. Scope: Remodeling CRM, private Recruiting Workspace (roles and applications), and Travel Desk. These are persistent local application models, not provider integrations or public sample state. Hosted rollout and payments remain disabled.

## Implemented scope

Migration `0095_operational_case_workflows.sql` adds room-scoped records/actions with immutable review snapshots, exact source/parent versions, seven-day expiry, creator-only review/application, idempotent receipts, audited changes and the existing paid-access guard. PostgreSQL remains authoritative under authenticated RLS. API input is strict, actor/organisation are server-resolved and mutating requests require the same origin. Recruiting records require a private room, including SQL mutators and read policies.

- Remodeling records property, scope, exclusions, a manually entered GBP estimate and next milestone. Decimal amounts convert to integer pence with exact arithmetic. Scope changes reset review; the final handoff is immutable. No quote, contract, deposit or financial ledger entry is issued.
- Recruiting records distinct role requirements and linked applications. Applications require an open role in the same private room. Changed role criteria invalidate pending application review. Stage changes record explicit human review; the app does not rank applicants, decide eligibility, hire, send invitations or generate offers.
- Travel records enquiry dates, party reference, destination, itinerary proposal and exclusions. Invalid or reversed dates are rejected. Edited proposals require fresh review. No booking, payment, supplier send or passport/visa validation occurs.

Each room view offers search, stage counts/filtering, pagination, structured edits, review snapshots and receipts. Failed transport does not optimistically advance a stage. Lost acknowledgements retry the same request rather than duplicating work. Source and authority are rechecked before applying a change.

## Verification custody

Source-matched isolated harness: `/Users/kara/Documents/Codex/2026-10-19/task/kxra-cases-acceptance-ykj_5frt`, loopback preview `http://127.0.0.1:3289/os/workspace`. Private Unix-socket runtime: `/var/folders/1b/rx87jbks7ysd9v3n0dgym53w0000gn/T/kxra-wb-6QoB84`; nonsecret identity receipt `reference-workbench.json`. Local Next root override exists only in the harness to enclose the shared dependency link.

Earlier failures are retained: `/tmp/kxra-cases-acceptance.log`, `/tmp/kxra-cases-final-source.log`. The latter ended with 14 browser passes and four failures locating populated edit textareas. The correction gives edit controls explicit accessible names independent of their default contents. Original failure traces/screenshots are preserved in `/tmp/kxra-cases-populated-label-failures`, rather than silently replacing the evidence.

The first label-corrected rerun passed five of six browser journeys; the remaining mobile review assertion stopped at five seconds, while the server logged that route at 5.093 seconds. Its trace is retained in `/tmp/kxra-cases-five-second-review-failure`. Only that state assertion now waits up to 15 seconds; no state/security assertion was removed or replaced by a fixed sleep.

`/tmp/kxra-cases-verified.log` subsequently passes all six case browser journeys and all four case API/security contracts. The unchanged prior-app inventory passed all twelve applicable journeys in the preceding broad run. Together these accept the 18 relevant desktop/mobile app journeys against this slice. The fourth HTTP contract additionally proves room revocation and the same actor in another organisation cannot read records or reviews at both the HTTP and authenticated SQL layers. SQL checks within each transaction are sequential.

Remaining final regression/build outcomes are recorded below after completion. No claim of a clean complete repository-wide suite is made from focused acceptance. Accounts, email, billing records and model output in these fixtures are synthetic; PostgreSQL transactions, persistence, RLS and HTTP/browser behavior are real local execution.

Checkpoint: the final run has now terminated. The 15 Creator/Sampling and billing contracts pass. The 32 compatibility contracts ended **25 pass / 7 fail**; all seven fail at `knowledgeUpload` setup with 409, before their memory/schedule assertions. Read-only aggregate inspection of this repeatedly used isolated fixture confirms the active `file_upload` rate bucket has reached50; migration0043 enforces50uploads/hour. No counter, quota, data or guard was reset. The next verification must use a new disposable fixture store, preserving this evidence and original data. The driver correctly stopped before the final build, so that build and a verified source commit are still pending. Root typecheck and scoped formatting pass. The native-agent bridge is not yet implemented.

## Launch boundary

No push, private deployment, hosted migration, credential/provider activation, billing change or staging-hold restoration. Public source `665a6c0` remains live. Generated `apps/os/tsconfig.json` changes are preserved and excluded from this commit; no denied restoration was retried.

The native-agent bridge remains a separate implementation/acceptance item. Hosted schema was last verified at 82; an eventual exact candidate now includes migrations through 95 and needs a fresh plan, backup/recovery scope, isolated restore/configuration evidence and reviewed rollout/rollback. Excluding the three consumed encrypted invitation-delivery records is still an unanswered recovery decision, not the only launch gate. Real provider/worker/scanner/session/two-tenant acceptance, approved commercial terms and Stripe sandbox lifecycle acceptance remain outstanding. See the separate read-only Stripe readiness report; no customer or billing-history changes were performed.

## Final accepted source

Fresh source-matched harness `/Users/kara/Documents/Codex/2026-10-19/task/kxra-cases-fresh-m41gsvx6`, preview `http://127.0.0.1:3290/os/workspace`, runtime `/var/folders/1b/rx87jbks7ysd9v3n0dgym53w0000gn/T/kxra-wb-UZIlNG`. `/tmp/kxra-cases-fresh-verify.log` ended **FRESH CASE COMPATIBILITY AND FINAL BUILD PASS**: all 32 compatibility contracts, 95 migrations/204 protected tables and final production OS build pass. Combined with 4 case and 15 Creator/Sampling/billing contracts, this is 51 API/billing contracts; six corrected case plus twelve earlier app/workspace browser journeys pass. Root typecheck (`/tmp/kxra-cases-final-typecheck.log`), scoped formatting and whitespace checks pass. Earlier failed runs remain retained and are not described as successful. The saturated fixture was preserved, with no quota reset or safeguard weakening.

All eight executable case source files match their accepted harness copies by SHA-256. There is no real provider or hosted acceptance inference. The native-agent bridge is the next separate local slice.
