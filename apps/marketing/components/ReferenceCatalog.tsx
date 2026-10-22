"use client";
import Link from "next/link";
import { useState } from "react";
import { appTemplates } from "../lib/reference-content";
export function ReferenceCatalog({ kind }: { kind: "apps" }) {
  const [query, setQuery] = useState(""),
    [category, setCategory] = useState("All");
  const filtered = appTemplates.filter(
    (i) =>
      (category === "All" || i.topic === category) &&
      (i.name + " " + i.summary).toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <>
      <label className="ref-kicker" htmlFor="catalog-search">
        SEARCH {kind.toUpperCase()}
      </label>
      <input
        id="catalog-search"
        className="ref-search"
        type="search"
        placeholder="Search apps…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="ref-filter-row">
        {["All", ...Array.from(new Set(appTemplates.map((i) => i.topic)))].map(
          (c) => (
            <button
              key={c}
              aria-pressed={category === c}
              onClick={() => setCategory(c)}
            >
              {c}
            </button>
          ),
        )}
      </div>
      <p className="ref-caption" role="status">
        {filtered.length} {filtered.length === 1 ? "result" : "results"}
      </p>
      {filtered.length ? (
        <div className="ref-catalog-grid">
          {filtered.map((i) => (
            <Link
              className="ref-catalog-card"
              key={i.name}
              href={"/apps/" + i.name.toLowerCase().replaceAll(" ", "-")}
            >
              <span>{i.topic}</span>
              <h2>{i.name}</h2>
              <p>{i.summary}</p>
              <strong>Open app preview ↗</strong>
            </Link>
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
