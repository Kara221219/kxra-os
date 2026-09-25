import Link from "next/link";
import type { Project } from "../lib/data";
import type {
  DashboardSection,
  IdeaRow,
  PortfolioRow,
  PublicEnquiryRow,
  WorkLogRow,
} from "../lib/control-plane";
import {
  IdeaForm,
  IdeaOwnerControls,
  ProjectGovernanceForm,
} from "./ControlPlaneForms";

type Member = { id: string; display_name: string; role?: string };

export function PublicEnquiryInbox({ rows }: { rows: PublicEnquiryRow[] }) {
  return (
    <section className="panel">
      <div className="record-top">
        <div>
          <p className="eyebrow">Public website inbox</p>
          <h2>Unverified enquiries</h2>
        </div>
        <span className="badge">Owner only · {rows.length}</span>
      </div>
      <p>
        Website submissions are unverified input. Review identity and scope
        before moving anything into a project or sending a response.
      </p>
      <div className="record-list">
        {rows.map((row) => (
          <article className="record" key={row.id}>
            <div className="record-top">
              <div>
                <small>{label(row.form_kind)}</small>
                <h3>{row.name}</h3>
              </div>
              <span className="badge amber">{row.status}</span>
            </div>
            <p>{row.message}</p>
            <dl className="definition">
              <dt>Business</dt>
              <dd>{row.company || "Not supplied"}</dd>
              <dt>Email</dt>
              <dd>
                <a href={`mailto:${row.email}`}>{row.email}</a>
              </dd>
              <dt>Source</dt>
              <dd>{row.source_path}</dd>
              <dt>Received</dt>
              <dd>{date(row.received_at)}</dd>
              <dt>Response consent</dt>
              <dd>{date(row.consent_recorded_at)}</dd>
            </dl>
          </article>
        ))}
        {!rows.length && <p className="empty">No public enquiries received.</p>}
      </div>
    </section>
  );
}

function label(value: string) {
  return value.replaceAll("_", " ");
}

function date(value: string | null) {
  return value ? new Date(value).toLocaleString("en-GB") : "Unknown";
}

