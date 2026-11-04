# Local synthetic custody boundary

Base: `0912eb89332736a83e4a434d6d479c6cc5b5b3d4`.
Branch: `codex/github-custody-boundary-20261104`.
Worktree: `/Users/kara/Documents/Codex/2026-11-03/task-2/github-custody-boundary`.

This checkpoint moves the fake-token encryption key out of the application process and exercises a bounded asynchronous custody boundary through the existing GitHub adapter. It is not a managed vault deployment, live GitHub connection, production authorization system, durable-key implementation or launch/parity claim. No real credentials were accessed, and no real grants, persistent provider access, external provider actions, private provider queries, hosted changes, publication, push, deployment or spending occurred.

## Implemented contract and flow

`packages/connectors/github-vault-synthetic.ts` now accepts a `SyntheticLeaseCipher` port supporting asynchronous seal/open. The existing in-process fixture cipher remains supported and refuses custody-key labels. The broker re-resolves its SQL authority and compares the entire exact lease **after** asynchronous decryption, before returning a credential lease. Vault/connection revocation, account-session withdrawal, grant rotation, expiry or changed envelope/expiry therefore fails closed during the custody wait. Provisioning also re-enters the existing SQL authority check after sealing; no refresh, regrant, overwrite or retry fallback was added.

`packages/connectors/github-custody-synthetic.ts` implements that port using only literal `http://127.0.0.1:<port>` origins, fixed `/v1/synthetic/leases/seal|open` paths, a generated ephemeral fixture authorization supplied over owner IPC, and an explicit synthetic protocol. It refuses real vault/provider origins, URL credentials, paths, redirects, malformed/mismatched responses and non-JSON media types. Requests are bounded to 8 KiB; responses to 2 KiB, 512 reader iterations and a 1.5-second end-to-end deadline. It performs no automatic retries. Responses bind request UUID and context digest, and open accepts only the literal fake GitHub token. Neither real-token types nor remote-provider enablement were introduced.

`scripts/github-custody-fixture.ts` is a separate disposable child process requiring both explicit fixture configuration and owner IPC. It generates and retains all AES-256-GCM key bytes internally; neither the application client nor IPC responses receive encryption keys. It loads no encryption keys or real credentials from files, environment, keychain or KMS and performs no outbound requests; it reads only the existing synthetic fixture configuration. The owner receives a random fixture authorization through IPC; this authorization lasts at most ten minutes and is revocable. Browser Origin requests and HTTP administration are denied. Rotation, retirement and workload revocation controls exist only on the fixture owner's IPC channel.

The fake process retains up to eight key versions. Rotation selects a fresh version for new envelopes while retained versions can decrypt old envelopes; retirement destroys/removes the specified nonactive key. Immediately before a delayed open response, the process rechecks key residency, workload authorization and lease expiry. Retirement or workload revocation during that wait denies release. GCM authenticated data binds tenant, user, connection, credential reference, grant/session versions, exact provider target, scope, lease expiry and custody key version. The process bounds connections, request-body time and request count. Request rejection is idempotent, including slow-body aborts. Owner disconnect stops the listener and destroys its in-memory key buffers.

This remains a **fake custody workload**, not per-tenant vault policy enforcement. Possession of its ephemeral authorization permits operations on known fake contexts; real deployments must authorize each workload/tenant/context independently. Customer identity and grant authority are enforced through the trusted broker's scoped SQL before and after open, not inferred from caller-supplied context at the fake service. Raw client/cipher interfaces are trusted backend seams and are not customer APIs. Custody retirement does not recall plaintext already returned before retirement or revoke a real provider token; provider revocation remains a separate operation.

The existing `LocalGithubAdapter` remains unchanged: it accepts only loopback fake provider endpoints and the fixed fake token. The tests compose it with the asynchronous broker for a scoped provider read, exact approval, queue, single fake comment POST and durable outcome. Application reconstruction while the fake custody process remains alive does not need a key. Custody process/key loss denies existing leases; attempting a queued approved write afterward produces NOT_EXECUTED before sending, never mints replacement leases, and never replays a POST. No live provider adapter is enabled by this composition.

## Source and integration impact

Changed existing files:

- `packages/connectors/github-vault-synthetic.ts`: async port, versioned synthetic envelope validation and post-decrypt SQL check.
- `database/proposals/github-vault-receipts.sql`: accepts only the old memory label or bounded `synthetic-custody-key-vN` labels.
- `scripts/verify-github-vault-synthetic.mjs`: runs the new custody test file alongside the existing vault cohort.
- `docs/operations/progress.md` and `docs/operations/handover.md`: checkpoint handoff.

New files:

- `packages/connectors/github-custody-synthetic.ts`.
- `scripts/github-custody-fixture.ts`.
- `tests/connectors/github-custody-synthetic.test.ts`.
- This report.

