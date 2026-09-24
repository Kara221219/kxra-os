# Routine approval and recovery playbook

Use this playbook only for the local/staging governed engine. It does not authorize an external message, upload, publication, spend, trade, Git mutation or deployment.

## Approve an exact version

1. Open **Routines** as an active KXRA owner.
2. Inspect trigger type/configuration, timezone/calendar, service identity, project scope, action graph, budget/concurrency, attempts/backoff, lease and notification policy.
3. Compare the displayed SHA-256 with the reviewed configuration artifact.
4. Record a meaningful review note and approve the exact version. A changed hash requires a new review.
5. Enable the manifest only when its service identity and every action remain bounded. Imported versions are draft and disabled by default.

## Plan or enqueue

For a schedule, choose one reviewed local date. PostgreSQL determines eligibility and UTC time. Business/exchange triggers require the exact calendar day to be recorded first. For an event, use one stable provider/event id; retries of the same event must return the same logical run.

No always-on local scheduler exists. Planning a slot creates authoritative queued state; it does not wake Trigger.dev or call a provider.

## Inspect recovery

1. Confirm the run lease has expired before recovery.
2. Inspect existing checkpoint sequence, hashes and outcome evidence; do not delete or rewrite them.
3. Run recovery under the dedicated routine worker role. The same logical run returns to an eligible retry state.
4. Reclaim it and verify the attempt incremented while prior checkpoints remain.
5. Before retry, confirm the manifest is still enabled, the exact version remains approved/current and the service identity remains active. Failed authorization must cancel protected work.

## Inspect outcomes and notifications

An unchanged successful run must be quiet. A changed outcome requiring review or a terminal actionable failure may create one intent. Confirm `adapter=DISABLED` and `delivery_state=NOT_SENT`; there is no operational sender. Escalate repeated terminal failures through the owner Work Log without changing evidence rows.

## Hosted activation gate

Before connecting Trigger.dev or a sender, add provider-specific tasks, least-privilege credentials, cancellation/replay tests, revocation immediately before every side effect, telemetry redaction, runbook ownership and staging evidence. Keep schedules and delivery disabled until the exact provider adapter passes that gate.

