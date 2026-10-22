"use client";
import Link from "next/link";
import { useState } from "react";
import { useCases } from "../lib/use-case-content";
export function UseCaseExplorer() {
  const [view, setView] = useState("Scenarios");
  const cards =
    view === "Scenarios"
      ? Object.entries(useCases).map(([key, c]) => ({
          name: c.name,
          title: c.title,
          copy: c.intro,
          href: "/use-cases/" + key,
        }))
      : view === "Industries"
        ? [
            {
              name: "Property & hospitality",
              title: "Keep the brief and the review together.",
              copy: "Explore a property-specific scope and versioned estimate sample. This is an illustrative workflow, not a client case study.",
              href: "/apps/remodeling-crm",
            },
            {
              name: "Professional services",
              title: "Make the handoff reviewable.",
              copy: "Keep a team’s selected evidence, decisions and next actions connected.",
              href: "/solutions/team-context",
            },
            {
              name: "Retail & operations",
              title: "Validate before an external update.",
              copy: "Try a fictional count and inspect the review boundary before a real stock-system change.",
              href: "/use-cases/operations",
            },
          ]
        : [
            {
              name: "Gmail",
              title: "From a message to a deliberate response.",
              copy: "Review the account, reading scope and separate send boundary.",
              href: "/integrations/gmail",
            },
            {
              name: "Notion",
              title: "Keep the document’s source boundary.",
              copy: "Review provenance, selected pages and withdrawal before retrieval.",
              href: "/integrations/notion",
            },
            {
              name: "Slack",
              title: "Context follows channel membership.",
              copy: "Choose a task and confirm who may read or act on its conversation.",
              href: "/integrations/slack",
            },
          ];
  return (
    <>
      <div className="ref-filter-row" role="group" aria-label="Use case views">
        {["Scenarios", "Industries", "Connections"].map((v) => (
          <button key={v} aria-pressed={view === v} onClick={() => setView(v)}>
            {v}
          </button>
        ))}
      </div>
      <div className="ref-catalog-grid" aria-live="polite">
        {cards.map((c) => (
          <Link className="ref-catalog-card" href={c.href} key={c.href}>
            <span>{c.name}</span>
            <h2>{c.title}</h2>
            <p>{c.copy}</p>
            <strong>Explore the workflow ↗</strong>
          </Link>
        ))}
      </div>
    </>
  );
}
