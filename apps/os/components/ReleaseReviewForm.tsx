"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  releaseReviewPackets,
  type ReleaseReviewType,
} from "../lib/release-review-packets";

export default function ReleaseReviewForm({
  kind,
  manifestId,
  candidateSha256,
  evidenceSha256,
  recorded,
  finalized,
}: {
  kind: ReleaseReviewType;
  manifestId: string;
  candidateSha256: string;
  evidenceSha256: string;
  recorded?: { reviewer_name: string; attested_at: string } | null;
  finalized: boolean;
}) {
  const packet = releaseReviewPackets[kind];
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  if (recorded)
    return (
      <section className="panel release-review recorded">
        <p className="eyebrow">Review recorded</p>
        <h2>{packet.title}</h2>
        <p>
          Signed by {recorded.reviewer_name} on{" "}
          {new Date(recorded.attested_at).toLocaleString("en-GB")}.
        </p>
        <p className="subtle">
          {finalized
            ? "Bound to the finalized release evidence."
            : "Awaiting final evidence binding to the release manifest."}
        </p>
      </section>
    );

  return (
    <form
      className="panel release-review"
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy) return;
        setBusy(true);
        setMessage("");
        const form = new FormData(event.currentTarget);
        const checklist = Object.fromEntries(
          packet.checks.map(([key]) => [key, form.get(key) === "on"]),
        );
        try {
          const response = await fetch("/api/release-reviews", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              manifest_id: manifestId,
              review_type: kind,
              candidate_sha256: candidateSha256,
              evidence_sha256: evidenceSha256,
              checklist,
              notes: form.get("notes"),
            }),
          });
          const result = await response.json();
          if (!response.ok)
            throw new Error(result.error || "Review unavailable");
          setMessage("Review recorded.");
          router.refresh();
        } catch (error) {
          setMessage(
            error instanceof Error ? error.message : "Review unavailable",
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <p className="eyebrow">Named human review</p>
      <h2>{packet.title}</h2>
      <p>{packet.purpose}</p>
      <details>
        <summary>Evidence included in this review</summary>
        <ul>
          {packet.evidence.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p className="subtle">Evidence digest: {evidenceSha256}</p>
        <p className="subtle">Candidate digest: {candidateSha256}</p>
      </details>
      <fieldset>
        <legend>Confirm every check after you have completed it</legend>
        {packet.checks.map(([key, label]) => (
          <label key={key}>
            <input name={key} required type="checkbox" />
            {label}
          </label>
        ))}
      </fieldset>
      <label>
        Review notes
        <textarea
          name="notes"
          minLength={20}
          maxLength={4000}
          required
          placeholder="Record devices, browsers, assistive tools, findings and any remediation checked."
        />
      </label>
      <p className="notice">
        Signing records your authenticated name, exact candidate and evidence
        digests. Recent MFA is required. This does not deploy or publish KXRA.
      </p>
      <button disabled={busy}>
        {busy ? "Recording…" : "Sign completed review"}
      </button>
      {message && <p role="status">{message}</p>}
    </form>
  );
}
