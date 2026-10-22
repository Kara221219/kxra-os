"use client";
import Link from "next/link";
import { useState } from "react";
import { helpArticles, helpCategories } from "../lib/help-content";
export function HelpCenter() {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const results = helpArticles.filter((a) =>
    (
      a.title +
      " " +
      a.summary +
      " " +
      a.sections.map((s) => s.join(" ")).join(" ")
    )
      .toLowerCase()
      .includes(q),
  );
  return (
    <>
      <label htmlFor="help-search" className="ref-kicker">
        SEARCH THE HELP CENTER
      </label>
      <input
        id="help-search"
        className="ref-search"
        type="search"
        placeholder="Try rooms, access, agents or privacy…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="ref-filter-row" aria-label="Suggested questions">
        {["workspace", "room", "agent", "privacy"].map((s) => (
          <button key={s} onClick={() => setQuery(s)}>
            {s}
          </button>
        ))}
      </div>
      <p role="status" className="ref-caption">
        {results.length} {results.length === 1 ? "article" : "articles"}
        {q ? " matching “" + query + "”" : ""}
      </p>
      {q ? (
        <div className="help-result-list">
          {results.map((a) => (
            <Link key={a.slug} href={"/help/" + a.slug}>
              <span>{a.category}</span>
              <h2>{a.title}</h2>
              <p>{a.summary}</p>
              <strong>Read article ↗</strong>
            </Link>
          ))}
          {!results.length && (
            <div className="ref-empty">
              <h2>No matching articles.</h2>
              <p>
                Try a different question, browse the categories or contact KXRA.
              </p>
              <button className="ref-button" onClick={() => setQuery("")}>
                Clear search
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="help-categories">
          {helpCategories.map((c, i) => (
            <details key={c} open={i === 0}>
              <summary>
                <span>
                  <strong>{c}</strong>
                  <small>
                    {helpArticles.filter((a) => a.category === c).length}{" "}
                    articles
                  </small>
                </span>
                <span aria-hidden="true">+</span>
              </summary>
              <div>
                {helpArticles
                  .filter((a) => a.category === c)
                  .map((a) => (
                    <Link key={a.slug} href={"/help/" + a.slug}>
                      {a.title}
                      <span aria-hidden="true">↗</span>
                    </Link>
                  ))}
              </div>
            </details>
          ))}
        </div>
      )}
      <aside className="help-contact">
        <div>
          <h2>Still have a question?</h2>
          <p>
            Describe the issue without passwords, authentication codes or
            private customer files.
          </p>
        </div>
        <Link className="ref-button" href="/contact">
          Contact KXRA ↗
        </Link>
      </aside>
    </>
  );
}
