import { NextResponse } from "next/server";
import { z } from "zod";
import {
  actor,
  owner,
  recentOwnerMfa,
  sameOrigin,
  HttpError,
} from "../../../lib/auth";
import {
  listProjects,
  project,
  listRecords,
  getRecord,
  createRecord,
  search,
  approval,
  totals,
  counts,
  operatingLoop,
} from "../../../lib/data";
import {
  adminSnapshot,
  dispositions,
  getIdea,
  ideaStates,
  lifecycleStages,
  listIdeas,
  listPortfolio,
  listWorkLog,
  ownerDashboard,
  recommendations,
  workLogTypes,
} from "../../../lib/control-plane";
import { loadProjectWorkspace } from "../../../lib/project-workspaces";
import {
  executeLocalBrandGeneration,
  loadBrandStudio,
} from "../../../lib/brand-studio";
import { query, localMode } from "../../../../../packages/db";
import {
  classifications,
  uuid,
  recordInput,
} from "../../../../../packages/domain";
import {
  ASK_AGENT_CODE,
  ASK_SKILL_CODE,
  LOCAL_SOL_POLICY_CODE,
  LOCAL_ZERO_COST_BUDGET_CODE,
  estimateModelInputTokens,
  evidenceAnswer,
  hashStructured,
  modelAnswer,
  prepareModelEvidence,
  type ModelEvidence,
} from "../../../../../packages/ai";
import { executeAskAgentRun } from "../../../../../packages/ai/worker";
import {
  assertPublicWebsiteUrl,
  brandChannelSchema,
  brandProfileEvidence,
  brandProfileSchema,
  campaignBriefSchema,
  creativeContentSchema,
  inferLocalBrandProfile,
  renderBrandExport,
} from "../../../../../packages/brand-studio";
import {
  privateObjectStore,
  sha256 as objectSha256,
} from "../../../../../packages/storage";
import { renderEmail } from "../../../../../packages/integrations/email";
import {
  pairingChallenge,
  whatsappPhoneDigest,
} from "../../../../../packages/integrations/whatsapp";
import {
  fakeAuthProvider,
  fakeEmailTransport,
  issueLocalProviderSession,
} from "#kxra/local-runtime";
import { cookies } from "next/headers";
import crypto from "node:crypto";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type Context = { params: Promise<{ path: string[] }> };
const positiveVersion = z.number().int().positive();
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const gitSha = z.string().regex(/^[a-f0-9]{40}$/);
const requestId = uuid;
const evidenceReference = z
  .object({ record_id: uuid, version: positiveVersion })
  .strict();
