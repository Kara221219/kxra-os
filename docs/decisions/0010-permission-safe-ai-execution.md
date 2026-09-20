# ADR 0010 — Permission-safe AI execution and evidence delivery

Date: 21 September 2026. Status: accepted and implemented with a deterministic local model adapter; external model providers remain disabled.

## Context

Evidence-only Ask KXRA already required one authorized project and rechecked current record/chunk versions before delivery. It did not provide model synthesis, executable agent/skill contracts, a capability broker, deterministic AI budgets or complete run evidence. Calling a model directly from a request route would let application code bypass worker grants, lose retry/cost evidence and risk delivering an answer after membership or evidence changed.

The 13 Genesis agent and 12 skill definitions are source material. Treating descriptive registry text as executable authority would create autonomous-agent theatre and an unsafe implicit permission system.

## Decision

Store model policies, agent manifests, skill manifests and budget policies as typed, versioned records. Import the Genesis definitions as `DRAFT`. Add one narrowly approved local capability: `AGT-ASK` version 1 with `SKL-ASK-001` version 1, the fake Sol policy and zero-cost local budget. Draft, retired or unbound definitions cannot start a run.

Split execution into three authorities:

1. the authenticated request transaction verifies current account, selected tenant, legal gate and exactly one project, then creates a hash-bound run, locked budget reservation and immutable evidence envelope;
2. the `kxra_ai_worker` role may call only private claim, tool-evidence, finish and failure functions; a capability broker permits only tools bound to the exact skill version;
3. the authenticated delivery transaction atomically rechecks membership version, legal gate, project access, every cited source version/hash and the linked knowledge query before returning output.

The application persists hashes, typed status, exact evidence references, tool outcomes, token/cost usage and QA results. It does not persist raw questions or generated answer text in agent-run tables. The existing evidence remains in its authorized source records. The response is ephemeral and citations resolve only through the run envelope.

Budget reservation is deterministic PostgreSQL arithmetic under a row lock. Model output never grants permission, changes a budget or calculates financial authority. Sol is the default policy label. Astra requires both an escalation policy and a current database capability; no Astra policy is seeded. A non-fake provider cannot dispatch with a zero paid reservation.

Retries are capped at three. Each retry requires current authority and a new reservation, links to the previous attempt and receives the skill's per-attempt tool allowance. Invalid schema/citations/policy, timeout, provider error, changed authority and usage overage fail closed with typed evidence. Usage over a reservation enters reconciliation and is never delivered.

## Consequences

- Owner AI Team, Skills and Run History screens now read the typed registries and redacted run evidence rather than generic records.
- The local fake adapter is deterministic, makes no network request and is available only behind the guarded fixture environment. Production model mode returns `AI_PROVIDER_UNAVAILABLE`.
- External OpenAI retention, region, credential, rate-limit, spend and incident controls must be implemented and verified in staging before a live model policy can be approved.
- Routine scheduling, autonomous handoffs, external writes, publication, messaging, spending, deployment and trading remain unavailable.

Implementation: migrations `0045`–`0046`, `packages/ai`, the Ask route, typed AI views and `tests/ai-execution.test.ts`.
