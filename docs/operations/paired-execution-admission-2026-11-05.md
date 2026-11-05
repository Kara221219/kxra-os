# Paired execution launch admission — local contract, 5 November 2026

Base: integrated **d60a463941bc10430dccf359f8b189a4d6e1107e**. Separate clone/branch `codex/paired-execution-admission`; original dirty work, integrated checkouts, frozen release and previous paired checkpoints are preserved. No other branch is merged.

## Assessment and bounded deliverable

The integrated code has real local fixture pairing/tasks and a deliberately stub-only Codex supervisor. It has no genuine production pairing schema/admission, installed CLI acceptance, complete tool-isolation proof or accepted customer-local commercial auth route. Fixture118/119 and extension cohorts remain forbidden by the hosted release guard. The default real CLI constructor still refuses; production paired/bridge entries remain503 and integration entries404.

The missing handoff is an exact, single-use launch admission: a reviewed task must not authorize a different binary/configuration, host, account binding, source or session, nor be dispatched twice after an uncertain acknowledgment. `packages/workspace/paired-execution-admission.ts` implements that orchestration with mandatory trusted ports and **no production defaults**. It is an unwired server-side component; synthetic port acceptance does not establish working production pairing.

| Boundary | Implemented locally | Verified | Still required |
| --- | --- | --- | --- |
| Input/identity | Strict task/fence/attempt selectors; server context is separate; no caller roles, tenant, approval flags or runtime claims | Extra authority fields and foreign tenant/account/session/room/task/fence deny | Verified server identity and genuine authenticated RLS port |
| Reviewed source/runtime | Exact approval content hash, explicit active room membership, independent runtime reviewer, auth-review binding and full immutable snapshot digest | Changed sources/revisions, self-review, wrong purpose, stale/expired review and every runtime fingerprint deny | Server review schema/policy and independently authenticated evidence |
| Measured launch | Executable/schema/config/tool-policy/isolation/host/auth/model digests; compiled text-policy fingerprint; two measurements and current reads | Artifact drift before/after consumption and withdrawal while awaiting measurement deny | Same immutable measured artifacts at actual launch, externally enforced containment and accepted installed version |
| Single dispatch | Mandatory atomic consumption before execution; task/fence uniqueness across attempt IDs; exact permit/digest/realm/continuity binding | Concurrent attempts execute once; lost consume ACK executes zero times and is not retried | Independently durable irreversible consumption, restore fencing and production ledger implementation |
| Publication | Bounded draft, current authority recheck, exact permit/digest receipt; mandatory atomic publication fence | Revocation, cancellation, expiry, malformed receipts and lost publication ACK withhold success/replay | Transactional source/membership/paid/review/device/permit validation and durable room/thread receipt |

## Authority and port contract

`executeAdmittedPairedText` returns ADMISSION_UNAVAILABLE without ports. `PairedAdmissionPorts` must be constructed in trusted server/workload code, never from JSON/model output or a device's self-reported acceptance flags. The measured hashes and ACCEPTED review values are synthetic fixtures in tests; no actual authority record, signing key, credential, grant or reviewer is created.

`readCurrent` must resolve the task under current verified identity, tenant and explicit room membership, and reject unless existing account/session/device, paid entitlement, terms/business/provider policy, approval and source authority are current. This helper does not decide prices, grace, eligibility or commercial permission from hashes. The future server read must not reuse a fixture principal/token, free-form declaration or unrelated AI/GitHub review as paired execution acceptance. Runtime and auth reviews must be independently issued/revocable and scoped to the exact device/session/realm/customer/runtime subject. The current operator BUSINESS/AI review surface does not supply this paired runtime review automatically.

`measureRuntime` must authenticate a fresh workload/host measurement, not echo expected digests. It must cover the executable bytes, generated protocol schema, effective loaded configuration, actual tool/isolation policy, host identity, exact provider/auth binding and selected model. A self-signed device assertion or an on-disk pathname is insufficient. Digests are metadata bindings; they do not prove an OS sandbox or provider entitlement.

`consume` must atomically recheck the same current authority and irreversibly consume one task/fence across all attempt IDs before acknowledging CONSUMED. An application-only counter restored from backup is insufficient for potentially billable external dispatch; its production realm/continuity authority and independent durability/restore fencing must be reviewed. ALREADY_CONSUMED never authorizes execution. Lost, malformed, overlong-lived or cross-realm receipts are uncertain, with no retry.

`execute` must recheck authority at its own launch boundary, honor the permit and launch the SAME immutable measured executable/config/schema/policy, using pinned handles or an immutable artifact identity. Reopening a mutable path after a hash check fails this requirement. It must refuse if the binding cannot be proven, honor abort and own child/descendant cleanup. Generic repeated measurements cannot close an OS use-time race. No production executor or OS permission change is supplied here.

