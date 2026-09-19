"use client";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { classifications } from "../../../packages/domain";
function useReady() {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  return ready;
}
type Project = { id: string; code: string; name: string };
export function InvitationForm({ projects }: { projects: Project[] }) {
  const ready = useReady();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  return (
    <form
      method="post"
      className="panel create-form"
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy) return;
        setBusy(true);
        setMessage("");
        const formElement = event.currentTarget;
        const form = new FormData(formElement);
        try {
          const grants = projects
            .filter((project) => form.get(`project-${project.id}`) === "on")
            .map((project) => ({
              project_id: project.id,
              role: form.get(`role-${project.id}`),
            }));
          if (!grants.length) throw new Error("Choose at least one project");
          const response = await fetch("/api/invitations", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: form.get("email"),
              grants,
              note: form.get("note") || null,
              expires_hours: Number(form.get("expires_hours")),
            }),
          });
          const result = await response.json();
          if (!response.ok) throw Error(result.error);
          setMessage(
            result.state === "SENT"
              ? `Invitation created for ${result.project_count} project${result.project_count === 1 ? "" : "s"} and captured by the local fake email provider.`
              : "Invitation created and waiting for configured email delivery.",
          );
          formElement.reset();
          router.refresh();
        } catch (error) {
          setMessage(
            error instanceof Error ? error.message : "Invitation unavailable",
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2>Create an invitation</h2>
      <p>
        The partner creates their own password. The one-use link is delivered
        only through the configured provider; this environment uses a local fake
        outbox.
      </p>
      <fieldset disabled={!ready || busy}>
        <label>
          Verified account email
          <input name="email" type="email" required maxLength={320} />
        </label>
        <fieldset className="assignment-picker">
          <legend>Project assignments</legend>
          {projects.map((project) => (
            <div className="assignment-row" key={project.id}>
              <label className="check-row">
                <input type="checkbox" name={`project-${project.id}`} />
                <span>
                  {project.code} · {project.name}
                </span>
              </label>
              <label>
                <span className="sr-only">Role for {project.name}</span>
                <select name={`role-${project.id}`} defaultValue="viewer">
                  <option value="viewer">Viewer</option>
                  <option value="contributor">Contributor</option>
                </select>
              </label>
            </div>
          ))}
        </fieldset>
        <label>
          Optional note
          <textarea name="note" maxLength={2000} />
        </label>
        <div className="form-grid">
          <label>
            Expires after
            <select name="expires_hours" defaultValue="24">
              <option value="1">1 hour</option>
              <option value="24">24 hours</option>
              <option value="72">3 days</option>
              <option value="168">7 days</option>
            </select>
          </label>
        </div>
      </fieldset>
      <button disabled={!ready || busy}>
        {busy ? "Creating…" : "Create invitation"}
      </button>
      {message && <p role="status">{message}</p>}
    </form>
  );
}

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

type WorkflowRecord = {
  id: string;
  title: string;
  kind: string;
  status: string;
  version: number;
  classification: string;
  created_by: string;
};
type WorkflowResult = {
  id: string;
  experiment_id: string;
  experiment_version: number;
  outcome: string;
};
type WorkflowTask = {
  id: string;
  project_id: string;
  context_record_id: string;
  context_version: number;
  title: string;
  acceptance_criteria: string;
  assignee_id: string;
  state: string;
  completion_note: string | null;
  version: number;
};
type WorkflowMember = { id: string; display_name: string; role: string };

function MutationForm({
  endpoint,
  label,
  success,
  payload,
  children,
}: {
  endpoint: string | ((form: FormData) => string);
  label: string;
  success: string;
  payload: (form: FormData) => unknown;
  children: ReactNode;
}) {
  const ready = useReady();
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      method="post"
      className="workflow-form"
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy) return;
        setBusy(true);
        setMessage("");
        try {
          const form = new FormData(event.currentTarget);
          const response = await fetch(
            typeof endpoint === "string" ? endpoint : endpoint(form),
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload(form)),
            },
          );
          const result = await response.json();
          if (!response.ok) throw Error(result.error);
          setMessage(success);
          event.currentTarget.reset();
          router.refresh();
        } catch (error) {
          setMessage(error instanceof Error ? error.message : "Action failed");
        } finally {
          setBusy(false);
        }
      }}
    >
      <fieldset disabled={!ready || busy}>{children}</fieldset>
      <button disabled={!ready || busy}>{busy ? "Saving…" : label}</button>
      {message && (
        <p role="status" className={message === success ? "success" : "error"}>
          {message}
        </p>
      )}
    </form>
  );
}

