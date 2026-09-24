# Implementation file inventory

All paths are relative to this workspace. Original source documents and KXRA-GENESIS remain preserved. Runtime/test output is ignored and excluded.

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
