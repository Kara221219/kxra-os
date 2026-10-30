# Room operations: smallest activation approval packet

Prepared locally on 30 October 2026 for implementation commit `4a21b80263e2a0ba78624b4781cd2914c3ffb5c0`. This packet changes no implementation file, setting, credential, grant, trigger or hosted state. Independent integration and QA may supersede this exact revision; any resulting SQL/code changes require a new bound packet before approval.

## Recommended approval boundary

Approve a **protected staging acceptance run**, not production unattended execution. Use one existing approved requester, one private room, one existing provider connection/model, one queued draft and one reviewed daily definition with `max_occurrences=1` and expiry within 24 hours. Permit at most **two provider dispatches**, each requesting at most 1,200 output tokens. Confirm no other executable grants can be issued through this acceptance deployment. Stop the one-hour trial after its two terminal results or the first uncertain outcome.

The flag in this candidate is environment-wide. It does **not** enforce a tenant/requester/room/model allowlist or a global spend ceiling. Its persisted grants are individually scoped, but every otherwise eligible customer reaching an enabled deployment can issue their own grant. Do not describe a production flag flip as a single-tenant canary. Such a canary requires a separately reviewed admission allowlist, or the owner must explicitly approve all eligible tenants after production acceptance and operational gaps are closed.

| Approval item | Concrete requested scope | Boundary still requiring release owner confirmation |
| --- | --- | --- |
| Source and artifact | Reviewed integration of `4a21b80`; no Auth route changes | Final merged SHA, CI/CodeQL/QA/security receipts and built artifact hash |
| Vercel target | Historically recorded OS staging project `prj_D9QZEnDEy4CaPnvBKJcXgAr2Gnww`, team `team_rcuJ4xQGKvLPetIFH3ceILH6` | Confirm current project identity, exact deployment ID/HTTPS origin, branch/environment scope, protection and region; local historical records are not fresh verification |
| Database target | Historically recorded staging Supabase project `jlebgsxcvhvpueuibekd` | Confirm actual ledger/hash, restricted `kxra_app` login, verified TLS/CA, target identity and backup/restore point |
| Customer scope | One existing requester + tenant + private room + connection + model; one one-off request ID + one daily definition ID | Record these exact opaque IDs in the private acceptance receipt; none is inferred or supplied through a worker wakeup |
| Execution window | One hour, one wakeup per minute, stop once two results are terminal | Exact UTC start/end, authorized operator and current platform spend allowance |
| Excluded targets | Production Supabase `lhbgeucifxxcdoyrnesf`, production `app.kxra-group.com`, marketing/email-worker projects and billing scheduler | No credential/configuration change or wakeup on these targets under the staging approval |

The project IDs above come from repository operations records only. No remote target reconciliation was performed in this follow-up, as instructed. Missing target/deployment/scope values are **approval blockers**, not permission to choose an arbitrary host.

## Migration allocation and exact database permissions

Proposal: `proposals/hosted-room-operations.sql`, SHA-256:

`3a2534f127e3d48d6aeabb859614bb56c93ed084be741a671278824458c72b1a`

The local baseline has 112 contiguous migrations, 208 protected `kxra` tables and 201 exposed `kxra` functions. If no other owner has allocated the next number, the proposal can become **0113** through the release migration workflow. If billing or security already owns 0113, allocate the actual next contiguous number after their reviewed migrations. Never overwrite/reorder/renumber an existing migration or assume this packet grants migration execution. A filename move alone does not change the SQL hash; edits do.

With this proposal alone the inventory delta is **+2 protected tables, +2 exposed `kxra` functions**, giving 210/203 and 113 migrations. Recompute the final merged manifest/inventory if other migrations are included. The new dedicated worker schema is not an exposed Data API schema.

