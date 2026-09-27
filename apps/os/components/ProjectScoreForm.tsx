"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Project, RecordRow } from "../lib/data";

const factors = [
  ["customer_problem", "Customer problem", 15],
  ["willingness_to_pay", "Willingness to pay", 15],
  ["distribution", "Distribution", 10],
  ["economics", "Economics", 15],
  ["market", "Market", 8],
  ["differentiation", "Differentiation", 10],
  ["feasibility", "Feasibility", 10],
  ["risk_capital", "Risk and capital", 7],
  ["team_partner", "Team and partners", 5],
  ["scale_reuse", "Scale and reuse", 5],
] as const;

const confidenceDimensions = [
  ["quality", "Evidence quality"],
  ["independence", "Independence"],
  ["recency", "Recency"],
  ["directness", "Directness"],
] as const;

export default function ProjectScoreForm({
  project,
  evidence,
}: {
  project: Project;
  evidence: RecordRow[];
}) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => setReady(true), []);
  return (
    <form
      method="post"
      className="panel score-assessment-form"
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy) return;
        const form = event.currentTarget;
        const data = new FormData(form);
        setBusy(true);
        setMessage("");
        try {
          const assessed = factors.flatMap(([factorKey]) => {
            const rawRating = String(data.get(`${factorKey}.rating`) || "");
            if (!rawRating) return [];
            const reference = String(data.get(`${factorKey}.evidence`) || "");
            const [recordId, version] = reference.split(":");
            const rawConfidence = Object.fromEntries(
              confidenceDimensions.map(([key]) => [
                key,
                String(data.get(`${factorKey}.${key}`) || ""),
              ]),
            );
            const supplied = Object.values(rawConfidence).filter(Boolean);
            if (supplied.length > 0 && supplied.length < 4)
              throw new Error(
                "Complete all four confidence dimensions or leave all four unknown.",
              );
            if (!recordId || !version)
              throw new Error("Every assessed factor requires evidence.");
            return [
              {
                factor_key: factorKey,
                rating: Number(rawRating),
                rationale: data.get(`${factorKey}.rationale`),
                confidence: supplied.length
                  ? {
                      quality: Number(rawConfidence.quality),
                      independence: Number(rawConfidence.independence),
                      recency: Number(rawConfidence.recency),
                      directness: Number(rawConfidence.directness),
                    }
                  : null,
                evidence: [{ record_id: recordId, version: Number(version) }],
              },
            ];
          });
          if (!assessed.length)
            throw new Error(
              "Assess at least one factor before requesting review.",
            );
          const response = await fetch("/api/approvals", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "project.score",
              project_id: project.id,
              payload: {
                expected_version: project.governance_version,
                reason: data.get("reason"),
                factors: assessed,
              },
            }),
          });
          const result = await response.json();
          if (!response.ok)
            throw new Error(result.error || "Assessment unavailable");
          setMessage("Score assessment submitted for exact approval.");
          form.reset();
          router.refresh();
        } catch (error) {
          setMessage(
            error instanceof Error ? error.message : "Assessment unavailable",
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <p className="eyebrow">Evidence-backed assessment</p>
      <h2>Assess Venture and Confidence Scores</h2>
      <p>
        Rate only factors supported by current accepted evidence. Missing
        factors remain unknown; KXRA will show bounds and will not produce an
        overall Venture Score until coverage reaches 100%.
      </p>
      {factors.map(([factorKey, label, weight]) => (
        <details key={factorKey} className="score-factor">
          <summary>
            {label} · weight {weight}
          </summary>
          <div className="form-grid">
            <label>
              Rating
              <select name={`${factorKey}.rating`} defaultValue="">
                <option value="">Unknown</option>
                {[0, 1, 2, 3, 4, 5].map((rating) => (
                  <option value={rating} key={rating}>
                    {rating} / 5
                  </option>
                ))}
              </select>
            </label>
            <label>
              Current accepted evidence
              <select name={`${factorKey}.evidence`} defaultValue="">
                <option value="">Choose evidence</option>
                {evidence.map((record) => (
                  <option
                    value={`${record.id}:${record.version}`}
                    key={`${record.id}:${record.version}`}
                  >
                    {record.title} · v{record.version}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label>
            Rationale
            <textarea name={`${factorKey}.rationale`} maxLength={2000} />
          </label>
          <div className="form-grid">
            {confidenceDimensions.map(([key, dimension]) => (
              <label key={key}>
                {dimension}
                <select name={`${factorKey}.${key}`} defaultValue="">
                  <option value="">Unknown</option>
                  <option value="0.25">Weak</option>
                  <option value="0.5">Moderate</option>
                  <option value="0.75">Strong</option>
                  <option value="1">Direct / highest</option>
                </select>
              </label>
            ))}
          </div>
        </details>
      ))}
      <label>
        Assessment reason
        <textarea name="reason" required maxLength={2000} />
      </label>
      <button disabled={!ready || busy || evidence.length === 0}>
        {busy ? "Requesting…" : "Request score approval"}
      </button>
      {evidence.length === 0 && (
        <p className="notice">Accept project evidence before scoring.</p>
      )}
      {message && (
        <p
          role="status"
          className={
            message === "Score assessment submitted for exact approval."
              ? "success"
              : "error"
          }
        >
          {message}
        </p>
      )}
    </form>
  );
}
