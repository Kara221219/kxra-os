# ADR 0056 — Team-and-agent workspace replaces the manual workroom direction

Date: 16 October 2026. Status: implemented locally; hosted activation pending.

## Decision and scope

The owner explicitly rejected the manual advisory/workroom approach and requested Kylon-equivalent team/agent collaboration under KXRA branding, retaining the current design. This supersedes ADR 0055's **primary product direction**, not its studio retirement or data preservation. Brand Studio and Video Studio remain retired. Previous discussions and advisory reviews remain accessible as history; no records are deleted.

KXRA uses its existing Next.js, PostgreSQL, Supabase Auth and RLS architecture. Organisations remain the tenant boundary and projects remain the business context. New rooms add an explicit private-membership boundary. Organisation administration is not a bypass into private rooms. Models neither decide permissions nor execute financial calculations.

Public Kylon material informs behavior and prioritisation. No proprietary source, private implementation, logo or visual assets have been copied. The existing cinematic marketing journey and private KXRA visual system remain.

## Implemented vertical slice

Migration 0083 adds rooms, room memberships, connections, room agents, messages, runs, tasks and append-only events. The primary navigation now opens Workspace. Room creation, membership, messages/replies, agent configuration, model connection metadata, scoped text generation, run history, cancellation, per-agent pause/resume, task proposals, human decisions and optimistic task transitions are persisted. Global Tasks, Approvals and Run History include room records under the same room RLS without copying their contents into broader registers. The homepage now requests workspace enquiries rather than a sprint package; the public pricing page describes separately scoped workspace setup.

A model connection belongs to its creator and is explicitly delegated through a room agent. The API supports OpenAI Chat Completions, Anthropic Messages, Gemini generateContent, OpenRouter and operator-configured OpenAI-compatible HTTPS endpoints. This is **protocol support**, not a guarantee that every model or personal AI subscription can be connected. Desktop coding agents require a separate bridge, not an API-key adapter.

## Security and execution

Every application operation uses the existing verified server identity and authenticated RLS transaction. New tables expose read policies and narrow mutation functions. A private room requires active project access plus explicit room membership. The room creator manages membership and approvals, subject to current project access. Contributors may chat, request drafts and propose tasks; viewers read only.

API keys are AES-256-GCM encrypted with tenant and connection identifiers as authenticated data. The vault key is server-only. Column grants prevent direct credential reads. Dispatch and completion functions also require the dedicated `kxra_app` database session, preventing browser/PostgREST identities from forging provider completion. The server never returns provider keys.

Requests use fixed provider URLs or operator-approved endpoint names, HTTPS, public IPv4 DNS validation pinned to the outgoing socket, no redirects, bounded response size a five-second DNS deadline and a 25-second HTTP deadline. Model results are untrusted text. There are no model-controlled tools, external sends or shell execution in this slice.

Context is the selected message or its thread, at most 40 messages and 48,000 characters. It includes no automatic cross-room/file retrieval. Every run records the selected context identifiers and a hash of the submitted system/context envelope. A second access check precedes publication. Additive migration 0084 rechecks delegated connection ownership authority as well as the requesting user; revoked owner membership or project access suppresses output and future dispatch. Failed/partial/refused responses are not labelled success. Cancellation prevents result publication but cannot guarantee the provider has not billed already.

20 run attempts per account per rolling 24 hours; one active request per account; maximum 1,200 output tokens. These are bounded usage controls, not a priced subscription or monetary budget guarantee. No automatic retries of billable requests.

## Not yet parity

No signed-in Kylon comparison was possible. This change does not implement a connector marketplace, a local Codex/Claude bridge, visual app builder, autonomous multi-tool workflows, live presence, desktop/mobile clients, agent memory management, scheduled agent runs or subscription metering. Existing KXRA registers for agents, skills, routines and approvals are retained; they are not silently represented as this new engine's execution features. See the completion matrix for precise acceptance gates.

No production deployment, hosted migration, real credential use or external send was performed, in accordance with the current workspace instructions.

## 19 October extension: shared room knowledge and reviewed instruction versions

Migration 0085 adds explicit bindings to existing same-project shared indexed file versions, immutable room instruction versions and approved agent bindings. Selected excerpts and reviewed instruction versions participate in bounded draft generation with persisted hashes; current provenance is checked at retrieval, admission, pre-provider readiness, completion and historical run reads. The current UI/design and earlier data are preserved. See [the implementation record](../workspace/room-knowledge-next.md) and [verification](../workspace/verification.md) for evidence and pending checks.

