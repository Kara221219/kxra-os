import Link from "next/link";
import {
  GateEvidenceForm,
  OperatingLoopForms,
  UploadForm,
  WorkflowTaskCards,
} from "./Forms";
import {
  ClprRevisitForm,
  DigitalOpportunityControls,
  DigitalOpportunityForm,
  PropertyAssetForm,
  PropertyAssetReviewForm,
  VehicleVerificationForm,
  WorkspaceEntryForm,
  WorkspaceReviewButton,
} from "./ProjectWorkspaceForms";
import type {
  GatePolicy,
  ProjectWorkspace,
  WorkspaceEntry,
  WorkspaceModule,
} from "../lib/project-workspaces";
import type { Project, RecordRow } from "../lib/data";

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="empty workspace-empty" role="status">
      {children}
    </div>
  );
}

function Boundary({ children }: { children: React.ReactNode }) {
  return (
    <div className="workspace-boundary">
      <strong>Hard boundary</strong>
      <p>{children}</p>
    </div>
  );
}

function WorkspaceNavigation({
  modules,
  projectId,
  active,
}: {
  modules: WorkspaceModule[];
  projectId: string;
  active: string;
}) {
  return (
    <nav
      className="workspace-navigation"
      aria-label="Project workspace modules"
    >
      {(["COMMON", "SPECIALIST"] as const).map((group) => (
        <section key={group}>
          <h2>
            {group === "COMMON" ? "Common workspace" : "Specialist modules"}
          </h2>
          <div>
            {modules
              .filter((module) => module.module_group === group)
              .map((module) => (
                <Link
                  key={module.module_key}
                  href={
                    module.module_key === "overview"
                      ? `/os/projects/${projectId}`
                      : `/os/projects/${projectId}/${module.module_key}`
                  }
                  aria-current={
                    active === module.module_key ? "page" : undefined
                  }
                >
                  {module.label}
                </Link>
              ))}
          </div>
        </section>
      ))}
    </nav>
  );
}

function GatePanel({
  policy,
  authorizations,
  owner,
  evidence,
  projectId,
}: {
  policy: GatePolicy;
  authorizations: ProjectWorkspace["gateAuthorizations"];
  owner: boolean;
  evidence: RecordRow[];
  projectId: string;
}) {
  const gateAuthorizations = authorizations.filter(
    (item) => item.gate_code === policy.gate_code,
  );
  return (
    <section className="panel project-gate-panel">
      <div className="record-top">
        <div>
          <p className="eyebrow">Project gate</p>
          <h2>{policy.gate_code.replaceAll("_", " ")}</h2>
        </div>
        <span className="badge amber">Thresholds proposed / unset</span>
      </div>
      <p>Required evidence:</p>
      <ul>
        {policy.requirements.map((requirement) => (
          <li key={requirement}>{requirement}</li>
        ))}
      </ul>
      <p className="subtle">
        Policy v{policy.policy_version}. Authority is local-only and cannot
        publish, deploy, spend, trade, message externally, or enable product
        creation.
      </p>
      {gateAuthorizations.length ? (
        gateAuthorizations.map((authorization) => (
          <p className="success" key={authorization.id}>
            Local-only authority recorded from evidence v
            {authorization.evidence_version}. External action remains disabled.
          </p>
        ))
      ) : (
        <p className="notice">No current local gate authorization.</p>
      )}
      {owner && (
        <GateEvidenceForm
          projectId={projectId}
          gate={policy.gate_code}
          evidence={evidence}
        />
      )}
    </section>
  );
}

function RecordCards({ rows }: { rows: RecordRow[] }) {
  if (!rows.length)
    return <Empty>No records have been entered for this module.</Empty>;
  return (
    <div className="record-list">
      {rows.map((row) => (
        <article className="record" key={row.id}>
          <div className="record-top">
            <h3>
              <Link href={`/os/record/${row.id}`}>{row.title}</Link>
            </h3>
            <span className="badge">{row.classification}</span>
          </div>
          <p>{row.body || "No narrative supplied."}</p>
          <footer>
            <span>{row.status}</span>
            <span>Version {row.version}</span>
            <span>{row.visibility.replaceAll("_", " ")}</span>
          </footer>
        </article>
      ))}
    </div>
  );
}

