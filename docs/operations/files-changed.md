# Implementation file inventory

All paths are relative to this workspace. Original source documents and KXRA-GENESIS remain preserved. Runtime/test output is ignored and excluded.

## 29 September isolated staging email worker

- added `apps/email-worker` as a separately built private processing target
- added timing-safe worker request authentication and bounded bodyless processing
- added `transactional-email` staging preflight separation and artifact checks
- added guarded `kxra_email_runner` role plan/apply/verify operators
- added worker HTTP, staging-configuration and database-role security tests
- updated architecture, threat model, staging playbook and operating records

## 27 September Phase 2 Slice 36

- migration `0069` for exact legal/commercial/provider/review release readiness
- owner Admin release-gate status and blocker presentation
- commercial acceptance and staging migration-manifest tests
- ADR 0039 plus architecture, security, staging and operating evidence updates

## 27 September Phase 2 Slice 35

- `scripts/staging-acceptance-core.mjs`, `scripts/staging-acceptance.mjs`, `tests/staging-acceptance.test.ts`, `package.json` — clean-pushed-SHA staging target validation, 18 bounded anonymous probes, redacted durable evidence and fail-closed tests.
- `docs/decisions/0038-hash-bound-staging-acceptance-evidence.md`, `docs/operations/evidence/staging/.gitkeep` — decision and reviewed evidence location.
- `README.md`, architecture, staging threat model, staging playbook and operating records — exact operator instructions, security boundary and current implementation evidence.

## 27 September Phase 2 Slice 34

- migration `0068` for evidence-backed score assessments, exact factor evidence, project-derived calculation, approval and superseded history
- owner score-assessment form plus project overview/scorecard bounds, coverage and history
- score request/execution API and owner approval execution route
- SQL, HTTP, full access-matrix and browser coverage for calculation, isolation, crafted evidence, stale state and unknown-score integrity
- ADR 0037 plus current README, architecture, access-control and operating evidence

No score is seeded or invented. No credential, hosted mutation, provider activation, deployment or publication is added.

## 27 September Phase 2 Slice 33

- hosted password-sign-in assurance gate, dedicated TOTP challenge route and direct actor-level AAL2 enforcement
- exact Auth callback destination policy and signed, subject-bound ten-minute recovery intent
- hosted provider password update, current-account check, intent consumption, explicit partial-failure result and global sign-out
- MFA/recovery policy and tamper tests, ADR 0036, account threat-model updates and staging acceptance steps
- current README, architecture, access-control and operating evidence

No password, provider token, factor secret, real identity, hosted mutation, deployment or publication is added.

## 27 September Phase 2 Slice 32

- guarded singleton-owner `plan`/`apply`/`verify` operator with exact Auth, seed, runtime-role, branch and takeover checks
- hosted Supabase TOTP enrollment, interrupted-factor reconciliation, six-digit verification, AMR-based owner step-up and provider-confirmed global sign-out
- transient QR/manual-key Profile controls, owner factor-removal block and retired unsafe manual SQL path
- owner/Auth integration tests, ADR 0035, threat model and complete staging-owner playbook
- current README, architecture, access-control and operating evidence

No owner identity, credential, factor secret, hosted mutation, provider activation, deployment or publication is added.

## 27 September Phase 2 Slice 31

- guarded exact runtime-role `plan`/`apply`/`verify` operator after canonical-seed verification
- distinct `kxra_app` and `kxra_public_ingress` login contracts, forced SCRAM passwords and exact non-admin memberships
- exact per-application database-user preflight and unconditional transactional public `anon` selection
- operator/role security tests, ADR 0034, runtime-role threat model and updated staging playbook
- current README, architecture, access-control and operating evidence

No credential value, hosted mutation, provider activation, deployment or publication is added.

## 27 September Phase 2 Slice 30

- canonical-only staging seed profile, manifest, `plan`/`apply`/`verify` operator and environment guards
- importer boundary that excludes every local executable/test contract from hosted canonical seeds
- fresh-database idempotency and fixture-exclusion integration evidence plus operator-state tests
- ADR 0033, staging seed threat model and updated connection playbook
- current README, architecture and operating evidence

No fixture identity, legal placeholder, AI approval, entitlement, product activation, credential, hosted mutation, deployment or publication is added.

## 27 September Phase 2 Slice 29

