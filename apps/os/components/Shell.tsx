import Link from "next/link";
import type { Actor } from "../lib/auth";
import OwnerNavigation from "./OwnerNavigation";
import styles from "./OwnerOperations.module.css";
const partnerNav = [
  ["Home", ""],
  ["Getting started", "start"],
  ["Workspace", "workspace"],
  ["My Projects", "projects"],
  ["Business Tools", "tools"],
  ["Ask KXRA", "ask"],
  ["Ideas", "ideas"],
  ["Custom Projects", "custom-projects"],
  ["Support & Privacy", "support"],
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
  const isOwner =
    actor.security_role === "KXRA_OWNER" && actor.organisation_kind === "KXRA";
  const links = partnerNav;
  return (
    <div className={`app-shell${isOwner ? ` ${styles.shell}` : ""}`}>
      <a href="#content" className="skip">
        Skip navigation
      </a>
      <aside>
        <Link className="wordmark" href="/os">
          KXRA<span>{isOwner ? "GROUP" : "OS"}</span>
        </Link>
        <p className="nav-label">
          {isOwner ? "Owner operations" : "Partner workspace"}
        </p>
        {isOwner ? (
          <OwnerNavigation active={active} />
        ) : (
          <>
            <nav className="desktop-nav" aria-label="Main navigation">
              {links.map(([name, path]) => (
                <Link
                  key={name}
                  aria-current={active === path ? "page" : undefined}
                  href={"/os" + (path ? "/" + path : "")}
                >
                  {name}
                </Link>
              ))}
            </nav>
            <details className="mobile-menu">
              <summary>Menu</summary>
              <nav aria-label="Mobile navigation">
                {links.map(([name, path]) => (
                  <Link
                    key={name}
                    aria-current={active === path ? "page" : undefined}
                    href={"/os" + (path ? "/" + path : "")}
                  >
                    {name}
                  </Link>
                ))}
              </nav>
            </details>
          </>
        )}
        <div className="identity">
          <Link href="/select-organisation" title="Change organisation">
            {actor.organisation_name}
          </Link>
          <Link href="/os/profile">{actor.display_name}</Link>
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
        <main id="content">
          {active === "" && !isOwner && (
            <p className="notice">
              <Link href="/os/start">
                Getting started: check recorded access and open your workspace ↗
              </Link>
            </p>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}
