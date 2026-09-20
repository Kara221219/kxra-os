"use client";

import { useState, type FormEvent } from "react";

export function CustomProjectRequestForm() {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/custom-projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        problem: form.get("problem"),
        desired_outcome: form.get("desired_outcome"),
        constraints: form.get("constraints"),
        reuse_consent: form.get("reuse_consent") === "on",
        request_id: crypto.randomUUID(),
      }),
    });
    const result = await response.json();
    setBusy(false);
    if (!response.ok) {
      setMessage(result.error || "Request unavailable");
      return;
    }
    setMessage("Request submitted privately to KXRA for triage.");
    event.currentTarget.reset();
    window.location.reload();
  }
  return (
    <form className="panel form-grid" onSubmit={submit}>
      <h2>Request a custom project</h2>
      <p>
        A subscription does not include custom implementation. KXRA will review
        this request and, if suitable, issue a separate scoped proposal.
      </p>
      <label>
        Problem or need
        <textarea name="problem" required maxLength={20000} rows={5} />
      </label>
      <label>
        Desired outcome
        <textarea name="desired_outcome" required maxLength={20000} rows={5} />
      </label>
      <label>
        Constraints, systems or deadlines
        <textarea name="constraints" maxLength={20000} rows={4} />
      </label>
      <label className="check-row">
        <input type="checkbox" name="reuse_consent" />
        KXRA may reuse generalized, nonconfidential learning. This does not
        authorize publication of my project or data.
      </label>
      <button type="submit" disabled={busy}>
        {busy ? "Submitting…" : "Submit private request"}
      </button>
      {message && <p role="status">{message}</p>}
    </form>
  );
}
