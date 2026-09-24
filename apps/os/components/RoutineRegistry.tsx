"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";

export type RoutineRow = {
  id: string;
  code: string;
  name: string;
  enabled: boolean;
  version_id: string;
  version: number;
  status: string;
  version_sha256: string;
  trigger_type: string;
  trigger_config: Record<string, unknown>;
  timezone: string;
  calendar_code: string | null;
  action_graph: Array<Record<string, unknown>>;
  scope_mode: string;
  maximum_attempts: number;
  lease_seconds: number;
  notification_policy: Record<string, unknown>;
  project_scopes: Array<{ id: string; code: string; name: string }>;
  run_count: number;
  last_run_state: string | null;
  last_run_at: string | null;
};

function useReady() {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  return ready;
}

function RoutineAction({
  endpoint,
  label,
  success,
  payload,
  children,
}: {
  endpoint: string;
  label: string;
  success: string;
  payload: (form: FormData) => unknown;
  children?: ReactNode;
}) {
  const ready = useReady();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload(new FormData(form))),
      });
      const result = await response.json();
      if (!response.ok)
        throw Error(result.error || "Routine action unavailable");
      setMessage(success);
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Routine action unavailable",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="create-form workspace-form" onSubmit={submit}>
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

export default function RoutineRegistry({
  routines,
}: {
  routines: RoutineRow[];
}) {
  return (
    <>
      <div className="notice warning">
        Trigger.dev and notification delivery are disconnected. Imported
        routines start draft and disabled. A local run can be queued only after
        exact owner approval and enablement; notification intents remain
        DISABLED / NOT_SENT.
      </div>
      <div className="card-grid">
        {routines.map((routine) => (
          <article
            className="panel"
            key={routine.id}
            id={`routine-${routine.id}`}
          >
            <p className="eyebrow">{routine.code}</p>
            <h2>{routine.name}</h2>
            <p>
              <span className="badge">{routine.status}</span>{" "}
              <span className="badge">
                {routine.enabled ? "ENABLED" : "DISABLED"}
              </span>
            </p>
            <dl className="detail-grid">
              <div>
                <dt>Trigger</dt>
                <dd>{routine.trigger_type}</dd>
              </div>
              <div>
                <dt>Timezone</dt>
                <dd>{routine.timezone}</dd>
              </div>
              <div>
                <dt>Scope</dt>
                <dd>
                  {routine.scope_mode}
                  {routine.project_scopes.length
                    ? ` · ${routine.project_scopes.map((item) => item.code).join(", ")}`
                    : ""}
                </dd>
              </div>
              <div>
                <dt>Recovery</dt>
                <dd>
                  {routine.maximum_attempts} attempts · {routine.lease_seconds}s
                  lease
                </dd>
              </div>
              <div>
                <dt>Runs</dt>
                <dd>
                  {routine.run_count} · {routine.last_run_state || "NONE"}
                </dd>
              </div>
              <div>
                <dt>Delivery</dt>
                <dd>
                  {String(routine.notification_policy.adapter || "DISABLED")}
                </dd>
              </div>
            </dl>
            <details>
              <summary>Exact version evidence</summary>
              <p className="mono">
                v{routine.version} · {routine.version_sha256}
              </p>
              <pre>{JSON.stringify(routine.action_graph, null, 2)}</pre>
            </details>
            {routine.status === "DRAFT" && (
              <details className="workspace-controls">
                <summary>Approve exact local contract</summary>
                <RoutineAction
                  endpoint={`/api/routines/versions/${routine.version_id}/approve`}
                  label="Approve exact version"
                  success="Routine version approved."
                  payload={(form) => ({
                    expected_sha256: routine.version_sha256,
                    note: form.get("note"),
                    request_id: crypto.randomUUID(),
                  })}
                >
                  <label>
                    Review note
                    <textarea
                      name="note"
                      required
                      minLength={3}
                      maxLength={3000}
                    />
                  </label>
                </RoutineAction>
              </details>
            )}
            {routine.status === "APPROVED" && (
              <>
                <RoutineAction
                  endpoint={`/api/routines/versions/${routine.version_id}/state`}
                  label={
                    routine.enabled ? "Disable routine" : "Enable local routine"
                  }
                  success={
                    routine.enabled
                      ? "Routine disabled."
                      : "Local routine enabled."
                  }
                  payload={() => ({
                    expected_sha256: routine.version_sha256,
                    enabled: !routine.enabled,
                    request_id: crypto.randomUUID(),
                  })}
                />
                {routine.enabled && routine.trigger_type !== "EVENT" && (
                  <details className="workspace-controls">
                    <summary>Plan one reviewed local slot</summary>
                    <RoutineAction
                      endpoint={`/api/routines/versions/${routine.version_id}/slots`}
                      label="Plan local slot"
                      success="Local routine slot planned."
                      payload={(form) => ({
                        local_date: form.get("local_date"),
                        project_id:
                          routine.scope_mode === "PROJECT"
                            ? form.get("project_id")
                            : null,
                        request_id: crypto.randomUUID(),
                      })}
                    >
                      <label>
                        Local calendar date
                        <input name="local_date" type="date" required />
                      </label>
                      {routine.scope_mode === "PROJECT" && (
                        <label>
                          Exact project
                          <select name="project_id" required>
                            <option value="">Select project</option>
                            {routine.project_scopes.map((project) => (
                              <option key={project.id} value={project.id}>
                                {project.code} · {project.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                    </RoutineAction>
                  </details>
                )}
              </>
            )}
          </article>
        ))}
      </div>
    </>
  );
}
