# WhatsApp and worker foundations

The approved target remains Meta WhatsApp Business Cloud API with Sol as the ordinary partner capability and optional owner-authorized Astra escalation. Available API IDs, contracts and data-processing terms must be verified before enabling provider calls; desktop model labels are not proof of public API availability.

Implemented now: raw-body HMAC signature verifier with timing-safe comparison; cryptographically random pairing challenge helper; private pairing and inbound-event tables; event uniqueness; explicit disabled UI/API states. There is no registered webhook, pairing completion, outbound message, media download, transcription or LLM call.

Required delivery sequence: verify provider signature over exact bytes → deduplicate provider event → resolve verified phone/account pairing in server code → verify active account/current project assignment → select explicit authorized project or ask for disambiguation → retrieve only authorized shared data → call model with scoped evidence and tool allowlist → validate citations/output → recheck pairing and project authorization before send → log actual delivery result. Never use a model to resolve authorization. Revoked pairings, stale assignment versions, ambiguous project choices and unsigned/replayed requests must fail closed.

Documents/images/voice notes require authenticated media fetch with allowlisted provider origins, bounded size/type, quarantine scanning, approved retention and transcription consent. Task proposals and ideas are drafts; no financial spend, publishing, membership change or trading authority comes from chat text.

Trigger.dev remains the worker target. There are no registered jobs in this slice. Before dispatch, implement narrowly scoped job capability tokens (actor/project/action/expiry/access version), deduplication, retry ceilings, owner budgets, cancellation, worker-side current-authorization checks, actual Agent Run Log entries and fail-closed provider adapters. Routines remain definitions, not schedules.
