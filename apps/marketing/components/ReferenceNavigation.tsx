"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export const navigation = {
  Solutions: [
    ["Start here", "All solutions", "/solutions"],
    ["Start here", "Use cases", "/use-cases"],
    ["A specific workflow", "Team context", "/solutions/team-context"],
    ["A specific workflow", "Internal tools", "/solutions/internal-apps"],
    ["A specific workflow", "Email operations", "/solutions/email-operations"],
  ],
  "How we work": [
    ["The practice", "How we work", "/how-we-work"],
    ["The practice", "Workspace", "/product/workspace"],
    ["Commercial", "Pricing", "/pricing"],
    ["Commercial", "Decision Review", "/business-sprints#decision-review"],
  ],
} as const;

const directLinks = [
  ["Insights", "/insights"],
  ["About us", "/about-us"],
  ["Careers", "/careers"],
] as const;

function Mark() {
  return (
    <svg className="ref-mark" viewBox="0 0 32 32" aria-hidden="true">
      <path
        fill="#c4a265"
        d="M5 3h7.2v9.2L22.4 3H30L18.2 16 30 29h-7.8l-9.8-10.2V29H5V3z"
      />
    </svg>
  );
}

export function ReferenceNavigation() {
  const [open, setOpen] = useState<string | null>(null),
    [mobile, setMobile] = useState(false);
  const root = useRef<HTMLElement>(null),
    buttons = useRef<Record<string, HTMLButtonElement | null>>({});
  const path = usePathname();
  useEffect(() => {
    setOpen(null);
    setMobile(false);
  }, [path]);
  useEffect(() => {
    function close(e: PointerEvent) {
      if (!root.current?.contains(e.target as Node)) setOpen(null);
    }
    function escape(e: KeyboardEvent) {
      if (e.key === "Escape" && open) {
        setOpen(null);
        buttons.current[open]?.focus();
      }
    }
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  return (
    <header ref={root} className="ref-header" data-home={path === "/"}>
      <Link href="/" className="ref-brand" aria-label="KXRA Group">
        <Mark />
        <span className="ref-brand-lockup">
          KXRA
          <small>GROUP</small>
        </span>
      </Link>
      <button
        className="ref-mobile-toggle"
        aria-expanded={mobile}
        aria-controls="reference-menu"
        onClick={() => setMobile(!mobile)}
      >
        {mobile ? "Close" : "Menu"}
      </button>
      <nav
        id="reference-menu"
        className={mobile ? "ref-nav ref-nav-open" : "ref-nav"}
        aria-label="Primary navigation"
      >
        {Object.entries(navigation).map(([name, links]) => (
          <div className="ref-menu" key={name}>
            <button
              ref={(el) => {
                buttons.current[name] = el;
              }}
              aria-expanded={open === name}
              aria-controls={"menu-" + name}
              onClick={() => setOpen(open === name ? null : name)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setOpen(name);
                  requestAnimationFrame(() =>
                    root.current
                      ?.querySelector<HTMLElement>("#menu-" + name + " a")
                      ?.focus(),
                  );
                }
              }}
            >
              {name}
              <span aria-hidden="true">⌄</span>
            </button>
            {open === name && (
              <div id={"menu-" + name} className="ref-mega">
                {Array.from(new Set(links.map((l) => l[0]))).map((group) => (
                  <section key={group}>
                    <h2>{group}</h2>
                    {links
                      .filter((l) => l[0] === group)
                      .map((l) => (
                        <Link
                          key={l[2]}
                          href={l[2]}
                          onClick={() => {
                            setOpen(null);
                            setMobile(false);
                          }}
                        >
                          {l[1]}
                          <span aria-hidden="true">↗</span>
                        </Link>
                      ))}
                  </section>
                ))}
              </div>
            )}
          </div>
        ))}
        {directLinks.map(([label, href]) => (
          <Link key={href} href={href} onClick={() => setMobile(false)}>
            {label}
          </Link>
        ))}
        <div className="ref-mobile-actions">
          <Link
            className="ref-button ref-button-gold"
            href="/lets-connect"
            onClick={() => setMobile(false)}
          >
            Let’s connect →
          </Link>
        </div>
      </nav>
      <div className="ref-header-actions">
        <Link href="/signup">Create account</Link>
        <Link href="/login">Sign in</Link>
        <Link className="ref-button ref-button-gold" href="/lets-connect">
          Let’s connect →
        </Link>
      </div>
    </header>
  );
}