- guarded `plan`, `apply` and `verify` commands for a separately authorized Supabase staging database
- exact project/host/role/TLS/branch/confirmation validation and application-profile secret rejection
- SHA-256 migration manifest, durable migration history, advisory-lock serialization, atomic per-file tracking and exact schema verification
- migration guard tests, ADR 0032, staging-migration threat model and updated connection playbook
- current README, architecture and operating evidence

No credential, hosted database mutation, deployment, provider activation or publication is added.

## 27 September Phase 2 Slice 28

- migration `0067` for organization-bound Stripe test-customer intents and restricted mapping
- fixed-endpoint Stripe Customer adapter, billing-worker recording and bounded customer API
- customer-admin Business Tools control with no browser-selected organization, name, email or provider customer
- bootstrap replay, isolation, worker, provider-response and RLS tests
- ADR 0031 plus updated Stripe threat model, staging playbook, architecture, security and operating evidence

No real Stripe credential, provider call, customer, charge, subscription, deployment or publication is added.

## 27 September Phase 2 Slice 27

- migration `0066` for tenant-bound hosted billing intents and bounded Checkout/Portal request functions
- fixed-endpoint Stripe hosted-session adapter and restricted worker result recording
- test-only Checkout/Portal API and customer-facing Business Tools billing controls
- hosted billing authority, replay, provider-response, RLS and worker tests
- ADR 0030 plus updated Stripe threat model, staging playbook, architecture, security and operating evidence

No real Stripe credential, provider call, session, charge, refund, cancellation, deployment or publication is added.

## 27 September Phase 2 Slice 26

- migration `0065` for a restricted billing worker, owner-only provider receipts, complete Stripe subscription states and fail-closed entitlement periods
- strict Stripe event normalization, raw-body webhook route and test-mode reconciliation worker
- worker-role, signature, replay, ordering, unknown-reference recovery and entitlement-withdrawal tests
- disabled staging configuration, ADR 0029, Stripe threat model and activation playbook
- current README, architecture, access-control, acceptance, progress, handover and Work Log evidence

No Stripe credential, provider call, product/price activation, checkout, portal, charge, refund, cancellation, deployment or publication is added.

## 26 September Phase 2 Slice 25

- migration `0064` for encrypted delivery custody, restricted worker state and provider events
- Resend transport, email worker, raw-byte signed webhook route and disabled staging configuration
- transactional-email role, encryption, idempotency, revocation, retry and reconciliation tests
- ADR 0028, transactional-email threat model and staging activation playbook

## 26 September Phase 2 Slice 24

Append-only Brand evidence correction and stale-lineage enforcement:

- `supabase/migrations/0063_brand_source_corrections.sql`
- `apps/os/app/api/[...path]/route.ts`
- `apps/os/lib/brand-studio.ts`
- `apps/os/components/BrandStudio.tsx`
- `tests/brand-source-corrections.test.ts`
- `tests/brand-studio.test.ts`
- `tests/brand-studio-http.test.ts`
- `tests/e2e/brand-studio.spec.ts`
- access-matrix, schema-count and control-plane count tests
- `docs/decisions/0027-append-only-brand-evidence-corrections.md`
- Brand Studio architecture, security, acceptance, progress, handover, work-log and staging records
- `README.md`

No source content is overwritten. No external website, credential, model call, message, deployment or publication is added.

## 26 September Phase 2 Slice 23

Governed Brand Studio website-source acquisition:

- `supabase/migrations/0062_brand_source_acquisition.sql`
- `packages/integrations/public-web.ts`
- `packages/integrations/public-web-worker.ts`
- `scripts/public-web-worker.ts`
- `apps/os/app/api/[...path]/route.ts`
- `apps/os/lib/brand-studio.ts`
- `apps/os/components/BrandStudio.tsx`
- `.env.example`, `package.json` and `scripts/staging-config.mjs`

Acceptance and regression coverage:

- `tests/brand-source-acquisition.test.ts`
- `tests/public-web.test.ts`
- `tests/brand-studio-http.test.ts`
- `tests/e2e/brand-studio.spec.ts`
- access-matrix, schema-count, control-plane and staging configuration tests

Architecture, security and operating evidence:

- `README.md`
- `docs/architecture/system.md`
- `docs/decisions/0026-address-pinned-brand-source-acquisition.md`
- `docs/security/brand-source-acquisition-threat-model.md`
- `docs/security/access-control.md`
- `docs/playbooks/brand-source-acquisition-staging.md`
- `docs/playbooks/staging-connection-and-preflight.md`
- current acceptance, progress, handover, work-log and file-inventory records

No live website, hosted worker, credential, external model, publication, deployment or production target is added. The worker is disabled by default and its database credential is prohibited in the core OS and marketing environments.

