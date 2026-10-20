"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { boardLenses } from "../../../packages/workrooms";
async function post(path: string, value: unknown) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(value),
  });
  const result = await response.json();
  if (!response.ok) throw Error(result.error || "Unable to save");
  return result;
}
export function WorkroomForm({
  projectId,
  threadId,
}: {
  projectId: string;
  threadId?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false),
    [ready, setReady] = useState(false),
    [error, setError] = useState("");
  const attempt = useRef<{ text: string; id: string } | null>(null);
  useEffect(() => setReady(true), []);
  return (
    <form
      className="panel create-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        const form = e.currentTarget;
        const data = new FormData(form);
        const content = {
          ...(threadId ? {} : { title: String(data.get("title")) }),
          body: String(data.get("body")),
        };
        const text = JSON.stringify(content);
        if (attempt.current?.text !== text)
          attempt.current = { text, id: crypto.randomUUID() };
        try {
          const result = await post(
            `/api/workrooms/${projectId}/threads${threadId ? `/${threadId}/messages` : ""}`,
            { ...content, request_id: attempt.current.id },
          );
          attempt.current = null;
          form.reset();
          if (!threadId) router.push(`/os/workrooms/${projectId}/${result.id}`);
          router.refresh();
        } catch (err) {
          setError(err instanceof Error ? err.message : "Unable to save");
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2>{threadId ? "Add to the discussion" : "Start a discussion"}</h2>
      <p>
        Visible to current members of this project. Messages are saved as
        attributed, versioned project notes.
      </p>
      <fieldset disabled={!ready || busy}>
        {!threadId && (
          <label>
            Discussion title
            <input name="title" required minLength={3} maxLength={160} />
          </label>
        )}
        <label>
          {threadId ? "Your reply" : "Goal and context"}
          <textarea
            name="body"
            required
            minLength={threadId ? 1 : 3}
            maxLength={8000}
          />
        </label>
        <button>
          {busy ? "Saving…" : threadId ? "Save reply" : "Create discussion"}
        </button>
      </fieldset>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
export function RefreshWorkroom() {
  const router = useRouter();
  return (
    <button className="secondary" onClick={() => router.refresh()}>
      Refresh discussion
    </button>
  );
}
export function BoardBriefForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false),
    [ready, setReady] = useState(false),
    [error, setError] = useState("");
  const attempt = useRef<{ text: string; id: string } | null>(null);
  useEffect(() => setReady(true), []);
  return (
    <form
      className="panel create-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        const data = new FormData(e.currentTarget);
        const value = {
          title: String(data.get("title")),
          question: String(data.get("question")),
          evidence: String(data.get("evidence")),
          constraints: String(data.get("constraints")),
          options: String(data.get("options"))
            .split("\n")
            .map((x) => x.trim())
            .filter(Boolean),
        };
        const text = JSON.stringify(value);
        if (attempt.current?.text !== text)
          attempt.current = { text, id: crypto.randomUUID() };
        try {
          const result = await post("/api/advisory-board", {
            ...value,
            request_id: attempt.current.id,
          });
          attempt.current = null;
          router.push(`/os/advisory-board/${result.id}`);
          router.refresh();
        } catch (err) {
          setError(err instanceof Error ? err.message : "Unable to save");
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2>Prepare an advisory review</h2>
      <fieldset disabled={!ready || busy}>
        <label>
          Decision title
          <input name="title" required minLength={3} maxLength={160} />
        </label>
        <label>
          Decision question
          <textarea name="question" required minLength={10} maxLength={8000} />
        </label>
        <label>
          Options — one per line, two to five
          <textarea name="options" required maxLength={1204} />
        </label>
        <label>
          Evidence and source links
          <textarea name="evidence" maxLength={8000} />
        </label>
        <label>
          Time, budget and other constraints
          <textarea name="constraints" maxLength={4000} />
        </label>
        <button>{busy ? "Saving…" : "Prepare review pack"}</button>
      </fieldset>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
export function BoardReviewForm({
  id,
  version,
  options,
}: {
  id: string;
  version: number;
  options: string[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false),
    [ready, setReady] = useState(false),
    [message, setMessage] = useState("");
  useEffect(() => setReady(true), []);
  return (
    <form
      className="panel create-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setMessage("");
        const data = new FormData(e.currentTarget);
        try {
          await post(`/api/advisory-board/${id}/review`, {
            version,
            source: String(data.get("source")),
            rationale: String(data.get("rationale")),
            uncertainty: String(data.get("uncertainty")),
            scores: options.map((_, i) =>
              boardLenses.map((l) => Number(data.get(`${i}-${l.key}`))),
            ),
          });
          setMessage(
            "Assessment saved. This does not approve or execute work.",
          );
          router.refresh();
        } catch (err) {
          setMessage(err instanceof Error ? err.message : "Unable to save");
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2>Record your reviewed assessment</h2>
      <p>
        Scores are judgements from 0 (weak) to 5 (strong). Weighted totals are
        computed in code; they are not probabilities of success. Missing
        evidence must be stated below.
      </p>
      <fieldset disabled={!ready || busy}>
        {options.map((option, i) => (
          <fieldset key={i}>
            <legend>{option}</legend>
            <div className="form-grid">
              {boardLenses.map((l) => (
                <label key={l.key}>
                  {l.name} · {l.weight}%
                  <select name={`${i}-${l.key}`} required defaultValue="">
                    <option value="" disabled>
                      Choose score
                    </option>
                    {[0, 1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          </fieldset>
        ))}
        <label>
          Assessment source
          <select name="source">
            <option value="OWNER_REVIEW">My own assessment</option>
            <option value="AI_DRAFT_REVIEWED_BY_OWNER">
              AI draft I have reviewed
            </option>
          </select>
        </label>
        <label>
          Evidence, rationale and disagreements
          <textarea name="rationale" required minLength={20} maxLength={8000} />
        </label>
        <label>
          Uncertainty and next validation test
          <textarea
            name="uncertainty"
            required
            minLength={10}
            maxLength={4000}
          />
        </label>
        <button>{busy ? "Saving…" : "Save assessment"}</button>
      </fieldset>
      <p role="status">{message}</p>
    </form>
  );
}
