"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { classifications } from "../../../packages/domain";
function useReady() {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  return ready;
}
type Project = { id: string; code: string; name: string };
export function RecordForm({
  kind,
  projects,
  partner = false,
  pid,
}: {
  kind: string;
  projects: Project[];
  partner?: boolean;
  pid?: string;
}) {
  const ready = useReady();
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const router = useRouter();
  return (
    <form
      method="post"
      className="create-form panel"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setMessage("");
        const form = e.currentTarget;
        const f = new FormData(form),
          data: Record<string, string> = {};
        for (const [k, v] of f.entries())
          if (k.startsWith("data.")) data[k.slice(5)] = String(v);
        try {
          const r = await fetch("/api/records", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              kind,
              title: f.get("title"),
              body: f.get("body"),
              project_id: f.get("project_id") || null,
              classification: f.get("classification"),
              visibility:
                partner || f.get("shared") ? "project_shared" : "owner_only",
              data,
            }),
          });
          const body = await r.json();
          if (!r.ok) throw Error(body.error);
          setMessage("Saved to KXRA.");
          form.reset();
          router.refresh();
        } catch (e) {
          setMessage(e instanceof Error ? e.message : "Save failed");
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2>Add {kind === "source" ? "research source" : kind}</h2>
      <label>
        Title
        <input disabled={!ready} name="title" required maxLength={240} />
      </label>
      <label>
        Project
        <select
          disabled={!ready}
          name="project_id"
          defaultValue={pid || ""}
          required={partner}
        >
          <option value="">
            {partner ? "Choose an assigned project" : "Group — owner only"}
          </option>
          {projects.map((p) => (
            <option value={p.id} key={p.id}>
              {p.code} · {p.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Evidence classification
        <select
          disabled={!ready}
          name="classification"
          defaultValue={
            kind === "assumption"
              ? "ASSUMPTION"
              : kind === "experiment"
                ? "HYPOTHESIS"
                : "USER-SUPPLIED INFORMATION"
          }
        >
          {classifications.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </label>
      <label>
        Description / evidence
        <textarea disabled={!ready} name="body" maxLength={50000} />
      </label>
      {(kind === "experiment"
        ? ["hypothesis", "test", "success_metric", "duration_days", "cost_cap"]
        : kind === "assumption"
          ? ["validation_method", "review_date"]
          : kind === "risk"
            ? ["mitigation", "owner"]
            : kind === "task"
              ? ["acceptance_criteria", "due_date"]
              : kind === "source"
                ? ["url", "publisher", "accessed_at"]
                : kind === "decision"
                  ? ["rationale", "alternatives"]
                  : []
      ).map((k) => (
        <label key={k}>
          {k.replaceAll("_", " ")}
          <input disabled={!ready} name={"data." + k} />
        </label>
      ))}
      {kind === "finance" && (
        <>
          <label>
            Amount
            <input
              name="data.amount"
              inputMode="decimal"
              required
              pattern="[0-9]+(\.[0-9]{1,4})?"
            />
          </label>
          <label>
            Currency
            <select disabled={!ready} name="data.currency">
              <option>GBP</option>
              <option>USD</option>
              <option>EUR</option>
            </select>
          </label>
          <label>
            Entry type
            <select disabled={!ready} name="data.entry_type">
              <option value="estimate">Estimate</option>
              <option value="actual">Actual</option>
              <option value="commitment">Commitment</option>
              <option value="paper">Paper only</option>
            </select>
          </label>
          <label>
            Direction
            <select disabled={!ready} name="data.direction">
              <option value="expense">Expense</option>
              <option value="income">Income</option>
            </select>
          </label>
        </>
      )}
      {!partner &&
        ![
          "finance",
          "partner",
          "agent",
          "skill",
          "routine",
          "run",
          "work_log",
          "approval",
        ].includes(kind) && (
          <label>
            <input disabled={!ready} name="shared" type="checkbox" />
            Share with assigned project members
          </label>
        )}
      <button disabled={!ready || busy}>
        {busy ? "Saving…" : "Save draft"}
      </button>
      {message && (
        <p
          role="status"
          className={message.startsWith("Saved") ? "success" : "error"}
        >
          {message}
        </p>
      )}
    </form>
  );
}
export function ActionButton({
  url,
  payload,
  label,
}: {
  url: string;
  payload: unknown;
  label: string;
}) {
  const ready = useReady();
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const router = useRouter();
  return (
    <span>
      <button
        disabled={!ready || busy}
        onClick={async () => {
          setBusy(true);
          try {
            const r = await fetch(url, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });
            const b = await r.json();
            if (!r.ok) throw Error(b.error);
            setMessage("Saved.");
            router.refresh();
          } catch (e) {
            setMessage(e instanceof Error ? e.message : "Action failed");
          } finally {
            setBusy(false);
          }
        }}
      >
        {label}
      </button>
      {message && <span role="status"> {message}</span>}
    </span>
  );
}
export function UploadForm({ projects }: { projects: Project[] }) {
  const ready = useReady();
  const [msg, setMsg] = useState("");
  const router = useRouter();
  return (
    <form
      method="post"
      className="panel"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const r = await fetch("/api/files", { method: "POST", body: f });
        const b = await r.json();
        setMsg(
          r.ok
            ? "Uploaded to quarantine. Files stay outside AI context until scanned."
            : b.error,
        );
        router.refresh();
      }}
    >
      <h2>Upload a project file</h2>
      <label>
        Project
        <select disabled={!ready} name="project_id" required>
          {projects.map((p) => (
            <option value={p.id} key={p.id}>
              {p.code} · {p.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        File
        <input disabled={!ready} type="file" name="file" required />
      </label>
      <p className="subtle">
        Maximum 20 MB. New files are quarantined. Only assigned project members
        can see shared files.
      </p>
      <button disabled={!ready}>Upload file</button>
      {msg && <p role="status">{msg}</p>}
    </form>
  );
}
export function AskForm({ projects }: { projects: Project[] }) {
  const ready = useReady();
  const [result, setResult] = useState<{
    answer?: string;
    error?: string;
    citations?: {
      record_id: string;
      title: string;
      excerpt: string;
      classification: string;
    }[];
  }>({});
  return (
    <>
      <form
        method="post"
        className="panel"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          setResult({ answer: "Searching authorised evidence…" });
          try {
            const r = await fetch("/api/ask", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                question: f.get("question"),
                project_id: f.get("project_id") || null,
              }),
            });
            setResult(await r.json());
          } catch {
            setResult({ error: "Search unavailable. Try again." });
          }
        }}
      >
        <label>
          Project
          <select disabled={!ready} name="project_id">
            <option value="">All projects I can access</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} · {p.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Ask about your evidence
          <input
            name="question"
            required
            maxLength={500}
            placeholder="For example: fitment"
          />
        </label>
        <button disabled={!ready}>Find evidence</button>
      </form>
      <div aria-live="polite">
        <p>{result.error || result.answer}</p>
        {result.citations?.map((c) => (
          <article className="record" key={c.record_id}>
            <h3>
              <a href={"/os/record/" + c.record_id}>{c.title}</a>
            </h3>
            <span className="badge">{c.classification}</span>
            <p>{c.excerpt}</p>
          </article>
        ))}
      </div>
    </>
  );
}
export function EditRecordForm({
  record,
}: {
  record: {
    id: string;
    title: string;
    body: string;
    data: Record<string, unknown>;
    version: number;
  };
}) {
  const ready = useReady();
  const [msg, setMsg] = useState(""),
    [busy, setBusy] = useState(false);
  const router = useRouter();
  return (
    <details className="panel create-form">
      <summary>Edit draft</summary>
      <form
        method="post"
        key={record.version}
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const f = new FormData(e.currentTarget);
          try {
            const data = JSON.parse(String(f.get("data")));
            const r = await fetch("/api/records/" + record.id, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                title: f.get("title"),
                body: f.get("body"),
                data,
                version: record.version,
              }),
            });
            const b = await r.json();
            if (!r.ok) throw Error(b.error);
            setMsg("Saved a new version.");
            router.refresh();
          } catch (e) {
            setMsg(e instanceof Error ? e.message : "Unable to save");
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Title
          <input
            name="title"
            defaultValue={record.title}
            required
            maxLength={240}
          />
        </label>
        <label>
          Description / evidence
          <textarea
            disabled={!ready}
            name="body"
            defaultValue={record.body}
            maxLength={50000}
          />
        </label>
        <details>
          <summary>Structured register fields</summary>
          <p className="subtle">
            Advanced editing. Preserve the existing field names and valid JSON.
          </p>
          <label>
            Data
            <textarea
              disabled={!ready}
              name="data"
              defaultValue={JSON.stringify(record.data, null, 2)}
            />
          </label>
        </details>
        <p className="subtle">
          Saving creates a new version. Project and visibility are fixed to
          protect history.
        </p>
        <button disabled={!ready || busy}>
          {busy ? "Saving…" : "Save new version"}
        </button>
        {msg && <p role="status">{msg}</p>}
      </form>
    </details>
  );
}