## 25 September Phase 2 Slice 8

- `apps/marketing/**` — independent public application, exact disabled snapshot, routes, layered presentation and accessible forms
- `supabase/migrations/0056_public_marketing_ingress.sql`
- `supabase/migrations/0057_public_ingress_read_surface.sql`
- `apps/os/app/os/[[...segments]]/page.tsx`
- `apps/os/components/ControlPlaneViews.tsx`
- `apps/os/lib/control-plane.ts`
- `scripts/build-marketing.mjs`
- `scripts/verify-marketing-boundary.mjs`
- `scripts/verify-publication-snapshot.mjs`
- `scripts/verify-production-artifact.mjs`
- `scripts/ci.mjs`
- `playwright.marketing.config.ts`
- `tests/public-marketing.test.ts`
- `tests/marketing-e2e/marketing.spec.ts`
- access-matrix, security, control-plane count and runtime helpers
- root workspace/package/environment/build configuration
- ADR 0015, public marketing threat model, staging/release playbook and current operating evidence

No real enquiry, legal approval, credential, Vercel project, DNS change, external send, deployment, indexing or publication is added.

## 25 September Phase 2 Slice 7

- `supabase/migrations/0054_whatsapp_gateway_schema.sql`
- `supabase/migrations/0055_whatsapp_gateway_contracts.sql`
- `packages/integrations/whatsapp.ts`
- `apps/os/app/api/[...path]/route.ts`
- `apps/os/app/os/[[...segments]]/page.tsx`
- `tests/whatsapp-gateway.test.ts`
- `tests/whatsapp-gateway-http.test.ts`
- `tests/domain.test.ts`
- `tests/access-matrix.test.ts`
- `tests/security.test.ts`
- `tests/control-plane-http.test.ts`
- `tests/e2e/control-plane.spec.ts`
- `docs/decisions/0014-whatsapp-gateway-authority.md`
- `docs/security/whatsapp-gateway-threat-model.md`
- `docs/playbooks/whatsapp-staging-activation.md`
- architecture and operating evidence documents listed in this inventory

No Meta credential, webhook registration, provider media fetch, transcription, model call, external send, deployment or publication is added.

## 24 September Phase 2 Slice 6

Governed Routine Registry and recovery implementation:

- `scripts/seed.mjs`
- `supabase/migrations/0052_governed_routine_schema.sql`
- `supabase/migrations/0053_governed_routine_contracts.sql`
- `apps/os/app/api/[...path]/route.ts`
- `apps/os/app/os/[[...segments]]/page.tsx`
- `apps/os/components/RoutineRegistry.tsx`
- `apps/os/lib/control-plane.ts`

Acceptance and regression coverage:

- `tests/routines.test.ts`
- `tests/routines-http.test.ts`
- `tests/access-matrix.test.ts`
- `tests/control-plane-http.test.ts`
- `tests/e2e/control-plane.spec.ts`
- `tests/security.test.ts`
- `tests/seed.test.ts`

Architecture, security and operating evidence:

- `README.md`
- `docs/architecture/system.md`
- `docs/architecture/whatsapp-and-jobs.md`
- `docs/decisions/0013-governed-routine-engine.md`
- `docs/security/access-control.md`
- `docs/security/ai-execution-threat-model.md`
- `docs/security/routine-engine-threat-model.md`
- `docs/playbooks/routine-approval-and-recovery.md`
- `docs/operations/acceptance-evidence.md`
- `docs/operations/files-changed.md`
- `docs/operations/handover.md`
- `docs/operations/local-development.md`
- `docs/operations/progress.md`
- `docs/operations/work-log.md`

The slice adds no Trigger.dev registration, always-on scheduler, hosted worker, notification delivery, real credential, external send, deployment or publication.

## 24 September Phase 2 Slice 5

Projects 006/007 portfolio and governed pipeline implementation:

- `KXRA-GENESIS/registers/projects.json`
- `scripts/seed.mjs`
- `supabase/migrations/0049_phase2_project_portfolio.sql`
- `supabase/migrations/0050_governed_youtube_and_repository_schema.sql`
- `supabase/migrations/0051_governed_youtube_and_repository_contracts.sql`
- `apps/os/app/api/[...path]/route.ts`
- `apps/os/components/LocalFixtureLogin.tsx`
- `apps/os/components/Phase2ProjectForms.tsx`
- `apps/os/components/ProjectWorkspaceView.tsx`
- `apps/os/lib/project-workspaces.ts`

