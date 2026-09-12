import Link from "next/link";
import type { Actor } from "../lib/auth";
const ownerNav = [
  ["Dashboard", ""],
  ["Portfolio", "portfolio"],
  ["Idea Inbox", "ideas"],
  ["Projects", "projects"],
  ["Research", "sources"],
  ["Experiments", "experiments"],
  ["Decisions", "decisions"],
  ["Risks", "risks"],
  ["Finance", "finance"],
  ["Partners", "partners"],
  ["WhatsApp", "whatsapp"],
  ["AI Team", "agents"],
  ["Skills", "skills"],
  ["Routines", "routines"],
  ["Run History", "runs"],
  ["Work Log", "work-log"],
  ["Approvals", "approvals"],
  ["Knowledge", "knowledge"],
  ["Assets", "files"],
  ["Admin", "admin"],
];
const partnerNav = [
  ["Home", ""],
  ["My Projects", "projects"],
  ["Ask KXRA", "ask"],
  ["Ideas", "ideas"],
  ["Tasks", "tasks"],
  ["Files", "files"],
  ["Activity", "activity"],
  ["WhatsApp Connection", "whatsapp"],
  ["Profile", "profile"],
];
export default function Shell({
  actor,
  active,
  children,
  local,
}: {
  actor: Actor;
  active: string;
  children: React.ReactNode;
  local: boolean;
}) {
  return (
    <div className="app-shell">
      <a href="#content" className="skip">
        Skip navigation
      </a>
      <aside>
        <Link className="wordmark" href="/os">
          KXRA<span>OS</span>
        </Link>
        <p className="nav-label">
          {actor.role === "owner" ? "Group workspace" : "Partner workspace"}
        </p>
        <nav aria-label="Main navigation">
          {(actor.role === "owner" ? ownerNav : partnerNav).map(
            ([name, path]) => (
              <Link
                key={name}
                aria-current={active === path ? "page" : undefined}
                href={"/os" + (path ? "/" + path : "")}
              >
                {name}
              </Link>
            ),
          )}
        </nav>
        <div className="identity">
          <span>{actor.display_name}</span>
          <form action="/api/auth" method="post">
            <button className="text-button" name="logout" value="1">
              Sign out
            </button>
          </form>
        </div>
      </aside>
      <div className="main-area">
        <header className="topbar">
          <span>
            KXRA GROUP <span className="slash">/</span>{" "}
            {actor.role === "owner"
              ? "Operating overview"
              : "Assigned projects"}
          </span>
          <Link href="/os/ask">Ask KXRA ↗</Link>
        </header>
        {local && (
          <div className="local-banner">
            Local development · synthetic accounts · external services disabled
          </div>
        )}
        <main id="content">{children}</main>
      </div>
    </div>
  );
}
