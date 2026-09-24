import { query } from "../../../packages/db";
import { type Actor, HttpError } from "./auth";
import {
  operatingLoop,
  project,
  type OperatingLoop,
  type Project,
  type RecordRow,
} from "./data";

export type WorkspaceModule = {
  project_id: string;
  module_key: string;
  label: string;
  module_group: "COMMON" | "SPECIALIST";
  source_kind:
    | "PROJECT"
    | "WORKSPACE_ENTRIES"
    | "RECORDS"
    | "EXPERIMENTS"
    | "DECISIONS"
    | "RISKS"
    | "FINANCE"
    | "TASKS"
    | "FILES"
    | "ACTIVITY"
    | "PARTNERS"
    | "APPROVALS"
    | "PROJECT_SCORES"
    | "VEHICLE_COMPATIBILITY"
    | "PROPERTY_ASSETS"
    | "P001_REVISIT"
    | "DIGITAL_OPPORTUNITIES"
    | "YOUTUBE_PIPELINE"
    | "REPOSITORY_PIPELINE";
  entry_type: WorkspaceEntryType | null;
  position: number;
  description: string;
  hard_boundary: string | null;
  write_policy: "OWNER" | "CONTRIBUTOR" | "READ_ONLY" | "GATED";
  filter_spec: Record<string, unknown>;
};

export type WorkspaceEntryType =
  | "NARRATIVE"
  | "RESEARCH_FINDING"
  | "EVIDENCE_ITEM"
  | "MILESTONE"
  | "METRIC"
  | "CATALOGUE_ITEM"
  | "MARKET_ITEM"
  | "PAPER_RESEARCH"
  | "REPORT"
  | "ASSET_NOTE";

export type WorkspaceEntry = {
  id: string;
  project_id: string;
  module_key: string;
  record_type: WorkspaceEntryType;
  title: string;
  summary: string;
  payload: Record<string, unknown>;
  classification: string;
  visibility: "owner_only" | "project_shared";
  status: "DRAFT" | "REVIEWED" | "ARCHIVED";
  created_by: string;
  creator_name: string;
  reviewed_by: string | null;
  reviewer_name: string | null;
  version: number;
  evidence_count: number;
  created_at: string;
  updated_at: string;
};

export type GatePolicy = {
  gate_code:
    | "P001_REVISIT"
    | "P002_LISTING"
    | "P003_FAITHFUL_DELIVERY"
    | "P004_PAPER_READINESS"
    | "P005_LOCAL_PROTOTYPE"
    | "P006_PUBLICATION_PACKAGE"
    | "P007_ADOPTION";
  policy_version: number;
  requirements: string[];
  threshold_state: string;
};

export type GateAuthorization = {
  id: string;
  gate_code: string;
  evidence_id: string;
  evidence_version: number;
  scope: "local_only";
  created_at: string;
};

export type VehicleCompatibility = {
  id: string;
  vehicle_family: string;
  supplier_sku: string | null;
  fitment_state: "UNKNOWN" | "VERIFIED";
  safety_state: "UNKNOWN" | "VERIFIED";
  fitment_evidence_id: string | null;
  fitment_evidence_version: number | null;
  safety_evidence_id: string | null;
  safety_evidence_version: number | null;
  version: number;
  reviewed_at: string | null;
};

export type PropertyAsset = {
  id: string;
  module_key: string;
  title: string;
  asset_kind:
    "PROPERTY_INPUT" | "FLOORPLAN" | "PHOTO" | "SOURCE_ASSET" | "DEMO";
  origin: "REAL_INPUT" | "AI_GENERATED" | "AI_INFERRED";
  rights_state: "UNKNOWN" | "CONFIRMED";
  geometry_state: "NOT_ASSESSED" | "NOT_APPLICABLE" | "PASSED";
  version: number;
  created_at: string;
  reviewed_at: string | null;
};

export type ClprRevisitReview = {
  id: string;
  recommendation: "MONITOR" | "REVISIT" | "DO_NOT_REVISIT";
  rationale: string;
  route_evidence_id: string;
  route_evidence_version: number;
  liquidity_evidence_id: string;
  liquidity_evidence_version: number;
  recovery_evidence_id: string;
  recovery_evidence_version: number;
  buyer_evidence_id: string;
  buyer_evidence_version: number;
  regulatory_evidence_id: string;
  regulatory_evidence_version: number;
  created_at: string;
};

