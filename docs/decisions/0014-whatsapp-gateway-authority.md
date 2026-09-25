# ADR 0014 — Account-bound WhatsApp gateway authority

Date: 25 September 2026. Status: accepted for the transport-disabled local contract.

## Context

Phone numbers and Meta webhook fields are identifiers, not KXRA authority. The gateway must prevent replay, ambiguous project retrieval, model-selected permissions and stale delivery after revocation. Meta credentials and transport are not connected.

## Decision

Pairing starts from an authenticated KXRA account. A ten-minute one-use challenge binds the current organization-membership version, SHA-256 phone digest, WABA id and phone-number id. Only the dedicated WhatsApp worker may complete the exact challenge. The raw phone and challenge token are never stored.

Each active pairing has one explicit active project selection. Durable ingress is accepted only by the worker after application-layer raw-body signature verification. Provider event and message ids are unique. PostgreSQL rechecks account, legal, membership and project access before recording project context. Supported intents are a closed enum; human help carries no project retrieval. Media starts unfetched/quarantined and voice transcription cannot queue without consent and a clean scan.

Outbound responses are intents, not sends. They snapshot pairing and access versions, reauthorize current account/project/pairing/takeover state, and remain fixed to `adapter=DISABLED` and `delivery_state=NOT_SENT`. Revocation cancels active selections and pending intents immediately. The LLM receives no pairing, permission or project-selection authority.

## Consequences

AT-15/16 can be proved locally without a provider credential. A Meta webhook route, encrypted token custody, allowlisted media fetcher, production scanner/transcriber, model broker, human-takeover UI and delivery reconciliation remain separate staging work.

