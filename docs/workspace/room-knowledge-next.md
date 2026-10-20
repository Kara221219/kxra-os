# Next operational slice: room knowledge

19 October 2026. Implemented and verified locally in migration 0085. Final full CI passed: 267 service/security tests, 54 private journeys (six intentional skips), 42 public journeys in each development/optimized mode and all build/recovery/security gates. Evidence: `.runtime/workspace-parity/knowledge-final-ci.log`. No private-room uploads, external calls or arbitrary code skills are implemented.

## Implemented boundary and evidence

`team_room_files` binds room/organisation/project to an existing indexed file version with composite foreign keys. `team_skill_versions` stores immutable instruction text/hash/version plus human review state; `team_agent_skills` explicitly binds approved versions to same-room agents. Direct authenticated writes and anonymous reads are denied; narrow mutations use verified room authority and append redacted events.

DECISION: bounded source and skill ID/hash arrays on `team_runs` provide the run provenance instead of a separate relation. The trusted application-only admission function validates every selected reference/hash under current room/source/binding authority before atomically storing it. The arrays are bounded to three entries per resource type, run table writes are denied, and read/completion policies revalidate every reference. This does not relax source permissions or copy file text into a broader knowledge store.

Search intersects active attachments with original RLS, current indexed version and shared-record eligibility before ranking. Ten full excerpts of at most 8,000 characters are returned; users select up to three, and messages/files together must fit 48,000 characters. Downloads perform guarded original delivery plus a second room/attachment/source check before bytes are returned. Owner-only files are rejected even when their owner is a current room member.

Skills are executable **instructions for draft generation**, not arbitrary scripts or tools. Only the room creator reviews the immutable version and attaches it separately. At most three skills apply, sorted by name/version/ID; platform restrictions, room guidelines and agent role take precedence. An approved new version does not replace an old binding. Revoked versions can be detached in the UI. Message-only requests exclude file and skill context.

Admission, immediate pre-provider readiness, completion and historical run RLS recheck resource authority. Detachment, version/lifecycle changes, hash mismatch, skill revocation or binding withdrawal block use and hide derived output in room/global reads. Client history rendering also filters previously loaded outputs against current eligible resources on refresh; this cannot recall already downloaded data. Existing record visibility is immutable; tests assert that changing it is rejected rather than bypassing that guard.

Focused evidence is preserved in `.runtime/workspace-parity/knowledge-focused-2.log`; final active-tenant, version replacement, exact-review and cached-history cases passed in `.runtime/workspace-parity/knowledge-final-ci.log`. The first full attempt `knowledge-full-ci.log` failed only a stale dashboard table-count assertion; its strict expected count was updated to 185 and the complete rerun passed. No live model or production scanner claim follows from the deterministic fixture.

## Existing code and the missing boundary

- `supabase/migrations/0039_secure_file_and_knowledge_lifecycle.sql` defines immutable file versions, scan/extraction evidence, indexed chunks, leased processing jobs, delivery receipts and knowledge-query receipts.
- `packages/storage/index.ts` supplies private immutable object adapters and bounded extraction/chunking; `packages/storage/worker.ts` runs the existing processing lifecycle.
- The main OS API already creates/finalizes uploads and calls `authorize_file_delivery` before reading bytes, then `complete_file_delivery` before returning them. Reuse that guarded delivery protocol where its original project/record scope is appropriate.
- `apps/os/lib/data.ts::search` retrieves records/chunks under authenticated RLS, filters project scope and ranks at most 20 results. The chunk policy requires current indexed file/version and original record access. This does **not** establish private-room scope.
- `team-workspace.ts::runTeamAgent` currently includes only authorised messages; `team_runs.context_ids` is explicitly validated as message IDs. Do not put file/chunk IDs into that array or silently call global search to expand the prompt.

The key gap is an explicit, revocable association between a room and a source version, plus provenance on each generated run. A project ID or membership alone cannot grant private-room access.

## Safe first delivery

Start with explicit attachments of **already project-shared, indexed files in the same project**. Room membership governs the association and retrieval; original file/record RLS still governs the source. An owner-only file must not become readable to the entire room through a generated answer. A room attachment must not widen source visibility. Do not call this private-room upload support.

New private-room uploads require a separate file/record policy design covering **every** existing read path: owner/project search, chunk retrieval, file versions, delivery, exports and derived runs. Creating a `project_shared` file for a private-room upload would expose it outside the room. The existing organisation-owner record policy cannot silently become a private-room bypass.

Use an additive migration with tenant/project/room/file/version composite relationships, explicit authenticated read policy and narrow audited attach/revoke functions. Read and mutate as the verified authenticated actor; no service-role retrieval. Contributors can select an existing shared source only while currently authorised for both room and source. Never infer a grant from an LLM response.

Search must join active room attachments with accessible current indexed chunks **before** ranking/returning snippets. Bound query length, result count and total returned characters. Exclude quarantined/rejected/failed/stale/replaced source versions. Do not return object keys or signed URLs in search responses. Link downloads through the existing delivery boundary only after current room/source checks.

For agent use, exact chunk and skill IDs/hashes are pinned on the run as described above. Include evidence inside the bounded context envelope; count files and messages together toward the character limit. Preserve message-only mode. Label file content untrusted, supply no tools and generate citations from verified server metadata rather than trusting model-produced URLs.

Run admission, provider dispatch and completion must recheck room, connection delegation, active attachment, shared-source eligibility, source/version lifecycle and current record permission. Visibility change or source/attachment revocation must suppress in-flight output even when the requester is an owner. A room-readable output cannot contain a source readable only by its requesting author. Extend run-read policy and global summaries to account for source provenance so historical derived output is not a back door after source permission changes. Do not rely only on HTTP post-filtering.

## Required acceptance

1. Synthetic upload → existing scan/extract/index worker → explicit same-project shared-file attachment → scoped search → synthetic agent draft → persisted verified provenance/citation. Reopen and verify persistence.
2. Owner outside a private room, other room, other tenant, revoked account/project/room member and direct authenticated-role SQL all receive no association, chunk, snippet or derived output. Existing project-shared source visibility remains independent of hidden room association.
3. Reject owner-only, wrong-project, quarantine/rejected/failed, stale-version and forged chunk references at DB and HTTP layers. A model cannot assign IDs/roles or choose arbitrary file/object paths.
4. Change record visibility, attachment state, current source version, lifecycle and connection authority separately during a run; completion withholds output and new dispatch fails. Historical run/global-view access also respects current provenance policy.
5. Concurrent attach/revoke and repeated request IDs are idempotent; replacing a version never silently changes a pinned run. Source removal excludes later context retrieval.
6. Browser: attach, search/no-results, clear, revoke, retry errors, citation/download denial, keyboard/mobile/reflow; exact model context hash excludes inaccessible chunks. No live provider, production migration or external send is required or authorised.

The shared-file/instruction-skill slice is locally verified. Private-room uploads, semantic search, arbitrary code/tool execution, governance-library import, hosted scanning and real-provider acceptance remain unimplemented or unverified. Room memory is the next active stage; durable execution follows. Later source changes require their own acceptance.