function payloadRows(payload: Record<string, unknown>) {
  return Object.entries(payload).map(([key, value]) => (
    <div key={key}>
      <dt>{key.replaceAll("_", " ")}</dt>
      <dd>
        {typeof value === "boolean" ? (value ? "Yes" : "No") : String(value)}
      </dd>
    </div>
  ));
}

function WorkspaceEntries({
  entries,
  owner,
}: {
  entries: WorkspaceEntry[];
  owner: boolean;
}) {
  if (!entries.length)
    return <Empty>No typed records have been entered for this module.</Empty>;
  return (
    <div className="workspace-entry-grid">
      {entries.map((entry) => (
        <article className="workspace-entry" key={entry.id}>
          <div className="record-top">
            <div>
              <p className="eyebrow">
                {entry.record_type.replaceAll("_", " ")}
              </p>
              <h3>{entry.title}</h3>
            </div>
            <span className="badge">{entry.status}</span>
          </div>
          <p>{entry.summary}</p>
          <dl className="workspace-data-list">{payloadRows(entry.payload)}</dl>
          <footer>
            <span>{entry.classification}</span>
            <span>v{entry.version}</span>
            <span>
              {entry.evidence_count} evidence link
              {entry.evidence_count === 1 ? "" : "s"}
            </span>
            <span>{entry.creator_name}</span>
          </footer>
          {owner && entry.status === "DRAFT" && (
            <WorkspaceReviewButton entry={entry} />
          )}
        </article>
      ))}
    </div>
  );
}

function ProjectOverview({
  workspace,
  owner,
}: {
  workspace: ProjectWorkspace;
  owner: boolean;
}) {
  const project = workspace.project;
  return (
    <>
      <div className="workspace-score-grid">
        <div>
          <span>Lifecycle</span>
          <strong>{project.lifecycle_stage || project.stage}</strong>
        </div>
        <div>
          <span>Disposition</span>
          <strong>{project.disposition || project.status}</strong>
        </div>
        <div>
          <span>Venture Score</span>
          <strong>{project.venture_score ?? "Not Assessed"}</strong>
        </div>
        <div>
          <span>Confidence Score</span>
          <strong>{project.confidence_score ?? "Not Assessed"}</strong>
        </div>
      </div>
      <section className="panel">
        <p className="eyebrow">Current next action</p>
        <h2>{project.next_action}</h2>
        <dl className="workspace-data-list">
          <div>
            <dt>Next gate</dt>
            <dd>{project.next_gate || "Not set"}</dd>
          </div>
          <div>
            <dt>Current recommendation</dt>
            <dd>{project.current_recommendation || "Not assessed"}</dd>
          </div>
          <div>
            <dt>Live execution</dt>
            <dd>{project.live_execution_enabled ? "Enabled" : "Disabled"}</dd>
          </div>
          <div>
            <dt>Product creation</dt>
            <dd>{project.product_creation_enabled ? "Enabled" : "Disabled"}</dd>
          </div>
        </dl>
      </section>
      {workspace.gatePolicies.map((policy) => (
        <GatePanel
          key={policy.gate_code}
          policy={policy}
          authorizations={workspace.gateAuthorizations}
          owner={owner}
          evidence={workspace.acceptedEvidence}
          projectId={project.id}
        />
      ))}
    </>
  );
}

function ExperimentModule({
  workspace,
  actorId,
  owner,
}: {
  workspace: ProjectWorkspace;
  actorId: string;
  owner: boolean;
}) {
  const loop = workspace.loop;
  if (!loop) return <Empty>Experiment data is unavailable.</Empty>;
  const currentById = new Map(loop.records.map((row) => [row.id, row]));
  return (
    <>
      <div className="workflow-flow" aria-label="Operating loop status">
        <div>
          <small>Ideas</small>
          <strong>
            {loop.records.filter((row) => row.kind === "idea").length}
          </strong>
        </div>
        <div>
          <small>Experiments</small>
          <strong>
            {loop.records.filter((row) => row.kind === "experiment").length}
          </strong>
        </div>
        <div>
          <small>Results</small>
          <strong>{loop.results.length}</strong>
        </div>
        <div>
          <small>Decisions</small>
          <strong>
            {loop.records.filter((row) => row.kind === "decision").length}
          </strong>
        </div>
      </div>
      {loop.links.map((link) => (
        <p className="workflow-link" key={link.id}>
          <Link href={`/os/record/${link.from_record_id}`}>
            {currentById.get(link.from_record_id)?.title || "Record"} v
            {link.from_version}
          </Link>{" "}
          <span>{link.relation.replaceAll("_", " ")}</span>{" "}
          <Link href={`/os/record/${link.to_record_id}`}>
            {currentById.get(link.to_record_id)?.title || "Evidence"} v
            {link.to_version}
          </Link>
        </p>
      ))}
      {!loop.records.length && (
        <Empty>No experiments have been recorded.</Empty>
      )}
      <OperatingLoopForms
        projectId={workspace.project.id}
        actorId={actorId}
        owner={owner}
        records={loop.records}
        results={loop.results}
        tasks={loop.tasks}
        members={loop.members}
      />
    </>
  );
}