export type DigitalOpportunity = {
  id: string;
  title: string;
  buyer_problem: string;
  stage: "DISCOVERY" | "EVIDENCE_REVIEW" | "LOCAL_PROTOTYPE_AUTHORIZED";
  demand_evidence_id: string | null;
  demand_evidence_version: number | null;
  gate_authorization_id: string | null;
  opportunity_score: number | null;
  confidence_score: number | null;
  version: number;
  created_at: string;
  updated_at: string;
};

export type YoutubeChannelBinding = {
  id: string;
  expected_channel_url: string;
  expected_handle: string;
  provider_channel_id: string | null;
  state: "UNVERIFIED" | "VERIFIED" | "DISCONNECTED";
  version: number;
  verified_at: string | null;
};

export type YoutubeContentPackage = {
  id: string;
  topic: string;
  state: "DRAFT" | "APPROVED" | "CHANGES_REQUIRED";
  current_version: number;
  approved_version: number | null;
  version_id: string;
  version_status: "DRAFT" | "APPROVED" | "REJECTED" | "SUPERSEDED";
  content_sha256: string;
  source_pack: Record<string, unknown>[];
  claim_ledger: Record<string, unknown>[];
  script: string;
  red_team: Record<string, unknown>;
  storyboard: Record<string, unknown>;
  rights_review: Record<string, unknown>;
  voice_provenance: Record<string, unknown>;
  render_manifest: Record<string, unknown>;
  qa_review: Record<string, unknown>;
  publication_metadata: Record<string, unknown>;
  creator_name: string;
  created_at: string;
};

export type YoutubeContentReview = {
  id: string;
  package_id: string;
  package_version_id: string;
  package_version: number;
  content_sha256: string;
  checks: Record<string, boolean>;
  decision: string;
  note: string;
  reviewer_name: string;
  created_at: string;
};

export type YoutubeUploadIntent = {
  id: string;
  package_id: string;
  package_version_id: string;
  package_version: number;
  content_sha256: string;
  intent_sha256: string;
  state: "READY" | "WITHDRAWN";
  adapter: "DISABLED";
  delivery_state: "NOT_SENT";
  created_at: string;
};

export type RepositoryCandidate = {
  id: string;
  repository_owner: string;
  repository_name: string;
  source_url: string;
  default_branch: string | null;
  commit_sha: string;
  tree_sha: string | null;
  fetched_at: string;
  source_classification: string;
  intake_source: string;
  state: "REFERENCE_ONLY" | "METADATA_ONLY";
  licence_observation: string;
  adoption_recommendation: string;
  created_at: string;
};

export type RepositoryQuarantine = {
  id: string;
  candidate_id: string;
  commit_sha: string;
  tree_sha: string;
  archive_sha256: string;
  manifest_sha256: string;
  archive_size_bytes: string;
  controls: Record<string, boolean>;
  policy_version: string;
  result: "ACCEPTED" | "REJECTED";
  reason: string;
  created_at: string;
};

export type RepositoryAssessment = {
  id: string;
  candidate_id: string;
  quarantine_id: string;
  toolchain: Record<string, string>;
  findings: Record<string, unknown>[];
  licence_state: string;
  provenance_state: string;
  secret_state: string;
  malware_state: string;
  dependency_state: string;
  sast_state: string;
  workflow_state: string;
  binary_state: string;
  critical_count: number;
  high_count: number;
  bounded_conclusion: string;
  residual_risk: string;
  disposition: "PASS" | "BLOCKED";
  created_at: string;
};

export type RepositoryProposal = {
  id: string;
  candidate_id: string;
  state: "DRAFT" | "APPROVED" | "CHANGES_REQUIRED";
  current_version: number;
  approved_version: number | null;
  version_id: string;
  assessment_id: string;
  need_statement: string;
  exact_scope: string[];
  licence_obligations: string;
  architecture_changes: string;
  threat_model: string;
  test_plan: string;
  rollback_plan: string;
  proposal_sha256: string;
  version_status: "DRAFT" | "APPROVED" | "REJECTED" | "SUPERSEDED";
  creator_name: string;
  created_at: string;
};

