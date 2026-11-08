# GitHub installation identity observer: local implementation

## Scope

Added an unwired, default-off provider identity observer on the clean combined application source `23a183a0fe8b248490e9762d113ff98557f3907b`. Existing transport, outbox, historical manifests, SQL, release operators, API routes and activation controls are unchanged. `KXRA_GITHUB_IDENTITY_OBSERVATION_ENABLED=true` alone does not wire or authorize a connection. No actual GitHub call, real credential, hosted mutation, external message, permission change, payment or deployment occurred.

`packages/connectors/github-installation-observer.ts` implements real Node HTTPS requests to `api.github.com:443`. One instance can perform one serial observation consisting of five fixed GET requests:

1. `/app` authenticates the supplied existing App JWT and checks numeric App ID, client ID, safe slug and the exact Metadata:read / Issues:write registration permissions.
2. `/app/installations/{id}` checks installation/App/slug, account ID/login/type, target ID/type, selected repository mode, exact permissions and unsuspended state.
3. `/repos/{owner}/{repo}/installation` checks that the same installation applies to this repository path.
4. `/repos/{owner}/{repo}` uses a separate existing read lease to check numeric repository ID, canonical names, owner identity/type and non-archived/non-disabled state.
5. `/users/{verified-app-slug}[bot]` sends no credential and checks numeric bot ID, login and Bot type.

The result is deliberately `IDENTITY_OBSERVATION_ONLY`, not an execution-authority or connection-approval acknowledgement. Success projects only the checked IDs/names, bounded permission map, binding digest and observation timestamp. It drops unknown provider fields, including temporary clone tokens. Failure returns one generic value; raw errors, JWTs and lease tokens are never returned.

## Boundaries

- Purpose-specific fresh authority is required before resolution, around each DNS/HTTP wait and before releasing evidence. The injected authority contract is not an implemented production authority adapter.
- The App broker must resolve an already existing purpose-bound JWT. This code cannot sign, mint, refresh, revoke, store or discover credentials. JWT parsing is structural, not local signature verification: the authenticated `/app` response is the provider check. RS256, numeric App ID or matched client-ID issuer, bounded issuance/expiry and matching expiry metadata are required.
- The separate installation broker must attest the exact binding/reference/version/App/installation, one repository and Metadata:read / Issues:read lease. A successful repository read does **not** prove the token is an installation token or establish its true scope, origin or custody. Those remain independently required broker/issuance evidence.
- Selected mode plus repository membership does **not** prove this is the installation's only selected repository. No such claim is emitted.
- Canonical case is matched exactly, consistently with the existing execution binding. Rename/transfer/case drift fails closed and needs rebinding rather than silently rewriting an approved subject.
- Only publicly observable App bots are supported by the unauthenticated bot read. Inaccessible enterprise-managed bots fail closed; a 404 is unavailable evidence, not proof the identity does not exist. No fallback credential is minted or forwarded.
- Each call pins a public IPv4 address after rejecting empty, private or mixed DNS answers. TLS/SNI/certificate checking, HTTPS 443, no pooling, no redirects/proxies, 16 KiB headers, 256 KiB body, 512 chunks, complete response/length, JSON identity encoding and fatal UTF-8 are enforced. A whole observation has a 10-second monotonic deadline. Rate signals stop the window. There are no sleeps or automatic retries.
- Object-local bounds do not implement shared provider rate coordination. Across reconstructed workers, global App/account rate state remains an activation prerequisite.
- Multiple sequential provider reads are historical observations, not an atomic snapshot or a durable guarantee that GitHub permissions cannot change afterward. The existing dispatch-time authority and provider checks remain necessary.

## Local verification

Run the 109 synthetic observer tests and existing transport regressions with:

`node --import tsx --test tests/github-installation-observer.test.ts tests/github-production-transport.test.ts`

The synthetic suite covers exact URL/auth separation, numeric identity and permission drift, 18 authority checkpoints, JWT/lease mismatch, expiry/disable, DNS/HTTP/encoding/body bounds, late promise completion, cancellation at all five endpoints, private bot 404, no partial evidence, no secret leakage and no repeat observation. These are fake provider responses and credentials.

`node scripts/verify-github-installation-observer.mjs` requires clean committed source, clones its exact head, acquires the shared native-fixture lease and runs the synthetic suite plus an owned loopback-only TLS fixture. It tests the five successful GETs, no repeated window, withdrawal, redirect/rate/byte/UTF-8/header limits, response loss, hanging response deadline and untrusted certificate refusal. Synthetic key/certificate files are removed, server sockets closed and the owned port checked closed before lease release. Its receipt explicitly does not claim real DNS, GitHub identity, token provenance or hosted acceptance. No acceptance receipt should be treated as final until the wrapper passes for the exact integrated head.

### Verified local results

The initial implementation commit `622fd5ba975adc717acc620436858eea7a8d3ff4` passed independent source review, 109 observer tests, 26 existing transport tests, 15 related historical composition/outbox tests, full lint/type/format checks and the secret scan. The independent native run passed all 11 phases and verified clean socket/port/key/certificate cleanup. Exact source receipts are retained outside this handoff and must identify the tested commit.

An attempted raw `npm test` run without the generated application/database fixture was **not a full acceptance pass**: 1,350 tests passed and 107 fixture-dependent tests failed. Its log is preserved. The full repository harness and final integrated release acceptance remain separate; the observer-specific proof does not replace them.

## Remaining full-product gates

Implement and accept actual purpose-bound server authority, managed custody/signer/workload identity, existing-token provenance and scoped read/write broker, durable encrypted attempt escrow and global rate coordination. Then wire customer consent/binding and bounded worker routes under the existing default-held policy. Actual provider account/App/installation/repository/bot, private reads, token lifecycle/revocation, TLS/DNS, custody/recovery and the exact external comment need explicit live acceptance. This slice does not remove any hosted, original-session, paid-proof, paired-device, publication, financial or launch gate.

## Official references

- [GitHub App and installation identity endpoints](https://docs.github.com/en/rest/apps/apps?apiVersion=2026-03-10)
- [JWT claims and authentication](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-json-web-token-jwt-for-a-github-app)
- [Repository identity](https://docs.github.com/en/rest/repos/repos#get-a-repository)
- [User identity and enterprise-managed profile access](https://docs.github.com/en/rest/users/users#get-a-user)
- [Official App-token action bot lookup example](https://github.com/actions/create-github-app-token#configure-git-cli-for-an-apps-bot-user)
