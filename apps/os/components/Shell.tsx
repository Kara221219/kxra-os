import Link from "next/link";
import type { Actor } from "../lib/auth";
import OwnerNavigation from "./OwnerNavigation";
import styles from "./OwnerOperations.module.css";
import { workspacePresentation } from "../../../packages/workspace/workspace-presentation";
const memberNav = [
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
  documentNavigation = false,
}: {
  actor: Actor;
  active: string;
  children: React.ReactNode;
  local: boolean;
  documentNavigation?: boolean;
}) {
  const isOwner =
    actor.security_role === "KXRA_OWNER" && actor.organisation_kind === "KXRA";
  const NavigationLink = documentNavigation ? "a" : Link;
  const links = memberNav;
  const presentation = workspacePresentation(actor);
  return (
    <div className={`app-shell${isOwner ? ` ${styles.shell}` : ""}`}>
      <a href="#content" className="skip">
        Skip navigation
      </a>
      <aside>
        <NavigationLink className="wordmark" href="/os">
          KXRA<span>{isOwner ? "GROUP" : "OS"}</span>
        </NavigationLink>
        <p className="nav-label">{presentation.label}</p>
        {isOwner ? (
          <OwnerNavigation
            active={active}
            documentNavigation={documentNavigation}
          />
        ) : (
          <>
            <nav className="desktop-nav" aria-label="Main navigation">
              {links.map(([name, path]) => (
                <NavigationLink
                  key={name}
                  aria-current={active === path ? "page" : undefined}
                  href={"/os" + (path ? "/" + path : "")}
                >
                  {name}
                </NavigationLink>
              ))}
            </nav>
            <details className="mobile-menu">
              <summary>Menu</summary>
              <nav aria-label="Mobile navigation">
                {links.map(([name, path]) => (
                  <NavigationLink
                    key={name}
                    aria-current={active === path ? "page" : undefined}
                    href={"/os" + (path ? "/" + path : "")}
                  >
                    {name}
                  </NavigationLink>
                ))}
              </nav>
            </details>
          </>
        )}
        <div className="identity">
          <NavigationLink
            href="/select-organisation"
            title="Change organisation"
          >
            {actor.organisation_name}
          </NavigationLink>
          <NavigationLink href="/os/profile">
            {actor.display_name}
          </NavigationLink>
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
            KXRA GROUP <span className="slash">/</span> {presentation.heading}
          </span>
          <NavigationLink href="/os/ask">Ask KXRA ↗</NavigationLink>
        </header>
        {local && (
          <div className="local-banner">
            Local development · synthetic accounts · external services disabled
          </div>
        )}
        <main id="content">
          {active === "" && !isOwner && (
            <p className="notice">
              <NavigationLink href="/os/start">
                Getting started: check recorded access and open your workspace ↗
              </NavigationLink>
            </p>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}