export type RepositoryAdoptionReview = {
  id: string;
  proposal_id: string;
  proposal_version_id: string;
  proposal_version: number;
  proposal_sha256: string;
  checks: Record<string, boolean>;
  decision: string;
  note: string;
  reviewer_name: string;
  created_at: string;
};

export type RepositoryImplementationIntent = {
  id: string;
  candidate_id: string;
  assessment_id: string;
  proposal_id: string;
  proposal_version_id: string;
  review_id: string;
  commit_sha: string;
  proposal_sha256: string;
  branch_name: string;
  intent_sha256: string;
  state: "AUTHORIZED";
  git_execution_state: "NOT_STARTED";
  merge_enabled: false;
  release_enabled: false;
  deploy_enabled: false;
  created_at: string;
};

export type WorkspaceFile = {
  id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  scan_status: string;
  lifecycle_state: string;
  state_reason_code: string | null;
  created_at: string;
};

export type WorkspaceMember = {
  id: string;
  display_name: string;
  role: string;
};

export type WorkspaceApproval = {
  id: string;
  action: string;
  state: string;
  payload: Record<string, unknown>;
  expires_at: string;
  created_at: string;
};

export type WorkspaceActivity = {
  id: string;
  entry_type: string;
  title: string;
  status: string;
  actor_name: string | null;
  occurred_at: string;
  resource_type: string;
  resource_id: string | null;
};

export type WorkspaceFinance = {
  currency: string;
  net_actual: string;
  entry_count: number;
};

export type ProjectWorkspace = {
  project: Project;
  modules: WorkspaceModule[];
  module: WorkspaceModule;
  projectWritable: boolean;
  writable: boolean;
  availability: "READY" | "DENIED";
  unavailableReason: string | null;
  entries: WorkspaceEntry[];
  records: RecordRow[];
  loop: OperatingLoop | null;
  files: WorkspaceFile[];
  members: WorkspaceMember[];
  approvals: WorkspaceApproval[];
  activity: WorkspaceActivity[];
  finance: WorkspaceFinance[];
  vehicles: VehicleCompatibility[];
  propertyAssets: PropertyAsset[];
  clprReviews: ClprRevisitReview[];
  digitalOpportunities: DigitalOpportunity[];
  youtubeChannelBindings: YoutubeChannelBinding[];
  youtubePackages: YoutubeContentPackage[];
  youtubeReviews: YoutubeContentReview[];
  youtubeUploadIntents: YoutubeUploadIntent[];
  repositoryCandidates: RepositoryCandidate[];
  repositoryQuarantines: RepositoryQuarantine[];
  repositoryAssessments: RepositoryAssessment[];
  repositoryProposals: RepositoryProposal[];
  repositoryReviews: RepositoryAdoptionReview[];
  repositoryImplementationIntents: RepositoryImplementationIntent[];
  gatePolicies: GatePolicy[];
  gateAuthorizations: GateAuthorization[];
  acceptedEvidence: RecordRow[];
};

export async function listWorkspaceModules(a: Actor, projectId: string) {
  await project(a, projectId);
  return query<WorkspaceModule>(
    a,
    `select project_id,module_key,label,module_group,source_kind,entry_type,
      position,description,hard_boundary,write_policy,filter_spec
     from kxra.project_workspace_modules where project_id=$1
     order by module_group,position,module_key`,
    [projectId],
  );
}

function recordKinds(module: WorkspaceModule) {
  if (module.source_kind === "DECISIONS") return ["decision"];
  if (module.source_kind === "RISKS") return ["risk"];
  if (module.module_key === "assumptions") return ["assumption"];
  return ["source", "knowledge"];
}