export function OperatingLoopForms({
  projectId,
  actorId,
  owner,
  records,
  results,
  tasks,
  members,
}: {
  projectId: string;
  actorId: string;
  owner: boolean;
  records: WorkflowRecord[];
  results: WorkflowResult[];
  tasks: WorkflowTask[];
  members: WorkflowMember[];
}) {
  const drafts = records.filter(
    (row) => row.kind === "idea" && row.status === "draft",
  );
  const ideas = records.filter(
    (row) =>
      row.kind === "idea" && ["submitted", "accepted"].includes(row.status),
  );
  const experiments = records.filter((row) => row.kind === "experiment");
  const decisions = records.filter((row) => row.kind === "decision");
  const evidence = records.filter((row) => row.status === "accepted");
  const resultable = experiments.filter(
    (experiment) =>
      !results.some(
        (result) =>
          result.experiment_id === experiment.id &&
          result.experiment_version === experiment.version,
      ) &&
      (owner ||
        tasks.some(
          (task) =>
            task.context_record_id === experiment.id &&
            task.context_version === experiment.version &&
            task.assignee_id === actorId &&
            task.state === "assigned",
        )),
  );
  return (
    <div className="workflow-controls">
      {drafts.length > 0 && (
        <section>
          <h3>Submit an idea</h3>
          <p>Submission fixes the idea version used by a later experiment.</p>
          {drafts
            .filter((idea) => owner || idea.created_by === actorId)
            .map((idea) => (
              <div className="list-item" key={idea.id}>
                <strong>{idea.title}</strong>{" "}
                <ActionButton
                  url={`/api/workflow/ideas/${idea.id}/submit`}
                  payload={{ version: idea.version }}
                  label="Submit idea"
                />
              </div>
            ))}
        </section>
      )}

      {owner && ideas.length > 0 && evidence.length > 0 && (
        <details>
          <summary>Create an evidence-linked experiment</summary>
          <MutationForm
            endpoint="/api/workflow/experiments"
            label="Create experiment"
            success="Experiment created."
            payload={(form) => {
              const idea = ideas.find(
                (row) => row.id === String(form.get("idea_id")),
              );
              const source = evidence.find(
                (row) => row.id === String(form.get("evidence_id")),
              );
              if (!idea || !source)
                throw Error("Choose current idea and evidence versions");
              return {
                project_id: projectId,
                idea_id: idea.id,
                idea_version: idea.version,
                title: form.get("title"),
                hypothesis: form.get("hypothesis"),
                cost_cap: form.get("cost_cap"),
                currency: form.get("currency"),
                success_criteria: form.get("success_criteria"),
                stop_criteria: form.get("stop_criteria"),
                evidence: [{ record_id: source.id, version: source.version }],
              };
            }}
          >
            <label>
              Submitted idea
              <select name="idea_id" required defaultValue="">
                <option value="" disabled>
                  Choose an idea
                </option>
                {ideas.map((idea) => (
                  <option value={idea.id} key={idea.id}>
                    {idea.title} · v{idea.version}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Experiment title
              <input name="title" required maxLength={240} />
            </label>
            <label>
              Hypothesis
              <textarea name="hypothesis" required maxLength={50000} />
            </label>
            <div className="form-grid">
              <label>
                Cost cap
                <input
                  name="cost_cap"
                  required
                  pattern="[0-9]+(\.[0-9]{1,4})?"
                />
              </label>
              <label>
                Currency
                <select name="currency" defaultValue="GBP">
                  <option>GBP</option>
                  <option>USD</option>
                  <option>EUR</option>
                </select>
              </label>
            </div>
            <label>
              Success criteria
              <textarea name="success_criteria" required maxLength={5000} />
            </label>
            <label>
              Stop criteria
              <textarea name="stop_criteria" required maxLength={5000} />
            </label>
            <EvidenceSelect rows={evidence} />
          </MutationForm>
        </details>
      )}

      {owner && experiments.length > 0 && members.length > 0 && (
        <details>
          <summary>Assign an experiment task</summary>
          <MutationForm
            endpoint="/api/workflow/tasks"
            label="Assign task"
            success="Task assigned."
            payload={(form) => {
              const context = experiments.find(
                (row) => row.id === String(form.get("context_id")),
              );
              if (!context) throw Error("Choose a current experiment");
              return {
                context_id: context.id,
                context_version: context.version,
                assignee_id: form.get("assignee_id"),
                title: form.get("title"),
                acceptance_criteria: form.get("acceptance_criteria"),
              };
            }}
          >
            <label>
              Experiment
              <select name="context_id" required defaultValue="">
                <option value="" disabled>
                  Choose an experiment
                </option>
                {experiments.map((experiment) => (
                  <option value={experiment.id} key={experiment.id}>
                    {experiment.title} · v{experiment.version}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Assignee
              <select name="assignee_id" required defaultValue="">
                <option value="" disabled>
                  Choose an active contributor
                </option>
                {members.map((member) => (
                  <option value={member.id} key={member.id}>
                    {member.display_name} · {member.role}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Task
              <input name="title" required maxLength={240} />
            </label>
            <label>
              Acceptance criteria
              <textarea name="acceptance_criteria" required maxLength={5000} />
            </label>
          </MutationForm>
        </details>
      )}

      {resultable.length > 0 && evidence.length > 0 && (
        <details open={!owner}>
          <summary>Record an experiment result</summary>
          <MutationForm
            endpoint={(form) =>
              `/api/workflow/experiments/${String(form.get("experiment_id"))}/results`
            }
            label="Record result"
            success="Experiment result recorded."
            payload={(form) => {
              const experiment = resultable.find(
                (row) => row.id === String(form.get("experiment_id")),
              );
              const source = evidence.find(
                (row) => row.id === String(form.get("evidence_id")),
              );
              if (!experiment || !source)
                throw Error("Choose current experiment and evidence versions");
              return {
                version: experiment.version,
                outcome: form.get("outcome"),
                observations: form.get("observations"),
                metric_value: form.get("metric_value"),
                evidence: [{ record_id: source.id, version: source.version }],
              };
            }}
          >
            <ResultFormFields experiments={resultable} evidence={evidence} />
          </MutationForm>
        </details>
      )}

      {owner && results.length > 0 && evidence.length > 0 && (
        <details>
          <summary>Record a linked decision</summary>
          <MutationForm
            endpoint="/api/workflow/decisions"
            label="Create decision draft"
            success="Decision draft created. Request acceptance from its record page."
            payload={(form) => {
              const result = results.find(
                (row) => row.id === String(form.get("result_id")),
              );
              const source = evidence.find(
                (row) => row.id === String(form.get("evidence_id")),
              );
              if (!result || !source)
                throw Error("Choose current result and evidence");
              return {
                project_id: projectId,
                experiment_id: result.experiment_id,
                experiment_version: result.experiment_version,
                result_id: result.id,
                title: form.get("title"),
                decision: form.get("decision"),
                evidence: [{ record_id: source.id, version: source.version }],
                supersedes_id: form.get("supersedes_id") || null,
              };
            }}
          >
            <label>
              Experiment result
              <select name="result_id" required defaultValue="">
                <option value="" disabled>
                  Choose a result
                </option>
                {results.map((result) => (
                  <option value={result.id} key={result.id}>
                    {records.find((row) => row.id === result.experiment_id)
                      ?.title || "Experiment"}{" "}
                    · {result.outcome}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Decision title
              <input name="title" required maxLength={240} />
            </label>
            <label>
              Decision
              <textarea name="decision" required maxLength={50000} />
            </label>
            <EvidenceSelect rows={evidence} />
            <label>
              Supersedes accepted decision (optional)
              <select name="supersedes_id" defaultValue="">
                <option value="">No supersession</option>
                {decisions
                  .filter((decision) => decision.status === "accepted")
                  .map((decision) => (
                    <option value={decision.id} key={decision.id}>
                      {decision.title} · v{decision.version}
                    </option>
                  ))}
              </select>
            </label>
          </MutationForm>
        </details>
      )}

      {tasks.length > 0 && (
        <section>
          <h3>Workflow tasks</h3>
          <WorkflowTaskCards
            tasks={tasks}
            records={records}
            actorId={actorId}
            owner={owner}
          />
        </section>
      )}
    </div>
  );
}

export function WorkflowTaskCards({
  tasks,
  records,
  actorId,
  owner,
}: {
  tasks: WorkflowTask[];
  records: WorkflowRecord[];
  actorId: string;
  owner: boolean;
}) {
  return (
    <>
      {tasks.map((task) => (
        <article className="workflow-task" key={task.id}>
          <strong>{task.title}</strong>
          <p>{task.acceptance_criteria}</p>
          <p className="subtle">
            Context:{" "}
            <a href={`/os/record/${task.context_record_id}`}>
              {records.find((row) => row.id === task.context_record_id)
                ?.title || "Current workflow record"}{" "}
              · v{task.context_version}
            </a>
          </p>
          <span className="badge">{task.state}</span>
          {task.completion_note && <p>Completion: {task.completion_note}</p>}
          {task.state === "assigned" &&
            (owner || task.assignee_id === actorId) && (
              <MutationForm
                endpoint={`/api/workflow/tasks/${task.id}/complete`}
                label="Complete task"
                success="Task completed."
                payload={(form) => ({
                  version: task.version,
                  completion_note: form.get("completion_note"),
                })}
              >
                <label>
                  Completion note
                  <textarea name="completion_note" required maxLength={5000} />
                </label>
              </MutationForm>
            )}
        </article>
      ))}
    </>
  );
}

export function GateEvidenceForm({
  projectId,
  gate,
  evidence,
}: {
  projectId: string;
  gate:
    | "P001_REVISIT"
    | "P002_LISTING"
    | "P003_FAITHFUL_DELIVERY"
    | "P004_PAPER_READINESS"
    | "P005_LOCAL_PROTOTYPE";
  evidence: WorkflowRecord[];
}) {
  if (!evidence.length)
    return (
      <p className="notice">Accepted project evidence is required first.</p>
    );
  if (gate === "P001_REVISIT" && evidence.length < 5)
    return (
      <p className="notice">
        Five distinct current evidence records are required for this gate.
      </p>
    );
  return (
    <details className="workflow-controls">
      <summary>Create a gate evidence packet</summary>
      <p>
        This creates a draft linked to current accepted evidence. The packet
        must be accepted separately before a local gate authorization can be
        requested.
      </p>
      <MutationForm
        endpoint="/api/project-gates/evidence"
        label="Create evidence packet"
        success="Evidence packet created as a draft."
        payload={(form) => {
          const source = evidence.find(
            (row) => row.id === String(form.get("evidence_id")),
          );
          if (gate !== "P001_REVISIT" && !source)
            throw Error("Choose current accepted evidence");
          const claims =
            gate === "P001_REVISIT"
              ? {
                  route_evidenced: form.get("route_evidenced") === "on",
                  liquidity_evidenced: form.get("liquidity_evidenced") === "on",
                  recovery_evidenced: form.get("recovery_evidenced") === "on",
                  buyer_evidenced: form.get("buyer_evidenced") === "on",
                  regulatory_evidenced:
                    form.get("regulatory_evidenced") === "on",
                }
              : gate === "P002_LISTING"
                ? {
                    exact_sku: form.get("exact_sku"),
                    fitment_verified: form.get("fitment_verified") === "on",
                    safety_evidence_verified:
                      form.get("safety_evidence_verified") === "on",
                  }
                : gate === "P003_FAITHFUL_DELIVERY"
                  ? {
                      rights_confirmed: form.get("rights_confirmed") === "on",
                      geometry_qa_passed:
                        form.get("geometry_qa_passed") === "on",
                    }
                  : gate === "P004_PAPER_READINESS"
                    ? {
                        protocol_defined: form.get("protocol_defined") === "on",
                        risk_limits_defined:
                          form.get("risk_limits_defined") === "on",
                        paper_account_ready:
                          form.get("paper_account_ready") === "on",
                      }
                    : {
                        buyer_problem: form.get("buyer_problem"),
                        demand_reviewed: form.get("demand_reviewed") === "on",
                      };
          const evidenceReferences =
            gate === "P001_REVISIT"
              ? ["route", "liquidity", "recovery", "buyer", "regulatory"].map(
                  (category) => {
                    const selected = evidence.find(
                      (row) =>
                        row.id ===
                        String(form.get(`${category}_gate_evidence_id`)),
                    );
                    if (!selected)
                      throw Error(`Choose current ${category} evidence`);
                    return {
                      record_id: selected.id,
                      version: selected.version,
                    };
                  },
                )
              : [
                  {
                    record_id: source!.id,
                    version: source!.version,
                  },
                ];
          if (
            gate === "P001_REVISIT" &&
            new Set(evidenceReferences.map((item) => item.record_id)).size !== 5
          )
            throw Error("Choose a distinct evidence record for each category");
          return {
            project_id: projectId,
            gate,
            title: form.get("title"),
            summary: form.get("summary"),
            claims,
            evidence: evidenceReferences,
          };
        }}
      >
        <label>
          Packet title
          <input name="title" required maxLength={240} />
        </label>
        <label>
          Review summary
          <textarea name="summary" required maxLength={50000} />
        </label>
        {gate === "P001_REVISIT" && (
          <>
            {[
              ["route", "Route"],
              ["liquidity", "Liquidity"],
              ["recovery", "Failure recovery"],
              ["buyer", "Buyer"],
              ["regulatory", "Regulatory"],
            ].map(([key, label]) => (
              <EvidenceSelect
                key={key}
                rows={evidence}
                name={`${key}_gate_evidence_id`}
                label={`${label} evidence`}
              />
            ))}
            <label>
              <input name="route_evidenced" type="checkbox" required />
              Route evidence reviewed
            </label>
            <label>
              <input name="liquidity_evidenced" type="checkbox" required />
              Liquidity evidence reviewed
            </label>
            <label>
              <input name="recovery_evidenced" type="checkbox" required />
              Failure recovery evidence reviewed
            </label>
            <label>
              <input name="buyer_evidenced" type="checkbox" required />
              Buyer evidence reviewed
            </label>
            <label>
              <input name="regulatory_evidenced" type="checkbox" required />
              Regulatory evidence reviewed
            </label>
          </>
        )}
        {gate === "P002_LISTING" && (
          <>
            <label>
              Exact supplier SKU
              <input name="exact_sku" required maxLength={240} />
            </label>
            <label>
              <input name="fitment_verified" type="checkbox" required />
              Exact fitment evidence reviewed
            </label>
            <label>
              <input name="safety_evidence_verified" type="checkbox" required />
              Safety evidence reviewed
            </label>
          </>
        )}
        {gate === "P003_FAITHFUL_DELIVERY" && (
          <>
            <label>
              <input name="rights_confirmed" type="checkbox" required />
              Rights confirmed
            </label>
            <label>
              <input name="geometry_qa_passed" type="checkbox" required />
              Geometry QA passed
            </label>
          </>
        )}
        {gate === "P005_LOCAL_PROTOTYPE" && (
          <>
            <label>
              Specific buyer problem
              <textarea name="buyer_problem" required maxLength={1000} />
            </label>
            <label>
              <input name="demand_reviewed" type="checkbox" required />
              Demand evidence reviewed
            </label>
          </>
        )}
        {gate === "P004_PAPER_READINESS" && (
          <>
            <label>
              <input name="protocol_defined" type="checkbox" required />
              Paper protocol defined
            </label>
            <label>
              <input name="risk_limits_defined" type="checkbox" required />
              Paper risk limits defined
            </label>
            <label>
              <input name="paper_account_ready" type="checkbox" required />
              Paper account readiness reviewed
            </label>
          </>
        )}
        {gate !== "P001_REVISIT" && <EvidenceSelect rows={evidence} />}
      </MutationForm>
    </details>
  );
}

function EvidenceSelect({
  rows,
  name = "evidence_id",
  label = "Accepted evidence",
}: {
  rows: WorkflowRecord[];
  name?: string;
  label?: string;
}) {
  return (
    <label>
      {label}
      <select name={name} required defaultValue="">
        <option value="" disabled>
          Choose current accepted evidence
        </option>
        {rows.map((row) => (
          <option value={row.id} key={row.id}>
            {row.title} · {row.classification} · v{row.version}
          </option>
        ))}
      </select>
    </label>
  );
}

function ResultFormFields({
  experiments,
  evidence,
}: {
  experiments: WorkflowRecord[];
  evidence: WorkflowRecord[];
}) {
  return (
    <>
      <label>
        Assigned experiment
        <select name="experiment_id" required defaultValue="">
          <option value="" disabled>
            Choose an experiment
          </option>
          {experiments.map((experiment) => (
            <option value={experiment.id} key={experiment.id}>
              {experiment.title} · v{experiment.version}
            </option>
          ))}
        </select>
      </label>
      <label>
        Outcome
        <select name="outcome" defaultValue="inconclusive">
          <option value="success">Success</option>
          <option value="failure">Failure</option>
          <option value="inconclusive">Inconclusive</option>
          <option value="stopped">Stopped</option>
        </select>
      </label>
      <label>
        Observations
        <textarea name="observations" required maxLength={50000} />
      </label>
      <label>
        Measured result
        <input name="metric_value" required maxLength={500} />
      </label>
      <EvidenceSelect rows={evidence} />
    </>
  );
}
export function UploadForm({
  projects,
  pid,
  owner = false,
}: {
  projects: Project[];
  pid?: string;
  owner?: boolean;
}) {
  const ready = useReady();
  const [msg, setMsg] = useState(""),
    [busy, setBusy] = useState(false);
  const router = useRouter();
  return (
    <form
      method="post"
      className="panel"
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        setBusy(true);
        setMsg("");
        try {
          const f = new FormData(e.currentTarget);
          const r = await fetch("/api/files", { method: "POST", body: f });
          const b = await r.json();
          if (!r.ok) throw Error(b.error);
          setMsg(
            "Uploaded to quarantine. File contents are not available to AI.",
          );
          router.refresh();
        } catch (e) {
          setMsg(
            e instanceof Error
              ? e.message
              : "Upload unavailable. Check the file list before retrying.",
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2>Upload a project file</h2>
      <label>
        Project
        <select
          disabled={!ready || busy}
          name="project_id"
          required
          defaultValue={pid}
        >
          {projects.map((p) => (
            <option value={p.id} key={p.id}>
              {p.code} · {p.name}
            </option>
          ))}
        </select>
      </label>
      {owner ? (
        <label>
          Who can see this file?
          <select
            name="visibility"
            defaultValue="owner_only"
            disabled={!ready || busy}
          >
            <option value="owner_only">Owner only (default)</option>
            <option value="project_shared">
              Currently assigned project members
            </option>
          </select>
        </label>
      ) : (
        <input type="hidden" name="visibility" value="project_shared" />
      )}
      <label>
        File
        <input disabled={!ready || busy} type="file" name="file" required />
      </label>
      <p className="subtle">
        Maximum 20 MB. Confirm the project and audience before uploading. New
        files stay in quarantine.
      </p>
      <button disabled={!ready || busy}>
        {busy ? "Uploading…" : "Upload file"}
      </button>
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
          <select disabled={!ready} name="project_id" required defaultValue="">
            <option value="" disabled>
              Select one project
            </option>
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