Acceptance and regression coverage:

- `tests/phase2-projects.test.ts`
- `tests/phase2-projects-http.test.ts`
- `tests/access-matrix.test.ts`
- `tests/control-plane-http.test.ts`
- `tests/e2e/control-plane.spec.ts`
- `tests/e2e/project-workspaces.spec.ts`
- `tests/http.test.ts`
- `tests/project-workspaces-http.test.ts`
- `tests/project-workspaces.test.ts`
- `tests/security.test.ts`
- `tests/seed.test.ts`

Architecture, security and operating evidence:

- `README.md`
- `docs/architecture/system.md`
- `docs/decisions/0007-customer-platform-and-new-projects.md`
- `docs/decisions/0012-governed-youtube-and-repository-pipelines.md`
- `docs/projects/PROJECT-006.md`
- `docs/projects/PROJECT-007.md`
- `docs/security/access-control.md`
- `docs/security/youtube-and-repository-pipelines-threat-model.md`
- `docs/playbooks/review-youtube-and-repository-intents.md`
- `docs/operations/acceptance-evidence.md`
- `docs/operations/files-changed.md`
- `docs/operations/handover.md`
- `docs/operations/local-development.md`
- `docs/operations/progress.md`
- `docs/operations/work-log.md`

The slice adds no YouTube credential or send, repository archive/code execution, Git mutation, production scanner, external provider call, deployment or publication.

## 20 September Phase 2 Slice 2

Secure private-file and knowledge implementation:

- `.env.example`
- `apps/os/app/api/[...path]/route.ts`
- `apps/os/app/os/[[...segments]]/page.tsx`
- `apps/os/components/Forms.tsx`
- `apps/os/components/ProjectWorkspaceView.tsx`
- `apps/os/lib/data.ts`
- `apps/os/lib/project-workspaces.ts`
- `apps/os/package.json`
- `package.json`
- `packages/ai/index.ts`
- `packages/storage/index.ts`
- `packages/storage/worker.ts`
- `scripts/build-os.mjs`
- `scripts/database.mjs`
- `scripts/file-worker.ts`
- `scripts/local.mjs`
- `scripts/verify-persistence.mjs`
- `supabase/migrations/0039_secure_file_and_knowledge_lifecycle.sql`
- `supabase/migrations/0040_file_worker_and_reconciliation.sql`
- `supabase/migrations/0041_file_processing_timestamps.sql`
- `supabase/migrations/0042_reconciliation_parameter_binding.sql`
- `supabase/migrations/0043_complete_file_lifecycle.sql`
- `supabase/migrations/0044_file_lifecycle_defaults.sql`
- `tsconfig.json`

## Phase 2 Slice 22 additions

- `apps/os/app/api/[...path]/route.ts`
- `apps/os/app/globals.css`
- `apps/os/app/os/[[...segments]]/page.tsx`
- `apps/os/components/BrandStudio.tsx`
- `apps/os/components/CustomerService.tsx`
- `apps/os/components/Shell.tsx`
- `docs/architecture/system.md`
- `docs/decisions/0025-customer-service-and-privacy-authority.md`
- `docs/security/access-control.md`
- `supabase/migrations/0061_customer_service_and_privacy_requests.sql`
- `tests/customer-service-http.test.ts`
- `tests/customer-service.test.ts`
- `tests/e2e/customer-service.spec.ts`

## Phase 2 Slice 23 additions

- `.env.example`
- `apps/os/app/api/[...path]/route.ts`
- `apps/os/components/BrandStudio.tsx`
- `apps/os/lib/brand-studio.ts`
- `package.json`
- `packages/integrations/public-web.ts`
- `packages/integrations/public-web-worker.ts`
- `scripts/public-web-worker.ts`
- `scripts/staging-config.mjs`
- `supabase/migrations/0062_brand_source_acquisition.sql`
- `tests/brand-source-acquisition.test.ts`
- `tests/brand-studio-http.test.ts`
- `tests/e2e/brand-studio.spec.ts`
- `tests/public-web.test.ts`
- `tests/staging-config.test.ts`
- `docs/decisions/0026-address-pinned-brand-source-acquisition.md`
- `docs/security/brand-source-acquisition-threat-model.md`
- `docs/playbooks/brand-source-acquisition-staging.md`

The slice adds no real website request, provider credential, hosted worker, external send, publication or deployment.

Acceptance and regression coverage:

