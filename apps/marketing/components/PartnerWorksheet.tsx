"use client";
import { useState } from "react";
export function PartnerWorksheet() {
  const [problem, setProblem] = useState(""),
    [outcome, setOutcome] = useState(""),
    [boundary, setBoundary] = useState(""),
    [reviewer, setReviewer] = useState(""),
    [status, setStatus] = useState("");
  const preview = `WORKFLOW SCOPE — LOCAL DRAFT\n\nProblem: ${problem || "To agree"}\nUseful outcome: ${outcome || "To agree"}\nData/access boundary: ${boundary || "To agree"}\nResponsible reviewer: ${reviewer || "To agree"}\n\nNo contract, payment, client record or external action is created by this worksheet.`;
  return (
    <section className="partner-worksheet">
      <div>
        <p className="ref-kicker">LOCAL PLANNING AID</p>
        <h2>Make the next step concrete.</h2>
        <p>
          Use fictional or non-confidential information. This draft stays in
          page memory and disappears when you leave.
        </p>
        <label htmlFor="partner-problem">Current problem</label>
        <textarea
          id="partner-problem"
          value={problem}
          onChange={(e) => setProblem(e.target.value)}
          maxLength={700}
        />
        <label htmlFor="partner-outcome">Useful outcome</label>
        <input
          id="partner-outcome"
          value={outcome}
          onChange={(e) => setOutcome(e.target.value)}
          maxLength={300}
        />
        <label htmlFor="partner-boundary">Data and access boundary</label>
        <input
          id="partner-boundary"
          value={boundary}
          onChange={(e) => setBoundary(e.target.value)}
          maxLength={300}
        />
        <label htmlFor="partner-reviewer">Responsible reviewer</label>
        <input
          id="partner-reviewer"
          value={reviewer}
          onChange={(e) => setReviewer(e.target.value)}
          maxLength={120}
        />
      </div>
      <div>
        <h3>Scope preview</h3>
        <pre>{preview}</pre>
        <button
          className="ref-button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(preview);
              setStatus(
                "Draft copied to your clipboard. Nothing was submitted.",
              );
            } catch {
              setStatus(
                "Clipboard unavailable. Select and copy the preview text instead.",
              );
            }
          }}
        >
          Copy scope draft
        </button>
        <button
          className="ref-text-button"
          onClick={() => {
            setProblem("");
            setOutcome("");
            setBoundary("");
            setReviewer("");
            setStatus("Local draft reset.");
          }}
        >
          Reset worksheet
        </button>
        <p role="status">{status}</p>
      </div>
    </section>
  );
}