export function DashboardSectionView({
  title,
  section,
  tone,
}: {
  title: string;
  section: DashboardSection;
  tone?: string;
}) {
  return (
    <section className={`control-section panel ${tone || ""}`}>
      <header className="control-section-header">
        <div>
          <p className="eyebrow">{title}</p>
          <strong className="control-count">{section.count}</strong>
        </div>
        <dl className="mini-counts">
          {Object.entries(section.breakdown).map(([key, value]) => (
            <div key={key}>
              <dt>{label(key)}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </header>
      {section.items.length ? (
        <div className="control-items">
          {section.items.map((item) => (
            <Link
              className="control-item"
              href={item.href}
              key={`${item.kind}-${item.id}`}
            >
              <span className="badge">{label(item.kind)}</span>
              <strong>{item.title}</strong>
              <p>{item.detail}</p>
              <small>
                {item.project_code || "KXRA Group"} · {date(item.occurred_at)}
              </small>
            </Link>
          ))}
        </div>
      ) : (
        <p className="empty compact">No persisted items require attention.</p>
      )}
      {section.note && <p className="subtle">{section.note}</p>}
    </section>
  );
}

function assessment(value: string | null) {
  return value === null ? <span className="unknown">NOT ASSESSED</span> : value;
}

function pageHref(
  base: string,
  values: Record<string, string | number | undefined>,
) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(values))
    if (value !== undefined && value !== "") search.set(key, String(value));
  return `${base}?${search.toString()}`;
}

export function PortfolioView({
  result,
  filters,
  projects,
  membersByProject,
}: {
  result: {
    rows: PortfolioRow[];
    page: number;
    page_size: number;
    total_count: number;
  };
  filters: Record<string, string | undefined>;
  projects: Project[];
  membersByProject: Record<string, Member[]>;
}) {
  const pageCount = Math.max(
    1,
    Math.ceil(result.total_count / result.page_size),
  );
  return (
    <>
      <form className="panel filter-bar" method="get">
        <label>
          Lifecycle stage
          <select name="stage" defaultValue={filters.stage || ""}>
            <option value="">All stages</option>
            {[
              "IDEA_INBOX",
              "PROBLEM_DISCOVERY",
              "VALIDATION",
              "MARKET_ANALYSIS",
              "FEASIBILITY",
              "BUSINESS_CASE",
              "MVP",
              "PILOT",
              "REVIEW",
              "LAUNCH",
              "SCALE",
            ].map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
        <label>
          Disposition
          <select name="disposition" defaultValue={filters.disposition || ""}>
            <option value="">All dispositions</option>
            {["ACTIVE", "MONITOR", "PAUSED", "REJECTED", "ARCHIVED"].map(
              (item) => (
                <option key={item}>{item}</option>
              ),
            )}
          </select>
        </label>
        <label>
          Sort
          <select name="sort" defaultValue={filters.sort || "code"}>
            <option value="code">Project code</option>
            <option value="name">Name</option>
            <option value="lifecycle_stage">Lifecycle stage</option>
            <option value="disposition">Disposition</option>
            <option value="venture_score">Venture Score</option>
            <option value="confidence_score">Confidence</option>
            <option value="next_gate">Next gate</option>
            <option value="updated_at">Latest governance change</option>
          </select>
        </label>
        <label>
          Direction
          <select name="direction" defaultValue={filters.direction || "asc"}>
            <option value="asc">Ascending</option>
            <option value="desc">Descending</option>
          </select>
        </label>
        <button>Apply</button>
      </form>
      <div className="panel portfolio-panel">
        <div className="table-meta">
          <strong>{result.total_count} ventures</strong>
          <span>
            Page {result.page} of {pageCount}
          </span>
        </div>
        <div className="table-wrap portfolio-table">
          <table>
            <thead>
              <tr>
                <th>Venture</th>
                <th>Stage / disposition</th>
                <th>Assessment</th>
                <th>Owner / partners</th>
                <th>Capital used</th>
                <th>Gate / risk</th>
                <th>Latest experiment</th>
                <th>Recommendation</th>
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row) => {
                const project = projects.find((item) => item.id === row.id);
                return (
                  <tr key={row.id} id={`portfolio-${row.id}`}>
                    <td className="project-name">
                      <small>{row.code}</small>
                      <Link href={`/os/projects/${row.id}`}>
                        <strong>{row.name}</strong>
                      </Link>
                      <small>
                        Source: {row.source_stage} · {row.source_status}
                      </small>
                    </td>
                    <td data-label="Stage / disposition">
                      <span className="badge">
                        {row.lifecycle_stage
                          ? label(row.lifecycle_stage)
                          : "Unknown"}
                      </span>
                      <p>{row.disposition || "Unknown"}</p>
                    </td>
                    <td data-label="Assessment">
                      <p>Venture {assessment(row.venture_score)}</p>
                      <p>Confidence {assessment(row.confidence_score)}</p>
                      <p>Coverage {assessment(row.score_coverage)}</p>
                    </td>
                    <td data-label="Owner / partners">
                      <p>{row.owner_name || "Unassigned"}</p>
                      <small>
                        {row.partners.length
                          ? row.partners
                              .map((partner) => partner.name)
                              .join(", ")
                          : "No active partners"}
                      </small>
                    </td>
                    <td data-label="Capital used">
                      {row.capital_used.length
                        ? row.capital_used.map((amount) => (
                            <div key={amount.currency}>
                              {amount.currency} {amount.amount}
                            </div>
                          ))
                        : "Unknown"}
                      <small>Actual expenses only; no FX conversion.</small>
                    </td>
                    <td data-label="Gate / risk">
                      <p>{row.next_gate || "Unknown"}</p>
                      {row.largest_risk ? (
                        <Link href={`/os/record/${row.largest_risk.id}`}>
                          {row.largest_risk.title} · rating{" "}
                          {row.largest_risk.rating || "Unknown"}
                        </Link>
                      ) : (
                        <small>Largest risk Unknown</small>
                      )}
                    </td>
                    <td data-label="Latest experiment">
                      {row.latest_experiment ? (
                        <Link href={`/os/record/${row.latest_experiment.id}`}>
                          {row.latest_experiment.title}
                        </Link>
                      ) : (
                        "Unknown"
                      )}
                    </td>
                    <td data-label="Recommendation">
                      <strong>{row.current_recommendation || "Unknown"}</strong>
                      <p>{row.next_action}</p>
                      {project && (
                        <details>
                          <summary>Propose change</summary>
                          <ProjectGovernanceForm
                            project={project}
                            members={membersByProject[row.id] || []}
                          />
                        </details>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!result.rows.length && (
          <p className="empty">No ventures match these filters.</p>
        )}
        <nav className="pagination" aria-label="Portfolio pages">
          {result.page > 1 && (
            <Link
              href={pageHref("/os/portfolio", {
                ...filters,
                page: result.page - 1,
              })}
            >
              ← Previous
            </Link>
          )}
          {result.page < pageCount && (
            <Link
              href={pageHref("/os/portfolio", {
                ...filters,
                page: result.page + 1,
              })}
            >
              Next →
            </Link>
          )}
        </nav>
      </div>
    </>
  );
}

export function IdeaInboxView({
  result,
  filters,
  projects,
  writableProjects,
  owner,
  partnersByProject,
}: {
  result: {
    rows: IdeaRow[];
    page: number;
    page_size: number;
    total_count: number;
  };
  filters: Record<string, string | undefined>;
  projects: Project[];
  writableProjects: Project[];
  owner: boolean;
  partnersByProject: Record<string, Member[]>;
}) {
  const pageCount = Math.max(
    1,
    Math.ceil(result.total_count / result.page_size),
  );
  return (
    <>
      <IdeaForm
        projects={writableProjects}
        partner={!owner}
        projectId={filters.project}
      />
      <form className="panel filter-bar" method="get">
        <label>
          Project
          <select name="project" defaultValue={filters.project || ""}>
            <option value="">All visible ideas</option>
            {projects.map((project) => (
              <option value={project.id} key={project.id}>
                {project.code} · {project.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          State
          <select name="state" defaultValue={filters.state || ""}>
            <option value="">All states</option>
            {[
              "NEW",
              "TRIAGE",
              "VALIDATING",
              "PROMISING",
              "BUILDING",
              "PAUSED",
              "REJECTED",
              "ARCHIVED",
            ].map((state) => (
              <option key={state}>{state}</option>
            ))}
          </select>
        </label>
        <button>Apply</button>
      </form>
      <div className="table-meta">
        <strong>{result.total_count} visible ideas</strong>
        <span>
          Page {result.page} of {pageCount}
        </span>
      </div>
      <div className="record-list idea-list">
        {result.rows.map((idea) => {
          const duplicates = result.rows.filter(
            (candidate) =>
              candidate.record_id !== idea.record_id &&
              candidate.project_id === idea.project_id &&
              candidate.state !== "ARCHIVED",
          );
          return (
            <article
              className="record idea-card"
              key={idea.record_id}
              id={`idea-${idea.record_id}`}
            >
              <div className="record-top">
                <div>
                  <small>{idea.project_code || "GROUP INBOX"}</small>
                  <h2>{idea.title}</h2>
                </div>
                <span className="badge">{idea.state}</span>
              </div>
              <p className="idea-raw">{idea.raw_idea}</p>
              <dl className="definition idea-definition">
                <dt>Submitter</dt>
                <dd>{idea.submitter_name || "Imported source"}</dd>
                <dt>Submitted</dt>
                <dd>{date(idea.submitted_at)}</dd>
                <dt>Source</dt>
                <dd>{label(idea.source_type)}</dd>
                <dt>Structured summary</dt>
                <dd>{idea.structured_summary || "Unknown"}</dd>
                <dt>Problem</dt>
                <dd>{idea.problem_statement || "Unknown"}</dd>
                <dt>Customer</dt>
                <dd>{idea.target_customer || "Unknown"}</dd>
                <dt>Validation</dt>
                <dd>{idea.validation_plan || "Unknown"}</dd>
                <dt>Next experiment</dt>
                <dd>{idea.next_experiment || "Unknown"}</dd>
                <dt>Evidence</dt>
                <dd>{idea.evidence_count} exact references</dd>
                <dt>Venture Score</dt>
                <dd>{assessment(idea.venture_score)}</dd>
                <dt>Confidence</dt>
                <dd>{assessment(idea.confidence_score)}</dd>
              </dl>
              {idea.duplicate_of && (
                <p className="notice">
                  Archived as a duplicate of {idea.duplicate_of}:{" "}
                  {idea.merge_reason}
                </p>
              )}
              <footer>
                <span>{label(idea.access_basis)}</span>
                <span>Version {idea.version}</span>
                {owner && <span>{idea.active_share_count} active shares</span>}
              </footer>
              {owner && (
                <IdeaOwnerControls
                  idea={idea}
                  possibleDuplicates={duplicates}
                  partners={
                    idea.project_id
                      ? partnersByProject[idea.project_id] || []
                      : []
                  }
                />
              )}
            </article>
          );
        })}
        {!result.rows.length && (
          <p className="empty">No ideas match this scope.</p>
        )}
      </div>
      <nav className="pagination" aria-label="Idea Inbox pages">
        {result.page > 1 && (
          <Link
            href={pageHref("/os/ideas", { ...filters, page: result.page - 1 })}
          >
            ← Previous
          </Link>
        )}
        {result.page < pageCount && (
          <Link
            href={pageHref("/os/ideas", { ...filters, page: result.page + 1 })}
          >
            Next →
          </Link>
        )}
      </nav>
    </>
  );
}

export function WorkLogView({
  result,
  filters,
  projects,
}: {
  result: {
    rows: WorkLogRow[];
    page: number;
    page_size: number;
    total_count: number;
  };
  filters: Record<string, string | undefined>;
  projects: Project[];
}) {
  const pageCount = Math.max(
    1,
    Math.ceil(result.total_count / result.page_size),
  );
  return (
    <>
      <form className="panel filter-bar wide" method="get">
        <label>
          Project
          <select name="project" defaultValue={filters.project || ""}>
            <option value="">All projects</option>
            {projects.map((project) => (
              <option value={project.id} key={project.id}>
                {project.code}
              </option>
            ))}
          </select>
        </label>
        <label>
          Person or agent
          <input name="actor" defaultValue={filters.actor || ""} />
        </label>
        <label>
          Department
          <input name="department" defaultValue={filters.department || ""} />
        </label>
        <label>
          Type
          <select name="type" defaultValue={filters.type || ""}>
            <option value="">All types</option>
            {[
              "WORK_ITEM",
              "ROUTINE_RUN",
              "AI_RUN",
              "HANDOFF",
              "SYSTEM_EVENT",
              "AUDIT_EVENT",
            ].map((type) => (
              <option key={type}>{type}</option>
            ))}
          </select>
        </label>
        <label>
          Status
          <input name="status" defaultValue={filters.status || ""} />
        </label>
        <label>
          From
          <input
            name="from"
            type="datetime-local"
            defaultValue={filters.from || ""}
          />
        </label>
        <label>
          To
          <input
            name="to"
            type="datetime-local"
            defaultValue={filters.to || ""}
          />
        </label>
        <button>Apply</button>
      </form>
      <div className="panel">
        <div className="table-meta">
          <strong>{result.total_count} persisted events</strong>
          <span>
            Page {result.page} of {pageCount}
          </span>
        </div>
        {result.rows.map((row) => (
          <Link
            className="work-log-row"
            href={row.href}
            key={row.id}
            id={`work-${row.id}`}
          >
            <span className="badge">{label(row.entry_type)}</span>
            <div>
              <strong>{row.title}</strong>
              <p>
                {row.project_code || "KXRA Group"} · {row.department} ·{" "}
                {row.actor_name || row.actor_label || label(row.actor_kind)}
              </p>
            </div>
            <div>
              <strong>{row.status}</strong>
              <small>{date(row.occurred_at)}</small>
            </div>
          </Link>
        ))}
        {!result.rows.length && (
          <p className="empty">No persisted events match these filters.</p>
        )}
        <nav className="pagination" aria-label="Work Log pages">
          {result.page > 1 && (
            <Link
              href={pageHref("/os/work-log", {
                ...filters,
                page: result.page - 1,
              })}
            >
              ← Previous
            </Link>
          )}
          {result.page < pageCount && (
            <Link
              href={pageHref("/os/work-log", {
                ...filters,
                page: result.page + 1,
              })}
            >
              Next →
            </Link>
          )}
        </nav>
      </div>
    </>
  );
}

function CountPanel({
  title,
  values,
}: {
  title: string;
  values: Record<string, number>;
}) {
  return (
    <section className="panel admin-counts">
      <h2>{title}</h2>
      {Object.entries(values).length ? (
        <dl>
          {Object.entries(values).map(([key, value]) => (
            <div key={key}>
              <dt>{label(key)}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p>None recorded.</p>
      )}
    </section>
  );
}

export function AdminView({ snapshot }: { snapshot: any }) {
  return (
    <>
      <div className="admin-grid">
        <CountPanel title="Accounts" values={snapshot.accounts} />
        <CountPanel title="Invitations" values={snapshot.invitations} />
        <CountPanel title="Memberships" values={snapshot.memberships} />
        <CountPanel title="Approvals" values={snapshot.approvals} />
        <CountPanel title="Email outbox" values={snapshot.email_outbox} />
        <CountPanel title="Portfolio" values={snapshot.portfolio} />
      </div>
      <section className="panel">
        <h2>Security and database health</h2>
        <dl className="definition">
          <dt>Environment</dt>
          <dd>{snapshot.environment}</dd>
          <dt>RLS tables</dt>
          <dd>
            {snapshot.database.protected_tables} /{" "}
            {snapshot.database.rls_tables}
          </dd>
          <dt>Exposed RPCs</dt>
          <dd>{snapshot.database.exposed_functions}</dd>
          <dt>Audit events</dt>
          <dd>{snapshot.database.audit_events}</dd>
          <dt>Approval assurance</dt>
          <dd>{snapshot.security_policy.owner_approval_assurance}</dd>
          <dt>Recent authentication</dt>
          <dd>
            {snapshot.security_policy.recent_authentication_minutes} minutes
          </dd>
          <dt>Partner context rule</dt>
          <dd>{label(snapshot.security_policy.partner_context_rule)}</dd>
        </dl>
      </section>
      <section className="panel">
        <h2>Connections and operating controls</h2>
        <div className="integration-grid">
          {Object.entries(snapshot.integrations as Record<string, boolean>).map(
            ([name, configured]) => (
              <div className="list-item" key={name}>
                <strong>{label(name)}</strong>
                <span className={`badge ${configured ? "" : "amber"}`}>
                  {configured ? "CONFIGURED" : "NOT CONNECTED"}
                </span>
              </div>
            ),
          )}
        </div>
        <p className="subtle">
          Only configuration presence is shown. Secret values are never
          returned.
        </p>
        <dl className="definition">
          {Object.entries(snapshot.controls as Record<string, string>).map(
            ([key, value]) => (
              <div key={key} className="definition-pair">
                <dt>{label(key)}</dt>
                <dd>{label(value)}</dd>
              </div>
            ),
          )}
        </dl>
      </section>
      <section className="panel" id="security-events">
        <h2>Recent account security events</h2>
        {snapshot.security_events.map((event: any) => (
          <div className="list-item" key={event.id} id={`security-${event.id}`}>
            <strong>{label(event.event_type)}</strong>
            <p>
              {event.user_name || "Account"} · {date(event.created_at)}
            </p>
          </div>
        ))}
        {!snapshot.security_events.length && (
          <p>No account security events recorded.</p>
        )}
      </section>
      <p className="notice">
        Admin provides bounded controls and status views. Generic secret
        editing, arbitrary role mutation, production deployment and external
        execution are unavailable.
      </p>
    </>
  );
}
