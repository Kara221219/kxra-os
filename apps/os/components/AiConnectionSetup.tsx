"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CustomerAiPolicy } from "../../../packages/workspace/customer-ai-policy";
import {
  aiSetupProviders,
  isAiAdmissionId,
  parseAiSetupStatus,
  type AiSetupStatus,
} from "../../../packages/admission/ai-setup-status";
const reasonText: Record<AiSetupStatus["reason"], string> = {
  CLEARED:
    "This reference has current review clearance. Re-enter the same key and details to save it; the server checks again.",
  AWAITING_PROVIDER_REVIEW:
    "This request is awaiting a provider/account review. No provider key has been stored for this request.",
  BUSINESS_REVIEW_REQUIRED:
    "Complete the business review before starting a new AI connection request. This reference cannot be activated.",
  BUSINESS_REVIEW_UNBOUND:
    "Business review is now available. This earlier reference cannot be rebound; start a new request.",
  BUSINESS_REVIEW_CHANGED:
    "Business review changed. This reference cannot reuse the earlier authority.",
  BUSINESS_PROVIDER_MISMATCH:
    "The business declaration covers a different provider. Complete the matching business review, then start a new connection request.",
  INTENT_EXPIRED:
    "This activation request expired. A new request needs its own current review.",
  SESSION_CHANGED:
    "The account security session changed. Start a new request; the old reference cannot be reused.",
  PROVIDER_REVIEW_BLOCKED:
    "This request is blocked. Contact KXRA; retrying does not grant permission.",
  REVIEW_WITHDRAWN:
    "Review was withdrawn. Contact KXRA before requesting another connection.",
  REVIEW_NOT_CURRENT:
    "Review is not current. Contact KXRA; there is no automatic renewal or regrant.",
  ACCOUNT_MODE_REVIEW_REQUIRED:
    "Provider account mode needs review. Contact KXRA before continuing.",
  SAVED:
    "The connection is recorded. Provider execution still depends on current access and configuration; saving is not provider acceptance.",
  SAVED_AUTHORITY_CHANGED:
    "A saved connection needs renewed authority. Do not resubmit this reference; use current connection controls or contact KXRA.",
};
export function AiConnectionSetup({
  aiPolicy,
  onSaved,
}: {
  aiPolicy: CustomerAiPolicy;
  onSaved: () => void;
}) {
  const [status, setStatus] = useState<AiSetupStatus | null>(null),
    [ready, setReady] = useState(false),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const request = useRef<AbortController | null>(null),
    manual = useRef<HTMLInputElement>(null),
    submitting = useRef(false);
  const load = useCallback(async (id?: string) => {
    request.current?.abort();
    const control = new AbortController();
    request.current = control;
    setLoading(true);
    setReady(false);
    setNotice("");
    try {
      const r = await fetch(
        "/api/ai-connection-admission" +
          (id ? "?id=" + encodeURIComponent(id) : ""),
        { cache: "no-store", signal: control.signal },
      );
      if (!r.ok) throw Error("UNAVAILABLE");
      const body = await r.json();
      if (
        !body ||
        typeof body !== "object" ||
        Object.keys(body).join(",") !== "admission"
      )
        throw Error("INVALID");
      const value =
        body.admission === null ? null : parseAiSetupStatus(body.admission);
      if (!control.signal.aborted) {
        setStatus(value);
        setReady(true);
      }
    } catch {
      if (!control.signal.aborted) {
        setStatus(null);
        setReady(false);
        setNotice(
          "Review status unavailable. Check your current workspace owner access and security, then try again.",
        );
      }
    } finally {
      if (!control.signal.aborted) setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
    return () => request.current?.abort();
  }, [load]);
  const canEnterKey =
    ready &&
    !loading &&
    (!status ||
      (status.state === "ELIGIBLE" &&
        status.next_action === "RESUBMIT_SAME_DETAILS"));
  return (
    <section aria-label="AI connection review">
      <h3>Connect or resume a reviewed AI account</h3>
      <p>
        Requests require current workspace owner and security checks. No browser
        state can approve a connection.
      </p>
      <button
        type="button"
        disabled={busy || loading}
        onClick={() => void load(status?.admission_id)}
      >
        {loading ? "Checking review…" : "Check review status"}
      </button>{" "}
      <button
        type="button"
        disabled={busy || loading}
        onClick={() => void load()}
      >
        Find my latest request
      </button>
      <label>
        Review reference (optional)
        <input ref={manual} maxLength={36} autoComplete="off" />
      </label>
      <button
        type="button"
        disabled={busy || loading}
        onClick={() => {
          const id = manual.current?.value.trim();
          if (!isAiAdmissionId(id)) {
            setNotice("Enter a valid review reference.");
            return;
          }
          void load(id);
        }}
      >
        Open review reference
      </button>
      <p role="status">{loading ? "Checking your recorded review…" : notice}</p>
      {status && (
        <div className="panel" style={{ overflowWrap: "anywhere" }}>
          <h4>
            {status.state === "ELIGIBLE"
              ? "Ready to resubmit"
              : status.state === "SAVED"
                ? "Connection recorded"
                : status.state === "NEW_INTENT_REQUIRED"
                  ? "New request required"
                  : status.state === "BLOCKED"
                    ? "Request blocked"
                    : "Review required"}
          </h4>
          <p>
            Review reference: <code>{status.admission_id}</code>
          </p>
          <p>
            {status.provider} · {status.model}
            {status.endpoint_id ? " · " + status.endpoint_id : ""}
          </p>
          <p>{reasonText[status.reason]}</p>
          {status.state !== "SAVED" && (
            <p>
              Initial activation deadline:{" "}
              {new Date(status.expires_at).toISOString()}. A saved connection
              does not expire merely because this activation deadline passes.
            </p>
          )}
          {status.next_action === "COMPLETE_BUSINESS_REVIEW" && (
            <a href="/billing">Complete business review</a>
          )}
          {status.next_action === "CONTACT_SUPPORT" && (
            <a href="mailto:info@kxra-group.com">Contact KXRA for review</a>
          )}
          {(status.next_action === "CREATE_NEW_INTENT" ||
            status.state === "SAVED") && (
            <>
              <p>
                A new request is not approval and cannot renew this reference.
              </p>
              <button
                type="button"
                disabled={busy || loading}
                onClick={() => {
                  request.current?.abort();
                  setStatus(null);
                  setNotice(
                    "Enter a new request. It requires its own current review.",
                  );
                }}
              >
                Start a new connection request
              </button>
            </>
          )}
        </div>
      )}
      {canEnterKey && (
        <form
          key={status?.admission_id || "new"}
          className="panel create-form"
          onSubmit={async (e) => {
            e.preventDefault();
            if (submitting.current || busy || loading || !canEnterKey) return;
            submitting.current = true;
            setBusy(true);
            setNotice("");
            const form = e.currentTarget,
              data = new FormData(form),
              key = form.elements.namedItem("key") as HTMLInputElement;
            try {
              const pending = fetch("/api/team-space/connections", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                  name: data.get("name"),
                  provider: status?.provider || data.get("provider"),
                  model: status?.model || data.get("model"),
                  endpoint_id:
                    status?.endpoint_id ?? data.get("endpoint_id") ?? "",
                  key: data.get("key"),
                  customer_billed_acknowledged:
                    data.get("customer_billed_acknowledged") === "on",
                  ...(status ? { admission_id: status.admission_id } : {}),
                }),
              });
              key.value = ""; // Never retain a submitted key in state, refs, browser storage or status.
              const r = await pending,
                body = await r.json();
              if (
                r.status === 409 &&
                body?.code === "AI_CONNECTION_REVIEW_REQUIRED"
              ) {
                setStatus(parseAiSetupStatus(body.admission));
                setNotice(
                  "Review response recorded. Follow the next step shown below.",
                );
              } else if (r.ok && isAiAdmissionId(body?.id)) {
                setNotice(
                  "Connection saved. Check its current state before use.",
                );
                onSaved();
                await load(body.id);
              } else throw Error("UNAVAILABLE");
            } catch {
              setReady(false);
              setStatus(null);
              setNotice(
                "Connection was not confirmed. Check the recorded review before trying again.",
              );
            } finally {
              key.value = "";
              submitting.current = false;
              setBusy(false);
            }
          }}
        >
          <h4>
            {status
              ? "Resubmit the exact reviewed connection"
              : "Request a model connection"}
          </h4>
          <label>
            Connection name
            <input name="name" required maxLength={120} />
          </label>
          <label>
            Provider
            <select
              name="provider"
              defaultValue={status?.provider || "OPENAI"}
              disabled={Boolean(status)}
            >
              {aiSetupProviders.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </label>
          <label>
            Model ID
            <input
              name="model"
              required
              maxLength={160}
              defaultValue={status?.model || ""}
              readOnly={Boolean(status)}
            />
          </label>
          <label>
            Custom endpoint name (compatible providers only)
            <input
              name="endpoint_id"
              maxLength={80}
              defaultValue={status?.endpoint_id || ""}
              readOnly={Boolean(status)}
            />
          </label>
          <p id="ai-setup-key-handling">{aiPolicy.keyHandling}</p>
          <label>
            API key
            <input
              name="key"
              type="password"
              required
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              aria-describedby="ai-setup-key-handling"
            />
          </label>
          <label>
            <input
              type="checkbox"
              name="customer_billed_acknowledged"
              required
            />
            {aiPolicy.acknowledgement}
          </label>
          <p>
            Re-enter the same key when resuming. This form does not save it in
            browser storage. The server rechecks current review before storing
            any encrypted key.
          </p>
          <button type="submit" disabled={busy || loading}>
            {busy
              ? "Checking…"
              : status
                ? "Resubmit reviewed connection"
                : "Request connection review"}
          </button>
        </form>
      )}
    </section>
  );
}