- `tests/file-knowledge.test.ts`
- `tests/access-matrix.test.ts`
- `tests/control-plane-http.test.ts`
- `tests/http.test.ts`
- `tests/security.test.ts`
- `tests/e2e/workspace.spec.ts`

Architecture, security and operating evidence:

- `README.md`
- `docs/architecture/system.md`
- `docs/decisions/0009-secure-file-and-knowledge-lifecycle.md`
- `docs/security/access-control.md`
- `docs/security/account-identity-threat-model.md`
- `docs/security/file-knowledge-threat-model.md`
- `docs/operations/acceptance-evidence.md`
- `docs/operations/files-changed.md`
- `docs/operations/handover.md`
- `docs/operations/local-development.md`
- `docs/operations/progress.md`
- `docs/operations/work-log.md`

The slice adds no real provider credential, hosted object, production scanner, external send, deployment or private source document.

## 20 September Phase 2 Slice 1

Identity, legal, commercial and custom-project implementation:

- `.env.example`
- `apps/os/app/agreements/page.tsx`
- `apps/os/app/api/agreements/route.ts`
- `apps/os/app/api/context/route.ts`
- `apps/os/app/api/[...path]/route.ts`
- `apps/os/app/api/auth/route.ts`
- `apps/os/app/os/[[...segments]]/page.tsx`
- `apps/os/app/select-organisation/page.tsx`
- `apps/os/components/CommercialForms.tsx`
- `apps/os/components/Shell.tsx`
- `apps/os/lib/auth.ts`
- `apps/os/lib/http.ts`
- `packages/db/index.ts`
- `packages/integrations/billing.ts`
- `scripts/seed.mjs`
- `supabase/migrations/0031_multi_tenant_identity_and_legal_gate.sql`
- `supabase/migrations/0032_commercial_and_custom_projects.sql`
- `supabase/migrations/0033_policy_helper_execution.sql`
- `supabase/migrations/0034_legal_and_commercial_hardening.sql`
- `supabase/migrations/0035_selected_tenant_visibility_and_legal_presentation.sql`
- `supabase/migrations/0036_kxra_organisation_seed_defaults.sql`
- `supabase/migrations/0037_project_proposal_output_disambiguation.sql`
- `supabase/migrations/0038_customer_project_identifier_default.sql`

Acceptance and regression coverage:

- `tests/phase2-commercial.test.ts`
- `tests/phase2-http.test.ts`
- `tests/e2e/phase2-identity-legal.spec.ts`
- `tests/access-matrix.test.ts`
- `tests/control-plane-http.test.ts`
- `tests/control-plane.test.ts`
- `tests/project-workspaces.test.ts`
- `tests/security.test.ts`
- `tests/workflow.test.ts`
- `tests/e2e/control-plane.spec.ts`
- `tests/e2e/workspace.spec.ts`

Canonical documentation:

- `README.md`
- `docs/architecture/system.md`
- `docs/decisions/0007-customer-platform-and-new-projects.md`
- `docs/decisions/0008-multi-tenant-legal-commercial-foundation.md`
- `docs/operations/acceptance-evidence.md`
- `docs/operations/files-changed.md`
- `docs/operations/handover.md`
- `docs/operations/progress.md`
- `docs/operations/work-log.md`
- `docs/security/access-control.md`
- `docs/security/account-identity-threat-model.md`

Original source documents, private Genesis research, business-pack DOCX/XLSX files, credentials and generated runtime/test artifacts are not part of this slice or publication set.

## 19 September repository audit and completion contract

- `docs/operations/CODEX-PHASE-COMPLETION-BRIEF-02.md`
- `docs/operations/acceptance-evidence.md`
- `docs/operations/progress.md`
- `docs/operations/handover.md`
- `docs/operations/work-log.md`
- `docs/decisions/0007-customer-platform-and-new-projects.md`
- `docs/projects/PROJECT-006.md`
- `docs/projects/PROJECT-007.md`
- `docs/architecture/system.md`
- `docs/security/access-control.md`
- `README.md`

This audit changes documentation and approved target specifications only. It does not claim that the new customer platform, Brand Studio, Projects 006/007 or any provider integration has been implemented.

## Final Milestone 3 additions and changes

