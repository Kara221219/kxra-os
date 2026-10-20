# KXRA team workspace

This is the current product implementation, replacing the manual workroom product direction. Entry: `/os/workspace`. Public narrative: a business workspace for people, chosen models, scoped context and accountable work. The existing cinematic design is preserved.

The [19 October public audit reference](kylon-public-audit-2026-10-19.md) records externally observed capabilities and their limits. The [staged parity plan](parity-plan.md) maps them to actual KXRA code. These are implementation references, not proof of full parity.

## Use the local demonstration

1. Start the repository's isolated local environment using `npm run dev`; choose a synthetic identity at `/login`.
2. Open Workspace, expand Model connections and create a named connection. In local mode only `FIXTURE`, model `fixture-draft`, key `local-fixture` is accepted. This is synthetic and makes no provider call.
3. Create a room in a project you can contribute to. Private is the default.
4. In Settings, add an eligible project member. Membership cannot grant access outside the project.
5. In Agents, attach your connection and write the agent's role and objective. This delegates use of that connection to contributors in this room.
6. Send a message; Ask agent with the selected thread or Message only. The result and run status persist with the message.
7. Propose a task in Tasks. The room creator approves/rejects it and can mark approved work complete. Approval records work; it does not send or execute anything externally.
8. Pause/resume individual agents in Agents, or disconnect the model to block all attached agents. Existing conversation/history remains.
9. Use global Tasks to find accessible room work, Approvals for your room proposals, and Run History for accessible room runs. Private-room membership is enforced there too.
10. Conversations initially show the latest 100 messages. Use **Load earlier messages** to retrieve another authorised page, including up to 100 related run receipts. Loaded root threads become available in the reply selector. A failed load can be retried; a new message refresh retains loaded history. Older pages are read-time snapshots; reload and retrieve them again to refresh older run states. A full page reload starts from the latest page again.
11. Upload a **project-shared** text file through Files & knowledge; the local file worker started by `npm run dev` scans/extracts/indexes it. In a room's **Knowledge** tab, attach the indexed version, search its text and select up to three excerpts. Return to Conversation and ask an agent in thread mode. Server-generated evidence links download through current room/source checks. Private-room uploads and owner-only attachments are intentionally unavailable.
12. Propose an instruction skill in Knowledge. Reusing its name creates a new immutable draft version. The room creator reviews the exact text/hash, approves the version and separately attaches it to an agent. At most three approved instruction skills apply in deterministic name/version/ID order, subordinate to platform rules, room guidelines and the assigned role. Message-only mode excludes file and skill context. These skills are instructions used in draft generation, not shell scripts or tool execution.
13. Detach evidence, revoke a skill or detach an agent binding to block future use and historical derived-output reads. Old versions are never silently replaced. The UI also hides cached derived output on its next authorised refresh. Previously downloaded bytes cannot be recalled.
14. In **Memory**, propose a typed entry for one room agent. The room creator reviews the exact version, provenance, expiry and hash. Default expiry is 90 days, maximum one year. Select **Use approved memory** on a thread request to include at most five eligible entries. Memory stays in this room and agent; message-only requests exclude it. Withdrawal, expiry, source loss or removal hides derived results. Removal redacts the title and body. See [the memory contract](room-memory.md); current verification is tracked separately.
15. In **Jobs**, queue a fixed-context fixture draft now or after a one-off due instant (maximum seven days ahead). Use **Run next due draft**, or explicitly start the ephemeral fixture worker with `npm run dev -- --jobs partner` on a fresh/disposable local store. The preserved review store uses its guarded existing-store launcher to avoid reseeding. Jobs persist independently of the browser, with three bounded pre-dispatch attempts and fenced cancellation. A lost worker after dispatch records uncertainty and withholds output without replay. Inputs use browser-local time; the recorded UTC instant is shown. Hosted and recurring execution remain inactive. See [durable execution](durable-execution.md) for exact limits and current verification.

## Architecture

- UI: `TeamWorkspace.tsx`, `RoomKnowledge.tsx`, `RoomMemory.tsx` and shared `TeamActionForm.tsx`; existing private shell/styles.
- API: `apps/os/app/api/team-space/[[...path]]/route.ts`.
- Services: `apps/os/lib/team-workspace.ts`, `team-knowledge.ts` and `team-memory.ts`, with shared `team-room.ts`, using `packages/db` verified identity/RLS transactions.
- Provider boundary: `packages/workspace/provider.ts`.
- Database: migration `0083_team_agent_workspace.sql`, eight RLS-protected tables; migration 0084 tightens delegated-connection revocation; immutable message bodies, composite same-room foreign keys, explicit mutation functions, append-only state-change audit.
- Migration `0085_team_knowledge_and_skills.sql` adds three protected room resource tables, immutable reviewed instruction versions and bounded run source/version hashes. It extends run RLS and admission/completion to enforce current source and skill authority. See [the knowledge implementation contract](room-knowledge-next.md).
- Migration `0086_team_scoped_memory.sql` adds reviewed room memory with expiry, removal redaction, finite source provenance and pinned run memory hashes. Services use shared `team-room.ts`; `RoomMemory.tsx` adds review controls without widening the existing room boundary.
- Migration `0087_team_durable_draft_jobs.sql` adds two protected queue/attempt tables, safe metadata grants, immutable admission snapshots, exact enqueue/claim idempotency, bounded leases/retries and atomic run/job publication. `team-jobs.ts`, `RoomJobs.tsx` and the guarded HTTP fixture worker implement local-only execution; no OS scheduler/service or worker credential is installed.
- Previous workrooms remain `/os/workrooms`; owner reviews remain `/os/advisory-board` as preserved historical tools.

