"use client";
import { useState } from "react";
const initial = [
  { customer: "Alder House", amount: 2400, status: "Open" },
  { customer: "North Studio", amount: 1850, status: "Overdue" },
  { customer: "Willow Works", amount: 4200, status: "Paid" },
  { customer: "Field & Form", amount: 3100, status: "Review" },
];
export function WorkspacePreview({
  initialScenario = "Finance",
}: {
  initialScenario?: "Finance" | "Hiring" | "Sales" | "Operations";
}) {
  const [scenario, setScenario] = useState<string>(initialScenario),
    [rows, setRows] = useState(initial),
    [ascending, setAscending] = useState(true),
    [stage, setStage] = useState("Review"),
    [deal, setDeal] = useState("Discovery"),
    [count, setCount] = useState(""),
    [note, setNote] = useState("");
  const sorted = [...rows].sort((a, b) =>
    ascending ? a.amount - b.amount : b.amount - a.amount,
  );
  return (
    <div className="ref-workspace">
      <aside className="ref-workspace-sidebar">
        <strong>✣ KXRA</strong>
        <span>Workspace preview</span>
        <p>⌂ Home</p>
        <p>◷ Recent</p>
        <p>
          ◎ Unread <small>2</small>
        </p>
        <h3>TEAM ROOMS</h3>
        {["Finance", "Hiring", "Sales", "Operations"].map((name, i) => (
          <button
            key={name}
            aria-pressed={scenario === name}
            onClick={() => {
              setScenario(name);
              setNote("");
            }}
          >
            <span>#</span> {name.toLowerCase()}
            <small>0{i + 1}</small>
          </button>
        ))}
        <div className="ref-sidebar-bottom">
          Sample workspace
          <br />
          No connected accounts
        </div>
      </aside>
      <section className="ref-thread">
        <header>
          <strong>
            {scenario === "Finance"
              ? "Invoice follow-up"
              : scenario === "Hiring"
                ? "Hiring shortlist"
                : scenario === "Sales"
                  ? "Next customer conversation"
                  : "Warehouse counts"}
          </strong>
          <span>{scenario.toLowerCase()} · Sample conversation</span>
        </header>
        <div className="ref-chat">
          <span className="ref-avatar">M</span>
          <div>
            <strong>
              Maya <small>Team member</small>
            </strong>
            <p>
              {scenario === "Finance"
                ? "Can we keep the invoice review here, with the next action attached?"
                : scenario === "Hiring"
                  ? "Let’s keep our candidate reviews together before we decide."
                  : scenario === "Sales"
                    ? "Which customer conversation needs a next step?"
                    : "Can we review this count before recording it?"}
            </p>
          </div>
        </div>
        <div className="ref-chat">
          <span className="ref-avatar ref-agent-avatar">✣</span>
          <div>
            <strong>
              KXRA <small>Sample agent response</small>
            </strong>
            <p>
              {scenario === "Finance"
                ? "Here is an illustrative tracker. Choose a column to sort it, or add a sample record."
                : scenario === "Hiring"
                  ? "Move the sample application between stages. A person makes the hiring decision."
                  : scenario === "Sales"
                    ? "Select a stage to explore the next review step. No customer is contacted."
                    : "Enter a whole number to validate the sample count. Nothing is sent to a stock system."}
            </p>
          </div>
        </div>
        <div className="ref-inline-app">
          <div className="ref-inline-title">
            <strong>{scenario} workspace</strong>
            <span>SAMPLE APP</span>
          </div>
          {scenario === "Finance" ? (
            <>
              <div className="ref-table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Customer</th>
                      <th>
                        <button onClick={() => setAscending(!ascending)}>
                          Amount {ascending ? "↑" : "↓"}
                        </button>
                      </th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((r, i) => (
                      <tr key={i}>
                        <td>{r.customer}</td>
                        <td>£{r.amount.toLocaleString("en-GB")}</td>
                        <td>
                          <span
                            className={
                              "ref-status ref-status-" + r.status.toLowerCase()
                            }
                          >
                            {r.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button
                className="ref-text-button"
                onClick={() =>
                  setRows((current) => [
                    ...current,
                    {
                      customer: "Sample record " + (current.length - 3),
                      amount: 1250,
                      status: "Review",
                    },
                  ])
                }
              >
                + New sample record
              </button>
              <button
                className="ref-text-button"
                onClick={() => setRows(initial)}
              >
                Reset
              </button>
            </>
          ) : scenario === "Hiring" ? (
            <div className="ref-stage-columns">
              {["Review", "Interview", "Decision"].map((s) => (
                <div
                  key={s}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => setStage(s)}
                >
                  <strong>{s}</strong>
                  {stage === s && (
                    <button
                      draggable
                      onDragStart={(e) =>
                        e.dataTransfer.setData("text/plain", "sample")
                      }
                      onClick={() =>
                        setStage(
                          s === "Review"
                            ? "Interview"
                            : s === "Interview"
                              ? "Decision"
                              : "Review",
                        )
                      }
                    >
                      Sample candidate <span>Click or drag to move →</span>
                    </button>
                  )}
                </div>
              ))}
            </div>
          ) : scenario === "Sales" ? (
            <div className="ref-demo-form">
              <label htmlFor="sample-deal">Opportunity stage</label>
              <select
                id="sample-deal"
                value={deal}
                onChange={(e) => setDeal(e.target.value)}
              >
                {["Discovery", "Qualified", "Proposal", "Review"].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
              <p>
                Next step:{" "}
                {deal === "Discovery"
                  ? "Confirm the customer’s problem."
                  : deal === "Qualified"
                    ? "Agree what a useful outcome looks like."
                    : deal === "Proposal"
                      ? "Review the exact scope and price."
                      : "Record the human decision."}
              </p>
            </div>
          ) : (
            <form
              className="ref-demo-form"
              onSubmit={(e) => {
                e.preventDefault();
                setNote(
                  /^\d+$/.test(count) && Number(count) <= 100000
                    ? "Sample count validated. No external stock record changed."
                    : "Enter a whole number from 0 to 100,000.",
                );
              }}
            >
              <label htmlFor="sample-count">Count for sample item</label>
              <input
                id="sample-count"
                value={count}
                inputMode="numeric"
                onChange={(e) => setCount(e.target.value)}
              />
              <button className="ref-button">Validate sample count</button>
              <p role="status">{note}</p>
            </form>
          )}
        </div>
        <div className="ref-chat-input">
          Message this room… <span>Sample preview</span>
        </div>
      </section>
      <aside className="ref-context">
        <span>CONTEXT</span>
        <h3>The work stays together.</h3>
        <p>◫ Room brief</p>
        <p>▧ Reviewed evidence</p>
        <p>✓ Decisions & next steps</p>
        <div>
          <strong>Human review</strong>
          <p>
            Sample data only. No live agent, provider call, payment or external
            action.
          </p>
        </div>
      </aside>
    </div>
  );
}
