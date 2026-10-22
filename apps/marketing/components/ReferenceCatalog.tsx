"use client";
import Link from "next/link";
import { useState } from "react";
import { appTemplates } from "../lib/reference-content";
export function ReferenceCatalog({
  kind,
}: {
  kind: "apps" | "integrations" | "help" | "solutions" | "use-cases";
}) {
  const [query, setQuery] = useState(""),
    [category, setCategory] = useState("All");
  const items =
    kind === "apps"
      ? appTemplates
      : kind === "integrations"
        ? [
            {
              name: "Email",
              topic: "Accounts",
              summary:
                "Review mailbox permissions, recipient scope and the approval boundary before any send.",
            },
            {
              name: "Team chat",
              topic: "Accounts",
              summary:
                "Choose a specific team and channel. Recheck membership before reading or writing.",
            },
            {
              name: "Knowledge",
              topic: "Accounts",
              summary:
                "Keep source provenance, withdrawal and permission-scoped retrieval connected.",
            },
            {
              name: "Models",
              topic: "Capabilities",
              summary:
                "Choose an approved model and provider terms before execution. Provider costs remain separate.",
            },
            {
              name: "Files",
              topic: "Capabilities",
              summary:
                "Require scoped access, integrity checks and accepted scanning before operational use.",
            },
            {
              name: "Business records",
              topic: "Capabilities",
              summary:
                "Use a reviewed data contract, explicit permissions and recorded update decisions.",
            },
          ]
        : kind === "help"
          ? [
              {
                name: "Getting workspace access",
                topic: "Getting started",
                summary:
                  "Request access, verify your identity and agree the workspace you are joining.",
              },
              {
                name: "Rooms and conversations",
                topic: "Working together",
                summary:
                  "Choose a room, confirm its members and keep the context within that boundary.",
              },
              {
                name: "Agents and review",
                topic: "Working together",
                summary:
                  "Give an agent selected context and review a specific draft before acting.",
              },
              {
                name: "Account and privacy",
                topic: "Account",
                summary:
                  "Keep access current. Use the published privacy and support routes for an account question.",
              },
            ]
          : [
              {
                name: "Finance",
                topic: "Operations",
                summary:
                  "Review invoices and next actions with a responsible owner. Explore the sample tracker.",
              },
              {
                name: "Hiring",
                topic: "People",
                summary:
                  "Organise applications and human review without automated hiring decisions.",
              },
              {
                name: "Sales",
                topic: "Customer work",
                summary:
                  "Keep leads, opportunities and next actions distinct and owned.",
              },
              {
                name: "Operations",
                topic: "Operations",
                summary:
                  "Validate a record and review the result before changing an external system.",
              },
            ];
  const filtered = items.filter(
    (i) =>
      (category === "All" || i.topic === category) &&
      (i.name + " " + i.summary).toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <>
      <label className="ref-kicker" htmlFor="catalog-search">
        SEARCH {kind.toUpperCase()}
      </label>
      <div>
        <input
          id="catalog-search"
          className="ref-search"
          type="search"
          placeholder={"Search " + kind + "…"}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className="ref-filter-row">
        {["All", ...Array.from(new Set(items.map((i) => i.topic)))].map((c) => (
          <button
            key={c}
            aria-pressed={category === c}
            onClick={() => setCategory(c)}
          >
            {c}
          </button>
        ))}
      </div>
      <p className="ref-caption" role="status">
        {filtered.length} {filtered.length === 1 ? "result" : "results"}
      </p>
      {filtered.length ? (
        <div className="ref-catalog-grid">
          {filtered.map((i) => (
            <article className="ref-catalog-card" key={i.name}>
              <span>{i.topic}</span>
              <h2>{i.name}</h2>
              <p>{i.summary}</p>
              <Link href={kind === "help" ? "/contact" : "/#workspace-preview"}>
                {kind === "help"
                  ? "Ask a question ↗"
                  : "Explore the sample workflow ↗"}
              </Link>
            </article>
          ))}
        </div>
      ) : (
        <div className="ref-empty">
          <h2>No results for “{query}”.</h2>
          <p>Try another term or reset the filters.</p>
          <button
            className="ref-button"
            onClick={() => {
              setQuery("");
              setCategory("All");
            }}
          >
            Reset filters
          </button>
        </div>
      )}
    </>
  );
}
