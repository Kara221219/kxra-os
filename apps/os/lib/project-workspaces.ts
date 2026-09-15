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
    | "DIGITAL_OPPORTUNITIES";
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
    | "P005_LOCAL_PROTOTYPE";
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

export type WorkspaceFile = {
  id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  scan_status: string;
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
      `select id,filename,mime_type,size_bytes,scan_status,created_at
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
  }
  return result;
}
