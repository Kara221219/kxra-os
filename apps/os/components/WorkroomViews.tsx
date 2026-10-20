import Link from "next/link";
import {
  boardBriefInput,
  boardLenses,
  boardReviewInput,
  rankOptions,
  ownerReferences,
} from "../../../packages/workrooms";
import type { Project, RecordRow } from "../lib/data";
import {
  BoardBriefForm,
  BoardReviewForm,
  WorkroomForm,
  RefreshWorkroom,
} from "./WorkroomForms";
export function RoomsView({ projects }: { projects: Project[] }) {
  return (
    <>
      <div className="workroom-intro panel">
        <h2>One project. One shared working context.</h2>
        <p>
          Keep discussions alongside evidence, tasks and files. Only currently
          assigned project members can read shared discussions. Refresh a
          discussion to see new replies.
        </p>
      </div>
      <div className="workroom-grid">
        {projects.map((p) => (
          <Link
            className="panel workroom-card"
            href={`/os/workrooms/${p.id}`}
            key={p.id}
          >
            <span className="eyebrow">{p.code}</span>
            <h2>{p.name}</h2>
            <p>{p.next_action || "Choose the next useful piece of work."}</p>
            <span>Enter workroom →</span>
          </Link>
        ))}
      </div>
      {!projects.length && (
        <p className="empty">
          No assigned projects. Ask your project administrator for access.
        </p>
      )}
    </>
  );
}
export function RoomView({
  project,
  threads,
  thread,
  messages,
  canWrite,
}: {
  project: Project;
  threads: RecordRow[];
  thread?: RecordRow;
  messages: RecordRow[];
  canWrite: boolean;
}) {
  return (
    <>
      <nav className="workroom-links" aria-label="Workroom tools">
        <Link href="/os/workrooms">All workrooms</Link>
        <Link href={`/os/projects/${project.id}`}>Project workspace</Link>
        <Link href={`/os/files?project=${project.id}`}>Files</Link>
        <Link href={`/os/ask?project=${project.id}`}>Ask KXRA</Link>
        <Link href={`/os/tasks?project=${project.id}`}>Tasks</Link>
      </nav>
      <div className="workroom-layout">
        <section className="panel">
          <h2>Discussions</h2>
          {threads.map((t) => (
            <Link
              className="workroom-thread"
              aria-current={thread?.id === t.id ? "page" : undefined}
              key={t.id}
              href={`/os/workrooms/${project.id}/${t.id}`}
            >
              {t.title}
            </Link>
          ))}
          {!threads.length && <p>No discussions yet.</p>}
          <Link href={`/os/workrooms/${project.id}`}>
            Start another discussion
          </Link>
        </section>
        <div>
          {thread ? (
            <>
              <section className="panel">
                <div className="record-top">
                  <h2>{thread.title}</h2>
                  <RefreshWorkroom />
                </div>
                <p className="workroom-message">{thread.body}</p>
                <p className="subtle">
                  Project-shared note · version {thread.version}
                </p>
                <a
                  href={`/api/workrooms/${project.id}/threads/${thread.id}/context`}
                >
                  Download discussion for an agent
                </a>
                <p className="subtle">
                  Downloads this shared discussion only. Review it before
                  sharing with another service. It does not connect an agent or
                  grant tools.
                </p>
              </section>
              <section aria-label="Discussion replies" className="record-list">
                {messages.map((m) => (
                  <article className="record" key={m.id}>
                    <p className="workroom-message">{m.body}</p>
                    <small>
                      Member {m.created_by.slice(0, 8)} ·{" "}
                      {new Date(m.created_at).toLocaleString("en-GB")} · v
                      {m.version}
                    </small>
                  </article>
                ))}
              </section>
              {messages.length === 200 && (
                <p>
                  Showing the first 200 replies. Start a follow-up discussion to
                  keep work bounded.
                </p>
              )}
              {canWrite && (
                <WorkroomForm projectId={project.id} threadId={thread.id} />
              )}
            </>
          ) : canWrite ? (
            <WorkroomForm projectId={project.id} />
          ) : (
            <p className="panel">You have read-only project access.</p>
          )}
        </div>
      </div>
    </>
  );
}
export function BoardView({
  sessions,
  session,
}: {
  sessions: RecordRow[];
  session?: RecordRow;
}) {
  const brief = session ? boardBriefInput.safeParse(session.data.brief) : null;
  const review = session
    ? boardReviewInput.strip().safeParse(session.data.review)
    : null;
  const ranking =
    brief?.success &&
    review?.success &&
    review.data.scores.length === brief.data.options.length
      ? rankOptions(brief.data.options, review.data.scores)
      : null;
  return (
    <>
      <p className="notice">
        Private owner workspace. Review packs and scoring work now. Automated AI
        deliberation is not connected; no agents have voted or run. Your
        assessment never grants execution approval.
      </p>
      <nav className="workroom-links">
        <Link href="/os/advisory-board">New review</Link>
        <Link href="/os/decisions">Decision register</Link>
        <Link href="/os/approvals">Execution approvals</Link>
      </nav>
      {brief?.success && session ? (
        <>
          <section className="panel">
            <h2>{session.title}</h2>
            <p>{brief.data.question}</p>
            <label>
              Prompt pack for your chosen AI tool
              <textarea
                className="workroom-prompt"
                value={session.body}
                readOnly
                rows={12}
              />
            </label>
            <a href={`/api/advisory-board/${session.id}/export`}>
              Download review pack
            </a>
            <p className="subtle">
              No content is sent to another service by this page.
            </p>
          </section>
          {ranking && (
            <section className="panel">
              <h2>Reviewed ranking</h2>
              <p className="subtle">
                {review?.success && review.data.source === "OWNER_REVIEW"
                  ? "Source: owner assessment"
                  : "Source: AI draft reviewed by owner"}
              </p>
              {ranking.ranked.map((x) => (
                <p key={x.index}>
                  <strong>{x.option}</strong> — {x.score}/100
                </p>
              ))}
              <p>
                {ranking.tied
                  ? "Tied: gather evidence before selecting an option."
                  : `Highest scored option: ${ranking.recommendation}`}
              </p>
              <p>{review?.success && review.data.rationale}</p>
              <p>{review?.success && review.data.uncertainty}</p>
            </section>
          )}
          <BoardReviewForm
            id={session.id}
            version={session.version}
            options={brief.data.options}
          />
        </>
      ) : (
        <>
          <BoardBriefForm />
          <section className="panel">
            <h2>Five perspectives, one accountable owner</h2>
            {boardLenses.map((l) => (
              <p key={l.key}>
                <strong>{l.name}</strong> · {l.question}
              </p>
            ))}
          </section>
        </>
      )}
      <section className="panel">
        <h2>Your saved reviews</h2>
        {sessions.map((s) => (
          <Link
            className="workroom-thread"
            href={`/os/advisory-board/${s.id}`}
            key={s.id}
          >
            {s.title}
          </Link>
        ))}
        {!sessions.length && <p>No saved reviews yet.</p>}
      </section>
      <section className="panel">
        <h2>Your reference library</h2>
        {ownerReferences.map((r) => (
          <article key={r.url}>
            <h3>
              <a href={r.url} target="_blank" rel="noreferrer">
                {r.title} ↗
              </a>
            </h3>
            <p>{r.use}</p>
            <p className="subtle">{r.status}</p>
          </article>
        ))}
      </section>
    </>
  );
}
export function OperatingModelView() {
  const pillars = [
    ["Context", "Keep reviewed evidence with its project.", "knowledge"],
    [
      "Connections",
      "Inspect configured services and their actual readiness.",
      "admin",
    ],
    ["Capabilities", "Choose registered roles and reusable skills.", "agents"],
    ["Cadence", "Review routines, schedules and enabled state.", "routines"],
    ["Control", "Approve consequential work explicitly.", "approvals"],
    [
      "Confidence",
      "Test assumptions and record what changes your mind.",
      "experiments",
    ],
    ["Compliance", "Track risks, rights and operating boundaries.", "risks"],
    [
      "Continuity",
      "Keep an attributable history of work and handoffs.",
      "work-log",
    ],
  ];
  return (
    <>
      <p className="notice">
        Start with one useful workflow. Define its input, responsible person,
        output, approval boundary and success measure before enabling
        automation.
      </p>
      <div className="workroom-grid">
        {pillars.map(([name, copy, path]) => (
          <Link className="panel workroom-card" href={`/os/${path}`} key={name}>
            <h2>{name}</h2>
            <p>{copy}</p>
            <span>Open →</span>
          </Link>
        ))}
      </div>
      <section className="panel">
        <h2>Observe → explain → test → adopt</h2>
        <p>
          For a useful feature in another product, record the observed
          behaviour, source, uncertainty, smallest implementation and acceptance
          test. Review repository code and licences before execution. Test in
          isolation before adoption.
        </p>
        <Link href="/os/projects">
          Open project and repository workspaces →
        </Link>
        <p>
          REA is a research reference, not an installed connector. No
          third-party code, credentials or browser sessions are imported.
        </p>
      </section>
    </>
  );
}
