"use client";

import React, { useRef, useState } from "react";
import { approvedCatalogue } from "../../../packages/workspace/approved-catalogue";
import {
  liveEntryStatus,
  type LiveEntryStatus,
} from "../../../packages/authz/live-billing-entry-contract";

type Pending = {
  action: "CUSTOMER" | "CHECKOUT" | "PORTAL" | "RECONCILE";
  request_id: string;
  offer_key: string;
};
export default function LiveBillingEntry({
  initial,
}: {
  initial: LiveEntryStatus;
}) {
  const [status, setStatus] = useState(initial);
  const [offer, setOffer] = useState<string>(
    initial.offer_key || "KXRA_STARTER_V1",
  );
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [message, setMessage] = useState("");

  async function refresh() {
    const response = await fetch("/api/live-billing", { cache: "no-store" });
    if (!response.ok)
      throw Error(
        "Status unavailable. Your original request must be reconciled before a replacement.",
      );
    const next = liveEntryStatus.parse(await response.json());
    setStatus(next);
    if (next.offer_key) setOffer(next.offer_key);
  }
  async function record(action: Pending["action"]) {
    if (submitting.current) return;
    submitting.current = true;
    // On uncertain transport, retry this exact operation ID; never manufacture success.
    const request = pending || {
      action,
      request_id: crypto.randomUUID(),
      offer_key: status.offer_key || offer,
    };
    setPending(request);
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/live-billing", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request),
      });
      if (!response.ok)
        throw Error(
          "Request was not confirmed. Check your MFA, agreements and current billing state; refresh status before any replacement.",
        );
      const value = await response.json();
      if (
        !["QUEUED", "RECORDED"].includes(value.state) ||
        value.action !== request.action ||
        value.request_id !== request.request_id ||
        value.dispatch_ready !== false ||
        value.entitlement_authority !== false
      )
        throw Error(
          "Response was not verified. No payment or access change is confirmed.",
        );
      setMessage(
        "Request recorded. Provider dispatch is not available; no payment, redirect or access change is confirmed.",
      );
      await refresh();
      setPending(null);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Request unavailable",
      );
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  return (
    <section aria-label="Workspace billing">
      <p>
        These are the approved monthly workspace prices. Provider dispatch is
        unavailable. Recording a request does not take payment or grant access.
      </p>
      <label>
        Workspace plan{" "}
        <select
          value={offer}
          disabled={busy || Boolean(status.offer_key) || Boolean(pending)}
          onChange={(event) => setOffer(event.target.value)}
        >
          {approvedCatalogue.map((plan) => (
            <option key={plan.offer_key} value={plan.offer_key}>
              {plan.name} — £{plan.monthly_amount_minor / 100} GBP per month ·{" "}
              {plan.people === 1 ? "1 user" : `up to ${plan.people} users`}
            </option>
          ))}
        </select>
      </label>
      <p>
        Status: {status.state.replaceAll("_", " ")}
        {status.request_state
          ? ` · ${status.request_state.replaceAll("_", " ")}`
          : ""}
      </p>
      {status.request_id && (
        <p>
          Original request: <code>{status.request_id}</code>. Refresh status
          after returning; do not create a replacement for an unresolved
          request.
        </p>
      )}
      <div>
        {status.available_actions.map((action) => (
          <button
            key={action}
            disabled={busy || Boolean(pending)}
            onClick={() => void record(action)}
          >
            Record {action.toLowerCase()} request
          </button>
        ))}
        {pending && (
          <button disabled={busy} onClick={() => void record(pending.action)}>
            Retry original request
          </button>
        )}
        <button
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void refresh()
              .catch(() =>
                setMessage(
                  "Status unavailable; keep the original request for reconciliation.",
                ),
              )
              .finally(() => setBusy(false));
          }}
        >
          Refresh status
        </button>
      </div>
      {status.state === "DISABLED" && <p>Live billing remains disabled.</p>}
      {status.state === "REVIEW_REQUIRED" && (
        <p>
          Billing requires operator review. Existing customer records will not
          be converted.
        </p>
      )}
      <p role="status" aria-live="polite">
        {message}
      </p>
    </section>
  );
}