- `apps/os/app/api/[...path]/route.ts`
- `apps/os/app/globals.css`
- `apps/os/app/os/[[...segments]]/page.tsx`
- `apps/os/app/os/error.tsx`
- `apps/os/components/Forms.tsx`
- `apps/os/components/ProjectWorkspaceForms.tsx`
- `apps/os/components/ProjectWorkspaceView.tsx`
- `apps/os/lib/project-workspaces.ts`
- `supabase/migrations/0026_project_workspaces.sql`
- `supabase/migrations/0027_project_workspace_hardening.sql`
- `supabase/migrations/0028_project_workspace_evidence_hardening.sql`
- `tests/access-matrix.test.ts`
- `tests/control-plane-http.test.ts`
- `tests/http.test.ts`
- `tests/project-workspaces-http.test.ts`
- `tests/project-workspaces.test.ts`
- `tests/security.test.ts`
- `tests/e2e/project-workspaces.spec.ts`
- `tests/e2e/workspace.spec.ts`
- `README.md`
- `docs/architecture/system.md`
- `docs/security/access-control.md`
- `docs/decisions/0006-project-workspaces.md`
- `docs/projects/PROJECT-001.md` through `PROJECT-005.md`
- `docs/operations/acceptance-evidence.md`
- `docs/operations/progress.md`
- `docs/operations/handover.md`
- `docs/operations/files-changed.md`
- `docs/operations/work-log.md`

The legacy list below records the earlier Genesis implementation inventory and remains for provenance.

- `.env.example`
- `.gitignore`
- `AGENTS.md`
- `README.md`
- `apps/os/app/api/[...path]/route.ts`
- `apps/os/app/api/auth/route.ts`
- `apps/os/app/globals.css`
- `apps/os/app/layout.tsx`
- `apps/os/app/login/page.tsx`
- `apps/os/app/os/[[...segments]]/page.tsx`
- `apps/os/app/page.tsx`
- `apps/os/app/redeem/page.tsx`
- `apps/os/components/Forms.tsx`
- `apps/os/components/Shell.tsx`
- `apps/os/lib/auth.ts`
- `apps/os/lib/data.ts`
- `apps/os/middleware.ts`
- `apps/os/next-env.d.ts`
- `apps/os/next.config.mjs`
- `apps/os/package.json`
- `apps/os/public/favicon.svg`
- `apps/os/tsconfig.json`
- `docs/architecture/system.md`
- `docs/architecture/whatsapp-and-jobs.md`
- `docs/decisions/0001-genesis-foundation.md`
- `docs/decisions/0002-dependency-hardening.md`
- `docs/decisions/0003-reviewed-operating-integrity.md`
- `docs/operations/files-changed.md`
- `docs/operations/CODEX-PHASE-COMPLETION-BRIEF.md`
- `docs/operations/acceptance-evidence.md`
- `docs/operations/handover.md`
- `docs/operations/local-development.md`
- `docs/operations/progress.md`
- `docs/operations/work-log.md`
- `docs/playbooks/review-evidence.md`
- `docs/projects/PROJECT-001.md`
- `docs/projects/PROJECT-002.md`
- `docs/projects/PROJECT-003.md`
- `docs/projects/PROJECT-004.md`
- `docs/projects/PROJECT-005.md`
- `docs/security/access-control.md`
- `jobs/README.md`
- `package-lock.json`
- `package.json`
- `packages/ai/index.ts`
- `packages/authz/session.ts`
- `packages/db/index.ts`
- `packages/domain/index.ts`
- `packages/domain/scoring.ts`
- `packages/integrations/whatsapp.ts`
- `playwright.config.ts`
- `scripts/database.mjs`
- `scripts/local.mjs`
- `scripts/seed.mjs`
- `scripts/verify-persistence.mjs`
- `supabase/manual/bootstrap-owner.sql`
- `supabase/migrations/0001_core.sql`
- `supabase/migrations/0002_hardening.sql`
- `supabase/migrations/0003_finance_validation.sql`
- `supabase/migrations/0004_review_integrity.sql`
- `supabase/migrations/0005_source_repair.sql`
- `supabase/migrations/0006_operating_loop.sql`
- `supabase/migrations/0007_operating_loop_integrity.sql`
- `supabase/migrations/0008_project_provenance.sql`
- `supabase/migrations/0009_project_brief_data_repair.sql`
- `supabase/migrations/0010_seed_envelope_provenance.sql`
- `supabase/migrations/0011_identity_invitations.sql`
- `supabase/migrations/0012_record_status_transitions.sql`
- `supabase/migrations/0013_project_gates.sql`
- `tests/access-matrix.test.ts`
- `tests/domain.test.ts`
- `tests/e2e/workspace.spec.ts`
- `tests/http.test.ts`
- `tests/security.test.ts`
- `tests/seed.test.ts`
- `tests/workflow.test.ts`
- `tsconfig.json`
