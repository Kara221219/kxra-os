"use client";
import { useState } from "react";
import type { TeamItem } from "../lib/team-workspace";
import { ActionForm } from "./TeamActionForm";
import styles from "./RoomTaskBoard.module.css";
const stages = [
  ["PROPOSED", "Proposed"],
  ["APPROVED", "Approved"],
  ["DONE", "Completed"],
  ["REJECTED", "Declined"],
] as const;
export function RoomTaskBoard({
  roomId,
  items,
  canWrite,
  canManage,
}: {
  roomId: string;
  items: TeamItem[];
  canWrite: boolean;
  canManage: boolean;
}) {
  const [query, setQuery] = useState("");
  const matching = items.filter((item) =>
    item.title.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <div className={styles.root}>
      <section className="panel" aria-label="Room operations board">
        <p className="eyebrow">ROOM APP · OPERATIONS</p>
        <h2>Decide, then do</h2>
        <p>
          Keep the proposed outcome, responsible person and recorded review
          together. Only the room creator approves or declines work and records
          completion. A proposal never executes an external action.
        </p>
        <label htmlFor="room-task-search">Find a task</label>
        <input
          id="room-task-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search the loaded work"
        />
        <p className={styles.caption} role="status">
          {matching.length} of {items.length} loaded tasks match.
          {query && (
            <button type="button" onClick={() => setQuery("")}>
              Clear task search
            </button>
          )}
        </p>
        {!matching.length && (
          <p>
            {items.length
              ? "No matching tasks. Clear the search to return to the board."
              : "No work proposed yet. Start with a clear outcome and responsible person."}
          </p>
        )}
        <div
          className={styles.scroll}
          tabIndex={0}
          role="group"
          aria-label="Task stages; scroll horizontally on small screens"
        >
          <div className={styles.board}>
            {stages.map(([state, label]) => {
              const rows = matching.filter((i) => i.state === state);
              return (
                <section
                  className={styles.column}
                  key={state}
                  aria-label={label + " tasks"}
                >
                  <h3 className={styles.stage}>
                    {label} <span>{rows.length}</span>
                  </h3>
                  {!rows.length && (
                    <p className={styles.empty}>
                      No {label.toLowerCase()} tasks in this view.
                    </p>
                  )}
                  {rows.map((item) => (
                    <article
                      className={styles.card}
                      key={item.id}
                      aria-label={item.title}
                    >
                      <h4>{item.title}</h4>
                      <p className={styles.state}>{item.state}</p>
                      <p className={styles.caption}>
                        Recorded revision {item.version}
                      </p>
                      {canManage &&
                        ["PROPOSED", "APPROVED"].includes(item.state) && (
                          <ActionForm
                            path={`/${roomId}/decide`}
                            title="Record decision"
                            build={(d) => ({
                              item_id: item.id,
                              version: item.version,
                              state: d.get("state"),
                            })}
                          >
                            <label>
                              Decision
                              <select name="state" aria-label="Decision">
                                {item.state === "PROPOSED" ? (
                                  <>
                                    <option value="APPROVED">
                                      Approve task
                                    </option>
                                    <option value="REJECTED">
                                      Decline task
                                    </option>
                                  </>
                                ) : (
                                  <option value="DONE">Mark completed</option>
                                )}
                              </select>
                            </label>
                            <p className={styles.caption}>
                              Save the exact current revision. The board changes
                              only after the server accepts it.
                            </p>
                          </ActionForm>
                        )}
                    </article>
                  ))}
                </section>
              );
            })}
          </div>
        </div>
        {!canManage && (
          <p className={styles.caption}>
            Review controls belong to the room creator. Current membership is
            checked again for every request.
          </p>
        )}
      </section>
      {canWrite && (
        <ActionForm
          path={`/${roomId}/items`}
          title="Propose task"
          build={(d) => ({ title: d.get("title") })}
        >
          <label>
            Outcome and responsible person
            <input
              name="title"
              maxLength={240}
              required
              placeholder="Alex: review the handoff checklist"
            />
          </label>
        </ActionForm>
      )}
    </div>
  );
}
