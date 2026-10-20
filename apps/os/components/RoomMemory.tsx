"use client";
import { useState } from "react";
import { ActionForm } from "./TeamActionForm";
import type { teamMemories } from "../lib/team-memory";
import type { TeamAgent } from "../lib/team-workspace";
export function RoomMemory({
  roomId,
  memory,
  agents,
  actorId,
  canWrite,
  canManage,
}: {
  roomId: string;
  memory: Awaited<ReturnType<typeof teamMemories>>;
  agents: TeamAgent[];
  actorId: string;
  canWrite: boolean;
  canManage: boolean;
}) {
  const [agent, setAgent] = useState(agents[0]?.id || "");
  return (
    <section className="panel" aria-label="Scoped room memory">
      <h2>Reviewed room memory</h2>
      <p>
        Preferences, feedback, references and context stay inside this room and
        agent. No company-wide summary or cross-room recall is available.
        Entries require human review, expire after at most a year, and are used
        only when you opt in on an agent request.
      </p>
      <p>
        Run provenance must reference a successful run for this agent in this
        room that used no memory. This prevents recursive learning chains.
        Losing source access hides the entry and its derived output.
      </p>
      {!memory.entries.length && <p>No currently accessible memory entries.</p>}
      {memory.entries.map((entry) => (
        <article key={entry.id} className="team-message">
          <h3>
            {entry.title} · v{entry.version}
          </h3>
          <p>
            {entry.kind} · {entry.state}
            {entry.state === "APPROVED" && !entry.eligible ? " · EXPIRED" : ""}
          </p>
          <p>
            Agent:{" "}
            {agents.find((a) => a.id === entry.agent_id)?.name || "Agent"} ·
            Room scope only
          </p>
          <p className="team-text">{entry.body || "Memory text removed."}</p>
          <p>
            Provenance:{" "}
            {entry.origin === "HUMAN"
              ? "Human-authored in this room"
              : `Authorised run ${entry.source_run_id}`}{" "}
            · Expires {new Date(entry.expires_at).toLocaleString("en-GB")}
          </p>
          {entry.content_sha256 && (
            <small>Review SHA-256: {entry.content_sha256}</small>
          )}
          {canManage && ["DRAFT", "APPROVED"].includes(entry.state) && (
            <ActionForm
              path={`/${roomId}/memory-review`}
              title={`Review memory ${entry.title} v${entry.version}`}
              build={(d) => ({ memory_id: entry.id, state: d.get("state") })}
            >
              <label>
                Memory decision
                <select
                  name="state"
                  aria-label={`Decision for memory ${entry.title} v${entry.version}`}
                >
                  {entry.state === "DRAFT" ? (
                    <>
                      <option value="APPROVED">Approve exact version</option>
                      <option value="REJECTED">Reject version</option>
                    </>
                  ) : (
                    <option value="REVOKED">Withdraw approved memory</option>
                  )}
                </select>
              </label>
              <p>
                Review the exact text, provenance, hash and expiry above.
                Changing text or expiry requires a new version.
              </p>
            </ActionForm>
          )}
          {entry.state !== "DELETED" &&
            (canManage || entry.created_by === actorId) && (
              <ActionForm
                path={`/${roomId}/memory-review`}
                title={`Remove memory ${entry.title} v${entry.version}`}
                build={() => ({ memory_id: entry.id, state: "DELETED" })}
              >
                <p>
                  Redacts this memory's title and body, removes it from future
                  context and hides derived runs. This does not erase backups or
                  already received content.
                </p>
              </ActionForm>
            )}
        </article>
      ))}
      {canWrite && agents.length > 0 && (
        <ActionForm
          path={`/${roomId}/memories`}
          title="Propose room memory"
          build={(d, id) => ({
            request_id: id,
            agent_id: d.get("agent_id"),
            kind: d.get("kind"),
            title: d.get("title"),
            body: d.get("body"),
            source_run_id: d.get("source_run_id") || null,
            expires_at: d.get("expires_at")
              ? new Date(String(d.get("expires_at"))).toISOString()
              : null,
          })}
        >
          <label>
            Memory agent
            <select
              name="agent_id"
              aria-label="Memory agent"
              value={agent}
              onChange={(e) => setAgent(e.target.value)}
            >
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Memory type
            <select name="kind" aria-label="Memory type">
              <option value="PREFERENCE">Preference</option>
              <option value="FEEDBACK">Feedback</option>
              <option value="REFERENCE">Reference</option>
              <option value="CONTEXT">Context</option>
            </select>
          </label>
          <label>
            Memory title
            <input name="title" maxLength={100} required />
          </label>
          <label>
            Memory text
            <textarea name="body" maxLength={2000} required />
          </label>
          <label>
            Provenance run
            <select
              name="source_run_id"
              aria-label="Provenance run"
              key={agent}
            >
              <option value="">Human-authored · no run source</option>
              {memory.origins
                .filter((run) => run.agent_id === agent)
                .map((run) => (
                  <option key={run.id} value={run.id}>
                    {run.id}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Memory expiry (local time, default 90 days)
            <input name="expires_at" type="datetime-local" />
          </label>
          <p>
            The proposed text is shared with current room members for review. Do
            not paste data from unrelated scopes. Reusing the title and type
            creates a new immutable version; withdraw the old approved version
            before approving another.
          </p>
        </ActionForm>
      )}
      {canWrite && !agents.length && (
        <p>Add a room agent before proposing memory.</p>
      )}
      <p>
        Agent retrieval is limited to five approved, unexpired entries ordered
        by type, title, version and ID. There is no automatic learning or hidden
        memory summary.
      </p>
    </section>
  );
}
