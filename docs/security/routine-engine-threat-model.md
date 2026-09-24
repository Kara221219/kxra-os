# Routine engine threat model

Status: deterministic local contract. Trigger.dev, provider delivery and production workers are disconnected.

| Threat | Control | Evidence |
| --- | --- | --- |
| Registry prose is executed as code | Versions require a typed action graph and exact hash; only known action kinds/fields pass database validation | Migration and routine tests |
| Draft or changed definition runs | Approval binds the expected SHA-256; enablement and planning require the approved current version | SQL and HTTP tests |
| Forged tenant/project/service identity | Current owner context is derived in the transaction; project scopes and service identity are stored relations, never accepted as authority from a model | RLS/access matrix and crafted-ID HTTP tests |
| Duplicate clock/event delivery | Unique organization/version/project/logical-key rows produce one run for one slot or event | Duplicate-slot test |
| DST or market-calendar error | IANA timezone conversion is server-side; business/exchange runs require an explicit recorded open day | Europe/London and XNYS tests |
| Worker uses browser authority | Private worker functions require `kxra_routine_worker`; browser roles cannot execute them or mutate run evidence directly | Function grant audit and direct-DML denial |
| Worker dies after side effect | Checkpoints append before later steps; expired leases recover the same run and retain prior checkpoints | Lease-expiry/reclaim test |
| Revoked routine retries | Requeue repeats enabled/current-version/service-active checks and cancels unauthorized work | Disable-before-retry test |
| Run silently sends externally | Notification records are intents only, fixed to disabled/not-sent; no sender or provider credential exists | Schema constraints and tests |
| Notification storm | Unchanged success creates no intent; terminal actionable failure or changed review outcome has one idempotent intent | Quiet/failure tests |
| Checkpoint/outcome tampering | Checkpoints and intents are append-only; run transitions are bounded functions with audit projections | Trigger and access tests |

Remaining staging risks include Trigger.dev replay/cancellation semantics, long-running distributed leases, provider idempotency, secret custody, telemetry redaction and revocation between the final database check and a provider-side action. Each provider adapter needs its own threat model and acceptance evidence before enablement.

