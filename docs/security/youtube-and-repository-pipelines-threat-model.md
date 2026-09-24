# YouTube and repository pipeline threat model

Status: local contract implemented; external providers and execution disabled.

## Assets and trust boundaries

Protected assets are tenant/project records, source and claim evidence, channel authority, rights/provenance evidence, review decisions, repository revisions, security findings and future provider/Git authority. Browser input, model output, media metadata, repository metadata/content and provider callbacks are untrusted. PostgreSQL under the authenticated RLS role is authoritative.

## Principal threats and controls

| Threat | Implemented control | Remaining evidence |
| --- | --- | --- |
| Crafted project/resource identifier | Server derives identity/tenant, checks the nested project relationship, then PostgreSQL RLS/functions recheck it | Hosted Auth/pooler staging |
| Model grants permission or fabricates readiness | Typed deterministic checks; no permission, review, money or provider state comes from a model | External-model policy/evals |
| Creator self-approves content/adoption | Final approval requires a current different actor and exact immutable version/hash | Staging identity/MFA |
| Stale content is published | Revision supersedes approval; channel disconnect withdraws ready intents; no local sender exists | YouTube delivery-time recheck |
| Forged channel authority | Seed is `UNVERIFIED`; private synthetic verification is test-only and stores no token | OAuth callback, encrypted token custody, revocation |
| Unsupported or harmful claim is published | All source, claim, originality, rights, disclosure, compliance, render, caption and metadata checks must pass | Solicitor/editor policy and real media QA |
| Candidate code executes during inspection | No archive reader/process runner; required quarantine controls disable hooks, submodules, scripts, Actions, network and secrets | Isolated acquisition/scanner/sandbox staging |
| Repository result overclaims safety | Forbidden safety phrases; exact toolchain/findings and residual risk required | Production scanner validation and signature freshness |
| Licence/provenance ambiguity | Clear licence/provenance required for passing assessment and proposal approval | Qualified review for each adopted component |
| Candidate content injects agent instructions | Repository content is stored as untrusted data and receives no tools or instruction priority | External-analysis prompt-injection tests |
| Automatic Git/production impact | Intent is `NOT_STARTED`; merge/release/deploy flags are fixed false; no Git writer exists | Separate reviewed implementation/PR workflow |
| Cross-project leakage | RLS on all 12 new tables; direct SQL and HTTP negative tests include revoked and crafted access | Hosted staging matrix |

## Hard-stop rule

Do not connect a sender, runner or writer merely because an intent exists. A new adapter needs its own least-privilege identity, encrypted secret custody, idempotency/reconciliation, delivery-time authorization, audit evidence, failure recovery and staging acceptance tests.
