"use client";

import { useEffect, useState, type FormEvent } from "react";

export type CustomerServiceEvent = {
  id: string;
  event_type: string;
  from_state: string | null;
  to_state: string;
  customer_message: string;
  request_version: number;
  created_at: string;
};

export type CustomerServiceRequest = {
  id: string;
  request_type: string;
  subject: string;
  description: string;
  related_subscription_id: string | null;
  state: string;
  request_hash: string;
  version: number;
  submitted_at: string;
  updated_at: string;
  closed_at: string | null;
  events: CustomerServiceEvent[];
  internal_notes: {
    id: string;
    note: string;
    evidence_reference: string | null;
    created_at: string;
  }[];
};

type Subscription = {
  id: string;
  state: string;
  plan_name: string;
  current_period_end: string | null;
};

const labels: Record<string, string> = {
  SUPPORT: "Support",
  SUBSCRIPTION_CANCELLATION: "Subscription cancellation",
  SUBSCRIPTION_WITHDRAWAL: "Subscription withdrawal",
  DATA_ACCESS: "Data access request",
  DATA_ERASURE: "Data erasure request",
  DATA_RECTIFICATION: "Data correction request",
};

function useHydrated() {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return hydrated;
}

async function post(path: string, payload: unknown) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Action unavailable");
  return result;
}

function ActionForm({
  request,
  action,
  title,
  ownerState,
}: {
  request: CustomerServiceRequest;
  action: "reply" | "cancel" | "transition";
  title: string;
  ownerState?: string;
}) {
  const hydrated = useHydrated();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setStatus("");
    const data = new FormData(event.currentTarget);
    try {
      await post(`/api/customer-service/${request.id}/${action}`, {
        request_hash: request.request_hash,
        expected_version: request.version,
        request_id: crypto.randomUUID(),
        ...(ownerState ? { next_state: ownerState } : {}),
        message: data.get("message"),
      });
      window.location.reload();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Action unavailable");
      setBusy(false);
    }
  }
  return (
    <form className="compact-form" onSubmit={submit}>
      <label>
        {title}
        <textarea
          name="message"
          required
          minLength={1}
          maxLength={10000}
          rows={3}
        />
      </label>
      <button disabled={!hydrated || busy}>
        {busy ? "Recording…" : title}
      </button>
      {status && <p role="status">{status}</p>}
    </form>
  );
}

function InternalNoteForm({ request }: { request: CustomerServiceRequest }) {
  const hydrated = useHydrated();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setStatus("");
    const data = new FormData(event.currentTarget);
    try {
      await post(`/api/customer-service/${request.id}/notes`, {
        request_id: crypto.randomUUID(),
        note: data.get("note"),
        evidence_reference: data.get("evidence_reference") || null,
      });
      window.location.reload();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Note unavailable");
      setBusy(false);
    }
  }
  return (
    <form className="compact-form" onSubmit={submit}>
      <label>
        Internal note
        <textarea
          name="note"
          required
          minLength={3}
          maxLength={20000}
          rows={3}
        />
      </label>
      <label>
        Evidence reference (optional)
        <input name="evidence_reference" minLength={3} maxLength={500} />
      </label>
      <button disabled={!hydrated || busy}>
        {busy ? "Recording…" : "Add private note"}
      </button>
      {status && <p role="status">{status}</p>}
    </form>
  );
}

