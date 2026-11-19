"use client";

export default function WorkspaceError({ reset }: { reset: () => void }) {
  return (
    <main className="workspace-failure" role="alert">
      <p className="eyebrow">Project workspace</p>
      <h1>Workspace temporarily unavailable</h1>
      <p>
        KXRA could not load this module from the authoritative database. No
        state was changed.
      </p>
      <button onClick={reset}>Retry module</button>
    </main>
  );
}