function SpecialistData({
  workspace,
  owner,
}: {
  workspace: ProjectWorkspace;
  owner: boolean;
}) {
  const source = workspace.module.source_kind;
  if (source === "VEHICLE_COMPATIBILITY")
    return (
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Vehicle family</th>
              <th>Supplier SKU</th>
              <th>Fitment</th>
              <th>Safety / airbag</th>
              {owner && <th>Evidence review</th>}
            </tr>
          </thead>
          <tbody>
            {workspace.vehicles.map((row) => (
              <tr key={row.id}>
                <td>{row.vehicle_family}</td>
                <td>{row.supplier_sku || "Unknown"}</td>
                <td>
                  <span
                    className={`badge ${row.fitment_state === "UNKNOWN" ? "amber" : ""}`}
                  >
                    {row.fitment_state}
                  </span>
                </td>
                <td>
                  <span
                    className={`badge ${row.safety_state === "UNKNOWN" ? "amber" : ""}`}
                  >
                    {row.safety_state}
                  </span>
                </td>
                {owner && (
                  <td>
                    <VehicleVerificationForm
                      projectId={workspace.project.id}
                      row={row}
                      evidence={workspace.acceptedEvidence}
                    />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  if (source === "PROPERTY_ASSETS") {
    const kinds = workspace.module.filter_spec.asset_kinds;
    const assetKind = Array.isArray(kinds) ? String(kinds[0] || "") : "";
    return (
      <>
        <div className="workspace-entry-grid">
          {workspace.propertyAssets.map((asset) => (
            <article className="workspace-entry" key={asset.id}>
              <div className="record-top">
                <h3>{asset.title}</h3>
                <span className="badge">
                  {asset.origin.replaceAll("_", " ")}
                </span>
              </div>
              <dl className="workspace-data-list">
                <div>
                  <dt>Asset kind</dt>
                  <dd>{asset.asset_kind.replaceAll("_", " ")}</dd>
                </div>
                <div>
                  <dt>Rights</dt>
                  <dd>{asset.rights_state}</dd>
                </div>
                <div>
                  <dt>Geometry QA</dt>
                  <dd>{asset.geometry_state.replaceAll("_", " ")}</dd>
                </div>
              </dl>
              {owner && asset.rights_state === "UNKNOWN" && (
                <PropertyAssetReviewForm
                  projectId={workspace.project.id}
                  asset={asset}
                  evidence={workspace.acceptedEvidence}
                />
              )}
            </article>
          ))}
        </div>
        {!workspace.propertyAssets.length && (
          <Empty>No property assets have been entered for this module.</Empty>
        )}
        {workspace.projectWritable && assetKind && (
          <PropertyAssetForm
            projectId={workspace.project.id}
            moduleKey={workspace.module.module_key}
            assetKind={assetKind}
          />
        )}
      </>
    );
  }
  if (source === "P001_REVISIT")
    return (
      <>
        <div className="workspace-entry-grid">
          {workspace.clprReviews.map((review) => (
            <article className="workspace-entry" key={review.id}>
              <div className="record-top">
                <h3>{review.recommendation.replaceAll("_", " ")}</h3>
                <span className="badge">Evidence-bound</span>
              </div>
              <p>{review.rationale}</p>
              <p className="subtle">
                Cites exact route, liquidity, recovery, buyer and regulatory
                record versions.
              </p>
            </article>
          ))}
        </div>
        {!workspace.clprReviews.length && (
          <Empty>No evidence-complete revisit recommendation exists.</Empty>
        )}
        {owner && (
          <ClprRevisitForm
            projectId={workspace.project.id}
            evidence={workspace.acceptedEvidence}
          />
        )}
      </>
    );
  if (source === "DIGITAL_OPPORTUNITIES")
    return (
      <>
        <div className="workspace-entry-grid">
          {workspace.digitalOpportunities.map((opportunity) => (
            <article className="workspace-entry" key={opportunity.id}>
              <div className="record-top">
                <h3>{opportunity.title}</h3>
                <span className="badge">
                  {opportunity.stage.replaceAll("_", " ")}
                </span>
              </div>
              <p>{opportunity.buyer_problem}</p>
              <dl className="workspace-data-list">
                <div>
                  <dt>Opportunity score</dt>
                  <dd>{opportunity.opportunity_score ?? "Not Assessed"}</dd>
                </div>
                <div>
                  <dt>Confidence score</dt>
                  <dd>{opportunity.confidence_score ?? "Not Assessed"}</dd>
                </div>
              </dl>
              {workspace.module.module_key === "opportunity-backlog" &&
                workspace.writable && (
                  <DigitalOpportunityControls
                    projectId={workspace.project.id}
                    opportunity={opportunity}
                    evidence={workspace.acceptedEvidence}
                    authorizations={workspace.gateAuthorizations}
                    owner={owner}
                  />
                )}
            </article>
          ))}
        </div>
        {!workspace.digitalOpportunities.length && (
          <Empty>No specific buyer-problem opportunity has been entered.</Empty>
        )}
        {workspace.module.module_key === "opportunity-backlog" &&
          workspace.writable && (
            <DigitalOpportunityForm projectId={workspace.project.id} />
          )}
      </>
    );
  return null;
}

function ModuleBody({
  workspace,
  owner,
  actorId,
}: {
  workspace: ProjectWorkspace;
  owner: boolean;
  actorId: string;
}) {
  const source = workspace.module.source_kind;
  if (workspace.availability === "DENIED")
    return (
      <div className="denied-state" role="status">
        <h3>Restricted module</h3>
        <p>{workspace.unavailableReason}</p>
      </div>
    );
  if (source === "PROJECT")
    return <ProjectOverview workspace={workspace} owner={owner} />;
  if (source === "WORKSPACE_ENTRIES")
    return (
      <>
        <WorkspaceEntries entries={workspace.entries} owner={owner} />
        {workspace.writable && workspace.module.entry_type && (
          <WorkspaceEntryForm
            projectId={workspace.project.id}
            moduleKey={workspace.module.module_key}
            entryType={workspace.module.entry_type}
            owner={owner}
            evidence={workspace.acceptedEvidence}
          />
        )}
      </>
    );
  if (["RECORDS", "DECISIONS", "RISKS"].includes(source))
    return <RecordCards rows={workspace.records} />;
  if (source === "EXPERIMENTS")
    return (
      <ExperimentModule workspace={workspace} actorId={actorId} owner={owner} />
    );
  if (source === "TASKS") {
    const loop = workspace.loop;
    if (!loop?.tasks.length)
      return <Empty>No workflow tasks are assigned.</Empty>;
    return (
      <WorkflowTaskCards
        tasks={loop.tasks}
        records={loop.records}
        actorId={actorId}
        owner={owner}
      />
    );
  }
  if (source === "FILES")
    return (
      <>
        <div className="panel">
          {workspace.files.map((file) => (
            <div className="list-item" key={file.id}>
              <Link href={`/api/files/${file.id}`}>{file.filename}</Link>
              <span className="badge">{file.lifecycle_state}</span>
              <p>{file.size_bytes} bytes</p>
              {file.state_reason_code && (
                <p className="subtle">{file.state_reason_code}</p>
              )}
            </div>
          ))}
          {!workspace.files.length && <p>No files uploaded.</p>}
        </div>
        {workspace.projectWritable && (
          <UploadForm
            projects={[workspace.project as Project]}
            pid={workspace.project.id}
            owner={owner}
          />
        )}
      </>
    );
  if (source === "PARTNERS")
    return workspace.members.length ? (
      <div className="workspace-entry-grid">
        {workspace.members.map((member) => (
          <article className="workspace-entry" key={member.id}>
            <h3>{member.display_name}</h3>
            <span className="badge">{member.role}</span>
          </article>
        ))}
      </div>
    ) : (
      <Empty>No current project assignments are visible.</Empty>
    );
  if (source === "APPROVALS")
    return workspace.approvals.length ? (
      <div className="record-list">
        {workspace.approvals.map((approval) => (
          <article className="record" key={approval.id}>
            <h3>
              {String(approval.payload.action_summary || approval.action)}
            </h3>
            <p>
              {approval.state} · expires{" "}
              {new Date(approval.expires_at).toLocaleString("en-GB")}
            </p>
            <Link href={`/os/approvals#approval-${approval.id}`}>
              Open exact envelope
            </Link>
          </article>
        ))}
      </div>
    ) : (
      <Empty>No project approvals have been requested.</Empty>
    );
  if (source === "ACTIVITY")
    return workspace.activity.length ? (
      <div className="record-list">
        {workspace.activity.map((item) => (
          <article className="record" key={item.id}>
            <h3>{item.title}</h3>
            <p>
              {item.entry_type.replaceAll("_", " ")} · {item.status} ·{" "}
              {item.actor_name || "System"}
            </p>
          </article>
        ))}
      </div>
    ) : (
      <Empty>No persisted project activity is available.</Empty>
    );
  if (source === "FINANCE")
    return workspace.finance.length ? (
      <div className="workspace-score-grid">
        {workspace.finance.map((item) => (
          <div key={item.currency}>
            <span>{item.currency} actual net movement</span>
            <strong>{item.net_actual}</strong>
            <small>{item.entry_count} entries</small>
          </div>
        ))}
      </div>
    ) : (
      <Empty>Unknown — no actual financial entries are recorded.</Empty>
    );
  if (source === "PROJECT_SCORES")
    return (
      <div className="workspace-score-grid">
        <div>
          <span>Venture Score</span>
          <strong>{workspace.project.venture_score ?? "Not Assessed"}</strong>
        </div>
        <div>
          <span>Confidence Score</span>
          <strong>
            {workspace.project.confidence_score ?? "Not Assessed"}
          </strong>
        </div>
        <div>
          <span>Coverage</span>
          <strong>{workspace.project.score_coverage ?? "Unknown"}</strong>
        </div>
      </div>
    );
  return <SpecialistData workspace={workspace} owner={owner} />;
}

export default function ProjectWorkspaceView({
  workspace,
  owner,
  actorId,
}: {
  workspace: ProjectWorkspace;
  owner: boolean;
  actorId: string;
}) {
  return (
    <>
      {workspace.project.code === "PROJECT-004" && (
        <div className="hard-stop-banner">
          <strong>Research / paper only.</strong> No broker adapter, live
          credential, live toggle, live approval, or trade executor exists.
        </div>
      )}
      {workspace.project.code === "PROJECT-005" && (
        <div className="hard-stop-banner">
          <strong>Demand first.</strong> Product creation and publication remain
          disabled; local prototype authority is evidence-bound and separate.
        </div>
      )}
      <WorkspaceNavigation
        modules={workspace.modules}
        projectId={workspace.project.id}
        active={workspace.module.module_key}
      />
      <section
        className="workspace-module"
        id={`module-${workspace.module.module_key}`}
      >
        <div className="workspace-module-heading">
          <div>
            <p className="eyebrow">
              {workspace.module.module_group.toLowerCase()} module
            </p>
            <h2>{workspace.module.label}</h2>
            <p>{workspace.module.description}</p>
          </div>
          <span className="badge">
            {workspace.module.write_policy === "GATED"
              ? "Gated"
              : workspace.writable
                ? "Typed input enabled"
                : "Read only"}
          </span>
        </div>
        {workspace.module.hard_boundary && (
          <Boundary>{workspace.module.hard_boundary}</Boundary>
        )}
        {workspace.module.write_policy === "GATED" && (
          <p className="notice">
            This module is visible for planning, but its mutation workflow is
            unavailable at the current authority boundary.
          </p>
        )}
        <ModuleBody workspace={workspace} owner={owner} actorId={actorId} />
      </section>
    </>
  );
}