const evidenceList = z.array(evidenceReference).min(1).max(20);
const optionalIdeaText = z.string().trim().max(50000).nullable().optional();
const ideaFields = {
  title: z.string().trim().min(1).max(240),
  raw_idea: z.string().trim().min(1).max(50000),
  structured_summary: optionalIdeaText,
  problem_statement: optionalIdeaText,
  target_customer: optionalIdeaText,
  validation_plan: optionalIdeaText,
  next_experiment: optionalIdeaText,
  source_note: z.string().trim().max(1000).nullable().optional(),
  evidence: z.array(evidenceReference).max(20).optional(),
};
const pageNumber = z.coerce.number().int().positive().default(1);
const pageSize = z.coerce.number().int().min(1).max(100);
const gateCode = z.enum([
  "P001_REVISIT",
  "P002_LISTING",
  "P003_FAITHFUL_DELIVERY",
  "P004_PAPER_READINESS",
  "P005_LOCAL_PROTOTYPE",
]);
const gateEvidenceBase = {
  project_id: uuid,
  title: z.string().trim().min(1).max(240),
  summary: z.string().trim().min(1).max(50000),
  evidence: evidenceList,
};
const gateEvidenceInput = z.discriminatedUnion("gate", [
  z
    .object({
      ...gateEvidenceBase,
      gate: z.literal("P001_REVISIT"),
      claims: z
        .object({
          route_evidenced: z.literal(true),
          liquidity_evidenced: z.literal(true),
          recovery_evidenced: z.literal(true),
          buyer_evidenced: z.literal(true),
          regulatory_evidenced: z.literal(true),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...gateEvidenceBase,
      gate: z.literal("P004_PAPER_READINESS"),
      claims: z
        .object({
          protocol_defined: z.literal(true),
          risk_limits_defined: z.literal(true),
          paper_account_ready: z.literal(true),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...gateEvidenceBase,
      gate: z.literal("P002_LISTING"),
      claims: z
        .object({
          exact_sku: z.string().trim().min(1).max(240),
          fitment_verified: z.literal(true),
          safety_evidence_verified: z.literal(true),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...gateEvidenceBase,
      gate: z.literal("P003_FAITHFUL_DELIVERY"),
      claims: z
        .object({
          rights_confirmed: z.literal(true),
          geometry_qa_passed: z.literal(true),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...gateEvidenceBase,
      gate: z.literal("P005_LOCAL_PROTOTYPE"),
      claims: z
        .object({
          buyer_problem: z.string().trim().min(1).max(1000),
          demand_reviewed: z.literal(true),
        })
        .strict(),
    })
    .strict(),
]);
const youtubeSource = z
  .object({
    source_url: z.string().url().startsWith("https://").max(2000),
    title: z.string().trim().min(3).max(500),
    published_at: z.string().date(),
    accessed_at: z.string().date(),
    source_type: z.enum(["PRIMARY", "OFFICIAL", "SECONDARY"]),
  })
  .strict();
const youtubeClaim = z
  .object({
    claim_id: z.string().regex(/^[A-Z0-9][A-Z0-9_-]{0,39}$/),
    text: z.string().trim().min(3).max(2000),
    source_url: z.string().url().startsWith("https://").max(2000),
    classification: z.enum([
      "FACT",
      "USER-SUPPLIED INFORMATION",
      "EXTERNAL RESEARCH",
      "ASSUMPTION",
      "HYPOTHESIS",
      "ESTIMATE",
      "AI INFERENCE",
      "UNRESOLVED QUESTION",
    ]),
    script_usage: z.string().trim().min(3).max(2000),
    review_state: z.enum(["SUPPORTED", "UNSUPPORTED", "NEEDS_REVIEW"]),
  })
  .strict();
const youtubePackageFields = {
  source_pack: z.array(youtubeSource).min(1).max(50),
  claim_ledger: z.array(youtubeClaim).min(1).max(100),
  script: z.string().trim().min(100).max(50000),
  red_team: z
    .object({
      financial_promotions_clear: z.boolean(),
      misinformation_clear: z.boolean(),
      originality_clear: z.boolean(),
      advice_language_clear: z.boolean(),
    })
    .strict(),
  storyboard: z
    .object({
      scenes: z.array(z.record(z.string(), z.unknown())).min(1).max(100),
    })
    .strict(),
  rights_review: z
    .object({
      assets_cleared: z.boolean(),
      music_cleared: z.boolean(),
      voice_rights_cleared: z.boolean(),
    })
    .strict(),
  voice_provenance: z
    .object({
      voice_type: z.enum(["HUMAN", "SYNTHETIC", "NONE"]),
      provider: z.string().trim().min(1).max(240),
      rights_basis: z.string().trim().min(3).max(2000),
      disclosure_required: z.boolean(),
      disclosure_present: z.boolean(),
    })
    .strict(),
  render_manifest: z
    .object({
      render_sha256: sha256,
      captions_sha256: sha256,
      duration_seconds: z.number().positive().max(43200),
      format: z.enum(["MP4", "WEBM"]),
      local_only: z.boolean(),
    })
    .strict(),
  qa_review: z
    .object({
      technical: z.boolean(),
      captions: z.boolean(),
      editorial: z.boolean(),
      accessibility: z.boolean(),
    })
    .strict(),
  publication_metadata: z
    .object({
      title: z.string().trim().min(3).max(100),
      description: z.string().trim().min(3).max(5000),
      thumbnail_sha256: sha256,
      disclosure_text: z.string().max(2000),
      visibility: z.enum(["PRIVATE", "UNLISTED"]),
      deceptive_metadata_clear: z.boolean(),
    })
    .strict(),
};
const youtubeReviewChecks = z
  .object({
    sources: z.boolean(),
    claims: z.boolean(),
    originality: z.boolean(),
    rights: z.boolean(),
    disclosure: z.boolean(),
    compliance: z.boolean(),
    technical_qa: z.boolean(),
    captions: z.boolean(),
    metadata: z.boolean(),
  })
  .strict();
const repositoryControls = z
  .object({
    hooks_disabled: z.boolean(),
    submodules_disabled: z.boolean(),
    lifecycle_scripts_disabled: z.boolean(),
    actions_disabled: z.boolean(),
    network_disabled: z.boolean(),
    secrets_absent: z.boolean(),
    path_traversal_rejected: z.boolean(),
    symlink_escape_rejected: z.boolean(),
    archive_bomb_rejected: z.boolean(),
    binary_policy_passed: z.boolean(),
  })
  .strict();
const repositoryToolchain = z
  .object({
    secret_scanner: z.string().trim().min(1).max(240),
    malware_scanner: z.string().trim().min(1).max(240),
    dependency_scanner: z.string().trim().min(1).max(240),
    sbom_tool: z.string().trim().min(1).max(240),
    sast_tool: z.string().trim().min(1).max(240),
    workflow_inspector: z.string().trim().min(1).max(240),
    signatures_as_of: z.string().trim().min(1).max(240),
  })
  .strict();
const repositoryReviewChecks = z
  .object({
    licence: z.boolean(),
    provenance: z.boolean(),
    security: z.boolean(),
    scope: z.boolean(),
    architecture: z.boolean(),
    threat_model: z.boolean(),
    tests: z.boolean(),
    rollback: z.boolean(),
  })
  .strict();
const json = (data: unknown, status = 200) =>
  NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
async function body(req: Request) {
  if (!req.headers.get("content-type")?.startsWith("application/json"))
    throw new HttpError(415, "JSON required");
  const reader = req.body?.getReader();
  if (!reader) throw new HttpError(400, "Body required");
  let text = "",
    size = 0;
  const decoder = new TextDecoder();
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 100000) {
      await reader.cancel();
      throw new HttpError(413, "Request too large");
    }
    text += decoder.decode(value, { stream: true });
  }
  try {
    return JSON.parse(text + decoder.decode());
  } catch {
    throw new HttpError(400, "Invalid JSON");
  }
}
const projectResourceQueries = {
  workspaceEntry: "select project_id from kxra.workspace_entries where id=$1",
  vehicleCompatibility:
    "select project_id from kxra.vehicle_compatibility where id=$1",
  propertyAsset: "select project_id from kxra.property_assets where id=$1",
  digitalOpportunity:
    "select project_id from kxra.digital_opportunities where id=$1",
  youtubePackage:
    "select project_id from kxra.youtube_content_packages where id=$1",
  youtubePackageVersion:
    "select project_id from kxra.youtube_content_package_versions where id=$1",
  youtubeReview:
    "select project_id from kxra.youtube_content_reviews where id=$1",
  repositoryCandidate:
    "select project_id from kxra.repository_candidates where id=$1",
  repositoryQuarantine:
    "select project_id from kxra.repository_quarantine_records where id=$1",
  repositoryAssessment:
    "select project_id from kxra.repository_assessments where id=$1",
  repositoryProposalVersion:
    "select project_id from kxra.repository_adoption_proposal_versions where id=$1",
  repositoryReview:
    "select project_id from kxra.repository_adoption_reviews where id=$1",
} as const;
async function requireProjectResource(
  a: Awaited<ReturnType<typeof actor>>,
  resource: keyof typeof projectResourceQueries,
  id: string,
  projectId: string,
) {
  const rows = await query<{ project_id: string }>(
    a,
    projectResourceQueries[resource],
    [id],
  );
  if (rows[0]?.project_id !== projectId) throw new HttpError(404, "Not found");
}
async function handle(req: Request, ctx: Context) {
  try {
    const { path: p } = await ctx.params;
    const url = new URL(req.url);
    const method = req.method;
    if (method !== "GET") sameOrigin(req);
    const a = await actor();
    if (p[0] === "dashboard" && method === "GET")
      return json(await ownerDashboard(a));
    if (p[0] === "portfolio" && method === "GET") {
      owner(a);
      const input = z
        .object({
          lifecycle_stage: z.enum(lifecycleStages).optional(),
          disposition: z.enum(dispositions).optional(),
          sort: z
            .enum([
              "code",
              "name",
              "lifecycle_stage",
              "disposition",
              "venture_score",
              "confidence_score",
              "next_gate",
              "updated_at",
            ])
            .default("code"),
          direction: z.enum(["asc", "desc"]).default("asc"),
          page: pageNumber,
          page_size: pageSize.default(10),
        })
        .strict()
        .parse(Object.fromEntries(url.searchParams));
      return json(
        await listPortfolio(a, {
          lifecycleStage: input.lifecycle_stage,
          disposition: input.disposition,
          sort: input.sort,
          direction: input.direction,
          page: input.page,
          pageSize: input.page_size,
        }),
      );
    }
    if (p[0] === "ideas") {
      if (method === "GET" && !p[1]) {
        const input = z
          .object({
            project_id: uuid.optional(),
            state: z.enum(ideaStates).optional(),
            submitter_id: uuid.optional(),
            page: pageNumber,
            page_size: pageSize.default(25),
          })
          .strict()
          .parse(Object.fromEntries(url.searchParams));
        if (input.project_id) await project(a, input.project_id);
        return json(
          await listIdeas(a, {
            project: input.project_id,
            state: input.state,
            submitter: input.submitter_id,
            page: input.page,
            pageSize: input.page_size,
          }),
        );
      }
      if (method === "GET" && p[1] && !p[2]) {
        uuid.parse(p[1]);
        return json(await getIdea(a, p[1]));
      }
      if (method === "POST" && !p[1]) {
        const input = z
          .object({ project_id: uuid.nullable(), ...ideaFields })
          .strict()
          .parse(await body(req));
        if (input.project_id) await project(a, input.project_id);
        const rows = await query<{ record_id: string }>(
          a,
          "select (kxra.create_idea($1)).record_id",
          [JSON.stringify(input)],
        );
        return json(await getIdea(a, rows[0].record_id), 201);
      }
      if (method === "PATCH" && p[1] && !p[2]) {
        uuid.parse(p[1]);
        const input = z
          .object({ version: positiveVersion, ...ideaFields })
          .strict()
          .parse(await body(req));
        const { version, ...contents } = input;
        const rows = await query<{ record_id: string }>(
          a,
          "select (kxra.update_idea($1,$2,$3)).record_id",
          [p[1], version, JSON.stringify(contents)],
        );
        return json(await getIdea(a, rows[0].record_id));
      }
      if (method === "POST" && p[1] && p[2] === "state") {
        uuid.parse(p[1]);
        owner(a);
        const input = z
          .object({
            version: positiveVersion,
            state: z.enum(ideaStates),
            reason: z.string().trim().min(1).max(2000),
          })
          .strict()
          .parse(await body(req));
        const rows = await query<{ record_id: string }>(
          a,
          "select (kxra.transition_idea($1,$2,$3,$4)).record_id",
          [p[1], input.version, input.state, input.reason],
        );
        return json(await getIdea(a, rows[0].record_id));
      }
      if (method === "POST" && p[1] && p[2] === "merge") {
        uuid.parse(p[1]);
        owner(a);
        const input = z
          .object({
            version: positiveVersion,
            canonical_id: uuid,
            reason: z.string().trim().min(1).max(2000),
          })
          .strict()
          .parse(await body(req));
        const rows = await query<{ record_id: string }>(
          a,
          "select (kxra.merge_idea_duplicate($1,$2,$3,$4)).record_id",
          [p[1], input.version, input.canonical_id, input.reason],
        );
        return json(await getIdea(a, rows[0].record_id));
      }
      if (method === "POST" && p[1] && p[2] === "share-approval") {
        uuid.parse(p[1]);
        owner(a);
        const input = z
          .object({ user_id: uuid, active: z.boolean() })
          .strict()
          .parse(await body(req));
        const rows = await query(
          a,
          "select * from kxra.request_idea_share_approval($1,$2,$3)",
          [p[1], input.user_id, input.active],
        );
        return json(rows[0], 201);
      }
      throw new HttpError(404, "Not found");
    }
    if (p[0] === "work-log" && method === "GET") {
      owner(a);
      const input = z
        .object({
          project_id: uuid.optional(),
          actor: z.string().trim().max(200).optional(),
          department: z.string().trim().max(120).optional(),
          type: z.enum(workLogTypes).optional(),
          status: z.string().trim().max(80).optional(),
          from: z.string().datetime({ offset: true }).optional(),
          to: z.string().datetime({ offset: true }).optional(),
          page: pageNumber,
          page_size: pageSize.default(50),
        })
        .strict()
        .parse(Object.fromEntries(url.searchParams));
      if (input.project_id) await project(a, input.project_id);
      return json(
        await listWorkLog(a, {
          project: input.project_id,
          actor: input.actor,
          department: input.department,
          type: input.type,
          status: input.status,
          from: input.from,
          to: input.to,
          page: input.page,
          pageSize: input.page_size,
        }),
      );
    }
    if (p[0] === "admin" && method === "GET")
      return json(await adminSnapshot(a));
    if (p[0] === "account") {
      if (method === "GET" && !p[1]) {
        const [
          profileRows,
          preferenceRows,
          assignments,
          pairings,
          securityEvents,
        ] = await Promise.all([
          query(
            a,
            `select first_name,last_name,job_title,company,phone,account_state,
                onboarding_completed_at,mfa_state,updated_at
               from kxra.profiles where user_id=$1`,
            [a.id],
          ),
          query(
            a,
            `select timezone,email_notifications,whatsapp_notifications,
                security_alerts,display_density,updated_at
               from kxra.user_preferences where user_id=$1`,
            [a.id],
          ),
          query(
            a,
            `select membership.project_id,project.code,project.name,
                membership.role,membership.active,membership.expires_at
               from kxra.project_memberships membership
               join kxra.projects project on project.id=membership.project_id
               where membership.user_id=$1 order by project.code`,
            [a.id],
          ),
          query(
            a,
            `select id,verified_at,revoked_at from kxra.whatsapp_pairings
               where user_id=$1 order by verified_at desc nulls last`,
            [a.id],
          ),
          query(
            a,
            `select event_type,metadata,created_at from kxra.account_security_events
               where user_id=$1 order by created_at desc limit 20`,
            [a.id],
          ),
        ]);
        return json({
          profile: profileRows[0],
          preferences: preferenceRows[0],
          assignments,
          pairings,
          security_events: securityEvents,
          identity: {
            email: a.email,
            role: a.role,
            aal: a.aal,
            source: a.source,
          },
        });
      }
      if (p[1] === "profile" && method === "PATCH") {
        const input = z
          .object({
            first_name: z.string().trim().min(1).max(100),
            last_name: z.string().trim().min(1).max(100),
            job_title: z.string().trim().max(160),
            company: z.string().trim().max(200),
            phone: z.string().trim().max(40),
          })
          .strict()
          .parse(await body(req));
        await query(a, "select kxra.update_own_profile($1)", [
          JSON.stringify(input),
        ]);
        return json({ ok: true });
      }
      if (p[1] === "preferences" && method === "PATCH") {
        const input = z
          .object({
            timezone: z.string().trim().min(1).max(100),
            email_notifications: z.boolean(),
            whatsapp_notifications: z.boolean(),
            display_density: z.enum(["comfortable", "compact"]),
          })
          .strict()
          .parse(await body(req));
        await query(a, "select kxra.update_own_preferences($1)", [
          JSON.stringify(input),
        ]);
        return json({ ok: true });
      }
      if (p[1] === "password" && method === "POST") {
        if (!localMode() || a.source !== "fake-provider")
          throw new HttpError(
            503,
            "Password provider is unavailable in this environment",
          );
        const input = z
          .object({
            current_password: z.string().min(1).max(256),
            new_password: z.string().min(12).max(256),
            confirmation: z.string().min(12).max(256),
          })
          .strict()
          .refine((value) => value.new_password === value.confirmation)
          .parse(await body(req));
        const identity = await fakeAuthProvider().changePassword(
          a.id,
          input.current_password,
          input.new_password,
        );
        await query(
          a,
          "select kxra.record_password_event('PASSWORD_CHANGED')",
          [],
        );
        await issueLocalProviderSession(identity, a.session_version);
        return json({ ok: true });
      }
      if (p[1] === "mfa" && method === "POST") {
        if (!localMode() || a.source !== "fake-provider")
          throw new HttpError(
            503,
            "MFA provider is unavailable in this environment",
          );
        const input = z
          .object({
            action: z.enum([
              "begin",
              "complete",
              "begin_recovery",
              "recover",
              "challenge",
              "remove",
            ]),
            proof: z.string().max(200).optional(),
          })
          .strict()
          .parse(await body(req));
        const provider = fakeAuthProvider();
        const identity =
          input.action === "begin"
            ? await provider.beginMfaEnrollment(a.id)
            : input.action === "complete"
              ? await provider.completeMfaEnrollment(a.id, input.proof || "")
              : input.action === "begin_recovery"
                ? await provider.beginMfaRecovery(a.id)
                : input.action === "recover"
                  ? await provider.recoverMfa(a.id, input.proof || "")
                  : input.action === "challenge"
                    ? await provider.challengeMfa(a.id, input.proof || "")
                    : await provider.removeMfa(a.id, input.proof || "");
        if (input.action !== "challenge")
          await query(a, "select kxra.record_mfa_state($1,$2)", [
            identity.mfaState,
            identity.factorReference || null,
          ]);
        await issueLocalProviderSession(identity, a.session_version);
        return json({ state: identity.mfaState, aal: identity.aal });
      }
      if (p[1] === "sessions" && method === "POST") {
        z.object({})
          .strict()
          .parse(await body(req));
        const rows = await query<{ session_version: number }>(
          a,
          "select kxra.revoke_own_sessions($1,$2) as session_version",
          [
            "User requested sign out on all devices",
            localMode() ? "LOCAL_APPLIED" : "PROVIDER_PENDING",
          ],
        );
        if (localMode() && a.source === "fake-provider")
          await fakeAuthProvider().signOutAll(a.id);
        (await cookies()).delete("kxra_local_session");
        return json({ ok: true, session_version: rows[0].session_version });
      }
      if (p[1] === "whatsapp" && p[2] === "unpair" && method === "POST") {
        z.object({})
          .strict()
          .parse(await body(req));
        await query(a, "select kxra.unpair_own_whatsapp()", []);
        return json({ ok: true });
      }
      throw new HttpError(404, "Not found");
    }
    if (p[0] === "routines") {
      owner(a);
      if (method === "GET" && !p[1]) {
        return json(
          await query(
            a,
            `select manifest.id,manifest.code,manifest.name,manifest.enabled,
              version.id as version_id,version.version,version.status,
              version.version_sha256,version.trigger_type,version.trigger_config,
              version.timezone,version.calendar_code,version.action_graph,
              version.scope_mode,version.maximum_attempts,version.lease_seconds,
              version.notification_policy
             from kxra.routine_manifests manifest
             join kxra.routine_manifest_versions version
              on version.routine_id=manifest.id and version.version=manifest.current_version
             order by manifest.code`,
          ),
        );
      }
      if (
        method === "POST" &&
        p[1] === "versions" &&
        p[2] &&
        p[3] === "approve"
      ) {
        recentOwnerMfa(a);
        const versionId = uuid.parse(p[2]);
        const input = z
          .object({
            expected_sha256: sha256,
            note: z.string().trim().min(3).max(3000),
            request_id: requestId,
          })
          .strict()
          .parse(await body(req));
        const rows = await query(
          a,
          "select result.* from kxra.approve_routine_version($1,$2,$3,$4) result",
          [versionId, input.expected_sha256, input.note, input.request_id],
        );
        return json(rows[0]);
      }
      if (
        method === "POST" &&
        p[1] === "versions" &&
        p[2] &&
        p[3] === "state"
      ) {
        recentOwnerMfa(a);
        const versionId = uuid.parse(p[2]);
        const input = z
          .object({
            expected_sha256: sha256,
            enabled: z.boolean(),
            request_id: requestId,
          })
          .strict()
          .parse(await body(req));
        const rows = await query(
          a,
          "select result.* from kxra.set_routine_enabled($1,$2,$3,$4) result",
          [versionId, input.expected_sha256, input.enabled, input.request_id],
        );
        return json(rows[0]);
      }
      if (
        method === "POST" &&
        p[1] === "versions" &&
        p[2] &&
        p[3] === "slots"
      ) {
        const versionId = uuid.parse(p[2]);
        const input = z
          .object({
            local_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
            project_id: uuid.nullable(),
            request_id: requestId,
          })
          .strict()
          .parse(await body(req));
        const rows = await query(
          a,
          "select * from kxra.plan_routine_slot($1,$2,$3,$4)",
          [versionId, input.local_date, input.project_id, input.request_id],
        );
        return json(rows[0]);
      }
      if (
        method === "POST" &&
        p[1] === "versions" &&
        p[2] &&
        p[3] === "events"
      ) {
        const versionId = uuid.parse(p[2]);
        const input = z
          .object({
            event_code: z.string().regex(/^[a-z][a-z0-9._-]{2,119}$/),
            event_id: z.string().regex(/^[A-Za-z0-9._:-]{3,240}$/),
            project_id: uuid.nullable(),
            payload_sha256: sha256,
            request_id: requestId,
          })
          .strict()
          .parse(await body(req));
        const rows = await query(
          a,
          "select result.* from kxra.enqueue_routine_event($1,$2,$3,$4,$5,$6) result",
          [
            versionId,
            input.event_code,
            input.event_id,
            input.project_id,
            input.payload_sha256,
            input.request_id,
          ],
        );
        return json(rows[0]);
      }
      if (method === "POST" && p[1] === "calendars" && !p[2]) {
        recentOwnerMfa(a);
        const input = z
          .object({
            calendar_code: z.string().regex(/^[A-Z0-9_-]{2,40}$/),
            local_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
            is_open: z.boolean(),
            session_label: z.string().trim().min(1).max(80),
            source_reference: z.string().trim().min(3).max(500),
            source_sha256: sha256,
            request_id: requestId,
          })
          .strict()
          .parse(await body(req));
        const rows = await query(
          a,
          "select result.* from kxra.record_routine_calendar_day($1,$2,$3,$4,$5,$6,$7) result",
          [
            input.calendar_code,
            input.local_date,
            input.is_open,
            input.session_label,
            input.source_reference,
            input.source_sha256,
            input.request_id,
          ],
        );
        return json(rows[0], 201);
      }
      throw new HttpError(404, "Not found");
    }
    if (p[0] === "brand-studio") {
      if (method === "GET" && !p[1]) return json(await loadBrandStudio(a));
      if (method === "POST" && p[1] === "sources" && !p[2]) {
        const input = z
          .object({
            project_id: uuid,
            source_type: z.enum(["WEBSITE", "MANUAL", "FILE"]),
            website_url: z.string().trim().max(2000).nullable(),
            source_text: z.string().trim().min(1).max(50000),
            rights_basis: z.string().trim().min(3).max(2000),
            consent: z.literal(true),
            request_id: uuid,
          })
          .strict()
          .parse(await body(req));
        await project(a, input.project_id);
        const locator =
          input.source_type === "WEBSITE"
            ? assertPublicWebsiteUrl(input.website_url || "")
            : null;
        if (input.source_type !== "WEBSITE" && input.website_url)
          throw new HttpError(
            400,
            "Website URL is only valid for website sources",
          );
        const rows = await query<{
          source_id: string;
          source_version_id: string;
          version: number;
        }>(a, "select * from kxra.create_brand_source($1,$2,$3,$4,$5,$6,$7)", [
          input.project_id,
          input.source_type,
          locator,
          input.source_text,
          input.rights_basis,
          input.consent,
          input.request_id,
        ]);
        return json(rows[0], 201);
      }
      if (method === "POST" && p[1] === "profiles" && !p[2]) {
        const input = z
          .object({
            project_id: uuid,
            source_version_id: uuid,
            name: z.string().trim().min(1).max(160),
            business_name: z.string().trim().max(160).nullable().optional(),
            tone: z.string().max(2000).optional(),
            audiences: z.string().max(5000).optional(),
            offers: z.string().max(5000).optional(),
            request_id: uuid,
          })
          .strict()
          .parse(await body(req));
        await project(a, input.project_id);
        const source = (
          await query<{
            project_id: string;
            supplied_content: string;
            locator: string | null;
          }>(
            a,
            `select version.project_id,version.supplied_content,source.locator
             from kxra.brand_source_versions version
             join kxra.brand_sources source on source.id=version.source_id
             where version.id=$1`,
            [input.source_version_id],
          )
        )[0];
        if (!source || source.project_id !== input.project_id)
          throw new HttpError(404, "Brand source not found");
        const profile = inferLocalBrandProfile({
          websiteUrl: source.locator,
          sourceText: source.supplied_content,
          businessName: input.business_name,
          tone: input.tone,
          audiences: input.audiences,
          offers: input.offers,
        });
        const rows = await query<{
          profile_id: string;
          profile_version_id: string;
          version: number;
        }>(a, "select * from kxra.create_brand_profile($1,$2,$3,$4,$5)", [
          input.project_id,
          input.name,
          profile,
          JSON.stringify(brandProfileEvidence(input.source_version_id)),
          input.request_id,
        ]);
        return json({ ...rows[0], profile }, 201);
      }
      if (
        method === "POST" &&
        p[1] === "profiles" &&
        p[2] &&
        p[3] === "revise" &&
        !p[4]
      ) {
        const profileId = uuid.parse(p[2]);
        const input = z
          .object({
            expected_version: positiveVersion,
            source_version_id: uuid,
            profile_data: brandProfileSchema,
            request_id: uuid,
          })
          .strict()
          .parse(await body(req));
        const rows = await query<{
          profile_version_id: string;
          version: number;
        }>(a, "select * from kxra.revise_brand_profile($1,$2,$3,$4,$5)", [
          profileId,
          input.expected_version,
          input.profile_data,
          JSON.stringify(
            brandProfileEvidence(
              input.source_version_id,
              "USER-SUPPLIED INFORMATION",
            ),
          ),
          input.request_id,
        ]);
        return json(rows[0]);
      }
      if (
        method === "POST" &&
        p[1] === "profiles" &&
        p[2] &&
        p[3] === "decision" &&
        !p[4]
      ) {
        const profileId = uuid.parse(p[2]);
        const input = z
          .object({
            version: positiveVersion,
            decision: z.enum(["APPROVE", "REJECT"]),
            note: z.string().trim().min(1).max(5000),
          })
          .strict()
          .parse(await body(req));
        return json(
          (
            await query(
              a,
              "select result.* from kxra.decide_brand_profile($1,$2,$3,$4) result",
              [profileId, input.version, input.decision, input.note],
            )
          )[0],
        );
      }
      if (method === "POST" && p[1] === "campaigns" && !p[2]) {
        const input = campaignBriefSchema
          .extend({
            project_id: uuid,
            profile_id: uuid,
            profile_version: positiveVersion,
            name: z.string().trim().min(1).max(160),
            request_id: uuid,
          })
          .strict()
          .parse(await body(req));
        await project(a, input.project_id);
        const rows = await query<{
          brief_id: string;
          brief_version_id: string;
          version: number;
        }>(
          a,
          "select * from kxra.create_campaign_brief($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)",
          [
            input.project_id,
            input.profile_id,
            input.profile_version,
            input.name,
            input.objective,
            input.audience,
            input.offer,
            input.channels,
            input.constraints,
            JSON.stringify(input.claims),
            input.success_measure,
            input.request_id,
          ],
        );
        return json(rows[0], 201);
      }
      if (
        method === "POST" &&
        p[1] === "campaigns" &&
        p[2] &&
        p[3] === "revise" &&
        !p[4]
      ) {
        const briefId = uuid.parse(p[2]);
        const input = campaignBriefSchema
          .extend({
            expected_version: positiveVersion,
            profile_version: positiveVersion,
            request_id: uuid,
          })
          .strict()
          .parse(await body(req));
        const rows = await query<{
          brief_version_id: string;
          version: number;
        }>(
          a,
          "select * from kxra.revise_campaign_brief($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
          [
            briefId,
            input.expected_version,
            input.profile_version,
            input.objective,
            input.audience,
            input.offer,
            input.channels,
            input.constraints,
            JSON.stringify(input.claims),
            input.success_measure,
            input.request_id,
          ],
        );
        return json(rows[0]);
      }
      if (
        method === "POST" &&
        p[1] === "campaigns" &&
        p[2] &&
        p[3] === "decision" &&
        !p[4]
      ) {
        const briefId = uuid.parse(p[2]);
        const input = z
          .object({
            version: positiveVersion,
            decision: z.enum(["APPROVE", "REJECT"]),
            note: z.string().trim().min(1).max(5000),
          })
          .strict()
          .parse(await body(req));
        return json(
          (
            await query(
              a,
              "select result.* from kxra.decide_campaign_brief($1,$2,$3,$4) result",
              [briefId, input.version, input.decision, input.note],
            )
          )[0],
        );
      }
      if (method === "POST" && p[1] === "generate" && !p[2]) {
        const input = z
          .object({
            project_id: uuid,
            profile_id: uuid,
            profile_version: positiveVersion,
            brief_id: uuid,
            brief_version: positiveVersion,
            channels: z.array(brandChannelSchema).min(1).max(6),
            variant_count: z.number().int().min(1).max(6),
            request_id: uuid,
          })
          .strict()
          .parse(await body(req));
        await project(a, input.project_id);
        return json(
          await executeLocalBrandGeneration(a, {
            projectId: input.project_id,
            profileId: input.profile_id,
            profileVersion: input.profile_version,
            briefId: input.brief_id,
            briefVersion: input.brief_version,
            channels: input.channels,
            variantCount: input.variant_count,
            requestId: input.request_id,
          }),
          201,
        );
      }
      if (
        method === "POST" &&
        p[1] === "variants" &&
        p[2] &&
        p[3] === "revise" &&
        !p[4]
      ) {
        const variantId = uuid.parse(p[2]);
        const input = z
          .object({
            expected_sha256: z.string().regex(/^[a-f0-9]{64}$/),
            content: creativeContentSchema,
            request_id: uuid,
          })
          .strict()
          .parse(await body(req));
        const rows = await query<{ id: string }>(
          a,
          "select kxra.revise_creative_variant($1,$2,$3,$4) as id",
          [variantId, input.expected_sha256, input.content, input.request_id],
        );
        return json(rows[0], 201);
      }
      if (
        method === "POST" &&
        p[1] === "variants" &&
        p[2] &&
        p[3] === "review" &&
        !p[4]
      ) {
        const variantId = uuid.parse(p[2]);
        const input = z
          .object({
            expected_sha256: z.string().regex(/^[a-f0-9]{64}$/),
            checks: z
              .object({
                brand: z.boolean(),
                claims: z.boolean(),
                rights: z.boolean(),
                accessibility: z.boolean(),
                compliance: z.boolean(),
              })
              .strict(),
            decision: z.enum(["APPROVE_EXPORT", "REQUEST_CHANGES", "REJECT"]),
            note: z.string().trim().min(1).max(5000),
            request_id: uuid,
          })
          .strict()
          .parse(await body(req));
        const rows = await query<{ id: string }>(
          a,
          "select kxra.review_creative_variant($1,$2,$3,$4,$5,$6) as id",
          [
            variantId,
            input.expected_sha256,
            input.checks,
            input.decision,
            input.note,
            input.request_id,
          ],
        );
        return json(rows[0], 201);
      }
      if (method === "POST" && p[1] === "exports" && !p[2]) {
        const input = z
          .object({
            variant_id: uuid,
            expected_sha256: z.string().regex(/^[a-f0-9]{64}$/),
            review_id: uuid,
            format: z.enum(["TEXT", "MARKDOWN", "JSON"]),
            request_id: uuid,
          })
          .strict()
          .parse(await body(req));
        const rows = await query<{ id: string }>(
          a,
          "select kxra.create_brand_export($1,$2,$3,$4,$5) as id",
          [
            input.variant_id,
            input.expected_sha256,
            input.review_id,
            input.format,
            input.request_id,
          ],
        );
        return json(rows[0], 201);
      }
      if (method === "GET" && p[1] === "exports" && p[2] && !p[3]) {
        const exportId = uuid.parse(p[2]);
        const result = (
          await query<{
            allowed: boolean;
            reason_code: string;
            export_format: "TEXT" | "MARKDOWN" | "JSON" | null;
            filename: string | null;
            content: unknown;
            content_sha256: string | null;
          }>(a, "select * from kxra.authorize_brand_export($1)", [exportId])
        )[0];
        if (!result?.allowed || !result.export_format || !result.filename)
          throw new HttpError(403, "Brand export unavailable");
        const rendered = renderBrandExport(
          result.export_format,
          creativeContentSchema.parse(result.content),
        );
        return new NextResponse(rendered, {
          status: 200,
          headers: {
            "Cache-Control": "private, no-store",
            "Content-Type":
              result.export_format === "JSON"
                ? "application/json; charset=utf-8"
                : result.export_format === "MARKDOWN"
                  ? "text/markdown; charset=utf-8"
                  : "text/plain; charset=utf-8",
            "Content-Disposition": `attachment; filename="${result.filename}"`,
            "X-Content-Type-Options": "nosniff",
          },
        });
      }
      throw new HttpError(404, "Not found");
    }
    if (p[0] === "plans" && method === "GET") {
      return json(
        await query(
          a,
          `select plan.plan_key,plan.name,version.id as plan_version_id,
            version.version,version.currency,version.amount_minor::text,
            version.billing_interval,version.tax_behavior,version.commercial_copy,
            coalesce(jsonb_agg(jsonb_build_object(
              'feature_key',feature.feature_key,
              'quantity_limit',feature.quantity_limit,
              'usage_window',feature.usage_window
            ) order by feature.feature_key) filter(where feature.id is not null),'[]'::jsonb) as features
           from kxra.plans plan
           join kxra.plan_versions version on version.plan_id=plan.id and version.state='ACTIVE'
           left join kxra.plan_features feature on feature.plan_version_id=version.id
           where plan.state='ACTIVE'
           group by plan.plan_key,plan.name,version.id,version.version,version.currency,
             version.amount_minor,version.billing_interval,version.tax_behavior,
             version.commercial_copy
           order by plan.name,version.version`,
        ),
      );
    }
    if (p[0] === "entitlements" && method === "GET") {
      const input = z
        .object({
          feature: z.string().regex(/^[a-z][a-z0-9]*(?:[.:_-][a-z0-9]+)*$/),
          units: z.coerce.number().int().positive().max(1_000_000).default(1),
        })
        .strict()
        .parse(Object.fromEntries(url.searchParams));
      return json(
        (
          await query(a, "select * from kxra.entitlement_decision($1,$2)", [
            input.feature,
            input.units,
          ])
        )[0],
      );
    }
    if (p[0] === "usage-reservations" && method === "POST") {
      if (!p[1]) {
        const input = z
          .object({
            feature: z.string().regex(/^[a-z][a-z0-9]*(?:[.:_-][a-z0-9]+)*$/),
            units: z.number().int().positive().max(1_000_000),
            idempotency_key: z.string().trim().min(8).max(240),
          })
          .strict()
          .parse(await body(req));
        return json(
          (
            await query(
              a,
              "select result.* from kxra.reserve_usage($1,$2,$3) result",
              [input.feature, input.units, input.idempotency_key],
            )
          )[0],
          201,
        );
      }
      const reservationId = uuid.parse(p[1]);
      if (p[2] !== "complete" || p[3]) throw new HttpError(404, "Not found");
      const input = z
        .object({
          outcome: z.enum(["SUCCESS", "FAILURE"]),
          provider_units: z.number().int().nonnegative().nullable(),
          provider_cost_minor: z.number().int().nonnegative().nullable(),
          provider_currency: z
            .string()
            .regex(/^[A-Z]{3}$/)
            .nullable(),
        })
        .strict()
        .parse(await body(req));
      return json(
        (
          await query(
            a,
            "select result.* from kxra.complete_usage_reservation($1,$2,$3,$4,$5) result",
            [
              reservationId,
              input.outcome,
              input.provider_units,
              input.provider_cost_minor,
              input.provider_currency,
            ],
          )
        )[0],
      );
    }
    if (p[0] === "entitlement-grants") {
      recentOwnerMfa(a);
      if (method === "POST" && !p[1]) {
        const input = z
          .object({
            organisation_id: uuid,
            feature: z.string().regex(/^[a-z][a-z0-9]*(?:[.:_-][a-z0-9]+)*$/),
            quantity_limit: z.number().int().positive().nullable(),
            usage_window: z.enum(["MONTH", "NONE"]),
            expires_at: z.string().datetime({ offset: true }).nullable(),
            reason: z.string().trim().min(1).max(1000),
          })
          .strict()
          .parse(await body(req));
        const rows = await query<{ id: string }>(
          a,
          "select kxra.grant_free_entitlement($1,$2,$3,$4,$5,$6) as id",
          [
            input.organisation_id,
            input.feature,
            input.quantity_limit,
            input.usage_window,
            input.expires_at,
            input.reason,
          ],
        );
        return json(rows[0], 201);
      }
      if (method === "POST" && p[1] && p[2] === "revoke" && !p[3]) {
        const grantId = uuid.parse(p[1]);
        const input = z
          .object({ reason: z.string().trim().min(1).max(1000) })
          .strict()
          .parse(await body(req));
        await query(a, "select kxra.revoke_free_entitlement($1,$2)", [
          grantId,
          input.reason,
        ]);
        return json({ ok: true });
      }
      throw new HttpError(404, "Not found");
    }
    if (p[0] === "custom-projects") {
      if (method === "GET" && !p[1]) {
        return json(
          await query(
            a,
            `select request.*,
              coalesce(jsonb_agg(jsonb_build_object(
                'id',proposal.id,'version',proposal.version,'state',proposal.state,
                'proposal_hash',proposal.proposal_hash,'price_minor',proposal.price_minor,
                'currency',proposal.currency,'valid_until',proposal.valid_until
              ) order by proposal.version) filter(where proposal.id is not null),'[]'::jsonb) as proposals
             from kxra.custom_project_requests request
             left join kxra.project_proposals proposal on proposal.request_id=request.id
             group by request.id order by request.created_at desc`,
          ),
        );
      }
      if (method === "POST" && !p[1]) {
        const input = z
          .object({
            problem: z.string().trim().min(1).max(20000),
            desired_outcome: z.string().trim().min(1).max(20000),
            constraints: z.string().max(20000).default(""),
            reuse_consent: z.boolean().default(false),
            request_id: uuid,
          })
          .strict()
          .parse(await body(req));
        const rows = await query<{ id: string }>(
          a,
          "select kxra.submit_custom_project_request($1,$2,$3,$4,$5) as id",
          [
            input.problem,
            input.desired_outcome,
            input.constraints,
            input.reuse_consent,
            input.request_id,
          ],
        );
        return json(rows[0], 201);
      }
      if (p[1] && p[2] === "proposals" && !p[3] && method === "POST") {
        const requestId = uuid.parse(p[1]);
        const input = z
          .object({
            scope: z.string().trim().min(1).max(50000),
            exclusions: z.string().max(30000),
            assumptions: z.string().max(30000),
            milestones: z
              .array(z.record(z.string(), z.unknown()))
              .min(1)
              .max(50),
            price_minor: z
              .number()
              .int()
              .nonnegative()
              .max(Number.MAX_SAFE_INTEGER),
            currency: z.string().regex(/^[A-Z]{3}$/),
            tax_treatment: z.string().trim().min(1).max(500),
            payment_gate: z.enum(["NONE", "DEPOSIT", "PAID_IN_FULL"]),
            deposit_minor: z
              .number()
              .int()
              .nonnegative()
              .max(Number.MAX_SAFE_INTEGER),
            legal_document_id: uuid,
            legal_document_version: positiveVersion,
            legal_document_sha256: z.string().regex(/^[a-f0-9]{64}$/),
            valid_until: z.string().datetime({ offset: true }),
          })
          .strict()
          .parse(await body(req));
        const rows = await query(
          a,
          "select * from kxra.create_project_proposal($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)",
          [
            requestId,
            input.scope,
            input.exclusions,
            input.assumptions,
            JSON.stringify(input.milestones),
            input.price_minor,
            input.currency,
            input.tax_treatment,
            input.payment_gate,
            input.deposit_minor,
            input.legal_document_id,
            input.legal_document_version,
            input.legal_document_sha256,
            input.valid_until,
          ],
        );
        return json(rows[0], 201);
      }
      if (
        p[1] === "proposals" &&
        p[2] &&
        p[3] === "accept" &&
        !p[4] &&
        method === "POST"
      ) {
        const proposalId = uuid.parse(p[2]);
        const input = z
          .object({
            proposal_hash: z.string().regex(/^[a-f0-9]{64}$/),
            request_id: uuid,
          })
          .strict()
          .parse(await body(req));
        const rows = await query<{ id: string }>(
          a,
          "select kxra.accept_project_proposal($1,$2,$3) as id",
          [proposalId, input.proposal_hash, input.request_id],
        );
        return json(rows[0]);
      }
      if (
        p[1] === "proposals" &&
        p[2] &&
        p[3] === "activate" &&
        !p[4] &&
        method === "POST"
      ) {
        const proposalId = uuid.parse(p[2]);
        const input = z
          .object({
            project_code: z.string().regex(/^[A-Z][A-Z0-9-]{2,39}$/),
            project_name: z.string().trim().min(1).max(240),
          })
          .strict()
          .parse(await body(req));
        const rows = await query<{ id: string }>(
          a,
          "select kxra.activate_custom_project($1,$2,$3) as id",
          [proposalId, input.project_code, input.project_name],
        );
        return json(rows[0], 201);
      }
      throw new HttpError(404, "Not found");
    }
    if (p[0] === "summary" && method === "GET") return json(await counts(a));
    if (p[0] === "finance-totals" && method === "GET") {
      owner(a);
      return json(await totals(a));
    }
    if (p[0] === "projects" && method === "GET")
      return json(p[1] ? await project(a, p[1]) : await listProjects(a));
    if (p[0] === "project-workspaces") {
      const projectId = uuid.parse(p[1]);
      await project(a, projectId);
      if (method === "GET") {
        if (!p[2]) return json(await loadProjectWorkspace(a, projectId));
        if (p[2] === "modules" && p[3] && !p[4])
          return json(await loadProjectWorkspace(a, projectId, p[3]));
        throw new HttpError(404, "Not found");
      }
      if (p[2] === "entries" && !p[3] && method === "POST") {
        const input = z
          .object({
            module_key: z
              .string()
              .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
              .max(120),
            title: z.string().trim().min(1).max(240),
            summary: z.string().trim().min(1).max(50000),
            classification: z.enum(classifications),
            visibility: z.enum(["owner_only", "project_shared"]),
            payload: z.record(z.string(), z.unknown()),
            evidence: z.array(evidenceReference).max(20),
          })
          .strict()
          .parse(await body(req));
        const rows = await query(
          a,
          "select * from kxra.create_workspace_entry($1,$2,$3,$4,$5,$6,$7,$8)",
          [
            projectId,
            input.module_key,
            input.title,
            input.summary,
            input.classification,
            input.visibility,
            input.payload,
            JSON.stringify(input.evidence),
          ],
        );
        return json(rows[0], 201);
      }
      if (
        p[2] === "entries" &&
        p[3] &&
        p[4] === "review" &&
        !p[5] &&
        method === "POST"
      ) {
        owner(a);
        const target = uuid.parse(p[3]);
        await requireProjectResource(a, "workspaceEntry", target, projectId);
        const input = z
          .object({ version: positiveVersion })
          .strict()
          .parse(await body(req));
        const rows = await query(
          a,
          "select * from kxra.review_workspace_entry($1,$2)",
          [target, input.version],
        );
        return json(rows[0]);
      }
      if (
        p[2] === "vehicle-compatibility" &&
        p[3] &&
        p[4] === "verify" &&
        !p[5] &&
        method === "POST"
      ) {
        owner(a);
        const target = uuid.parse(p[3]);
        await requireProjectResource(
          a,
          "vehicleCompatibility",
          target,
          projectId,
        );
        const input = z
          .object({
            version: positiveVersion,
            supplier_sku: z.string().trim().min(1).max(240),
            fitment_evidence_id: uuid,
            fitment_evidence_version: positiveVersion,
            safety_evidence_id: uuid,
            safety_evidence_version: positiveVersion,
          })
          .strict()
          .parse(await body(req));
        const rows = await query(
          a,
          "select * from kxra.verify_vehicle_compatibility($1,$2,$3,$4,$5,$6,$7)",
          [
            target,
            input.version,
            input.supplier_sku,
            input.fitment_evidence_id,
            input.fitment_evidence_version,
            input.safety_evidence_id,
            input.safety_evidence_version,
          ],
        );
        return json(rows[0]);
      }
      if (p[2] === "property-assets" && !p[3] && method === "POST") {
        const input = z
          .object({
            module_key: z
              .string()
              .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
              .max(120),
            title: z.string().trim().min(1).max(240),
            asset_kind: z.enum([
              "PROPERTY_INPUT",
              "FLOORPLAN",
              "PHOTO",
              "SOURCE_ASSET",
              "DEMO",
            ]),
            origin: z.enum(["REAL_INPUT", "AI_GENERATED", "AI_INFERRED"]),
          })
          .strict()
          .parse(await body(req));
        const rows = await query(
          a,
          "select * from kxra.create_property_asset($1,$2,$3,$4,$5)",
          [
            projectId,
            input.module_key,
            input.title,
            input.asset_kind,
            input.origin,
          ],
        );
        return json(rows[0], 201);
      }
      if (
        p[2] === "property-assets" &&
        p[3] &&
        p[4] === "review" &&
        !p[5] &&
        method === "POST"
      ) {
        owner(a);
        const target = uuid.parse(p[3]);
        await requireProjectResource(a, "propertyAsset", target, projectId);
        const input = z
          .object({
            version: positiveVersion,
            rights_evidence_id: uuid,
            rights_evidence_version: positiveVersion,
            geometry_evidence_id: uuid.nullable(),
            geometry_evidence_version: positiveVersion.nullable(),
          })
          .strict()
          .refine(
            (value) =>
              (value.geometry_evidence_id === null) ===
              (value.geometry_evidence_version === null),
          )
          .parse(await body(req));
        const rows = await query(
          a,
          "select * from kxra.review_property_asset($1,$2,$3,$4,$5,$6)",
          [
            target,
            input.version,
            input.rights_evidence_id,
            input.rights_evidence_version,
            input.geometry_evidence_id,
            input.geometry_evidence_version,
          ],
        );
        return json(rows[0]);
      }
      if (p[2] === "clpr-reviews" && !p[3] && method === "POST") {
        owner(a);
        const evidenceFields = {
          route_evidence_id: uuid,
          route_evidence_version: positiveVersion,
          liquidity_evidence_id: uuid,
          liquidity_evidence_version: positiveVersion,
          recovery_evidence_id: uuid,
          recovery_evidence_version: positiveVersion,
          buyer_evidence_id: uuid,
          buyer_evidence_version: positiveVersion,
          regulatory_evidence_id: uuid,
          regulatory_evidence_version: positiveVersion,
        };
        const input = z
          .object({
            recommendation: z.enum(["MONITOR", "REVISIT", "DO_NOT_REVISIT"]),
            rationale: z.string().trim().min(1).max(50000),
            ...evidenceFields,
          })
          .strict()
          .parse(await body(req));
        const rows = await query(
          a,
          "select * from kxra.create_clpr_revisit_review($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)",
          [
            projectId,
            input.recommendation,
            input.rationale,
            input.route_evidence_id,
            input.route_evidence_version,
            input.liquidity_evidence_id,
            input.liquidity_evidence_version,
            input.recovery_evidence_id,
            input.recovery_evidence_version,
            input.buyer_evidence_id,
            input.buyer_evidence_version,
            input.regulatory_evidence_id,
            input.regulatory_evidence_version,
          ],
        );
        return json(rows[0], 201);
      }
      if (p[2] === "digital-opportunities" && !p[3] && method === "POST") {
        const input = z
          .object({
            title: z.string().trim().min(1).max(240),
            buyer_problem: z.string().trim().min(1).max(5000),
          })
          .strict()
          .parse(await body(req));
        const rows = await query(
          a,
          "select * from kxra.create_digital_opportunity($1,$2,$3)",
          [projectId, input.title, input.buyer_problem],
        );
        return json(rows[0], 201);
      }
      if (
        p[2] === "digital-opportunities" &&
        p[3] &&
        p[4] === "evidence" &&
        !p[5] &&
        method === "POST"
      ) {
        const target = uuid.parse(p[3]);
        await requireProjectResource(
          a,
          "digitalOpportunity",
          target,
          projectId,
        );
        const input = z
          .object({
            version: positiveVersion,
            evidence_id: uuid,
            evidence_version: positiveVersion,
          })
          .strict()
          .parse(await body(req));
        const rows = await query(
          a,
          "select * from kxra.attach_digital_demand_evidence($1,$2,$3,$4)",
          [target, input.version, input.evidence_id, input.evidence_version],
        );
        return json(rows[0]);
      }
      if (
        p[2] === "digital-opportunities" &&
        p[3] &&
        p[4] === "authorize" &&
        !p[5] &&
        method === "POST"
      ) {
        owner(a);
        const target = uuid.parse(p[3]);
        await requireProjectResource(
          a,
          "digitalOpportunity",
          target,
          projectId,
        );
        const input = z
          .object({
            version: positiveVersion,
            gate_authorization_id: uuid,
          })
          .strict()
          .parse(await body(req));
        const rows = await query(
          a,
          "select * from kxra.authorize_digital_local_prototype($1,$2,$3)",
          [target, input.version, input.gate_authorization_id],
        );
        return json(rows[0]);
      }
      if (p[2] === "youtube-packages" && !p[3] && method === "POST") {
        const input = z
          .object({
            topic: z.string().trim().min(3).max(500),
            ...youtubePackageFields,
            request_id: requestId,
          })
          .strict()
          .parse(await body(req));
        const rows = await query(
          a,
          "select * from kxra.create_youtube_content_package($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)",
          [
            projectId,
            input.topic,
            JSON.stringify(input.source_pack),
            JSON.stringify(input.claim_ledger),
            input.script,
            input.red_team,
            input.storyboard,
            input.rights_review,
            input.voice_provenance,
            input.render_manifest,
            input.qa_review,
            input.publication_metadata,
            input.request_id,
          ],
        );
        return json(rows[0], 201);
      }
      if (
        p[2] === "youtube-packages" &&
        p[3] &&
        p[4] === "revise" &&
        !p[5] &&
        method === "POST"
      ) {
        const packageId = uuid.parse(p[3]);
        await requireProjectResource(a, "youtubePackage", packageId, projectId);
        const input = z
          .object({
            expected_version: positiveVersion,
            ...youtubePackageFields,
            request_id: requestId,
          })
          .strict()
          .parse(await body(req));
        const rows = await query(
          a,
          "select * from kxra.revise_youtube_content_package($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)",
          [
            packageId,
            input.expected_version,
            JSON.stringify(input.source_pack),
            JSON.stringify(input.claim_ledger),
            input.script,
            input.red_team,
            input.storyboard,
            input.rights_review,
            input.voice_provenance,
            input.render_manifest,
            input.qa_review,
            input.publication_metadata,
            input.request_id,
          ],
        );
        return json(rows[0]);
      }
      if (
        p[2] === "youtube-package-versions" &&
        p[3] &&
        p[4] === "review" &&
        !p[5] &&
        method === "POST"
      ) {
        owner(a);
        const versionId = uuid.parse(p[3]);
        await requireProjectResource(
          a,
          "youtubePackageVersion",
          versionId,
          projectId,
        );
        const input = z
          .object({
            expected_version: positiveVersion,
            content_sha256: sha256,
            checks: youtubeReviewChecks,
            decision: z.enum([
              "APPROVE_UPLOAD_INTENT",
              "REQUEST_CHANGES",
              "REJECT",
            ]),
            note: z.string().trim().min(3).max(5000),
            request_id: requestId,
          })
          .strict()
          .parse(await body(req));
        const rows = await query(
          a,
          "select * from kxra.review_youtube_content_package($1,$2,$3,$4,$5,$6,$7)",
          [
            versionId,
            input.expected_version,
            input.content_sha256,
            input.checks,
            input.decision,
            input.note,
            input.request_id,
          ],
        );
        return json(rows[0]);
      }
      if (p[2] === "youtube-upload-intents" && !p[3] && method === "POST") {
        owner(a);
        const input = z
          .object({
            package_version_id: uuid,
            review_id: uuid,
            content_sha256: sha256,
            idempotency_key: uuid,
          })
          .strict()
          .parse(await body(req));
        await requireProjectResource(
          a,
          "youtubePackageVersion",
          input.package_version_id,
          projectId,
        );
        await requireProjectResource(
          a,
          "youtubeReview",
          input.review_id,
          projectId,
        );
        const rows = await query(
          a,
          "select result.* from kxra.create_youtube_upload_intent($1,$2,$3,$4,$5) result",
          [
            projectId,
            input.package_version_id,
            input.review_id,
            input.content_sha256,
            input.idempotency_key,
          ],
        );
        return json(rows[0], 201);
      }
      if (p[2] === "repository-candidates" && !p[3] && method === "POST") {
        const input = z
          .object({
            repository_owner: z
              .string()
              .regex(/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38}[A-Za-z0-9])?$/),
            repository_name: z.string().regex(/^[A-Za-z0-9._-]{1,100}$/),
            source_url: z
              .string()
              .url()
              .startsWith("https://github.com/")
              .max(300),
            default_branch: z.string().regex(/^[A-Za-z0-9._/-]{1,240}$/),
            commit_sha: gitSha,
            tree_sha: gitSha,
            fetched_at: z.string().datetime(),
            licence_observation: z.string().trim().min(3).max(3000),
            adoption_recommendation: z.string().trim().min(3).max(3000),
            request_id: requestId,
          })
          .strict()
          .parse(await body(req));
        const rows = await query(
          a,
          "select result.* from kxra.create_repository_candidate($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) result",
          [
            projectId,
            input.repository_owner,
            input.repository_name,
            input.source_url,
            input.default_branch,
            input.commit_sha,
            input.tree_sha,
            input.fetched_at,
            input.licence_observation,
            input.adoption_recommendation,
            input.request_id,
          ],
        );
        return json(rows[0], 201);
      }
      if (
        p[2] === "repository-candidates" &&
        p[3] &&
        p[4] === "quarantine" &&
        !p[5] &&
        method === "POST"
      ) {
        owner(a);
        const candidateId = uuid.parse(p[3]);
        await requireProjectResource(
          a,
          "repositoryCandidate",
          candidateId,
          projectId,
        );
        const input = z
          .object({
            commit_sha: gitSha,
            tree_sha: gitSha,
            archive_sha256: sha256,
            manifest_sha256: sha256,
            archive_size_bytes: z.number().int().positive().max(104857600),
            controls: repositoryControls,
            policy_version: z.string().trim().min(1).max(80),
            reason: z.string().trim().min(3).max(3000),
            request_id: requestId,
          })
          .strict()
          .parse(await body(req));
        const rows = await query(
          a,
          "select result.* from kxra.record_repository_quarantine($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) result",
          [
            candidateId,
            input.commit_sha,
            input.tree_sha,
            input.archive_sha256,
            input.manifest_sha256,
            input.archive_size_bytes,
            input.controls,
            input.policy_version,
            input.reason,
            input.request_id,
          ],
        );
        return json(rows[0], 201);
      }
      if (
        p[2] === "repository-candidates" &&
        p[3] &&
        p[4] === "assessments" &&
        !p[5] &&
        method === "POST"
      ) {
        owner(a);
        const candidateId = uuid.parse(p[3]);
        await requireProjectResource(
          a,
          "repositoryCandidate",
          candidateId,
          projectId,
        );
        const input = z
          .object({
            quarantine_id: uuid,
            toolchain: repositoryToolchain,
            findings: z.array(z.record(z.string(), z.unknown())).max(1000),
            licence_state: z.enum(["CLEAR", "AMBIGUOUS", "BLOCKED"]),
            provenance_state: z.enum(["CLEAR", "UNRESOLVED", "BLOCKED"]),
            secret_state: z.enum(["NO_FINDING", "FINDING"]),
            malware_state: z.enum(["NO_FINDING", "FINDING"]),
            dependency_state: z.enum(["PASS", "BLOCKED"]),
            sast_state: z.enum(["PASS", "BLOCKED"]),
            workflow_state: z.enum(["PASS", "BLOCKED"]),
            binary_state: z.enum(["PASS", "BLOCKED"]),
            critical_count: z.number().int().min(0).max(100000),
            high_count: z.number().int().min(0).max(100000),
            bounded_conclusion: z.string().trim().min(20).max(3000),
            residual_risk: z.string().trim().min(3).max(5000),
            request_id: requestId,
          })
          .strict()
          .parse(await body(req));
        await requireProjectResource(
          a,
          "repositoryQuarantine",
          input.quarantine_id,
          projectId,
        );
        const rows = await query(
          a,
          "select result.* from kxra.record_repository_assessment($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) result",
          [
            candidateId,
            input.quarantine_id,
            input.toolchain,
            JSON.stringify(input.findings),
            input.licence_state,
            input.provenance_state,
            input.secret_state,
            input.malware_state,
            input.dependency_state,
            input.sast_state,
            input.workflow_state,
            input.binary_state,
            input.critical_count,
            input.high_count,
            input.bounded_conclusion,
            input.residual_risk,
            input.request_id,
          ],
        );
        return json(rows[0], 201);
      }
      if (p[2] === "repository-proposals" && !p[3] && method === "POST") {
        const input = z
          .object({
            candidate_id: uuid,
            assessment_id: uuid,
            need_statement: z.string().trim().min(3).max(5000),
            exact_scope: z
              .array(z.string().trim().min(3).max(500))
              .min(1)
              .max(100),
            licence_obligations: z.string().trim().min(3).max(5000),
            architecture_changes: z.string().trim().min(3).max(10000),
            threat_model: z.string().trim().min(3).max(10000),
            test_plan: z.string().trim().min(3).max(10000),
            rollback_plan: z.string().trim().min(3).max(10000),
            request_id: requestId,
          })
          .strict()
          .parse(await body(req));
        await requireProjectResource(
          a,
          "repositoryCandidate",
          input.candidate_id,
          projectId,
        );
        await requireProjectResource(
          a,
          "repositoryAssessment",
          input.assessment_id,
          projectId,
        );
        const rows = await query(
          a,
          "select * from kxra.create_repository_adoption_proposal($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
          [
            input.candidate_id,
            input.assessment_id,
            input.need_statement,
            JSON.stringify(input.exact_scope),
            input.licence_obligations,
            input.architecture_changes,
            input.threat_model,
            input.test_plan,
            input.rollback_plan,
            input.request_id,
          ],
        );
        return json(rows[0], 201);
      }
      if (
        p[2] === "repository-proposal-versions" &&
        p[3] &&
        p[4] === "review" &&
        !p[5] &&
        method === "POST"
      ) {
        owner(a);
        const versionId = uuid.parse(p[3]);
        await requireProjectResource(
          a,
          "repositoryProposalVersion",
          versionId,
          projectId,
        );
        const input = z
          .object({
            expected_version: positiveVersion,
            proposal_sha256: sha256,
            checks: repositoryReviewChecks,
            decision: z.enum([
              "APPROVE_IMPLEMENTATION_INTENT",
              "REQUEST_CHANGES",
              "REJECT",
            ]),
            note: z.string().trim().min(3).max(5000),
            request_id: requestId,
          })
          .strict()
          .parse(await body(req));
        const rows = await query(
          a,
          "select result.* from kxra.review_repository_adoption_proposal($1,$2,$3,$4,$5,$6,$7) result",
          [
            versionId,
            input.expected_version,
            input.proposal_sha256,
            input.checks,
            input.decision,
            input.note,
            input.request_id,
          ],
        );
        return json(rows[0]);
      }
      if (
        p[2] === "repository-implementation-intents" &&
        !p[3] &&
        method === "POST"
      ) {
        owner(a);
        const input = z
          .object({
            proposal_version_id: uuid,
            review_id: uuid,
            proposal_sha256: sha256,
            branch_name: z
              .string()
              .regex(/^codex\/[a-z0-9]+(?:-[a-z0-9]+)*$/)
              .max(120),
            idempotency_key: uuid,
          })
          .strict()
          .parse(await body(req));
        await requireProjectResource(
          a,
          "repositoryProposalVersion",
          input.proposal_version_id,
          projectId,
        );
        await requireProjectResource(
          a,
          "repositoryReview",
          input.review_id,
          projectId,
        );
        const rows = await query(
          a,
          "select result.* from kxra.create_repository_implementation_intent($1,$2,$3,$4,$5,$6) result",
          [
            projectId,
            input.proposal_version_id,
            input.review_id,
            input.proposal_sha256,
            input.branch_name,
            input.idempotency_key,
          ],
        );
        return json(rows[0], 201);
      }
      throw new HttpError(404, "Not found");
    }
    if (p[0] === "invitations") {
      owner(a);
      if (method === "GET") {
        await query(a, "select kxra.refresh_expired_invitations()", []);
        return json(
          await query(
            a,
            `select i.id,i.recipient_email,i.note,i.state,i.version,i.delivery_version,i.expires_at,
              i.sent_at,i.delivery_error,i.redeemed_at,i.revoked_at,i.created_at,
              coalesce(jsonb_agg(jsonb_build_object(
               'project_id',g.project_id,'project_code',p.code,'project_name',p.name,
               'role',g.role,'expires_at',g.membership_expires_at
              ) order by p.code) filter(where g.project_id is not null),'[]'::jsonb) as grants
             from kxra.invitations i
             left join kxra.invitation_project_grants g on g.invitation_id=i.id and g.org_id=i.org_id
             left join kxra.projects p on p.id=g.project_id and p.org_id=g.org_id
             group by i.id order by i.created_at desc`,
          ),
        );
      }
      if (method === "POST" && !p[1]) {
        recentOwnerMfa(a);
        const input = z
          .object({
            email: z.string().trim().email().max(320),
            grants: z
              .array(
                z
                  .object({
                    project_id: uuid,
                    role: z.enum(["viewer", "contributor"]),
                    expires_at: z.string().datetime().nullable().optional(),
                  })
                  .strict(),
              )
              .min(1)
              .max(10),
            note: z.string().trim().max(2000).nullable().optional(),
            expires_hours: z.number().int().min(1).max(168).default(24),
          })
          .strict()
          .parse(await body(req));
        if (
          new Set(input.grants.map((grant) => grant.project_id)).size !==
          input.grants.length
        )
          throw new HttpError(400, "Each project may be assigned once");
        const assigned = await Promise.all(
          input.grants.map((grant) => project(a, grant.project_id)),
        );
        const token = crypto.randomBytes(32).toString("base64url");
        const tokenHash = crypto
          .createHash("sha256")
          .update(token)
          .digest("hex");
        const expiry = new Date(Date.now() + input.expires_hours * 3600_000);
        const rows = await query<{
          id: string;
          expires_at: string;
          outbox_id: string;
        }>(
          a,
          "select * from kxra.create_multi_project_invitation($1,$2,$3,$4,$5)",
          [
            input.email,
            JSON.stringify(input.grants),
            input.note || null,
            tokenHash,
            expiry,
          ],
        );
        let deliveryState = "PENDING";
        if (localMode()) {
          try {
            const delivered = await fakeEmailTransport().deliver({
              operationKey: `invitation:${rows[0].id}:v1`,
              recipient: input.email,
              rendered: renderEmail({
                template: "PARTNER_INVITATION",
                recipientHint: input.email.replace(/^(.).*(@.*)$/, "$1***$2"),
                expiresAt: rows[0].expires_at,
                projectNames: assigned.map(
                  (item) => `${item.code} · ${item.name}`,
                ),
                actionUrl: `${process.env.KXRA_ORIGIN}/join#token=${encodeURIComponent(token)}`,
              }),
            });
            await query(
              a,
              "select kxra.mark_invitation_delivery($1,1,$2,true,$3,null)",
              [rows[0].id, rows[0].outbox_id, delivered.providerMessageId],
            );
            deliveryState = "SENT";
          } catch {
            await query(
              a,
              "select kxra.mark_invitation_delivery($1,1,$2,false,null,$3)",
              [rows[0].id, rows[0].outbox_id, "Local fake delivery failed"],
            );
            deliveryState = "DELIVERY_FAILED";
          }
        }
        return json(
          {
            id: rows[0].id,
            expires_at: rows[0].expires_at,
            state: deliveryState,
            project_count: input.grants.length,
          },
          201,
        );
      }
      if (p[1] && p[2] === "resend" && method === "POST") {
        recentOwnerMfa(a);
        uuid.parse(p[1]);
        z.object({})
          .strict()
          .parse(await body(req));
        const token = crypto.randomBytes(32).toString("base64url");
        const tokenHash = crypto
          .createHash("sha256")
          .update(token)
          .digest("hex");
        const rows = await query<{
          id: string;
          version: number;
          expires_at: string;
          outbox_id: string;
          recipient_email: string;
        }>(a, "select * from kxra.resend_invitation($1,$2)", [p[1], tokenHash]);
        let deliveryState = "PENDING";
        if (localMode()) {
          const grants = await query<{
            project_name: string;
            project_code: string;
          }>(
            a,
            `select project.name as project_name,project.code as project_code
             from kxra.invitation_project_grants grant_row
             join kxra.projects project on project.id=grant_row.project_id
             where grant_row.invitation_id=$1 order by project.code`,
            [p[1]],
          );
          try {
            const delivered = await fakeEmailTransport().deliver({
              operationKey: `invitation:${rows[0].id}:delivery:${rows[0].version}`,
              recipient: rows[0].recipient_email,
              rendered: renderEmail({
                template: "INVITATION_REMINDER",
                recipientHint: rows[0].recipient_email.replace(
                  /^(.).*(@.*)$/,
                  "$1***$2",
                ),
                expiresAt: rows[0].expires_at,
                projectNames: grants.map(
                  (item) => `${item.project_code} · ${item.project_name}`,
                ),
                actionUrl: `${process.env.KXRA_ORIGIN}/join#token=${encodeURIComponent(token)}`,
              }),
            });
            await query(
              a,
              "select kxra.mark_invitation_delivery($1,$2,$3,true,$4,null)",
              [
                rows[0].id,
                rows[0].version,
                rows[0].outbox_id,
                delivered.providerMessageId,
              ],
            );
            deliveryState = "SENT";
          } catch {
            await query(
              a,
              "select kxra.mark_invitation_delivery($1,$2,$3,false,null,$4)",
              [
                rows[0].id,
                rows[0].version,
                rows[0].outbox_id,
                "Local fake delivery failed",
              ],
            );
            deliveryState = "DELIVERY_FAILED";
          }
        }
        return json({
          id: rows[0].id,
          version: rows[0].version,
          state: deliveryState,
        });
      }
      if (p[1] && p[2] === "revoke" && method === "POST") {
        recentOwnerMfa(a);
        uuid.parse(p[1]);
        z.object({})
          .strict()
          .parse(await body(req));
        await query(a, "select kxra.revoke_invitation($1)", [p[1]]);
        return json({ ok: true });
      }
      throw new HttpError(404, "Not found");
    }
    if (p[0] === "project-gates") {
      if (method === "GET" && !p[1]) {
        const pid = uuid.parse(url.searchParams.get("project_id"));
        await project(a, pid);
        const [policies, authorizations] = await Promise.all([
          query(
            a,
            "select gate_code,policy_version,requirements,threshold_state from kxra.project_gate_policies where project_id=$1",
            [pid],
          ),
          query(
            a,
            "select id,gate_code,evidence_id,evidence_version,scope,created_at from kxra.project_gate_authorizations where project_id=$1 order by created_at desc",
            [pid],
          ),
        ]);
        return json({ policies, authorizations });
      }
      if (method === "POST" && p[1] === "evidence") {
        owner(a);
        const input = gateEvidenceInput.parse(await body(req));
        const rows = await query<{ id: string }>(
          a,
          "select kxra.create_gate_evidence_packet($1,$2,$3,$4,$5,$6) as id",
          [
            input.project_id,
            input.gate,
            input.title,
            input.summary,
            input.claims,
            JSON.stringify(input.evidence),
          ],
        );
        return json(rows[0], 201);
      }
      throw new HttpError(404, "Not found");
    }
    if (p[0] === "workflow") {
      if (method === "GET" && !p[1]) {
        const pid = uuid.parse(url.searchParams.get("project_id"));
        return json(await operatingLoop(a, pid));
      }
      if (method === "POST" && p[1] === "ideas" && p[3] === "submit") {
        const target = uuid.parse(p[2]);
        const input = z
          .object({ version: positiveVersion })
          .strict()
          .parse(await body(req));
        const rows = await query<{
          id: string;
          version: number;
          status: string;
        }>(a, "select id,version,status from kxra.submit_idea($1,$2)", [
          target,
          input.version,
        ]);
        return json(rows[0]);
      }
      if (method === "POST" && p[1] === "experiments" && !p[2]) {
        owner(a);
        const input = z
          .object({
            project_id: uuid,
            idea_id: uuid,
            idea_version: positiveVersion,
            title: z.string().trim().min(1).max(240),
            hypothesis: z.string().trim().min(1).max(50000),
            cost_cap: z.string().regex(/^\d{1,12}(\.\d{1,4})?$/),
            currency: z.enum(["GBP", "USD", "EUR"]),
            success_criteria: z.string().trim().min(1).max(5000),
            stop_criteria: z.string().trim().min(1).max(5000),
            evidence: evidenceList,
          })
          .strict()
          .parse(await body(req));
        const rows = await query<{ id: string }>(
          a,
          "select kxra.create_experiment($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) as id",
          [
            input.project_id,
            input.idea_id,
            input.idea_version,
            input.title,
            input.hypothesis,
            input.cost_cap,
            input.currency,
            input.success_criteria,
            input.stop_criteria,
            JSON.stringify(input.evidence),
          ],
        );
        return json(rows[0], 201);
      }
      if (method === "POST" && p[1] === "experiments" && p[3] === "results") {
        const experiment = uuid.parse(p[2]);
        const input = z
          .object({
            version: positiveVersion,
            outcome: z.enum(["success", "failure", "inconclusive", "stopped"]),
            observations: z.string().trim().min(1).max(50000),
            metric_value: z.string().trim().min(1).max(500),
            evidence: evidenceList,
          })
          .strict()
          .parse(await body(req));
        const rows = await query<{ id: string }>(
          a,
          "select kxra.record_experiment_result($1,$2,$3,$4,$5,$6) as id",
          [
            experiment,
            input.version,
            input.outcome,
            input.observations,
            input.metric_value,
            JSON.stringify(input.evidence),
          ],
        );
        return json(rows[0], 201);
      }
      if (method === "POST" && p[1] === "tasks" && !p[2]) {
        owner(a);
        const input = z
          .object({
            context_id: uuid,
            context_version: positiveVersion,
            assignee_id: uuid,
            title: z.string().trim().min(1).max(240),
            acceptance_criteria: z.string().trim().min(1).max(5000),
          })
          .strict()
          .parse(await body(req));
        const rows = await query<{ id: string }>(
          a,
          "select kxra.assign_workflow_task($1,$2,$3,$4,$5) as id",
          [
            input.context_id,
            input.context_version,
            input.assignee_id,
            input.title,
            input.acceptance_criteria,
          ],
        );
        return json(rows[0], 201);
      }
      if (method === "POST" && p[1] === "tasks" && p[3] === "complete") {
        const target = uuid.parse(p[2]);
        const input = z
          .object({
            version: positiveVersion,
            completion_note: z.string().trim().min(1).max(5000),
          })
          .strict()
          .parse(await body(req));
        await query(a, "select kxra.complete_workflow_task($1,$2,$3)", [
          target,
          input.version,
          input.completion_note,
        ]);
        return json({ ok: true });
      }
      if (method === "POST" && p[1] === "decisions" && !p[2]) {
        owner(a);
        const input = z
          .object({
            project_id: uuid,
            experiment_id: uuid,
            experiment_version: positiveVersion,
            result_id: uuid,
            title: z.string().trim().min(1).max(240),
            decision: z.string().trim().min(1).max(50000),
            evidence: evidenceList,
            supersedes_id: uuid.nullable().default(null),
          })
          .strict()
          .parse(await body(req));
        const rows = await query<{ id: string }>(
          a,
          "select kxra.create_linked_decision($1,$2,$3,$4,$5,$6,$7,$8) as id",
          [
            input.project_id,
            input.experiment_id,
            input.experiment_version,
            input.result_id,
            input.title,
            input.decision,
            JSON.stringify(input.evidence),
            input.supersedes_id,
          ],
        );
        return json(rows[0], 201);
      }
      throw new HttpError(404, "Not found");
    }
    if (p[0] === "records") {
      if (method === "GET")
        return json(
          p[1]
            ? await getRecord(a, p[1])
            : await listRecords(
                a,
                url.searchParams.get("kind") || undefined,
                url.searchParams.get("project_id") || undefined,
              ),
        );
      if (method === "POST" && !p[1])
        return json(await createRecord(a, await body(req)), 201);
      if (method === "PATCH" && p[1]) {
        const current = await getRecord(a, p[1]);
        const input = z
          .object({
            title: z.string().min(1).max(240),
            body: z.string().max(50000),
            data: z.record(z.string(), z.unknown()),
            version: z.number().int().positive(),
          })
          .strict()
          .parse(await body(req));
        recordInput.parse({
          title: input.title,
          body: input.body,
          data: input.data,
          kind: current.kind,
          project_id: current.project_id,
          classification: current.classification,
          visibility: current.visibility,
        });
        const rows = await query(
          a,
          "update kxra.records set title=$1,body=$2,data=$3 where id=$4 and version=$5 returning *",
          [input.title, input.body, input.data, current.id, input.version],
        );
        if (!rows[0])
          throw new HttpError(409, "Record changed or is no longer editable");
        return json(rows[0]);
      }
    }
    if (
      (p[0] === "search" && method === "GET") ||
      (p[0] === "ask" && method === "POST")
    ) {
      const input =
        p[0] === "ask"
          ? z
              .object({
                question: z.string().trim().min(1).max(500),
                project_id: uuid,
                mode: z
                  .enum(["evidence-only", "model"])
                  .default("evidence-only"),
              })
              .strict()
              .parse(await body(req))
          : {
              question: url.searchParams.get("q") || "",
              project_id: url.searchParams.get("project_id"),
              mode: "evidence-only" as const,
            };
      if (p[0] === "search")
        return json(
          await search(a, input.question, input.project_id || undefined),
        );
      const requestId = crypto.randomUUID();
      const projectId = uuid.parse(input.project_id);
      await project(a, projectId);
      if (
        input.mode === "model" &&
        (!localMode() || !["fixture", "fake-provider"].includes(a.source || ""))
      )
        throw new HttpError(
          503,
          "AI synthesis is not configured for this environment",
          "AI_PROVIDER_UNAVAILABLE",
        );
      const queryHash = hashStructured({
        question: input.question,
        project_id: projectId,
        mode: input.mode,
      });
      const run = (
        await query<{ id: string }>(
          a,
          "select kxra.begin_knowledge_query($1,$2,$3,$4) as id",
          [projectId, requestId, queryHash, "PROJECT_EVIDENCE"],
        )
      )[0].id;
      let finalized = false;
      let agentRunId: string | null = null;
      try {
        const rows = await search(a, input.question, projectId);
        const references = rows.map((row) => ({
          type: row.source_type,
          id: row.id,
          version: row.version,
        }));
        if (input.mode === "model" && rows.length) {
          const reservationEvidence = prepareModelEvidence(
            rows.map((row) => ({
              ...row,
              envelope_item_id: row.id,
              source_sha256: "0".repeat(64),
            })),
          );
          const reservedInputTokens = estimateModelInputTokens(
            input.question,
            projectId,
            reservationEvidence,
          );
          const authorized = (
            await query<{
              run_id: string;
              provider: "FAKE" | "OPENAI";
              model: string;
              evidence_items: {
                id: string;
                source_type: "RECORD" | "CHUNK";
                source_id: string;
                source_version: number;
                source_sha256: string;
              }[];
            }>(
              a,
              `select * from kxra.begin_agent_run(
                $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17
               )`,
              [
                projectId,
                crypto.randomUUID(),
                ASK_AGENT_CODE,
                1,
                ASK_SKILL_CODE,
                1,
                LOCAL_SOL_POLICY_CODE,
                1,
                LOCAL_ZERO_COST_BUDGET_CODE,
                1,
                hashStructured({
                  question: input.question,
                  project_id: projectId,
                  evidence: references,
                }),
                JSON.stringify(references),
                0,
                reservedInputTokens,
                4000,
                "ASK",
                null,
              ],
            )
          )[0];
          if (!authorized)
            throw new HttpError(503, "AI run authorization unavailable");
          agentRunId = authorized.run_id;
          const rowByReference = new Map(
            rows.map((row) => [
              `${row.source_type}:${row.id}:${row.version}`,
              row,
            ]),
          );
          const modelEvidence = prepareModelEvidence(
            authorized.evidence_items.map((item) => {
              const source = rowByReference.get(
                `${item.source_type}:${item.source_id}:${item.source_version}`,
              );
              if (!source)
                throw new HttpError(
                  503,
                  "Authorized evidence could not be resolved",
                );
              return {
                ...source,
                envelope_item_id: item.id,
                source_sha256: item.source_sha256,
              } satisfies ModelEvidence;
            }),
          );
          const attached = (
            await query<{ allowed: boolean }>(
              a,
              "select kxra.attach_knowledge_agent_run($1,$2) as allowed",
              [run, agentRunId],
            )
          )[0]?.allowed;
          if (!attached)
            throw new HttpError(503, "AI run attachment unavailable");
          const execution = await executeAskAgentRun({
            runId: agentRunId,
            projectId,
            question: input.question,
            evidence: modelEvidence,
            localFixture: true,
          });
          if (execution.state !== "COMPLETED" || !execution.output) {
            const failure =
              execution.state === "RECONCILIATION_REQUIRED"
                ? "AI_USAGE_RECONCILIATION_REQUIRED"
                : execution.failureCode || "AI_EXECUTION_FAILED";
            const completion = (
              await query<{ allowed: boolean }>(
                a,
                "select kxra.complete_knowledge_query($1,$2,$3,$4) as allowed",
                [run, "[]", "FAILED", failure],
              )
            )[0];
            finalized = true;
            if (!completion?.allowed) throw new HttpError(404, "Not found");
            return json(
              {
                error: "AI synthesis unavailable",
                code: failure,
                run_id: agentRunId,
              },
              execution.state === "RECONCILIATION_REQUIRED" ? 503 : 502,
            );
          }
          const citedById = new Map(
            modelEvidence.map((item) => [item.envelope_item_id, item]),
          );
          const citedReferences = [
            ...new Map(
              execution.output.citations.map((citation) => {
                const source = citedById.get(citation.evidence_item_id);
                if (!source)
                  throw new HttpError(503, "Validated citation unavailable");
                const reference = {
                  type: source.source_type || "RECORD",
                  id: source.id,
                  version: source.version,
                };
                return [
                  `${reference.type}:${reference.id}:${reference.version}`,
                  reference,
                ];
              }),
            ).values(),
          ];
          const delivery = (
            await query<{ allowed: boolean }>(
              a,
              "select kxra.finalize_ask_delivery($1,$2,$3) as allowed",
              [run, agentRunId, JSON.stringify(citedReferences)],
            )
          )[0];
          finalized = true;
          if (!delivery?.allowed) throw new HttpError(404, "Not found");
          return json(
            modelAnswer(
              input.question,
              execution.provider,
              execution.model,
              agentRunId,
              execution.output,
              modelEvidence,
            ),
          );
        }
        const completion = (
          await query<{ allowed: boolean }>(
            a,
            "select kxra.complete_knowledge_query($1,$2,$3,$4) as allowed",
            [
              run,
              JSON.stringify(references),
              rows.length ? "DELIVERED" : "EMPTY",
              null,
            ],
          )
        )[0];
        finalized = true;
        if (!completion?.allowed) throw new HttpError(404, "Not found");
        return json(evidenceAnswer(input.question, rows));
      } catch (error) {
        if (agentRunId)
          await query(a, "select kxra.cancel_agent_run($1)", [
            agentRunId,
          ]).catch(() => {});
        if (!finalized)
          await query(a, "select kxra.complete_knowledge_query($1,$2,$3,$4)", [
            run,
            "[]",
            "FAILED",
            "QUERY_FAILED",
          ]).catch(() => {});
        throw error;
      }
    }
    if (p[0] === "approvals") {
      owner(a);
      if (method === "GET") {
        await query(a, "select kxra.refresh_expired_approvals()", []);
        return json(
          await query(
            a,
            "select * from kxra.approvals order by created_at desc limit 200",
          ),
        );
      }
      if (method === "POST" && !p[1]) {
        const input = z
          .discriminatedUnion("action", [
            z
              .object({
                action: z.literal("record.accept"),
                project_id: uuid.nullable(),
                payload: z
                  .object({
                    record_id: uuid,
                    version: z.number().int().positive(),
                  })
                  .strict(),
              })
              .strict(),
            z
              .object({
                action: z.literal("project.gate"),
                project_id: uuid,
                payload: z
                  .object({
                    gate: gateCode,
                    evidence_id: uuid,
                    evidence_version: positiveVersion,
                  })
                  .strict(),
              })
              .strict(),
            z
              .object({
                action: z.literal("membership.change"),
                project_id: uuid,
                payload: z
                  .object({
                    user_id: uuid,
                    role: z.enum(["viewer", "contributor"]),
                    active: z.boolean(),
                    expires_at: z.string().datetime().nullable().optional(),
                  })
                  .strict(),
              })
              .strict(),
            z
              .object({
                action: z.literal("account.lifecycle"),
                project_id: z.null(),
                payload: z
                  .object({
                    user_id: uuid,
                    desired_state: z.enum(["ACTIVE", "SUSPENDED", "REVOKED"]),
                    reason: z.string().trim().min(1).max(1000),
                  })
                  .strict(),
              })
              .strict(),
            z
              .object({
                action: z.literal("idea.share"),
                project_id: uuid,
                payload: z
                  .object({
                    idea_id: uuid,
                    user_id: uuid,
                    active: z.boolean(),
                  })
                  .strict(),
              })
              .strict(),
            z
              .object({
                action: z.literal("project.governance"),
                project_id: uuid,
                payload: z
                  .object({
                    expected_version: positiveVersion,
                    lifecycle_stage: z.enum(lifecycleStages),
                    disposition: z.enum(dispositions),
                    next_gate: z.string().trim().max(240).nullable(),
                    next_action: z.string().trim().min(1).max(5000),
                    current_recommendation: z.enum(recommendations).nullable(),
                    owner_user_id: uuid.nullable(),
                  })
                  .strict(),
              })
              .strict(),
          ])
          .parse(await body(req));
        if (input.action === "account.lifecycle") {
          const rows = await query(
            a,
            "select * from kxra.request_account_lifecycle_approval($1,$2,$3)",
            [
              input.payload.user_id,
              input.payload.desired_state,
              input.payload.reason,
            ],
          );
          return json(rows[0], 201);
        }
        if (input.action === "idea.share") {
          const idea = await getIdea(a, input.payload.idea_id);
          if (idea.project_id !== input.project_id)
            throw new HttpError(409, "Idea project changed");
          const rows = await query(
            a,
            "select * from kxra.request_idea_share_approval($1,$2,$3)",
            [
              input.payload.idea_id,
              input.payload.user_id,
              input.payload.active,
            ],
          );
          return json(rows[0], 201);
        }
        if (input.action === "project.governance") {
          await project(a, input.project_id);
          const { expected_version, ...contents } = input.payload;
          const rows = await query(
            a,
            "select * from kxra.request_project_governance_approval($1,$2,$3)",
            [input.project_id, expected_version, JSON.stringify(contents)],
          );
          return json(rows[0], 201);
        }
        return json(await approval(a, input), 201);
      }
      if (p[1] && method === "POST") {
        uuid.parse(p[1]);
        recentOwnerMfa(a);
        if (p[2] === "execute") {
          z.object({})
            .strict()
            .parse(await body(req));
          const rows = await query<{ action: string }>(
            a,
            "select action from kxra.approvals where id=$1",
            [p[1]],
          );
          if (!rows[0]) throw new HttpError(404, "Not found");
          const fn =
            rows[0].action === "record.accept"
              ? "accept_record"
              : rows[0].action === "membership.change"
                ? "change_membership"
                : rows[0].action === "project.gate"
                  ? "authorize_project_gate"
                  : rows[0].action === "account.lifecycle"
                    ? "change_account_lifecycle"
                    : rows[0].action === "idea.share"
                      ? "change_idea_share"
                      : rows[0].action === "project.governance"
                        ? "change_project_governance"
                        : null;
          if (!fn)
            throw new HttpError(409, "Execution is disabled for this action");
          await query(a, `select kxra.${fn}($1)`, [p[1]]);
        } else {
          const v = z
            .object({
              hash: z.string().regex(/^[a-f0-9]{64}$/),
              approve: z.boolean(),
            })
            .strict()
            .parse(await body(req));
          await query(a, "select kxra.decide_approval($1,$2,$3)", [
            p[1],
            v.hash,
            v.approve,
          ]);
        }
        return json({ ok: true });
      }
    }
    if (p[0] === "files") {
      if (method === "GET") {
        if (!p[1])
          return json(
            await query(
              a,
              `select id,project_id,filename,mime_type,detected_mime,size_bytes,
                scan_status,lifecycle_state,state_reason_code,current_version
               from kxra.files order by created_at desc`,
            ),
          );
        if (!uuid.safeParse(p[1]).success)
          throw new HttpError(404, "Not found");
        const delivery = (
          await query<{
            delivery_id: string;
            file_version_id: string;
            object_key: string;
            filename: string;
            mime_type: string;
            size_bytes: number;
            sha256: string;
          }>(a, "select * from kxra.authorize_file_delivery($1,$2)", [
            p[1],
            crypto.randomUUID(),
          ])
        )[0];
        if (!delivery) throw new HttpError(404, "Not found");
        let content: Buffer;
        try {
          content = await privateObjectStore(localMode()).get(
            delivery.object_key,
          );
        } catch {
          await query(a, "select kxra.complete_file_delivery($1,$2,$3)", [
            delivery.delivery_id,
            objectSha256(Buffer.alloc(0)),
            0,
          ]);
          throw new HttpError(409, "File is temporarily unavailable");
        }
        const allowed = (
          await query<{ allowed: boolean }>(
            a,
            "select kxra.complete_file_delivery($1,$2,$3) as allowed",
            [delivery.delivery_id, objectSha256(content), content.length],
          )
        )[0]?.allowed;
        if (!allowed) throw new HttpError(404, "Not found");
        return new Response(new Uint8Array(content), {
          status: 200,
          headers: {
            "Content-Type": delivery.mime_type,
            "Content-Length": String(content.length),
            "Content-Disposition": `attachment; filename="download"; filename*=UTF-8''${encodeURIComponent(delivery.filename)}`,
            "Cache-Control": "private, no-store",
            "Referrer-Policy": "no-referrer",
            "X-Content-Type-Options": "nosniff",
          },
        });
      }
      if (method === "POST") {
        let store;
        try {
          store = privateObjectStore(localMode());
        } catch {
          throw new HttpError(503, "Private storage is not configured");
        }
        const length = Number(req.headers.get("content-length"));
        if (!Number.isSafeInteger(length) || length <= 0 || length > 20980000)
          throw new HttpError(413, "File request must be at most 20 MB");
        // Bound actual bytes as well: content-length is untrusted.
        const reader = req.body?.getReader();
        if (!reader) throw new HttpError(400, "File required");
        const chunks: Uint8Array[] = [];
        let bytes = 0;
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          bytes += value.length;
          if (bytes > 20980000) {
            await reader.cancel();
            throw new HttpError(413, "File too large");
          }
          chunks.push(value);
        }
        const buffer = Buffer.concat(chunks);
        const form = await new Request(req.url, {
          method: "POST",
          headers: { "content-type": req.headers.get("content-type") || "" },
          body: buffer,
        }).formData();
        const allowedFields = new Set([
          "project_id",
          "visibility",
          "request_id",
          "file",
        ]);
        for (const key of form.keys())
          if (!allowedFields.has(key))
            throw new HttpError(400, "Invalid upload fields");
        if (
          form.getAll("project_id").length !== 1 ||
          form.getAll("visibility").length > 1 ||
          form.getAll("request_id").length > 1 ||
          form.getAll("file").length !== 1
        )
          throw new HttpError(400, "Invalid upload fields");
        const pid = uuid.parse(form.get("project_id"));
        await project(a, pid);
        const visibility = z
          .enum(["owner_only", "project_shared"])
          .parse(
            form.get("visibility") ||
              (a.role === "owner" ? "owner_only" : "project_shared"),
          );
        if (a.role !== "owner" && visibility !== "project_shared")
          throw new HttpError(403, "Access unavailable");
        const file = form.get("file");
        if (!(file instanceof File) || file.size > 20971520 || !file.size)
          throw new HttpError(
            400,
            "A nonempty file of at most 20 MB is required",
          );
        const filename =
          file.name.replace(/[\x00-\x1f\x7f/\\]/g, "_").slice(0, 240) ||
          "document";
        const content = Buffer.from(await file.arrayBuffer());
        const sha = objectSha256(content);
        const suppliedRequest = form.get("request_id");
        const requestId = suppliedRequest
          ? uuid.parse(suppliedRequest)
          : crypto.randomUUID();
        const saved = (
          await query<{
            file_id: string;
            record_id: string;
            file_version_id: string;
            object_key: string;
            lifecycle_state: string;
          }>(a, "select * from kxra.create_file_upload($1,$2,$3,$4,$5,$6,$7)", [
            pid,
            filename,
            file.type || "application/octet-stream",
            file.size,
            sha,
            visibility,
            requestId,
          ])
        )[0];
        try {
          await store.putImmutable(
            saved.object_key,
            content,
            file.type || "application/octet-stream",
          );
        } catch {
          const existing = await store.head(saved.object_key).catch(() => null);
          if (
            !existing ||
            existing.sha256 !== sha ||
            existing.size !== content.length
          )
            throw new HttpError(
              503,
              "File metadata was recorded but private object storage did not accept the upload",
            );
        }
        const lifecycle = (
          await query<{ lifecycle_state: string }>(
            a,
            "select kxra.finalize_file_upload($1,$2,$3,$4) as lifecycle_state",
            [saved.file_id, requestId, sha, content.length],
          )
        )[0].lifecycle_state;
        return json(
          {
            id: saved.file_id,
            record_id: saved.record_id,
            filename,
            lifecycle_state: lifecycle,
          },
          201,
        );
      }
    }
    if (p[0] === "partners") {
      owner(a);
      if (method === "GET" && !p[1])
        return json(
          await query(
            a,
            `select member.id,member.display_name,member.active,member.access_version,
              profile.account_state,profile.first_name,profile.last_name,profile.job_title,
              profile.company,profile.mfa_state,profile.onboarding_completed_at,
              profile.session_version
             from kxra.members member join kxra.profiles profile on profile.user_id=member.id
             where member.role='partner' order by member.display_name,member.id`,
          ),
        );
      if (p[1] && p[2] === "sessions" && method === "POST") {
        recentOwnerMfa(a);
        const target = uuid.parse(p[1]);
        const input = z
          .object({ reason: z.string().trim().min(1).max(1000) })
          .strict()
          .parse(await body(req));
        if (localMode()) {
          const identity = await fakeAuthProvider().getIdentity(target);
          if (identity) await fakeAuthProvider().signOutAll(target);
        }
        const rows = await query<{ session_version: number }>(
          a,
          "select kxra.force_account_session_revoke($1,$2,$3) as session_version",
          [
            target,
            input.reason,
            localMode() ? "LOCAL_APPLIED" : "PROVIDER_PENDING",
          ],
        );
        return json(rows[0]);
      }
      if (
        p[1] &&
        p[2] === "whatsapp" &&
        p[3] === "unpair" &&
        method === "POST"
      ) {
        recentOwnerMfa(a);
        uuid.parse(p[1]);
        z.object({})
          .strict()
          .parse(await body(req));
        await query(a, "select kxra.owner_unpair_whatsapp($1)", [p[1]]);
        return json({ ok: true });
      }
      throw new HttpError(404, "Not found");
    }
    if (p[0] === "whatsapp") {
      if (method === "GET" && !p[1]) {
        const [pairings, selections, messages, intents] = await Promise.all([
          query(
            a,
            `select id,state,version,verified_at,revoked_at,created_at
             from kxra.whatsapp_gateway_pairings order by created_at desc limit 20`,
          ),
          query(
            a,
            `select selection.id,selection.pairing_id,selection.project_id,
              project.code,project.name,selection.state,selection.selected_at
             from kxra.whatsapp_project_selections selection
             join kxra.projects project on project.id=selection.project_id
             order by selection.selected_at desc limit 50`,
          ),
          query(
            a,
            `select id,project_id,intent_type,state,created_at
             from kxra.whatsapp_messages order by created_at desc limit 50`,
          ),
          query(
            a,
            `select id,message_id,project_id,adapter,state,delivery_state,
              cancellation_code,created_at
             from kxra.whatsapp_outbound_intents order by created_at desc limit 50`,
          ),
        ]);
        return json({
          provider: "META_WHATSAPP_CLOUD",
          transport: "DISABLED",
          pairings,
          selections,
          messages,
          outbound_intents: intents,
        });
      }
      if (method === "POST" && p[1] === "pairing-challenges") {
        const input = z
          .object({
            phone_e164: z.string().trim().min(8).max(16),
            waba_id: z.string().trim().min(1).max(120),
            phone_number_id: z.string().trim().min(1).max(120),
            request_id: requestId,
          })
          .strict()
          .parse(await body(req));
        const challenge = pairingChallenge();
        const rows = await query<{ id: string }>(
          a,
          `select kxra.create_whatsapp_pairing_challenge(
            $1,$2,$3,$4,$5,$6
           ) id`,
          [
            whatsappPhoneDigest(input.phone_e164),
            input.waba_id,
            input.phone_number_id,
            challenge.hash,
            input.request_id,
            challenge.expires_at,
          ],
        );
        return json(
          {
            challenge_id: rows[0].id,
            pairing_code: challenge.token,
            expires_at: challenge.expires_at,
            transport: "DISABLED",
          },
          201,
        );
      }
      if (
        method === "POST" &&
        p[1] === "pairings" &&
        p[2] &&
        p[3] === "project"
      ) {
        const pairingId = uuid.parse(p[2]);
        const input = z
          .object({ project_id: uuid, request_id: requestId })
          .strict()
          .parse(await body(req));
        const rows = await query<{ id: string }>(
          a,
          "select kxra.select_whatsapp_project($1,$2,$3) id",
          [pairingId, input.project_id, input.request_id],
        );
        return json({ selection_id: rows[0].id });
      }
      if (
        method === "POST" &&
        p[1] === "pairings" &&
        p[2] &&
        p[3] === "revoke"
      ) {
        const pairingId = uuid.parse(p[2]);
        const input = z
          .object({
            reason: z.string().trim().min(3).max(1000),
            request_id: requestId,
          })
          .strict()
          .parse(await body(req));
        await query(a, "select kxra.revoke_whatsapp_pairing($1,$2,$3)", [
          pairingId,
          input.reason,
          input.request_id,
        ]);
        return json({ ok: true });
      }
      throw new HttpError(404, "Not found");
    }
    throw new HttpError(404, "Not found");
  } catch (e) {
    if (e instanceof HttpError)
      return json(
        { error: e.message, ...(e.code ? { code: e.code } : {}) },
        e.status,
      );
    if (e instanceof z.ZodError)
      return json({ error: "Invalid request fields" }, 400);
    if (
      e instanceof Error &&
      [
        "PASSWORD_POLICY",
        "PASSWORD_CHANGE_UNAVAILABLE",
        "MFA_PROOF_UNAVAILABLE",
        "MFA_UPDATE_UNAVAILABLE",
      ].includes(e.message)
    )
      return json({ error: "Security action unavailable" }, 400);
    if (
      e instanceof Error &&
      [
        "BRAND_SOURCE_URL_INVALID",
        "BRAND_SOURCE_URL_NOT_PUBLIC_HTTPS",
        "BRAND_SOURCE_CONTENT_INVALID",
        "BRAND_GENERATION_INPUT_INVALID",
      ].includes(e.message)
    )
      return json({ error: "Brand Studio input is unavailable" }, 400);
    if (
      e instanceof Error &&
      e.message === "BRAND_GENERATION_PROVIDER_UNAVAILABLE"
    )
      return json(
        {
          error: "Brand generation is unavailable in this environment",
          code: "BRAND_GENERATION_PROVIDER_UNAVAILABLE",
        },
        503,
      );
    const code = (e as { code?: string }).code;
    if (code === "42501") return json({ error: "Access unavailable" }, 403);
    if (["23503", "23505", "23514", "P0001", "22P02"].includes(code || ""))
      return json(
        { error: "Action conflicts with current state or permissions" },
        409,
      );
    console.error("KXRA request failed", {
      type: e instanceof Error ? e.name : "unknown",
      code,
    });
    return json({ error: "Request unavailable" }, 503);
  }
}
export { handle as GET, handle as POST, handle as PATCH };