`publish` must recheck current authority, exact source/task/fence and permit inside its database transaction and store one original-room/thread receipt. The preceding read is not a substitute for its atomic fence. A lost publication ACK may conceal an already committed receipt; it remains UNCERTAIN and must be reconciled through status, not replayed inference.

Snapshots, selector objects, measurements passed to ports and executor payloads are copied/frozen. Exceptions become finite nonsecret outcomes. No token, raw provider error or credential is returned. Before consumption, failures are BLOCKED; once consumption is attempted, failure/timeout is conservatively UNCERTAIN. No branch retries consumption, execution or publication.

## Deadlines and review findings

A25-second maximum local orchestration deadline is checked with monotonic time as well as the abort timer, so delayed timer delivery cannot authorize a late new action. The abort deadline tightens to the earliest task lease, runtime review, auth review or permit expiry; wall-clock expiry is checked too. Caller-supplied aborts propagate. A noncooperative port can still complete a side effect after the local deadline: the production port must enforce its own validity/fencing and cleanup, and the helper reports uncertainty rather than claiming cancellation retracts provider billing.

Independent source review identified expiry not shortening active execution and a missing immutable-artifact launch requirement. Both are fixed, with cooperative expiry-abort tests and an explicit executor contract. An earlier additional current read after final measurement closes the orchestration's stale-read window; actual launch/publication still require the trusted port fences above. Final source review reports no remaining concrete findings in this bounded unwired component; it did not independently execute tests.

## Local verification and scope

The final focused command is:

`node --import tsx --test --test-concurrency=1 tests/paired-execution-admission.test.ts tests/paired-runtime.test.ts tests/native-bridge-production.test.ts tests/production-release-strategy.test.ts`

The13 new admission cases cover exact positive flow; selectors/default denial; all runtime fingerprints; foreign scope/purpose/approval/source; independent reviewer and review expiry; measurement/consume/dispatch withdrawal; concurrent operation IDs; lost consume/publication ACK; cancellation/expiry during generation; forged permits; noncooperative ports; delayed timer delivery; and cooperative abort at each applicable expiry. Existing runtime and production entry denial checks are retained. A first expiry fixture wrongly returned a permit beyond review expiry and correctly failed; the synthetic receipt was fixed to the earliest authority deadline without weakening validation. Earlier logs remain in the ignored runtime.

No database, browser, provider CLI or native fixture was started by this slice. No SQL or migration inventory changed. Production denial tests prove no downstream RPC/pool invocation; no database RLS acceptance is newly claimed. No shared native lease was needed or removed. The selected baseline tests invoke only guarded local Node code or the checked-in inert protocol peer.

Final source-specific checks, exact file hashes, OS build/budget and commit identity are recorded in `.runtime/paired-admission-manifest.json`. This source does not claim canonical/full-platform CI or actual production execution.

## Integration and live-acceptance gates

Integrate the complete delta afterd60a463 into a separately reviewed candidate. It is not a deployment/migration manifest, permission grant or activation. No production route may be opened solely because this helper returns DONE with test ports.

Before production wiring: implement genuine nonfixture identity/device/task/review schema and least-privilege RLS/ACL; bind existing paid/terms/business/provider authority; install independently durable one-shot consumption and rollback continuity; implement authenticated host measurements and immutable launch/egress fencing; implement atomic publication/status/recovery. Review port behavior with native RLS/HTTP negatives, deterministic revocation races, restore/older-snapshot replay denial and actual process isolation tests. Those implementations are absent here.

Real installed CLI/version/schema validation, deny-all tool/startup/plugin/MCP/app/browser/process/filesystem/egress acceptance and the unresolved commercial customer-local subscription gateway question remain separate. Customer API-key and subscription auth are different routes; this helper assumes neither is eligible. Any actual credential/auth flow, one provider request/spend, persistent device pairing, installation/background service, TLS/hosted endpoint, hosted schema/configuration change, push or deployment requires its own explicit action/target approval. None occurred.

## Final local result

Final focused acceptance: **26/26**, zero failed/skipped (13new admission cases plus13existing runtime/production-boundary cases), in `.runtime/admission-acceptance-final.log`. Root typecheck/format lint passes in `.runtime/admission-lint-final.log`; dependency policy, disabled public snapshot, marketing boundary and1274-file/six-pattern secret scan pass in `.runtime/admission-boundaries.log`. OS production build passes with generated configuration restored;23pages and largest compressed route **203,945/204,800bytes**, recorded in `.runtime/admission-os-build.log` and `admission-budget.json`.

`release:check` remains intentionally BLOCKED with authorization:false on fixture migration0118; `.runtime/admission-release-check.log` retains that result. No guard, inventory or byte limit was relaxed. Independent final source review has no remaining concrete findings in this bounded unwired component. Full canonical CI, database/HTTP/UI end-to-end admission and real provider/tool isolation are not claimed. No service was started, no fixture lock was taken, and no owned cleanup remains pending.
