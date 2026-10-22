"use client";
import Link from "next/link";
import { useState } from "react";
import {
  articles,
  articleKeys,
  readingMinutes,
} from "../lib/editorial-content";
export function ArticleDirectory() {
  const [category, setCategory] = useState("All"),
    [query, setQuery] = useState("");
  const keys = articleKeys.filter(
    (k) =>
      (category === "All" || articles[k].category === category) &&
      (articles[k].title + " " + articles[k].summary)
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <>
      <label className="ref-kicker" htmlFor="article-search">
        SEARCH ARTICLES
      </label>
      <input
        id="article-search"
        className="ref-search"
        type="search"
        placeholder="Find a guide or product explanation…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="ref-filter-row">
        {["All", "Guide", "Product", "Governance"].map((c) => (
          <button
            key={c}
            aria-pressed={category === c}
            onClick={() => setCategory(c)}
          >
            {c}
          </button>
        ))}
      </div>
      <p role="status" className="ref-caption">
        {keys.length} {keys.length === 1 ? "article" : "articles"}
      </p>
      {keys.length ? (
        <div className="ref-catalog-grid editorial-grid">
          {keys.map((k) => (
            <Link className="ref-catalog-card" href={"/blog/" + k} key={k}>
              <span>
                {articles[k].category} · {readingMinutes(k)} min read
              </span>
              <h2>{articles[k].title}</h2>
              <p>{articles[k].summary}</p>
              <strong>Read the article ↗</strong>
            </Link>
          ))}
        </div>
      ) : (
        <div className="ref-empty">
          <h2>No articles match.</h2>
          <button
            className="ref-button"
            onClick={() => {
              setCategory("All");
              setQuery("");
            }}
          >
            Reset articles
          </button>
        </div>
      )}
    </>
  );
}
