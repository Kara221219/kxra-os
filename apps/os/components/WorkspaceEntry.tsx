import React from "react";
import Link from "next/link";

/** Public entry only. Registration availability is resolved on the server. */
export default function WorkspaceEntry({
  registration,
}: {
  registration: boolean;
}) {
  return (
    <main className="join-page">
      <section className="join-card">
        <Link className="wordmark" href="/">
          KXRA<span>OS</span>
        </Link>
        <p className="eyebrow">Your team. Your workspace.</p>
        <h1>Bring your work together.</h1>
        <p>
          Open your organisation’s workspace for shared conversations, project
          work and supported AI tools. Your current membership determines what
          you can access.
        </p>
        <p>
          <Link className="button" href="/login">
            Sign in →
          </Link>
        </p>
        {registration ? (
          <p>
            <Link className="button secondary" href="/signup">
              Create a customer workspace
            </Link>
          </p>
        ) : (
          <p className="subtle">
            Self-service registration is currently unavailable. If you have an
            invitation, use its secure link to join.
          </p>
        )}
        <p className="subtle">
          Already signed in? <Link href="/os">Open your workspace ↗</Link>
        </p>
      </section>
    </main>
  );
}