## Provider activation — not performed

Current workspace instructions prohibit production deployment and real credentials. The local fixture deliberately rejects real provider configuration.

When separately authorised for an isolated hosted staging environment:

1. Review current verification and migrations 0083–0087 with the existing guarded migrator. Never edit an already deployed migration. New expected inventory: 87 migrations, 188 protected tables and 176 exposed functions. No hosted migration is authorised by the current instructions. The queued-draft adapter remains fixture-only even if the schema is applied; hosted execution requires a separately reviewed implementation and acceptance.
2. Ensure the application connects as the dedicated `kxra_app` runtime login and assumes the authenticated RLS role per request. Do not substitute a service-role client or broad database login.
3. Generate a fresh 32-byte encryption key in the host secret manager and configure `KXRA_MODEL_VAULT_KEY` as 64 hexadecimal characters. Never use a public/browser environment variable. Back up the vault key securely; deleting it makes saved model credentials unreadable. Rotation/re-encryption is not yet automated.
4. Optionally configure `KXRA_MODEL_ENDPOINTS` as a JSON object mapping approved short names to full HTTPS Chat Completions endpoints. Never use customer-supplied arbitrary URLs. Current transport supports public IPv4 endpoints; private/local providers require a future authenticated bridge.
5. A user enters their own provider API key into the hosted Model connections form, selects the protocol and an actual model ID from their provider. API billing is separate from consumer ChatGPT/Claude subscriptions.
6. Run one synthetic, non-confidential prompt. Verify provider success, token usage and the persisted run; disconnect, retry and confirm refusal. No provider is currently certified by a real billed acceptance run for this new engine.
7. Review retention/processing terms and publish an accurate supported-provider list before customer use. Enable customer billing only after independent end-to-end commercial acceptance.

## Limitations that must remain visible

The local model is an explicitly labelled deterministic demonstration. Provider adapters have protocol-contract tests, not live-account evidence. Responses are drafts; tools, external sends, browser/computer control and provider-side cancellation are not implemented. Rooms use eight-second refresh, not real-time presence. Team tasks and runs remain authoritative room records; global Tasks/Approvals/Run History now include RLS-scoped room summaries and version-checked task actions. Messages currently show a generic team-author label except for the current user; richer team profiles need the next UI pass.

Knowledge limits: existing same-project shared indexed files only; ten search results of up to 8,000 characters each, three selected excerpts, and a combined message/file/memory context limit of 48,000 characters. Each instruction version is capped at 4,000 characters; at most three apply to an agent. File/skill/memory catalogs show up to 100 entries. Jobs, recurring definitions and workflow records/receipts have independent 100-row cursor pages. Memory text is capped at 2,000 characters and opt-in recall at five entries. Durable fixture drafts and one-off due instants have their own bounded contract; reviewed daily recurrence is fixture-only; no hosted execution is activated. No semantic/vector search, private-room upload policy, arbitrary code skills, automatic governance-library import, global memory summaries or automatic learning is claimed. Production scanning/provider/worker pipelines require separate authorised acceptance.

## Evidence sources, reviewed 16 October 2026

