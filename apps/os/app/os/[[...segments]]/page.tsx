import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import Shell from "../../../components/Shell";
import {
  RecordForm,
  ActionButton,
  UploadForm,
  AskForm,
  EditRecordForm,
} from "../../../components/Forms";
import { actor, HttpError, owner, type Actor } from "../../../lib/auth";
import {
  listProjects,
  listRecords,
  project,
  getRecord,
  type Project,
  type RecordRow,
} from "../../../lib/data";
import { localMode, query } from "../../../../../packages/db";
import { sumFinance } from "../../../../../packages/domain";
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
  searchParams: Promise<{ project?: string }>;
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
  const filter = (await searchParams).project;
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
      const risks = rows.filter((r) => r.kind === "risk");
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
              <strong>{rows.length}</strong>
            </div>
            <div className="stat">
              <p>Open risks</p>
              <strong>{risks.length}</strong>
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
      const rows = await listRecords(a, undefined, p.id);
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
          <div className="tabs">
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
    } else if (modules[section]) {
      const [title, kind] = modules[section];
      if (["finance", "agents", "skills", "routines", "runs"].includes(section))
        owner(a);
      const rows = await listRecords(a, kind, filter);
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
              {Object.entries(sumFinance(rows)).length ? (
                Object.entries(sumFinance(rows)).map(([c, v]) => (
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
          {kind !== "run" &&
            (a.role === "owner" ||
              (["idea", "note", "task", "experiment"].includes(kind) &&
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
      const versions = await query<{ version: number; created_at: string }>(
        a,
        "select version,created_at from kxra.record_versions where record_id=$1 order by version desc",
        [r.id],
      );
      content = (
        <>
          <Heading title={r.title} sub={`${r.kind} · ${r.classification}`} />
          <article className="record">
            <p>{r.body}</p>
            <span className="badge">
              {r.status} · v{r.version} · {r.visibility}
            </span>
            <details>
              <summary>Structured evidence and provenance</summary>
              <pre>{JSON.stringify(r.data, null, 2)}</pre>
            </details>
            {a.role === "owner" &&
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
          </article>
          {["draft", "submitted"].includes(r.status) &&
            (a.role === "owner" ||
              (r.created_by === a.id &&
                writableProjects.some((p) => p.id === r.project_id))) && (
              <EditRecordForm record={r} />
            )}
          <div className="panel" style={{ marginTop: 24 }}>
            <h2>Version history</h2>
            {versions.map((v) => (
              <p key={v.version}>Version {v.version}</p>
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
            <UploadForm projects={writableProjects} />
          )}
        </>
      );
    } else if (section === "approvals") {
      owner(a);
      const rows = await query<{
        id: string;
        action: string;
        state: string;
        payload: Record<string, unknown>;
        payload_hash: string;
        expires_at: string;
      }>(a, "select * from kxra.approvals order by created_at desc");
      content = (
        <>
          <Heading
            title="Approvals"
            sub="Review the exact action. Consequential changes require owner MFA."
          />
          {rows.map((r) => (
            <article className="record" key={r.id}>
              <h3>{r.action}</h3>
              <span className="badge">{r.state}</span>
              <pre>{JSON.stringify(r.payload, null, 2)}</pre>
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
                ["record.accept", "membership.change"].includes(r.action) && (
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
          <p className="notice">
            New partner invitations and email delivery are not enabled. Existing
            membership changes use an exact approval.
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