| Object/capability | Exact permission needed | No additional authority required |
| --- | --- | --- |
| Existing app login `kxra_app` | Existing NOINHERIT, non-superuser, NOBYPASSRLS login and existing ability to enter `authenticated` | No new login/role, administrator connection or service-role fallback |
| `kxra_room_worker` schema | USAGE for `kxra_app` only | PUBLIC/anon/authenticated schema access explicitly revoked |
| `kxra_room_worker.next(uuid)` | EXECUTE for `kxra_app` only, with raw app role and fixed 5-second discovery statement timeout | Cannot accept caller-selected actor/tenant/room/grant; no grant discovery by customer roles |
| `team_execution_grants` | Authenticated requester may read only `id,target_id,expires_at,revoked_at` under RLS | No direct authenticated insert/update/delete, provider key or connection fingerprint read |
| `team_worker_deliveries` | Private receipt writes through discovery | No direct public/anonymous/authenticated access |
| Grant issue/revoke | Authenticated scope through existing app identity; issue requires AAL2 and MFA timestamp no older than 600 seconds | Requester/tenant/room/connection/session/membership bindings are derived/rechecked server-side |
| Existing job/schedule RPCs | Existing `session_user='kxra_app'` checks retained, with exact worker target filtering | No all-tenant queue claim, arbitrary role setting from a body or owner bypass into private rooms |

The proposal creates **no triggers** and schedules nothing. It adds two empty RLS-protected tables, one schema, six functions, one explicit fairness index and associated constraints/ACLs, while replacing three existing function bodies. Audit writes reuse existing infrastructure. Installation and ACL verification require the existing approved migration operator; the scheduler receives no migration or database privileges.

## Secret custody: one new purpose, no generated value

| Name | Purpose | Approved recipients/storage | Effective privilege |
| --- | --- | --- | --- |
| `KXRA_ROOM_WORKER_SECRET` | Dedicated room wakeup bearer, 64 hexadecimal characters encoding 32 random bytes; value to be generated only after exact approval | The exact OS staging deployment's server-only environment and the single approved scheduler's secret store/process environment | Can request a bounded traversal of existing grants in that deployment. Cannot choose an actor/tenant/room, issue grants, read provider secrets or directly mutate the database. A stolen bearer can cause extra wakeups and consume already-authorized provider budgets, so it is still sensitive |
| `KXRA_HOSTED_ROOM_JOBS` | Admission/execution gate, default `false` | Same exact OS deployment environment | `true` works only with Supabase auth mode and a structurally valid room bearer; it is a global gate within that deployment |
| `KXRA_ORIGIN` in scheduler | Exact HTTPS origin, with no path, query, credentials or trailing slash | Approved scheduler configuration | Restricts this CLI's destination. No redirects are followed |

The server already needs its restricted `DATABASE_URL`, verified database CA configuration and model vault setup for an existing approved connection. They remain server-side and are **not** copied to the scheduler. An absent/mismatched vault or provider connection is a blocker, not authorization to create/rotate a vault key, provider key or provider account. Do not reuse billing keys, `CRON_SECRET`, auth access/refresh tokens, customer cookies or deployment-protection secrets as the room bearer.

Never place the bearer in a URL, repository, public/`NEXT_PUBLIC_` variable, build output, issue body or log. Protection authentication is a separate platform boundary. This CLI has no deployment-protection bypass header, and no bypass credential is requested by this packet. A protected deployment that needs one requires a separate reviewed delivery design and exact credential scope before the trial; do not make the application public merely to reach the worker.

## Delivery and scheduler choice

The supported application request is:

- POST to the exact approved origin plus `/api/internal/room-jobs/drain`.
- `Authorization: Bearer <room secret>` in a header, JSON containing only a newly generated `request_id` UUID.
- No actor, organisation, room or grant fields; such fields are rejected.
- At most one selected grant and one claimed draft per request; response includes only processed/state. No-store, 256-byte/eight-chunk/two-second body bounds, 60-second function duration, 45-second lease, 25-second provider transport deadline and five-second DNS/discovery bounds.

The included launcher is `node --import tsx scripts/team-hosted-job-worker.ts --once`. It makes one request with a 55-second client deadline and no automatic retry. It is not a daemon or installed schedule.

Smallest infrastructure choice: an **existing, owner-approved POST-capable scheduler** or an existing approved process host invoking this finite CLI every 60 seconds for one hour. Its credential has HTTP wakeup authority only. No suitable registered scheduler was verified offline; if none exists/has approval, scheduled activation is blocked. This packet does not purchase or activate a queue, workflow platform, VM or paid scheduler.