- [Kylon product](https://kylon.io/), [workspace](https://kylon.io/product/workspace), [agents](https://kylon.io/product/agents), [bring your own agent](https://kylon.io/bring-your-own-agent): public product behavior only; no signed-in test or private-code access.
- [OpenAI Chat Completions](https://developers.openai.com/api/reference/resources/chat): request/response protocol.
- [Anthropic Messages](https://platform.claude.com/docs/en/api/messages/create): headers, message format, token limit and completion state.
- [Gemini generateContent](https://ai.google.dev/api/generate-content): system instruction, content, usage and completion state.
- [OpenRouter chat](https://openrouter.ai/docs/api/api-reference/chat/send-chat-completion-request): compatible chat protocol.
- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security): explicit grants plus policies; no service-role retrieval.

Product claims in vendor material are EXTERNAL RESEARCH, not independent validation. Scope choices are DECISIONS. Future commercial uptake, willingness to pay and time savings remain HYPOTHESES requiring customer evidence. The pilot pricing direction is approved; charges remain disabled.

Current recurring-draft implementation/semantics: [recurring schedules](recurring-schedules.md). Verified locally by the 0088 full regression and subsequent focused privacy/catalog hardening; exact separate receipts are in [verification](verification.md). Open Jobs → Recurring drafts to propose/review daily fixture work, or Audit metadata for redacted CSV pages. Hosted scheduling is inactive. Approved pilot direction and pending entitlement/terms decisions: [pilot offer implementation](pilot-offer-implementation.md).

## 20 October current acceptance — 0089/0090

Full `launch-final-2-ci.log` exited 0: **288** service/DB/HTTP/security tests, **62** private browser journeys plus six intentional skips, **42** public journeys in each development/optimized mode, all three builds and all recovery/security/budget gates. Current inventory: **90 migrations / 195 protected tables / 184 exposed functions**. This is local fixture acceptance, not hosted or payment-provider acceptance.

- **Implemented/tested:** active-first job/schedule cursors and independent workflow-record/action pages; abort/dedup/retry UI; room CRM capture → exact creator review → explicit atomic conversion with immutable idempotent receipts; opt-in fixture pilot with frozen approved offer, actual five-person membership/invitation holds, lifecycle/reconciliation and entitlement fences.
- **Preserved preview:** http://127.0.0.1:3244/os/workspace. Guarded 0089+0090 upgrade preserved every original column in **191 tables / 1,397 rows**; no bootstrap/seeds/reset. Read-only normal fixture sign-in/anonymous denial and 11-room Workflow/Settings smoke pass; no demonstration record or pilot assigned, provider call or job worker activated.
- **Remaining:** other catalogs and independent global run pagination; conversion reviews are room-only, not in global Tasks/Approvals. More templates, profile/capability versions, isolated tools/coding bridge, original help/catalog and actual hosted/provider/scanner/worker/webhook acceptance remain. The pilot is not connected to Stripe subscription/customer/price/session events. Usage caps, VAT/refunds/cancellation/service terms remain unapproved. Checkout stays410/livemode:false.
- **Release:** [staging sequence](../operations/staging-release-sequence.md) records concrete source/target/backup/operator approvals and acceptance gates. Owner secure handoff stays separate. No remote mutation, credentials/access grants, external sends/spend, deployment or live charges.

This current ledger supersedes earlier pending/next-stage statements while retaining them as historical evidence. Full parity and hosted launch remain unfinished. Applied0085–0090 are frozen; next migration0091.

## 20 October current acceptance — isolated Stripe test contracts, final freeze

Full `stripe-full-1-ci.log` exited 0: **295** service/DB/HTTP/security tests, **62** private browser journeys plus six intentional skips, **42** public journeys in each development/optimized mode, all three builds and every recovery/security/budget gate. A subsequent **SQL-only session-read policy** change passed one focused test with **eight boundary assertions**, migration/RLS verification and type checks; runtime JavaScript was unchanged after the full run. Current inventory: **91 migrations / 199 protected tables / 185 exposed KXRA functions**. These are separate source phases, not a claim of a second full-platform run after the policy change.

**Implemented/tested locally:** separate test-only pilot checkout/portal/reconciliation adapter and owner API/UI; verified raw-body signature webhook; exact account/customer/product/price/GBP4900 monthly/optional19900 setup validation; immutable replay receipts; stale/tied event handling, denial-only invalid-offer quarantine, version-fenced canonical reconciliation and terminal cancellation. The real membership/invitation five-person boundary starts with a pending checkout binding; customer remapping immediately removes provider entitlement. Stored session URLs require the current tenant's fresh MFA requester even through direct RLS reads. No browser-selected price, customer, role or entitlement is accepted. Legacy studio checkout remains410.

**Not connected/accepted:** the provider config table is empty/disabled in the preserved preview. No real Stripe account/key/object/session/webhook delivery, invoice/refund accounting, paid setup fulfillment or hosted worker/provider/scanner acceptance is established. Hosted execution readiness stays unavailable regardless of key presence. VAT/refund/cancellation/service and proposed usage limits remain decisions; no public offer/legal snapshot or live charge is enabled. An abandoned checkout past23hours and resubscription after a bound terminal subscription require a reviewed recovery workflow; automatic recreation is intentionally unavailable.

**Preserved preview:** http://127.0.0.1:3244/os/workspace. Guarded0091-only upgrade preserved all original columns in **195 tables / 1,397 rows**, no seeds/reset/bootstrap. Normal fixture sign-in/anonymous401,11existingrooms and knowledge/memory/jobs/schedules/Workflow/Settings smoke pass. Pilot remains unassigned; no demonstration records, provider call or agent/job worker activated. App/file worker are ephemeral task processes only. Never bootstrap this store. Applied0085–0091 are frozen; next migration0092.

**Release:** [artifact contract](release-artifact-contract.md), [staging sequence](../operations/staging-release-sequence.md), [Stripe test boundary](pilot-stripe-test.md). Parent assembles a separate clean dependency-complete candidate from the final source manifest; no blanket stage/reset of the active tree. Staging82 hashes match per parent;0083–0091 remain additive. Vercel team-list403 is denied (no bypass); existing secure TLS operator/CA/backup inputs, owner handoff/MFA and actual hosted/provider acceptance remain pending. No commit/push/deploy, real credentials/account mutation, external send/spend or live charge occurred here. Full parity is unfinished. No further feature slice starts after this freeze.
