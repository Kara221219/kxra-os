"use client";
import Link from "next/link";
import { useState } from "react";
import { solutions, solutionKeys } from "../lib/solution-content";
export function SolutionDirectory() {
  const [audience, setAudience] = useState("All");
  const keys = solutionKeys.filter(
    (k) =>
      audience === "All" ||
      (audience === "Technical teams"
        ? solutions[k].audience === "Technical teams"
        : solutions[k].audience !== "Technical teams"),
  );
  return (
    <div className="solution-directory">
      <div
        className="ref-filter-row"
        role="group"
        aria-label="Solution audiences"
      >
        {["All", "Business teams", "Technical teams"].map((a) => (
          <button
            key={a}
            aria-pressed={audience === a}
            onClick={() => setAudience(a)}
          >
            {a}
          </button>
        ))}
      </div>
      <p role="status" className="ref-caption">
        {keys.length} {keys.length === 1 ? "workflow" : "workflows"}
      </p>
      <div className="ref-catalog-grid">
        {keys.map((k) => (
          <Link className="ref-catalog-card" href={"/solutions/" + k} key={k}>
            <span>{solutions[k].audience}</span>
            <h2>{solutions[k].title}</h2>
            <p>{solutions[k].intro}</p>
            <strong>Explore the workflow ↗</strong>
          </Link>
        ))}
      </div>
    </div>
  );
}