export async function loadProjectWorkspace(
  a: Actor,
  projectId: string,
  moduleKey = "overview",
): Promise<ProjectWorkspace> {
  const currentProject = await project(a, projectId);
  const modules = await listWorkspaceModules(a, projectId);
  const module = modules.find(
    (candidate) => candidate.module_key === moduleKey,
  );
  if (!module) throw new HttpError(404, "Not found");

  const writeCheck = await query<{ allowed: boolean }>(
    a,
    "select kxra_private.can_project($1,true) as allowed",
    [projectId],
  );
  const writable =
    Boolean(writeCheck[0]?.allowed) &&
    (module.write_policy === "CONTRIBUTOR" ||
      (module.write_policy === "OWNER" && a.role === "owner"));
  let availability: ProjectWorkspace["availability"] = "READY";
  let unavailableReason: string | null = null;
  if (
    ["FINANCE", "APPROVALS", "ACTIVITY"].includes(module.source_kind) &&
    a.role !== "owner"
  ) {
    availability = "DENIED";
    unavailableReason =
      module.source_kind === "FINANCE"
        ? "Project financial controls are owner-only."
        : module.source_kind === "APPROVALS"
          ? "Approval details are owner-only."
          : "The full operating activity log is owner-only.";
  }

  const result: ProjectWorkspace = {
    project: currentProject,
    modules,
    module,
    projectWritable: Boolean(writeCheck[0]?.allowed),
    writable,
    availability,
    unavailableReason,
    entries: [],
    records: [],
    loop: null,
    files: [],
    members: [],
    approvals: [],
    activity: [],
    finance: [],
    vehicles: [],
    propertyAssets: [],
    clprReviews: [],
    digitalOpportunities: [],
    youtubeChannelBindings: [],
    youtubePackages: [],
    youtubeReviews: [],
    youtubeUploadIntents: [],
    repositoryCandidates: [],
    repositoryQuarantines: [],
    repositoryAssessments: [],
    repositoryProposals: [],
    repositoryReviews: [],
    repositoryImplementationIntents: [],
    gatePolicies: [],
    gateAuthorizations: [],
    acceptedEvidence: [],
  };

  const [policies, authorizations, evidence] = await Promise.all([
    query<GatePolicy>(
      a,
      `select gate_code,policy_version,requirements,threshold_state
       from kxra.project_gate_policies where project_id=$1 order by gate_code`,
      [projectId],
    ),
    query<GateAuthorization>(
      a,
      `select id,gate_code,evidence_id,evidence_version,scope,created_at
       from kxra.project_gate_authorizations where project_id=$1 order by created_at desc,id`,
      [projectId],
    ),
    a.role === "owner"
      ? query<RecordRow>(
          a,
          `select * from kxra.records where project_id=$1 and status='accepted'
            and visibility='project_shared' and kind<>'idea'
           order by title,id`,
          [projectId],
        )
      : Promise.resolve([] as RecordRow[]),
  ]);
  result.gatePolicies = policies;
  result.gateAuthorizations = authorizations;
  result.acceptedEvidence = evidence;

  if (availability === "DENIED") return result;

  if (module.source_kind === "WORKSPACE_ENTRIES") {
    result.entries = await query<WorkspaceEntry>(
      a,
      `select e.*,creator.display_name as creator_name,reviewer.display_name as reviewer_name,
        (select count(*)::int from kxra.workspace_entry_evidence x
         where x.entry_id=e.id and x.entry_version=e.version) as evidence_count
       from kxra.workspace_entries e
       join kxra.members creator on creator.id=e.created_by and creator.org_id=e.org_id
       left join kxra.members reviewer on reviewer.id=e.reviewed_by and reviewer.org_id=e.org_id
       where e.project_id=$1 and e.module_key=$2
       order by e.updated_at desc,e.id`,
      [projectId, module.module_key],
    );
  } else if (["RECORDS", "DECISIONS", "RISKS"].includes(module.source_kind)) {
    result.records = await query<RecordRow>(
      a,
      `select * from kxra.records where project_id=$1 and kind::text=any($2::text[])
       order by updated_at desc,id`,
      [projectId, recordKinds(module)],
    );
  } else if (
    module.source_kind === "EXPERIMENTS" ||
    module.source_kind === "TASKS"
  ) {
    result.loop = await operatingLoop(a, projectId);
  } else if (module.source_kind === "FILES") {
    result.files = await query<WorkspaceFile>(
      a,
      `select id,filename,mime_type,size_bytes,scan_status,lifecycle_state,
        state_reason_code,created_at
       from kxra.files where project_id=$1 order by created_at desc,id`,
      [projectId],
    );
  } else if (module.source_kind === "PARTNERS") {
    result.members = await query<WorkspaceMember>(
      a,
      `select m.id,m.display_name,
        case when m.role='owner' then 'owner' else pm.role end as role
       from kxra.members m
       left join kxra.project_memberships pm on pm.user_id=m.id and pm.org_id=m.org_id
        and pm.project_id=$1 and pm.active and (pm.expires_at is null or pm.expires_at>now())
       join kxra.projects p on p.id=$1 and p.org_id=m.org_id
       where m.active and (m.role='owner' or pm.user_id is not null)
       order by m.role,m.display_name,m.id`,
      [projectId],
    );
  } else if (module.source_kind === "APPROVALS") {
    result.approvals = await query<WorkspaceApproval>(
      a,
      `select id,action,state,payload,expires_at,created_at from kxra.approvals
       where project_id=$1 order by created_at desc,id limit 100`,
      [projectId],
    );
  } else if (module.source_kind === "ACTIVITY") {
    result.activity = await query<WorkspaceActivity>(
      a,
      `select w.id,w.entry_type,w.title,w.status,m.display_name as actor_name,
        w.occurred_at,w.resource_type,w.resource_id
       from kxra.work_log_entries w
       left join kxra.members m on m.id=w.actor_id and m.org_id=w.org_id
       where w.project_id=$1 order by w.occurred_at desc,w.id desc limit 100`,
      [projectId],
    );
  } else if (module.source_kind === "FINANCE") {
    result.finance = await query<WorkspaceFinance>(
      a,
      `select data->>'currency' as currency,
        sum(case when data->>'direction'='income' then (data->>'amount')::numeric
                 else -(data->>'amount')::numeric end)::numeric(30,4)::text as net_actual,
        count(*)::int as entry_count
       from kxra.records where project_id=$1 and kind='finance'
        and data->>'entry_type'='actual'
       group by data->>'currency' order by data->>'currency'`,
      [projectId],
    );
  } else if (module.source_kind === "VEHICLE_COMPATIBILITY") {
    result.vehicles = await query<VehicleCompatibility>(
      a,
      `select id,vehicle_family,supplier_sku,fitment_state,safety_state,
        fitment_evidence_id,fitment_evidence_version,safety_evidence_id,
        safety_evidence_version,version,reviewed_at
       from kxra.vehicle_compatibility where project_id=$1
       order by vehicle_family,id`,
      [projectId],
    );
  } else if (module.source_kind === "PROPERTY_ASSETS") {
    result.propertyAssets = await query<PropertyAsset>(
      a,
      `select id,module_key,title,asset_kind,origin,rights_state,geometry_state,
        version,created_at,reviewed_at
       from kxra.property_assets where project_id=$1 and module_key=$2
       order by created_at desc,id`,
      [projectId, module.module_key],
    );
  } else if (module.source_kind === "P001_REVISIT") {
    result.clprReviews = await query<ClprRevisitReview>(
      a,
      `select id,recommendation,rationale,route_evidence_id,route_evidence_version,
        liquidity_evidence_id,liquidity_evidence_version,recovery_evidence_id,
        recovery_evidence_version,buyer_evidence_id,buyer_evidence_version,
        regulatory_evidence_id,regulatory_evidence_version,created_at
       from kxra.clpr_revisit_reviews where project_id=$1 order by created_at desc,id`,
      [projectId],
    );
  } else if (module.source_kind === "DIGITAL_OPPORTUNITIES") {
    result.digitalOpportunities = await query<DigitalOpportunity>(
      a,
      `select id,title,buyer_problem,stage,demand_evidence_id,demand_evidence_version,
        gate_authorization_id,opportunity_score,confidence_score,version,created_at,updated_at
       from kxra.digital_opportunities where project_id=$1 order by updated_at desc,id`,
      [projectId],
    );
  } else if (module.source_kind === "YOUTUBE_PIPELINE") {
    const [bindings, packages, reviews, intents] = await Promise.all([
      query<YoutubeChannelBinding>(
        a,
        `select id,expected_channel_url,expected_handle,provider_channel_id,
          state,version,verified_at
         from kxra.youtube_channel_bindings where project_id=$1`,
        [projectId],
      ),
      query<YoutubeContentPackage>(
        a,
        `select p.id,p.topic,p.state,p.current_version,p.approved_version,
          v.id as version_id,v.status as version_status,v.content_sha256,
          v.source_pack,v.claim_ledger,v.script,v.red_team,v.storyboard,
          v.rights_review,v.voice_provenance,v.render_manifest,v.qa_review,
          v.publication_metadata,m.display_name as creator_name,p.created_at
         from kxra.youtube_content_packages p
         join kxra.youtube_content_package_versions v
          on v.package_id=p.id and v.version=p.current_version
         join kxra.members m on m.id=p.created_by and m.org_id=p.org_id
         where p.project_id=$1 order by p.updated_at desc,p.id`,
        [projectId],
      ),
      query<YoutubeContentReview>(
        a,
        `select r.id,r.package_id,r.package_version_id,r.package_version,
          r.content_sha256,r.checks,r.decision,r.note,
          m.display_name as reviewer_name,r.created_at
         from kxra.youtube_content_reviews r
         join kxra.members m on m.id=r.reviewed_by and m.org_id=r.org_id
         where r.project_id=$1 order by r.created_at desc,r.id`,
        [projectId],
      ),
      query<YoutubeUploadIntent>(
        a,
        `select id,package_id,package_version_id,package_version,content_sha256,
          intent_sha256,state,adapter,delivery_state,created_at
         from kxra.youtube_upload_intents where project_id=$1
         order by created_at desc,id`,
        [projectId],
      ),
    ]);
    result.youtubeChannelBindings = bindings;
    result.youtubePackages = packages;
    result.youtubeReviews = reviews;
    result.youtubeUploadIntents = intents;
  } else if (module.source_kind === "REPOSITORY_PIPELINE") {
    const [candidates, quarantines, assessments, proposals, reviews, intents] =
      await Promise.all([
        query<RepositoryCandidate>(
          a,
          `select id,repository_owner,repository_name,source_url,default_branch,
            commit_sha,tree_sha,fetched_at,source_classification,intake_source,
            state,licence_observation,adoption_recommendation,created_at
           from kxra.repository_candidates where project_id=$1
           order by created_at desc,id`,
          [projectId],
        ),
        query<RepositoryQuarantine>(
          a,
          `select id,candidate_id,commit_sha,tree_sha,archive_sha256,
            manifest_sha256,archive_size_bytes::text,controls,policy_version,
            result,reason,created_at
           from kxra.repository_quarantine_records where project_id=$1
           order by created_at desc,id`,
          [projectId],
        ),
        query<RepositoryAssessment>(
          a,
          `select id,candidate_id,quarantine_id,toolchain,findings,licence_state,
            provenance_state,secret_state,malware_state,dependency_state,
            sast_state,workflow_state,binary_state,critical_count,high_count,
            bounded_conclusion,residual_risk,disposition,created_at
           from kxra.repository_assessments where project_id=$1
           order by created_at desc,id`,
          [projectId],
        ),
        query<RepositoryProposal>(
          a,
          `select p.id,p.candidate_id,p.state,p.current_version,p.approved_version,
            v.id as version_id,v.assessment_id,v.need_statement,v.exact_scope,
            v.licence_obligations,v.architecture_changes,v.threat_model,
            v.test_plan,v.rollback_plan,v.proposal_sha256,
            v.status as version_status,m.display_name as creator_name,p.created_at
           from kxra.repository_adoption_proposals p
           join kxra.repository_adoption_proposal_versions v
            on v.proposal_id=p.id and v.version=p.current_version
           join kxra.members m on m.id=p.created_by and m.org_id=p.org_id
           where p.project_id=$1 order by p.updated_at desc,p.id`,
          [projectId],
        ),
        query<RepositoryAdoptionReview>(
          a,
          `select r.id,r.proposal_id,r.proposal_version_id,r.proposal_version,
            r.proposal_sha256,r.checks,r.decision,r.note,
            m.display_name as reviewer_name,r.created_at
           from kxra.repository_adoption_reviews r
           join kxra.members m on m.id=r.reviewed_by and m.org_id=r.org_id
           where r.project_id=$1 order by r.created_at desc,r.id`,
          [projectId],
        ),
        query<RepositoryImplementationIntent>(
          a,
          `select id,candidate_id,assessment_id,proposal_id,proposal_version_id,
            review_id,commit_sha,proposal_sha256,branch_name,intent_sha256,
            state,git_execution_state,merge_enabled,release_enabled,
            deploy_enabled,created_at
           from kxra.repository_implementation_intents where project_id=$1
           order by created_at desc,id`,
          [projectId],
        ),
      ]);
    result.repositoryCandidates = candidates;
    result.repositoryQuarantines = quarantines;
    result.repositoryAssessments = assessments;
    result.repositoryProposals = proposals;
    result.repositoryReviews = reviews;
    result.repositoryImplementationIntents = intents;
  }
  return result;
}