No table, function signature, role, production route, baseline migration, integration installer/catalogue or unrelated feature lane changed. The DDL remains in the explicitly installed synthetic proposal; migration discovery remains 119 in this source and the separate frozen release remains untouched. Later integration overlaps are the shared broker, proposal, existing verifier and operational documentation above. The proposal must be installed into a fresh local extension fixture for testing; it is not an upgrade script for any existing hosted database.

## Verification and review

`node scripts/verify-github-vault-synthetic.mjs`: **29/29 focused passed**, comprising **15 new custody cases plus 14 existing vault/receipt cases**, followed by **6/6 existing wire checks**. Migration/RLS source verification passed: **119 migrations / 216 protected baseline tables**. Final runtime `/tmp/kxra-vault-proof-b0o01E`; log `/tmp/kxra-custody-proof-final.log`. Six custody children exited, no key files were created, the fake provider exited, PostgreSQL status was 3 and the own shared fixture lease was released (`cleanup=true`). All native runs use the existing shared native-fixture lease protocol; no foreign lease was removed.

Coverage includes custody/app reconstruction and custody key-loss restart; rotate/retire semantics; delayed retirement/workload revocation; cross-tenant/scope/session/envelope denial; SQL grant/connection/vault/session/lease changes during open; lease expiry; bounded malformed/oversized/empty-stream/redirect/stalled responses; slow authenticated request-body timeout with subsequent service health; startup timeout/invalid handshake cleanup; owner IPC disconnect; fake authorization/browser/administration boundaries; approved provider write only once and denied write after key loss; explicit fixture-only mode.

`npm run lint` passed (typechecking and repository formatting). `git diff --check` passed.

Aggregate current-source service/restart/restore regression passed **1,285/1,285 service cases**, dependency/migration checks, AT-08/10 restart persistence (1 completed task, 2 accepted supersessions, 49 private object versions) and AT-29 empty-target restore (216 tables, 7,978 rows, 49 objects; measured RTO 2 seconds). Snapshot `/tmp/kxra-connector-aggregate-lw7leu`; log `/tmp/kxra-custody-aggregate.log`. All four bounded-cleanup checks are true and the own shared lease was released. The snapshot includes the final functional source; subsequent edits only clarify comments/documentation. Full canonical build, multi-application browser, production HTTP/artifact and combined extension-installed restore suites are not repeated for this opt-in backend slice. The previous integrated-head CI evidence does not establish managed-key disaster recovery or external acceptance for these new modules.

Independent read-only review by `/root/connector_review` found no remaining blocking defect. Review found the delayed-retirement race and two fixture cleanup paths; these were fixed and given direct regression coverage. Reviewer ran no fixtures and changed no files. Earlier local typechecking found a test-only HTTP header inference issue, which was corrected; final lint and focused proof passed.

## Exact remaining production and approval gates

1. **Managed custody implementation:** choose and provision an owner-approved vault/KMS, durable key persistence, encryption-context/tenant policies, nonexportable key handling where supported, authenticated workload identity, secure TLS/mTLS transport, secret-safe audit, availability, quotas and key recovery. None is implemented by the local fake process. A reviewed real-key/envelope identifier contract and schema upgrade are required; the current schema deliberately accepts only synthetic labels.
2. **Rotation/recovery operations:** define active/retiring/retired versions, concurrency fencing, safe compare-and-swap rewrap of persisted envelopes, backup/restore and loss drills, expiry/revocation propagation and operational ownership. This slice rotates only the fake process keyring for new envelopes; it does not rewrap existing leases or survive custody restart. There is no silent regrant/refresh fallback.
3. **Real provider binding and token lifecycle:** replace the synthetic installation observer with trusted provider-observed app/account/installation/selected-repository/issue/author identity; implement narrow token acquisition, expiry/refresh/revoke and exact scoped HTTPS transport. The fixed fixture IDs/token and external-origin refusal remain in force. Existing receipt-only/no-replay boundaries must survive that work, including uncertain writes after authority withdrawal.
4. **Owner setup and separate approvals:** exact GitHub app, account/installation, repository and acceptance issue selection; minimum approved permissions; authorization for credential custody, account/grant/persistent-access setup, private reads and a single exact external comment write. Real managed-vault setup/policies and workload access also require separate approval. Hosted schema/access/activation/deployment and any spending remain separate gates. Nothing here supplies those approvals or enables those actions.
5. **Acceptance and release evidence:** independently review actual vault/workload/provider adapters, run approved live read/write acceptance, verify production-denial and recovery behavior, and re-run full combined integration/restore/build/browser checks before a later release. Signup/payment/customer journey and launch readiness remain outside this local checkpoint.
