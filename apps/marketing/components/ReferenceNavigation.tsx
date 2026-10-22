"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
export const navigation = {
  Product: [
    ["Explore", "Overview", "/product"],
    ["Explore", "Workspace", "/product/workspace"],
    ["Explore", "Agents", "/product/agents"],
    ["Explore", "Bring your own agents", "/bring-your-own-agent"],
    ["Build", "Apps", "/apps"],
    ["Build", "Workflows", "/product/workflows"],
    ["Build", "Skills", "/product/skills"],
    ["Build", "Tools", "/product/tools"],
  ],
  Solutions: [
    ["For technical teams", "Workspace architecture", "/product"],
    ["For technical teams", "Access & governance", "/product/access"],
    ["For business owners", "Business workflows", "/solutions"],
    ["For business owners", "All use cases", "/use-cases"],
  ],
  Partners: [
    ["Join", "Partner program", "/partner"],
    ["Join", "Apply", "/partner#apply"],
    ["Learn", "Our approach", "/approach"],
    ["Deliver", "Business sprints", "/business-sprints"],
    ["Deliver", "Custom implementation", "/custom-projects"],
  ],
  Integrations: [
    ["Your connected tools", "Connection boundaries", "/integrations"],
    ["Your connected tools", "Models", "/product/models"],
    ["Tools & capabilities", "Tools", "/product/tools"],
    ["Tools & capabilities", "Skills", "/product/skills"],
  ],
  Resources: [
    ["Explore", "About KXRA", "/about"],
    ["Explore", "Our approach", "/approach"],
    ["Learn & support", "Help center", "/help"],
    ["Learn & support", "FAQ", "/#faq"],
    ["Learn & support", "Customer documents", "/legal"],
  ],
} as const;
export function ReferenceNavigation() {
  const [open, setOpen] = useState<string | null>(null),
    [mobile, setMobile] = useState(false);
  const root = useRef<HTMLElement>(null),
    buttons = useRef<Record<string, HTMLButtonElement | null>>({});
  const dialog = useRef<HTMLDialogElement>(null);
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
    <>
      <header ref={root} className="ref-header" data-home={path === "/"}>
        <Link href="/" className="ref-brand">
          KXRA<span>GROUP</span>
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
          <Link href="/pricing">Pricing</Link>
          <div className="ref-mobile-actions">
            <button
              className="ref-button ref-button-outline"
              onClick={() => {
                setMobile(false);
                dialog.current?.showModal();
              }}
            >
              Book a demo
            </button>
            <Link
              className="ref-button"
              href="/#request-access"
              onClick={() => setMobile(false)}
            >
              Request access ↗
            </Link>
          </div>
        </nav>
        <div className="ref-header-actions">
          <Link href="/login">Sign in</Link>
          <button
            className="ref-button ref-button-outline"
            onClick={() => dialog.current?.showModal()}
          >
            Book a demo
          </button>
          <Link className="ref-button" href="/#request-access">
            Request access ↗
          </Link>
        </div>
      </header>
      <dialog
        ref={dialog}
        className="ref-dialog"
        onClick={(e) => {
          if (e.target === dialog.current) dialog.current.close();
        }}
      >
        <button
          className="ref-dialog-close"
          aria-label="Close demonstration request"
          onClick={() => dialog.current?.close()}
        >
          ×
        </button>
        <p className="ref-kicker">LET’S WALK THROUGH IT</p>
        <h2>See what your team could do.</h2>
        <p>
          Tell us about the workflow you want to improve. We’ll agree a
          demonstration with you. No time slot is booked automatically.
        </p>
        <Link
          className="ref-button"
          href="/contact"
          onClick={() => dialog.current?.close()}
        >
          Request a demonstration ↗
        </Link>
        <a href="mailto:info@kxra-group.com">info@kxra-group.com</a>
      </dialog>
    </>
  );
}
