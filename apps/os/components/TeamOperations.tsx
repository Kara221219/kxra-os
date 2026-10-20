import Link from "next/link";
import { ActionButton } from "./Forms";
import type { TeamTaskOverview, TeamRunOverview } from "../lib/team-workspace";

export function TeamTasks({
  rows,
  approvals = false,
}: {
  rows: TeamTaskOverview[];
  approvals?: boolean;
}) {
  const visible = approvals
    ? rows.filter((row) => row.state === "PROPOSED" && row.can_review)
    : rows;
  return (
    <section aria-label={approvals ? "Room task approvals" : "Room tasks"}>
      <h2>{approvals ? "Room task approvals" : "Room tasks"}</h2>
      <p className="subtle">
        {approvals
          ? "Proposals awaiting you as room creator. Approval records agreed work; it does not execute an external action."
          : "Recent work from rooms you can access. Room tasks are shared work, not personal assignments."}
      </p>
      {visible.length === 0 && <p>No accessible room tasks to show.</p>}
      {visible.map((row) => (
        <article className="record" key={row.id}>
          <div className="record-top">
            <h3>{row.title}</h3>
            <span className="badge">{row.state}</span>
          </div>
          <p>
            {row.project_code} · {row.room_name} · Version {row.version}
          </p>
          <div className="record-actions">
            <Link href={`/os/workspace/${row.room_id}`}>Open room</Link>
            {row.can_review &&
              (row.state === "PROPOSED"
                ? ["APPROVED", "REJECTED"]
                : row.state === "APPROVED"
                  ? ["DONE"]
                  : []
              ).map((state) => (
                <ActionButton
                  key={state}
                  url={`/api/team-space/${row.room_id}/decide`}
                  payload={{ item_id: row.id, version: row.version, state }}
                  label={
                    state === "APPROVED"
                      ? "Approve task"
                      : state === "REJECTED"
                        ? "Reject task"
                        : "Mark task complete"
                  }
                />
              ))}
          </div>
        </article>
      ))}
    </section>
  );
}

export function TeamRuns({ rows }: { rows: TeamRunOverview[] }) {
  return (
    <section aria-label="Room agent runs">
      <h2>Room agent runs</h2>
      <p className="subtle">
        Latest 100 accessible room runs. Open the room to inspect the
        conversation and draft. Token counts come from the provider; no monetary
        estimate is inferred.
      </p>
      {!rows.length && <p>No accessible room runs to show.</p>}
      {rows.map((row) => (
        <article className="record" key={row.id}>
          <div className="record-top">
            <h3>{row.agent_name}</h3>
            <span className="badge">{row.status}</span>
          </div>
          <p>
            {row.project_code} · {row.room_name}
          </p>
          <p>
            {row.context_count} context message(s) · {row.input_tokens} input
            tokens · {row.output_tokens} output tokens
          </p>
          {row.error_code && <p>Outcome: {row.error_code}</p>}
          <p className="subtle">
            Run {row.id} · {new Date(row.created_at).toLocaleString("en-GB")}
          </p>
          <Link href={`/os/workspace/${row.room_id}`}>Open room</Link>
        </article>
      ))}
    </section>
  );
}
