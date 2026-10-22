"use client";
import Link from "next/link";
import { useState } from "react";
const approaches = {
  chats: {
    name: "Separate conversations",
    context:
      "A person carries useful context between their own chats and notes.",
    review: "Review is handled by the person using each tool.",
    work: "Small, individual questions with a clear owner.",
    boundary:
      "A shared source of truth and team handoff must be arranged separately.",
    next: "/resources/what-is-kxra",
  },
  workspace: {
    name: "A shared workspace",
    context:
      "Rooms, selected sources, records and decisions stay together for the permitted team.",
    review:
      "A responsible person reviews specific work inside the shared context.",
    work: "Recurring team workflows that need ownership and traceable handoffs.",
    boundary:
      "Membership, persistence, provider paths and recovery must be accepted in the real environment.",
    next: "/product/workspace",
  },
  implementation: {
    name: "Scoped implementation",
    context:
      "A particular process and its data model are designed for an agreed business need.",
    review:
      "Acceptance criteria, dependencies and release authority are agreed before delivery.",
    work: "A workflow that needs custom records, connections or integration behavior.",
    boundary:
      "Discovery, third-party costs, support and exclusions require an exact proposal.",
    next: "/custom-projects",
  },
} as const;
export function ApproachComparison() {
  const [key, setKey] = useState<keyof typeof approaches>("workspace");
  const a = approaches[key];
  return (
    <>
      <div
        className="ref-filter-row"
        role="group"
        aria-label="Approaches to compare"
      >
        {Object.entries(approaches).map(([k, v]) => (
          <button
            key={k}
            aria-pressed={key === k}
            onClick={() => setKey(k as keyof typeof approaches)}
          >
            {v.name}
          </button>
        ))}
      </div>
      <section className="comparison-review" aria-live="polite">
        <h2>{a.name}</h2>
        <dl>
          {[
            ["Context handoff", a.context],
            ["Review boundary", a.review],
            ["Kind of work to discuss", a.work],
            ["Question to resolve", a.boundary],
          ].map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        <Link className="ref-button" href={a.next}>
          Explore this approach ↗
        </Link>
      </section>
      <p className="ref-caption">
        An editorial decision framework, reviewed22October2026. This is not a
        claim about a competitor’s current prices, capabilities or compliance.
      </p>
    </>
  );
}
