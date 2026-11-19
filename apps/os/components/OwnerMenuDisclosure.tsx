"use client";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";

// Static groups and labels remain server-rendered children, not client code.
export default function OwnerMenuDisclosure({
  children,
}: {
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();
  useEffect(() => {
    setOpen(false);
    setReady(true);
  }, [pathname]);
  return (
    <nav
      className="owner-navigation"
      aria-label="Owner navigation"
      onClick={(event) => {
        if (event.target instanceof Element && event.target.closest("a[href]"))
          setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          setOpen(false);
          toggle.current?.focus();
        }
      }}
    >
      <button
        ref={toggle}
        className="owner-menu-toggle"
        type="button"
        disabled={!ready}
        aria-expanded={open}
        aria-controls="owner-navigation-links"
        onClick={() => setOpen((current) => !current)}
      >
        {open ? "Close navigation" : "Open navigation"}
        <span aria-hidden="true">{open ? "−" : "+"}</span>
      </button>
      <div
        id="owner-navigation-links"
        className="owner-navigation-links"
        data-open={open}
      >
        {children}
      </div>
    </nav>
  );
}
