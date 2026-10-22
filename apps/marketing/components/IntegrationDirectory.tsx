"use client";
import Link from "next/link";
import { useState } from "react";
import { integrations, integrationKeys } from "../lib/integration-content";
export function IntegrationDirectory() {
  const [query, setQuery] = useState(""),
    [group, setGroup] = useState("All");
  const results = integrationKeys.filter(
    (k) =>
      (group === "All" || integrations[k].group === group) &&
      (integrations[k].name + " " + integrations[k].summary)
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <>
      <label className="ref-kicker" htmlFor="integration-search">
        SEARCH INTEGRATIONS
      </label>
      <input
        className="ref-search"
        id="integration-search"
        type="search"
        placeholder="Search accounts and capabilities…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="ref-filter-row">
        {["All", "Accounts", "Capabilities"].map((g) => (
          <button
            key={g}
            aria-pressed={group === g}
            onClick={() => setGroup(g)}
          >
            {g}
          </button>
        ))}
      </div>
      <p className="ref-caption" role="status">
        {results.length} {results.length === 1 ? "result" : "results"} · No
        accounts connected by this public site
      </p>
      {results.length ? (
        <>
          {["Accounts", "Capabilities"].map((g) => {
            const items = results.filter((k) => integrations[k].group === g);
            return items.length ? (
              <section className="directory-group" key={g}>
                <h2>
                  {g === "Accounts"
                    ? "Your connected accounts"
                    : "Built-in capability boundaries"}
                </h2>
                <div className="ref-catalog-grid">
                  {items.map((k) => (
                    <Link
                      className="ref-catalog-card"
                      href={"/integrations/" + k}
                      key={k}
                    >
                      <span>
                        {integrations[k].group === "Accounts"
                          ? "CONNECTION DESIGN · NOT CONNECTED HERE"
                          : "ACCEPTANCE REQUIRED"}
                      </span>
                      <h3>{integrations[k].name}</h3>
                      <p>{integrations[k].summary}</p>
                      <strong>Review the boundary ↗</strong>
                    </Link>
                  ))}
                </div>
              </section>
            ) : null;
          })}
        </>
      ) : (
        <div className="ref-empty">
          <h2>No matching connections.</h2>
          <p>Try a different term or browse the complete directory.</p>
          <button
            className="ref-button"
            onClick={() => {
              setQuery("");
              setGroup("All");
            }}
          >
            Reset filters
          </button>
        </div>
      )}
    </>
  );
}
