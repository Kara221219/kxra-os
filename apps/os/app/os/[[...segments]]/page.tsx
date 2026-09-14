import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import Shell from "../../../components/Shell";
import {
  RecordForm,
  ActionButton,
  UploadForm,
  AskForm,
  EditRecordForm,
  OperatingLoopForms,
  WorkflowTaskCards,
  InvitationForm,
  GateEvidenceForm,
} from "../../../components/Forms";
import { actor, HttpError, owner, type Actor } from "../../../lib/auth";
import {
  counts,
  totals,
  listProjects,
  listRecords,
  project,
  getRecord,
  operatingLoop,
  type Project,
  type RecordRow,
} from "../../../lib/data";
import { localMode, query } from "../../../../../packages/db";
export const dynamic = "force-dynamic";
const modules: Record<string, [string, string]> = {
  ideas: ["Idea Inbox", "idea"],
  assumptions: ["Assumptions", "assumption"],
  experiments: ["Experiments", "experiment"],
  decisions: ["Decisions", "decision"],
  risks: ["Risks", "risk"],
  sources: ["Research Sources", "source"],
  tasks: ["Tasks", "task"],
  finance: ["Finance", "finance"],
  knowledge: ["Knowledge", "knowledge"],
  agents: ["AI Agent Registry", "agent"],
  skills: ["Skills Library", "skill"],
  routines: ["Routine Registry", "routine"],
  runs: ["Agent Run History", "run"],
  blockers: ["Blockers", "blocker"],
};
function Heading({
  title,
  sub,
  children,
}: {
  title: string;
  sub?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <p className="eyebrow">KXRA operating system</p>
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
      {children}
    </div>
  );
}
function Projects({ projects }: { projects: Project[] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Venture</th>
            <th>Stage</th>
            <th>Confidence</th>
            <th>Next action</th>
          </tr>
        </thead>
        <tbody>
          {projects.map((p) => (
            <tr key={p.id}>
              <td className="project-name">
                <small>{p.code}</small>
                <Link href={"/os/projects/" + p.id}>
                  <strong>{p.name}</strong>
                </Link>
              </td>
              <td data-label="Stage">
                <span className="badge">{p.stage}</span>
              </td>
              <td data-label="Confidence">
                {p.confidence_score ?? "Not assessed"}
              </td>
              <td data-label="Next action">{p.next_action}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {projects.length === 0 && (
        <div className="empty">
          No projects are currently assigned to your account.
        </div>
      )}
    </div>
  );
}
function Records({
  rows,
  projects,
}: {
  rows: RecordRow[];
  projects: Project[];
}) {
  return (
    <div className="record-list">
      {rows.map((r) => (
        <article className="record" key={r.id}>
          <div className="record-top">
            <h3>
              <Link href={"/os/record/" + r.id}>{r.title}</Link>
            </h3>
            <span className="badge">{r.classification}</span>
          </div>
          <p>{r.body.slice(0, 600)}</p>
          <footer>
            <span>
              {projects.find((p) => p.id === r.project_id)?.code || "Group"}
            </span>
            <span>{r.status}</span>
            <span>
              {r.visibility === "owner_only" ? "Owner only" : "Project shared"}
            </span>
            <span>Version {r.version}</span>
          </footer>
        </article>
      ))}
      {!rows.length && (
        <div className="empty">No records yet. New work will appear here.</div>
      )}
    </div>
  );
}
export default async function Workspace({
  params,
  searchParams,
}: {
  params: Promise<{ segments?: string[] }>;
  searchParams: Promise<{ project?: string; version?: string }>;
}) {
  let a: Actor;
  try {
    a = await actor();
  } catch (e) {
    if (e instanceof HttpError && e.status === 401) redirect("/login");
    return (
      <main className="login">
        <h1>Access unavailable</h1>
        <p>Your account does not have an active membership.</p>
        <Link href="/login">Return to sign in</Link>
      </main>
    );
  }
  const { segments = [] } = await params;
  const section = segments[0] || "";
  const queryParameters = await searchParams;
  const filter = queryParameters.project;
  let content: React.ReactNode;
  const projects = await listProjects(a);
  const writable = await query<{ id: string }>(
    a,
    "select id from kxra.projects where kxra_private.can_project(id,true)",
  );
  const writableProjects = projects.filter((p) =>
    writable.some((w) => w.id === p.id),
  );
  try {
    if (
      !section ||
      section === "portfolio" ||
      (section === "projects" && !segments[1])
    ) {
      const rows = await listRecords(a);
      const summary = await counts(a);
      content = (
        <>
          <Heading
            title={
              section === "portfolio"
                ? "Portfolio"
                : section === "projects"
                  ? "Projects"
                  : a.role === "owner"
                    ? "Your operating overview"
                    : "Your project workspace"
            }
            sub={
              a.role === "owner"
                ? "Evidence, decisions and the next useful step."
                : "Updates and evidence from your assigned projects."
            }
          />
          <div className="stats">
            <div className="stat">
              <p>Projects in view</p>
              <strong>{projects.length.toString().padStart(2, "0")}</strong>
            </div>
            <div className="stat">
              <p>Evidence records</p>
              <strong>{summary.records}</strong>
            </div>
            <div className="stat">
              <p>Open risks</p>
              <strong>{summary.open_risks}</strong>
            </div>
            <div className="stat">
              <p>Investment recorded</p>
              <strong>Unknown</strong>
            </div>
          </div>
          <div className="panel">
            <h2>Venture portfolio</h2>
            <Projects projects={projects} />
          </div>
          <div className="grid">
            <section className="panel">
              <h2>Next gates</h2>
              {projects.slice(0, 3).map((p) => (
                <div className="list-item" key={p.id}>
                  <strong>{p.code}</strong>
                  <p>{p.next_action}</p>
                </div>
              ))}
            </section>
            <section className="panel">
              <h2>Operating discipline</h2>
              {a.role === "owner" && (
                <>
                  <div className="list-item">
                    <span className="badge amber">Research only</span>
                    <p>Trading execution remains disabled.</p>
                  </div>
                  <div className="list-item">
                    <span className="badge">Demand first</span>
                    <p>Digital product creation requires evidence.</p>
                  </div>
                </>
              )}
              <p>
                Every claim needs evidence. New records remain drafts until
                reviewed.
              </p>
              <Link href="/os/ask">Search your evidence ↗</Link>
            </section>
          </div>
        </>
      );
    } else if (section === "projects" && segments[1]) {
      const p = await project(a, segments[1]);
      const [rows, loop, gatePolicies, gateAuthorizations] = await Promise.all([
        listRecords(a, undefined, p.id),
        operatingLoop(a, p.id),
        query<{
          gate_code:
            "P002_LISTING" | "P003_FAITHFUL_DELIVERY" | "P005_LOCAL_PROTOTYPE";
          policy_version: number;
          requirements: string[];
          threshold_state: string;
        }>(
          a,
          "select gate_code,policy_version,requirements,threshold_state from kxra.project_gate_policies where project_id=$1",
          [p.id],
        ),
        query<{
          id: string;
          gate_code: string;
          evidence_id: string;
          evidence_version: number;
          scope: string;
        }>(
          a,
          "select id,gate_code,evidence_id,evidence_version,scope from kxra.project_gate_authorizations where project_id=$1 order by created_at desc",
          [p.id],
        ),
      ]);
      const currentById = new Map(loop.records.map((row) => [row.id, row]));
      content = (
        <>
          <Heading title={p.name} sub={`${p.code} · ${p.status}`} />
          <div className="panel">
            <h2>Next gate</h2>
            <p>{p.next_action}</p>
            <span className="badge">
              Venture score: {p.venture_score ?? "Not assessed"}
            </span>
          </div>
          {gatePolicies.map((policy) => (
            <section className="panel" key={policy.gate_code}>
              <div className="record-top">
                <div>
                  <h2>Project gate</h2>
                  <p>{policy.gate_code.replaceAll("_", " ")}</p>
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
                Policy v{policy.policy_version}. Any authorization is
                local-only; it does not enable creation, publishing, purchasing
                or live execution.
              </p>
              {gateAuthorizations
                .filter(
                  (authorization) =>
                    authorization.gate_code === policy.gate_code,
                )
                .map((authorization) => (
                  <p className="success" key={authorization.id}>
                    Local-only authorization recorded from evidence v
                    {authorization.evidence_version}. External release remains
                    disabled.
                  </p>
                ))}
              {a.role === "owner" && (
                <GateEvidenceForm
                  projectId={p.id}
                  gate={policy.gate_code}
                  evidence={loop.records.filter(
                    (record) => record.status === "accepted",
                  )}
                />
              )}
            </section>
          ))}
          <section className="panel" id="operating-loop">
            <div className="record-top">
              <div>
                <h2>Operating loop</h2>
                <p>
                  Ideas, experiments, results and decisions retain exact
                  evidence versions. Actions below are checked again by
                  PostgreSQL.
                </p>
              </div>
              <span className="badge">
                {loop.results.length} result
                {loop.results.length === 1 ? "" : "s"}
              </span>
            </div>
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
                  {
                    loop.records.filter((row) => row.kind === "experiment")
                      .length
                  }
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
            {loop.links.length > 0 && (
              <details>
                <summary>
                  Evidence and lifecycle links ({loop.links.length})
                </summary>
                {loop.links.map((link) => (
                  <p className="workflow-link" key={link.id}>
                    <Link href={`/os/record/${link.from_record_id}`}>
                      {currentById.get(link.from_record_id)?.title || "Record"}{" "}
                      v{link.from_version}
                    </Link>{" "}
                    <span>{link.relation.replaceAll("_", " ")}</span>{" "}
                    <Link href={`/os/record/${link.to_record_id}`}>
                      {currentById.get(link.to_record_id)?.title || "Evidence"}{" "}
                      v{link.to_version}
                    </Link>
                  </p>
                ))}
              </details>
            )}
            <OperatingLoopForms
              projectId={p.id}
              actorId={a.id}
              owner={a.role === "owner"}
              records={loop.records}
              results={loop.results}
              tasks={loop.tasks}
              members={loop.members}
            />
          </section>
          <div className="tabs">
            <a href="#operating-loop">operating loop</a>
            {[
              "assumptions",
              "experiments",
              "decisions",
              "risks",
              "sources",
              "tasks",
              "files",
            ].map((s) => (
              <Link key={s} href={"/os/" + s + "?project=" + p.id}>
                {s.replace("sources", "research")}
              </Link>
            ))}
          </div>
          <Records rows={rows} projects={projects} />
          {writableProjects.some((w) => w.id === p.id) && (
            <div style={{ marginTop: 24 }}>
              <RecordForm
                kind="note"
                projects={[p]}
                pid={p.id}
                partner={a.role !== "owner"}
              />
            </div>
          )}
        </>
      );
    } else if (section === "tasks") {
      const loops = await Promise.all(
        projects.map((item) => operatingLoop(a, item.id)),
      );
      const taskRows = loops.flatMap((loop) => loop.tasks);
      const taskRecords = loops.flatMap((loop) => loop.records);
      content = (
        <>
          <Heading
            title="Tasks"
            sub={
              a.role === "owner"
                ? "Assigned work tied to exact project record versions."
                : "Work assigned to you within your current project access."
            }
          />
          {taskRows.length ? (
            <WorkflowTaskCards
              tasks={taskRows}
              records={taskRecords}
              actorId={a.id}
              owner={a.role === "owner"}
            />
          ) : (
            <div className="empty">
              No workflow tasks are currently assigned.
            </div>
          )}
        </>
      );
    } else if (modules[section]) {
      const [title, kind] = modules[section];
      if (["finance", "agents", "skills", "routines", "runs"].includes(section))
        owner(a);
      const rows = await listRecords(a, kind, filter);
      const cash = section === "finance" ? await totals(a) : [];
      content = (
        <>
          <Heading
            title={title}
            sub={
              section === "routines"
                ? "Definitions are saved. Scheduled execution is disabled."
                : section === "runs"
                  ? "Only recorded runs appear here. No agents are running."
                  : undefined
            }
          />
          {section === "finance" && (
            <div className="panel">
              <h2>Recorded net cash movement</h2>
              {cash.length ? (
                cash.map(({ currency: c, total: v }) => (
                  <p key={c}>
                    {c} {v}
                  </p>
                ))
              ) : (
                <p>
                  Unknown — no actual entries recorded. Estimates and paper
                  results are excluded.
                </p>
              )}
              <p className="subtle">
                Currencies are kept separate. This is not a bank balance or
                profit forecast.
              </p>
            </div>
          )}
          <Records rows={rows} projects={projects} />
          {!["run", "experiment", "decision", "task"].includes(kind) &&
            (a.role === "owner" ||
              (["idea", "note"].includes(kind) &&
                writableProjects.length > 0)) && (
              <div style={{ marginTop: 24 }}>
                <RecordForm
                  kind={kind}
                  projects={writableProjects}
                  pid={filter}
                  partner={a.role !== "owner"}
                />
              </div>
            )}
        </>
      );
    } else if (section === "record" && segments[1]) {
      const r = await getRecord(a, segments[1]);
      const versions = await query<{
        version: number;
        title: string;
        body: string;
        data: Record<string, unknown>;
        classification: string | null;
        status: string | null;
        editor_id: string | null;
        editor_name: string | null;
        created_at: string;
      }>(
        a,
        `select v.version,v.title,v.body,v.data,v.classification::text,v.status,
                v.editor_id,m.display_name as editor_name,v.created_at
         from kxra.record_versions v left join kxra.members m on m.id=v.editor_id
         where v.record_id=$1 order by v.version desc`,
        [r.id],
      );
      const requestedVersion = queryParameters.version
        ? Number(queryParameters.version)
        : null;
      const historical = requestedVersion
        ? versions.find((version) => version.version === requestedVersion)
        : null;
      if (
        requestedVersion &&
        (!Number.isSafeInteger(requestedVersion) || !historical)
      )
        notFound();
      const displayed = historical || r;
      content = (
        <>
          <Heading
            title={displayed.title}
            sub={`${r.kind} · ${displayed.classification || "Legacy classification unavailable"}${historical ? ` · historical version ${historical.version}` : ""}`}
          />
          {historical && (
            <p className="notice">
              This is an immutable historical snapshot.{" "}
              <Link href={`/os/record/${r.id}`}>
                Return to current version.
              </Link>
            </p>
          )}
          <article className="record">
            <p>{displayed.body}</p>
            <span className="badge">
              {displayed.status || "Legacy status unavailable"} · v
              {historical?.version || r.version} · {r.visibility}
            </span>
            <details>
              <summary>Structured evidence and provenance</summary>
              <pre>{JSON.stringify(displayed.data, null, 2)}</pre>
            </details>
            {!historical &&
              a.role === "owner" &&
              ["draft", "submitted"].includes(r.status) && (
                <div className="record-actions">
                  <ActionButton
                    url="/api/approvals"
                    payload={{
                      action: "record.accept",
                      project_id: r.project_id,
                      payload: { record_id: r.id, version: r.version },
                    }}
                    label="Request acceptance approval"
                  />
                </div>
              )}
            {!historical &&
              a.role === "owner" &&
              r.status === "accepted" &&
              typeof r.data.gate === "string" &&
              [
                "P002_LISTING",
                "P003_FAITHFUL_DELIVERY",
                "P005_LOCAL_PROTOTYPE",
              ].includes(r.data.gate) && (
                <div className="record-actions">
                  <ActionButton
                    url="/api/approvals"
                    payload={{
                      action: "project.gate",
                      project_id: r.project_id,
                      payload: {
                        gate: r.data.gate,
                        evidence_id: r.id,
                        evidence_version: r.version,
                      },
                    }}
                    label="Request local gate authorization"
                  />
                </div>
              )}
          </article>
          {!historical &&
            ["draft", "submitted"].includes(r.status) &&
            (a.role === "owner" ||
              (r.created_by === a.id &&
                writableProjects.some((p) => p.id === r.project_id))) && (
              <EditRecordForm record={r} />
            )}
          <div className="panel" style={{ marginTop: 24 }}>
            <h2>Version history</h2>
            {versions.map((v) => (
              <div className="list-item" key={v.version}>
                <Link href={`/os/record/${r.id}?version=${v.version}`}>
                  Version {v.version}
                </Link>
                <p>
                  {v.classification || "Legacy classification unavailable"} ·{" "}
                  {v.status || "Legacy status unavailable"} ·{" "}
                  {v.editor_name ||
                    (v.editor_id ? "Attributed member" : "System migration")}
                  {" · "}
                  {new Date(v.created_at).toLocaleString("en-GB")}
                </p>
              </div>
            ))}
          </div>
        </>
      );
    } else if (section === "ask") {
      content = (
        <>
          <Heading
            title="Ask KXRA"
            sub="Find source-linked evidence within your current access."
          />
          <p className="notice">
            Evidence search is working. AI synthesis and paid model calls are
            disabled.
          </p>
          <AskForm projects={projects} />
        </>
      );
    } else if (section === "files") {
      if (filter) await project(a, filter);
      const files = await query<{
        id: string;
        filename: string;
        scan_status: string;
        size_bytes: number;
      }>(
        a,
        "select id,filename,scan_status,size_bytes from kxra.files where ($1::uuid is null or project_id=$1) order by created_at desc",
        [filter || null],
      );
      content = (
        <>
          <Heading
            title="Project files"
            sub="Private files follow the permissions of their project record."
          />
          <div className="panel">
            {files.length ? (
              files.map((f) => (
                <div className="list-item" key={f.id}>
                  <Link href={"/api/files/" + f.id}>{f.filename}</Link>{" "}
                  <span className="badge">{f.scan_status}</span>
                  <p>{f.size_bytes} bytes</p>
                </div>
              ))
            ) : (
              <p>No files uploaded.</p>
            )}
          </div>
          {writableProjects.length > 0 && (
            <UploadForm
              projects={writableProjects}
              pid={filter}
              owner={a.role === "owner"}
            />
          )}
        </>
      );
    } else if (section === "approvals") {
      owner(a);
      const rows = await query<{
        id: string;
        action: string;
        state: string;
        project_id: string | null;
        payload: Record<string, unknown>;
        payload_hash: string;
        expires_at: string;
        project_code: string | null;
        target_name: string | null;
      }>(
        a,
        `select a.*,p.code as project_code,
                coalesce(r.title,m.display_name) as target_name
         from kxra.approvals a
         left join kxra.projects p on p.id=a.project_id
         left join kxra.records r on r.id=nullif(a.payload->>'record_id','')::uuid
         left join kxra.members m on m.id=nullif(a.payload->>'user_id','')::uuid
         order by a.created_at desc`,
      );
      content = (
        <>
          <Heading
            title="Approvals"
            sub="Review the exact action. Consequential changes require owner MFA."
          />
          {rows.map((r) => (
            <article className="record" key={r.id}>
              <h3>
                {r.action === "record.accept"
                  ? "Accept record"
                  : r.action === "membership.change"
                    ? "Change project access"
                    : r.action === "project.gate"
                      ? "Authorize local project gate"
                      : r.action}
              </h3>
              <span className="badge">{r.state}</span>
              <dl className="definition">
                <dt>Target</dt>
                <dd>{r.target_name || "Unavailable target"}</dd>
                <dt>Project</dt>
                <dd>{r.project_code || "KXRA Group"}</dd>
                <dt>Expires</dt>
                <dd>{new Date(r.expires_at).toLocaleString("en-GB")}</dd>
                {r.action === "membership.change" && (
                  <>
                    <dt>Before</dt>
                    <dd>{JSON.stringify(r.payload.before)}</dd>
                    <dt>After</dt>
                    <dd>
                      {JSON.stringify({
                        role: r.payload.role,
                        active: r.payload.active,
                        expires_at: r.payload.expires_at,
                      })}
                    </dd>
                  </>
                )}
                {r.action === "record.accept" && (
                  <>
                    <dt>Version</dt>
                    <dd>{String(r.payload.version)}</dd>
                    <dt>Classification</dt>
                    <dd>{String(r.payload.classification)}</dd>
                  </>
                )}
                {r.action === "project.gate" && (
                  <>
                    <dt>Gate</dt>
                    <dd>{String(r.payload.gate)}</dd>
                    <dt>Evidence version</dt>
                    <dd>{String(r.payload.evidence_version)}</dd>
                    <dt>Scope</dt>
                    <dd>{String(r.payload.scope)}</dd>
                  </>
                )}
              </dl>
              <details>
                <summary>Exact signed envelope</summary>
                <pre>{JSON.stringify(r.payload, null, 2)}</pre>
                <p className="subtle">Digest: {r.payload_hash}</p>
              </details>
              {r.state === "requested" && (
                <div className="record-actions">
                  <ActionButton
                    url={"/api/approvals/" + r.id}
                    payload={{ hash: r.payload_hash, approve: true }}
                    label="Approve"
                  />
                  <ActionButton
                    url={"/api/approvals/" + r.id}
                    payload={{ hash: r.payload_hash, approve: false }}
                    label="Reject"
                  />
                </div>
              )}
              {r.state === "approved" &&
                ["record.accept", "membership.change", "project.gate"].includes(
                  r.action,
                ) && (
                  <ActionButton
                    url={"/api/approvals/" + r.id + "/execute"}
                    payload={{}}
                    label="Execute approved action"
                  />
                )}
            </article>
          ))}
          {!rows.length && (
            <div className="empty">
              No approval requests. Request acceptance from a draft record.
            </div>
          )}
        </>
      );
    } else if (section === "partners") {
      owner(a);
      const members = await query<{
        id: string;
        display_name: string;
        role: string;
        active: boolean;
      }>(
        a,
        "select id,display_name,role,active from kxra.members where role='partner'",
      );
      const memberships = await query<{
        user_id: string;
        project_id: string;
        active: boolean;
        role: string;
      }>(a, "select * from kxra.project_memberships");
      content = (
        <>
          <Heading
            title="Partners"
            sub="Local fixtures are not real partner invitations."
          />
          {members.map((m) => (
            <article className="record" key={m.id}>
              <h3>{m.display_name}</h3>
              {memberships
                .filter((x) => x.user_id === m.id)
                .map((x) => (
                  <div className="list-item" key={x.project_id}>
                    <p>
                      {projects.find((p) => p.id === x.project_id)?.code} ·{" "}
                      {x.role} · {x.active ? "Active" : "Revoked"}
                    </p>
                    <ActionButton
                      url="/api/approvals"
                      payload={{
                        action: "membership.change",
                        project_id: x.project_id,
                        payload: {
                          user_id: m.id,
                          role: x.role,
                          active: !x.active,
                        },
                      }}
                      label={
                        x.active
                          ? "Request revocation"
                          : "Request access restoration"
                      }
                    />
                  </div>
                ))}
            </article>
          ))}
          <InvitationForm projects={projects} />
          <p className="notice">
            Invitation tokens are generated locally and shown once. Email
            delivery is not connected. Existing membership changes use an exact
            approval.
          </p>
        </>
      );
    } else if (section === "work-log" || section === "activity") {
      const rows =
        section === "work-log"
          ? (owner(a),
            await query<{ id: string; action: string; created_at: string }>(
              a,
              "select id,action,created_at from kxra.audit_events order by created_at desc limit 100",
            ))
          : await query<{ id: string; action: string; created_at: string }>(
              a,
              "select id,title as action,created_at from kxra.records where visibility='project_shared' order by updated_at desc limit 100",
            );
      content = (
        <>
          <Heading
            title={section === "activity" ? "Project activity" : "Work Log"}
            sub="Durable records of actual saved work."
          />
          <div className="panel">
            {rows.map((r) => (
              <div className="list-item" key={r.id}>
                <strong>{r.action}</strong>
                <p>{new Date(r.created_at).toLocaleString("en-GB")}</p>
              </div>
            ))}
          </div>
        </>
      );
    } else if (section === "whatsapp") {
      content = (
        <>
          <Heading
            title={
              a.role === "owner" ? "WhatsApp Gateway" : "WhatsApp Connection"
            }
          />
          <div className="panel">
            <span className="badge amber">Not connected</span>
            <h2 style={{ marginTop: 20 }}>Pairing is not enabled.</h2>
            <p>
              Signature verification, challenge generation and private pairing
              tables are implemented. Provider setup, identity-pairing workflow
              and message delivery still require implementation and testing.
            </p>
            <p>Continue project conversations through Ask KXRA.</p>
            <Link href="/os/ask">Open Ask KXRA ↗</Link>
          </div>
        </>
      );
    } else if (section === "profile") {
      content = (
        <>
          <Heading title="Profile" />
          <div className="panel">
            <p>{a.display_name}</p>
            <p>Role: {a.role}</p>
            <p>Permissions are managed by the owner.</p>
          </div>
        </>
      );
    } else if (section === "admin") {
      owner(a);
      content = (
        <>
          <Heading title="Administration" />
          <div className="panel">
            <h2>Environment</h2>
            <p>
              {localMode()
                ? "Isolated local PostgreSQL with synthetic sign-in"
                : "Supabase authentication with PostgreSQL RLS"}
            </p>
            <p>
              Owner assurance: {a.aal.toUpperCase()} · authenticated{" "}
              {a.auth_time
                ? new Date(a.auth_time * 1000).toLocaleString("en-GB")
                : "time unavailable"}
            </p>
            <p>
              Approval and invitation actions require recent AAL2
              authentication.
            </p>
            <p>
              External messaging, model calls, jobs, analytics and production
              deployment are disabled.
            </p>
            <p>
              Production readiness requires hosted authentication, MFA, storage
              scanning, rate limiting and recovery verification.
            </p>
          </div>
        </>
      );
    } else notFound();
  } catch (e) {
    if (e instanceof HttpError && (e.status === 404 || e.status === 403))
      content = (
        <>
          <Heading title="Not available" />
          <p>This resource is not available to your account.</p>
        </>
      );
    else throw e;
  }
  return (
    <Shell actor={a} active={section} local={localMode()}>
      {content}
    </Shell>
  );
}
