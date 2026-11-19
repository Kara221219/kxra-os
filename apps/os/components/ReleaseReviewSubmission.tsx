"use client";
import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { ReleaseReviewType } from "../lib/release-review-packets";

export default function ReleaseReviewSubmission({
  kind,
  manifestId,
  candidateSha256,
  evidenceSha256,
  checkKeys,
  children,
}: {
  kind: ReleaseReviewType;
  manifestId: string;
  candidateSha256: string;
  evidenceSha256: string;
  checkKeys: readonly string[];
  children: ReactNode;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
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
          checkKeys.map((key) => [key, form.get(key) === "on"]),
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
      {children}
      <button disabled={busy}>
        {busy ? "Recording…" : "Sign completed review"}
      </button>
      {message && <p role="status">{message}</p>}
    </form>
  );
}