export default function CustomerService({
  requests,
  subscriptions,
  canManage,
}: {
  requests: CustomerServiceRequest[];
  subscriptions: Subscription[];
  canManage: boolean;
}) {
  const hydrated = useHydrated();
  const [kind, setKind] = useState("SUPPORT");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const subscriptionRequired = kind.startsWith("SUBSCRIPTION_");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setStatus("");
    const data = new FormData(event.currentTarget);
    try {
      await post("/api/customer-service", {
        request_type: kind,
        subject: data.get("subject"),
        description: data.get("description"),
        related_subscription_id: subscriptionRequired
          ? data.get("related_subscription_id")
          : null,
        request_id: crypto.randomUUID(),
      });
      window.location.reload();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Request unavailable");
      setBusy(false);
    }
  }

  return (
    <>
      <section className="panel">
        <h2>Open a private request</h2>
        <p>
          Use this path for support, subscription cancellation or withdrawal,
          and personal data rights. Submission records the request; it does not
          itself cancel billing, erase data, or confirm a legal outcome.
        </p>
        <form className="form-grid" onSubmit={submit}>
          <label>
            Request type
            <select
              name="request_type"
              value={kind}
              onChange={(event) => setKind(event.target.value)}
            >
              {Object.entries(labels).map(([value, label]) => (
                <option value={value} key={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          {subscriptionRequired && (
            <label>
              Subscription
              <select name="related_subscription_id" required defaultValue="">
                <option value="" disabled>
                  Select a subscription
                </option>
                {subscriptions.map((subscription) => (
                  <option value={subscription.id} key={subscription.id}>
                    {subscription.plan_name} · {subscription.state}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            Subject
            <input name="subject" required minLength={3} maxLength={240} />
          </label>
          <label>
            Details
            <textarea
              name="description"
              required
              minLength={3}
              maxLength={20000}
              rows={5}
            />
          </label>
          <button
            disabled={
              !hydrated ||
              busy ||
              (subscriptionRequired && !subscriptions.length)
            }
          >
            {busy ? "Submitting…" : "Submit private request"}
          </button>
          {subscriptionRequired && !subscriptions.length && (
            <p role="status">
              No cancellable subscription is visible in this organization.
            </p>
          )}
          {status && <p role="status">{status}</p>}
        </form>
      </section>

      <section className="record-list customer-service-list">
        {requests.map((request) => (
          <article className="record" key={request.id}>
            <div className="record-top">
              <div>
                <p className="eyebrow">
                  {labels[request.request_type] || request.request_type}
                </p>
                <h2>{request.subject}</h2>
              </div>
              <span className="badge">
                {request.state.replaceAll("_", " ")}
              </span>
            </div>
            <p>{request.description}</p>
            <footer>
              <span>Version {request.version}</span>
              <span>
                Submitted{" "}
                {new Date(request.submitted_at).toLocaleString("en-GB")}
              </span>
              <span>Reference {request.id.slice(0, 8)}</span>
            </footer>
            <details>
              <summary>Request history ({request.events.length})</summary>
              {request.events.map((event) => (
                <div className="list-item" key={event.id}>
                  <strong>{event.event_type.replaceAll("_", " ")}</strong>
                  <p>{event.customer_message}</p>
                  <small>
                    {new Date(event.created_at).toLocaleString("en-GB")} ·
                    version {event.request_version}
                  </small>
                </div>
              ))}
            </details>
            {!canManage &&
              ["ACKNOWLEDGED", "IN_PROGRESS", "AWAITING_CUSTOMER"].includes(
                request.state,
              ) && (
                <details>
                  <summary>Reply to KXRA</summary>
                  <ActionForm
                    request={request}
                    action="reply"
                    title="Send reply"
                  />
                </details>
              )}
            {!canManage &&
              ["SUBMITTED", "ACKNOWLEDGED", "AWAITING_CUSTOMER"].includes(
                request.state,
              ) && (
                <details>
                  <summary>Cancel this request</summary>
                  <ActionForm
                    request={request}
                    action="cancel"
                    title="Cancel request"
                  />
                </details>
              )}
            {canManage && !["CLOSED", "CANCELLED"].includes(request.state) && (
              <details>
                <summary>Owner handling controls</summary>
                <div className="service-actions">
                  {request.state === "SUBMITTED" && (
                    <ActionForm
                      request={request}
                      action="transition"
                      ownerState="ACKNOWLEDGED"
                      title="Acknowledge"
                    />
                  )}
                  {["ACKNOWLEDGED", "AWAITING_CUSTOMER", "RESOLVED"].includes(
                    request.state,
                  ) && (
                    <ActionForm
                      request={request}
                      action="transition"
                      ownerState="IN_PROGRESS"
                      title="Move to in progress"
                    />
                  )}
                  {["ACKNOWLEDGED", "IN_PROGRESS"].includes(request.state) && (
                    <ActionForm
                      request={request}
                      action="transition"
                      ownerState="AWAITING_CUSTOMER"
                      title="Request customer information"
                    />
                  )}
                  {request.state === "IN_PROGRESS" && (
                    <ActionForm
                      request={request}
                      action="transition"
                      ownerState="RESOLVED"
                      title="Resolve"
                    />
                  )}
                  {request.state === "RESOLVED" && (
                    <ActionForm
                      request={request}
                      action="transition"
                      ownerState="CLOSED"
                      title="Close"
                    />
                  )}
                  <InternalNoteForm request={request} />
                </div>
              </details>
            )}
            {canManage && request.internal_notes.length > 0 && (
              <details>
                <summary>
                  Private handling notes ({request.internal_notes.length})
                </summary>
                {request.internal_notes.map((note) => (
                  <div className="list-item" key={note.id}>
                    <p>{note.note}</p>
                    {note.evidence_reference && (
                      <small>Evidence: {note.evidence_reference}</small>
                    )}
                  </div>
                ))}
              </details>
            )}
          </article>
        ))}
        {!requests.length && (
          <div className="empty">
            No support or privacy requests are visible.
          </div>
        )}
      </section>
    </>
  );
}
