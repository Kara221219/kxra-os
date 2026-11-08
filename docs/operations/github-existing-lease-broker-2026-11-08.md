# Existing GitHub installation-token broker

## Concrete scope

This additive slice starts from accepted rate/observer source `419d85f1de6586dc3df80e824e8a353009560e84`. One backend module implements `GithubExecutionBroker.resolve`, the existing seam used by the production executor and installation observer. It resolves only an already issued, already stored, currently authorized installation-token lease. Tests compose it with both consumers and the shared rate wrapper; it is not a separate unused protocol demo.

The implementation performs no provider call, JWT signing, token issuance/refresh/revocation, encryption-key creation, custody provisioning, store mutation or secret discovery. The real issuer, current-authority store and custodian adapters are not selected or implemented here. No production route is wired. `KXRA_GITHUB_EXISTING_LEASE_BROKER_ENABLED` defaults off, independently of existing provider/rate/observer gates.

No real credential, provider API, hosted state, persistent access, payment or deployment was used. Synthetic tokens and an ephemeral in-memory AES key exist only in tests. Historical transports/contracts, SQL, release manifests and activation remain unchanged.

## Retained issuance evidence

`projectGithubIssuanceEvidence` validates an already captured exchange from a separately trusted and authorized issuer. It requires the exact GitHub origin, API version and installation-token POST path, an authenticated App ID matching the binding, an explicit singleton numeric repository list and only Metadata:read plus the requested Issues:read or Issues:write permission. It refuses omitted/default-wide scope, extra permissions, repository changes and non-201 responses.

The projected response retains only exact permission/selection/expiry and checked repository/account identities. It drops the token, temporary clone tokens and unrelated provider fields. The token is represented by SHA-256, linked to an issuance UUID and full binding digest. Tokens are opaque, length-bounded values; the code does not assume a 40-character token, inspect token claims or infer permissions from a prefix. Existing stateless installation-token formats are supported within the reviewed transport's existing character/size contract.

The observed response time and provider expiry must be ordered and no more than 61 minutes apart. The extra minute is a bounded issuer/provider clock tolerance around GitHub's documented one-hour lifetime. This does not extend the provider expiry. Local lease expiry never exceeds that expiry or the bound connection deadline. Broker release additionally rejects future observation times and expired provider/lease/binding deadlines.

**This projection is not evidence authentication.** Hashes establish content consistency, not that GitHub issued a token. A caller can fabricate a JSON exchange. App identity, authenticated request origin and the 201 response must come from a separately accepted issuer pipeline, with trusted immutable retention and service identity. Actual token permission/provenance acceptance remains open.

## Existing-object custody boundary

The stored record contains the projected evidence plus an immutable object UUID/version, envelope digest and custody-context digest. No `latest` alias or caller-supplied record fallback is accepted by the broker.

`githubLeaseCustodyContext` binds the complete existing connection/tenant/user/session/grant/credential/target/expiry binding, requested scope, evidence digest and immutable object identity/version. `githubLeaseCustodyAAD` returns the exact canonical UTF-8 JSON bytes for authenticated encryption, and `githubLeaseCustodyContextDigest` hashes those bytes. A real custodian should use this shared serializer rather than duplicate its property-order rules.

The custodian must independently enforce workload and tenant policy, authenticate the envelope with these exact bytes, verify immutable-object/envelope identity, and check current object/key validity. The port's context/envelope acknowledgements are testimony, not substitutes for authenticated encryption. The tests use actual AES-256-GCM and prove that a coherently rehashed metadata/context substitution cannot open unchanged ciphertext.

The broker opens one existing object, verifies the returned token digest and object/version/context/envelope acknowledgements, then rereads the authoritative current record. Any changed observed record, revocation, rotation, expiry, disabled gate, cancellation or deadline denies release without resealing, refreshing or retrying. Parsed records are frozen detached JSON snapshots. The entire resolve operation has a maximum 1.5-second monotonic deadline; it checks state around every asynchronous boundary and ignores late results.

The current-store adapter must enforce verified server/workload and tenant/session/grant/credential authority on **every** read. The broker cannot infer this from an `active:true` field. Its final reread detects a changed record observed after custody returns; it does not make revocation atomic with token use, detect store rollback, or invalidate plaintext already returned. Existing execution authority checks, exact comment approval, irreversible attempt consumption, external-effect fence and rate gate remain necessary.

## Plaintext and inspection

The trusted executor needs a plaintext token, so the resolved backend lease necessarily contains one. Ordinary JSON serialization and inspection of the returned lease redact it, as do broker errors and broker-object inspection. Extracting, spreading or copying the lease can bypass that convenience redaction. Never expose this object or the raw exchange to browser/model inputs, generic logs, diagnostics, receipts or customer responses. JavaScript string memory is not securely erased by this implementation; there is no claim of zeroization or managed-key isolation.

No token cache survives a resolve call. Reconstructing the broker requires the current record and intact custody again. Custody/key loss denies release; it never mints a replacement. Key retirement does not itself revoke a provider token or recall plaintext already returned.

## Local verification

Run `node --import tsx --test tests/github-existing-lease-broker.test.ts` for the new synthetic suite. It covers exact request/response scope, variable token formats, plaintext projection/redaction, tenant/session/grant/credential substitution, ciphertext/key loss, coherent AAD rebinding, revocation/rotation during custody, deadlines/late promises, detached snapshots, concurrent read/write scopes and no refresh. Composition tests use the unchanged executor, observer and rate wrapper with fake HTTP/provider responses and actual in-memory AES-GCM.

No native hosted/provider/custodian acceptance is implied by these tests. Whole-worktree lint/types/format, related historical pin regressions and independent code/test review are tracked in the source-bound handoff. Full canonical application fixture CI is a separate integration gate; raw `npm test` without its generated fixture is not full acceptance.

## Remaining required decisions and implementation

Select an authorized real issuer/custodian/workload identity and durable authority store. Implement those concrete adapters, immutable issuance capture and custody write path, current revocation/key policy, retention and loss/restore recovery, and their owner/effective-permission attestations. No vendor, deployment owner or real key policy is inferred here. Accept those systems and actual provider scopes/identity before wiring customer consent/worker routes or lifting default-held gates. Separate authorization remains required for credential creation, persistence, provider use and any spending.

Official references: [GitHub installation-token API](https://docs.github.com/en/rest/apps/apps?apiVersion=2026-03-10#create-an-installation-access-token-for-an-app) and [installation-token generation requirements](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app).