Vercel Cron sends **GET** to production URLs, whereas this endpoint implements POST. It therefore cannot directly schedule this candidate. A GET adapter would be a separate code/auth/target change, and preview acceptance cannot be assumed to receive production Cron invocations. Vercel documents daily-only Hobby scheduling and minute cadence on Pro/Enterprise. No plan change is requested. [Cron request behavior](https://vercel.com/docs/cron-jobs), [Cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing).

Transport retries, if an approved POST scheduler has them, must reuse the same delivery UUID. The included CLI does not persist/reuse a UUID across separate invocations, so configure the one-hour trial without automatic process retries; the next regular minute tick handles persisted work. Do not interpret HTTP timeout as proof that no provider request occurred.

## Capacity and cost decision

One least-recently-served candidate is selected per wakeup. Each grant has a 60-second delivery cooldown; each requester has one active lease and a global rolling-24-hour admission limit of 20 runs shared across their rooms/tenants and on-demand work. Existing queue and definition budgets still apply. No global tenant-count or dollar cap is implemented.

| Wakeup cadence | Selections/hour, theoretical ceiling | Wakeups/day | Wakeups/30 days |
| --- | ---: | ---: | ---: |
| 60 seconds | 60 | 1,440 | 43,200 |
| 300 seconds | 12 | 288 | 8,640 |
| 900 seconds | 4 | 96 | 2,880 |

These are **scope selections**, not successful jobs. Every ACTIVE schedule is a discovery candidate even before its wall time, and invalid-but-unexpired authority can consume a selection before validation rejects it. Let A be continuously eligible candidates, including those schedules. With one serial wakeup each c seconds, an ideal fair traversal is about A×c seconds, plus execution and delivery jitter. It is not a measured latency guarantee. At A=10 and c=60, a traversal is about ten minutes. A one-off grant expires one hour after its due time, so an unbounded global backlog can exhaust its execution window. A daily definition admits only its latest due local day, not every missed day.

For the proposed one-hour staging trial: **at most 60 scheduled HTTP requests** and at most two approved provider dispatches, assuming only the two acceptance grants can exist. These limits need the protected staging scope; the production flag does not enforce them. No fee change or zero-cost guarantee is implied.

Illustrative gross compute arithmetic, **not an account quote**: at 43,200 requests/30 days, 2 GB and the documented `iad1` Fluid rates ($0.128 active CPU-hour, $0.0106 GB-hour, $0.60/million requests), average 1-second wall time/0.05 CPU-seconds gives about **$0.36/month**; average 30-second wall time/0.5 CPU-seconds gives about **$8.43/month**. The account's actual region, memory, plan, remaining credits and observed timings were not inspected. Scheduler, DB, logs, transfer, protection, provider costs and taxes are excluded; failed requests also count. [Vercel compute pricing](https://vercel.com/docs/functions/usage-and-pricing).

Provider cost needs the exact existing model and approved account rates before approval. Requested output is capped at 1,200 tokens per dispatch (2,400 across the proposed two-call trial; 24,000 across 20 runs for one requester/day). Input context is limited to 48,000 JavaScript string code units **plus system/instruction content**, not a guaranteed token count. For model rates P_in/P_out per million tokens, successful-call cost is `(input_tokens×P_in + output_tokens×P_out)/1,000,000`; interrupted/failed calls may still incur provider charges. No reliable dollar ceiling follows from these token settings alone. Record a separately approved provider-side spend ceiling or keep provider acceptance blocked. Do not create a new provider limit/key/account under this packet.

## Revoke, suspend and rollback

1. Stop the specific scheduler first. This prevents new wakeups but does not recall in-flight work or disable authenticated manual drains.
2. For the approved scope, use existing authenticated job cancel and schedule PAUSE/REVOKE controls, preserving requester/room authority. With the capability enabled, pause/revoke revokes the stored grant before job/schedule locks; publication transactions and revocation serialize on the grant. Already completed outputs remain in authorized history; already received provider work cannot be recalled.
3. Deploy reviewed configuration with `KXRA_HOSTED_ROOM_JOBS=false`; do not assume editing an environment value instantly changes already-running deployments. Pause/revoke/cancel remains available. Old in-flight invocations may retain old configuration, which is why persisted target revocation/cancellation precedes reliance on the flag.
4. If the bearer is compromised, stop delivery and authorize removal/rotation in **both** named stores and redeployment as a separate exact operation. No rotation is performed here. Removing the bearer also disables this capability's gate, but does not retroactively undo provider work.
5. For application rollback, deploy the last approved artifact with this capability off and preserve the additive tables/receipts. Do not drop the schema, replay a provider request, or rewind run/attempt/audit rows to manufacture success. Database rollback/restore requires a separately reviewed concrete plan; this packet requests no destructive SQL.

Grant withdrawal covers application session-version change, membership-version/state change, expiry, account/room/entitlement withdrawal and connection configuration fingerprint changes. A durable grant is not a stored browser session: plain browser logout or external provider-session revocation is not independently checked against `auth.sessions` here. Approval must accept that delegation persists until its explicit expiry/revocation/application authority fences, or QA must require a different reviewed policy.

## Reconciliation, retention and monitoring: actual behavior and decisions

**Implemented:** ordinary validated drains reconcile eligible jobs. An expired pre-dispatch lease can retry up to three attempts; a lost post-dispatch outcome becomes UNCERTAIN and is never automatically replayed. Stop controls fence late output. Schedule uncertainty pauses future occurrences when its validated tick reaches reconciliation.

**Not implemented:** an autonomous reducer for abandoned grants after expiry/revocation/authority loss, a retention/pruning service, or an operator-only aggregate backlog health API. Discovery excludes expired/revoked grants; authority loss can make validation fail before tick/reconciliation. Jobs can therefore remain QUEUED/LEASED/DISPATCHED in storage until an authorized reduction/reconciliation occurs. A deadline is not an automatic stored-state transition. Do not relabel those jobs successful or assume browser inactivity cleans them up.

For the one-hour protected trial, the authorized requester/operator remains available to use scoped GET job/schedule history, cancel/pause controls and existing platform status/latency logs. Proposed stop criteria: any UNCERTAIN result; three consecutive 503s; any authorized wakeup returning 404; or no confirmed delivery for three 60-second intervals. These are proposed manual acceptance criteria, not already installed alerts or message automations. Monitoring must not introduce an owner bypass into another tenant's private room.

At 60-second cadence, normal scheduled delivery creates 1,440 new UUID receipts/day, including no-candidate wakeups; replaying an existing UUID adds no row. Extra new-UUID requests add rows beyond that scheduled estimate. All receipts are currently retained. A 30-day raw-delivery retention proposal would be 43,200 normal scheduled rows, but no deletion job exists and byte/storage cost was not measured. Any pruning changes the maximum durable wakeup-replay horizon. It must preserve job/run/attempt idempotency and existing audit/customer retention requirements; do not delete these records under a receipt-cleanup approval.

Before production unattended use, approve and implement a **bounded, reduce-only reconciliation/retention capability**, with exact allowed tables/states/horizon, no provider dispatch/publication, private aggregate metrics and tenant/authority-withdrawal tests. No administrator/service-role fallback or broad table mutation should be given to the wakeup scheduler. Decide the retention duration and replay horizon with the existing retention policy; this packet does not invent a legal retention period.

## Owner decision batch and present status

The smallest approval request is for the staging target/artifact/SQL plan, the single dedicated secret's two stores, one approved POST delivery mechanism for one hour, the exact two test targets/connection/model and an explicit provider-spend ceiling. Fill the unresolved identity fields and obtain integration/QA receipts before presenting it for execution.

Production activation is **not ready for approval** while tenant rollout scope, protected delivery, provider-dollar budget, autonomous abandoned-scope reconciliation, monitoring and retention are unresolved. The alternative release scope is the already supported verified on-demand room workflow, with unattended/recurring execution explicitly excluded. No persistent secret, scheduler, cloud role/trigger, provider setting or hosted step was performed to prepare this document.