This is a bounded instruction-skill engine with no arbitrary code or external tools. Private-room uploads need a complete file/record policy design; owner-only sources are rejected. Governance-library rows are not automatically released. Message-only mode excludes file/skill context. Memory, durable jobs/schedules, bridges, live-provider acceptance and commercial activation remain unfinished. No hosted migration or external action is authorised by this extension.

## 19 October extension: reviewed room memory

Migration 0086 implements immutable typed entries scoped to one room and agent. Human review, bounded expiry, explicit thread-request opt-in and exact memory IDs/hashes supplement the existing source checks. Source runs must be successful same-agent room runs without memory inputs, preventing recursive learning chains. Revocation, expiry, removal and source withdrawal affect recall, pre-dispatch checks, publication and historical output. Removal redacts title/body while concealing retained fingerprints from authenticated readers. There is no company-wide summary, cross-room recall or automatic learning. Current acceptance is recorded in [memory](../workspace/room-memory.md) and [verification](../workspace/verification.md); earlier missing-memory statements are historical. Durable execution/schedules, tools/bridges, live-provider acceptance and activation remain outstanding.

## 19 October extension: local durable draft queue

Migration 0087 and the application Jobs flow add fixed-context draft intents, one-off due instants, immutable attempts, fencing leases, bounded pre-dispatch retry/recovery and cancellation. The ephemeral fixture worker authenticates through normal loopback HTTP; no database/service credential, OS service, scheduler or persistent access is created. Exact actor/tenant/room/source authority is rechecked, and output remains in the original provenance-gated run. Admission/dispatch and run/job completion are atomic. Lost post-dispatch completion is uncertain and never automatically replayed. Hosted execution remains inactive. This is a draft queue, not approval-backed tool/action execution or recurring scheduling. Current evidence and limits are in [durable execution](../workspace/durable-execution.md) and [verification](../workspace/verification.md).

### 0088: reviewed daily fixture schedules and scoped audit export

The original 0087 queue remains the execution primitive. Immutable creator-proposed/reviewed daily definitions pin its prepared context; PostgreSQL resolves IANA gaps/folds, deduplicates ticks/occurrences and applies overlap/latest-due catch-up/budget policy. Pause/revoke and current source/session validity gate pending work and late publication. Source withdrawal also hides the aggregate review fingerprint. Authenticated local draining expands occurrences before claiming one job; hosted workers, webhooks and tool/action execution remain inactive. Pending controls are prioritised within bounded catalogs; full history pagination remains separate work.

Creator-only CSV event pages export allowlisted metadata under current RLS, with exact bigint pagination, formula protection and no prompts/output/people/source IDs/secrets/fences. Full local acceptance plus subsequent focused hardening/current artifact checks are recorded separately in verification.md. Preserved preview data survives the additive 0088 upgrade; do not rewrite now-applied 0085–0088. The user-approved pilot offer remains a separate deterministic entitlement/billing-acceptance task with charges disabled.

## 20 October additive0090 acceptance

Room CRM conversion uses immutable exact source/version/hash review and explicit idempotent same-room atomic execution. Pilot entitlements are empty opt-in FIXTURE tables with frozen offer identity, immutable receipts, real membership/invitation reservations and organisation-locked admission/publication/cancellation. Trusted execution mode is transaction-local and derived by the server from verified fixture auth plus guarded loopback environment, never body/JWT metadata/profile provider. The optimized job-run lookup preserves current room and provenance checks. Full local288service/62private+6skips/42public per mode and three builds pass at90migrations/195protectedtables/184functions. See workspace contracts/verification and operations/staging-release-sequence.md; no hosted/provider/payment acceptance implied.

## 20 October0091 isolated test billing acceptance

Separate test-provider config/bindings/intents/immutable event receipts and one fresh-owner RPC extend opt-in pilot entitlements. A narrow existing billing-worker role records validated test-only signed facts; no table DML, service-role fallback, new hosted credential or account mutation. Customer/price/product/amount/quantity/provenance binding and org locks prevent browser grants and duplicate/out-of-order activation. Invalid signed known offers only quarantine/deny; canonical reconciliation is version-fenced, terminal cancellation cannot resurrect. Direct session URL reads require current tenant/fresh MFA/original requester. Full295service/62private+6skips/42public per mode/all3builds precedes a separate SQL-only eight-boundary session-read hardening proof; current inventory91/199/185. Provider config stays empty/disabled in the preserved preview. Actual hosted/payment/worker acceptance is pending; see workspace/pilot-stripe-test.md, verification.md and operations/staging-release-sequence.md. Applied0091 is frozen; next0092.
