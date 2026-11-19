"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { approvedCatalogue } from "../../../packages/workspace/approved-catalogue";
import { customerAiPolicy } from "../../../packages/workspace/customer-ai-policy";
import { openBillingResult } from "../../../packages/workspace/billing-navigation";
import {
  liveEntryStatus,
  type LiveEntryStatus,
} from "../../../packages/authz/live-billing-entry-contract";

import {
  billingEntryRequestTimeoutMs,
  billingStatusConfirmsRequest,
  type BillingPendingRequest as Pending,
} from "../../../packages/workspace/billing-entry-recovery";

type ClientOperation = { controller: AbortController; timer: number };
export default function LiveBillingEntry({
  initial,
  checkoutResultAvailable = false,
  portalAvailable = false,
}: {
  initial: LiveEntryStatus;
  checkoutResultAvailable?: boolean;
  portalAvailable?: boolean;
}) {
  const [status, setStatus] = useState(initial);
  const [offer, setOffer] = useState<string>(
    initial.offer_key || "KXRA_STARTER_V1",
  );
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [message, setMessage] = useState("");
  const active = useRef<ClientOperation | null>(null);

  useEffect(
    () => () => {
      const operation = active.current;
      if (operation) {
        active.current = null;
        window.clearTimeout(operation.timer);
        operation.controller.abort();
      }
    },
    [],
  );

  function begin() {
    if (submitting.current) return null;
    submitting.current = true;
    setBusy(true);
    const controller = new AbortController();
    const operation = {
      controller,
      timer: window.setTimeout(
        () => controller.abort(),
        billingEntryRequestTimeoutMs,
      ),
    };
    active.current = operation;
    return operation;
  }
  function current(operation: ClientOperation) {
    return active.current === operation && !operation.controller.signal.aborted;
  }
  function finish(operation: ClientOperation) {
    window.clearTimeout(operation.timer);
    if (active.current !== operation) return;
    active.current = null;
    submitting.current = false;
    setBusy(false);
  }

  async function refresh(operation: ClientOperation) {
    const response = await fetch("/api/live-billing", {
      cache: "no-store",
      signal: operation.controller.signal,
      redirect: "error",
    });
    if (!response.ok)
      throw Error(
        "Status unavailable. Your original request must be reconciled before a replacement.",
      );
    const next = liveEntryStatus.parse(await response.json());
    if (!current(operation)) throw Error("BILLING_REQUEST_NO_LONGER_CURRENT");
    setStatus(next);
    setPending((original) =>
      original && billingStatusConfirmsRequest(original, next)
        ? null
        : original,
    );
    if (next.offer_key) setOffer(next.offer_key);
  }
  async function record(action: Pending["action"]) {
    if (action === "RECONCILE") return;
    if (action === "PORTAL" && !portalAvailable) return;
    const operation = begin();
    if (!operation) return;
    // On uncertain transport, retry this exact operation ID; never manufacture success.
    const request = pending || {
      action,
      request_id:
        action === "PORTAL" &&
        status.kind === "PORTAL" &&
        status.request_state === "REQUESTED" &&
        status.request_id
          ? status.request_id
          : crypto.randomUUID(),
      offer_key: status.offer_key || offer,
    };
    setPending(request);
    setMessage("");
    try {
      const portal = request.action === "PORTAL";
      const response = await fetch(
        portal ? "/api/live-billing/portal" : "/api/live-billing",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(
            portal
              ? { request_id: request.request_id, offer_key: request.offer_key }
              : request,
          ),
          signal: operation.controller.signal,
        },
      );
      if (!response.ok)
        throw Error(
          "Request was not confirmed. Check your MFA, agreements and current billing state; refresh status before any replacement.",
        );
      const value = await response.json();
      if (!current(operation)) throw Error("BILLING_REQUEST_NO_LONGER_CURRENT");
      if (portal) {
        openBillingResult(value, request.request_id, "PORTAL", (url) =>
          window.location.assign(url),
        );
        setPending(null);
        setMessage("Opening your secure subscription settings.");
        return;
      }
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
        "Your request was recorded. Refresh status to continue; payment has not been confirmed.",
      );
      await refresh(operation);
      setPending(null);
    } catch {
      if (active.current === operation)
        setMessage(
          "We couldn’t confirm this request. Refresh status before trying again, and check your account security and agreements.",
        );
    } finally {
      finish(operation);
    }
  }
  async function continueCheckout() {
    if (
      !checkoutResultAvailable ||
      submitting.current ||
      !status.request_id ||
      status.kind !== "CHECKOUT" ||
      status.request_state !== "CONSUMED"
    )
      return;
    const operation = begin();
    if (!operation) return;
    setMessage("");
    const requestId = status.request_id;
    try {
      const response = await fetch("/api/live-billing/result", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ request_id: requestId }),
        cache: "no-store",
        signal: operation.controller.signal,
      });
      if (!response.ok)
        throw Error(
          "Payment is not ready to open. Refresh status and check your account security and agreements.",
        );
      const value = await response.json();
      if (!current(operation)) throw Error("BILLING_REQUEST_NO_LONGER_CURRENT");
      openBillingResult(value, requestId, "CHECKOUT", (url) =>
        window.location.assign(url),
      );
    } catch {
      if (active.current === operation)
        setMessage(
          "Payment is not ready to open. Refresh status and check your account security and agreements.",
        );
    } finally {
      finish(operation);
    }
  }
  async function refreshStatus() {
    const operation = begin();
    if (!operation) return;
    setMessage("");
    try {
      await refresh(operation);
    } catch {
      if (active.current === operation)
        setMessage(
          "Status unavailable; keep the original request for reconciliation.",
        );
    } finally {
      finish(operation);
    }
  }
  return (
    <section aria-label="Workspace billing">
      <p>
        Choose a monthly workspace plan. We’ll confirm your subscription after
        payment is processed.
      </p>
      <p>{customerAiPolicy.billing}</p>
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
        Status:{" "}
        {
          {
            FRESH: "Choose a plan",
            DISABLED: "Payment setup paused",
            CUSTOMER_PENDING: "Setting up billing",
            BOUND: "Billing profile ready",
            REQUEST_PENDING: "Preparing your request",
            REVIEW_REQUIRED: "Needs review",
          }[status.state]
        }
        {status.request_state
          ? ` · ${status.request_state.replaceAll("_", " ")}`
          : ""}
      </p>
      {status.request_id && (
        <details>
          <summary>Request reference</summary>
          <code>{status.request_id}</code>
        </details>
      )}
      <div>
        {status.available_actions
          .filter((action) => action !== "RECONCILE")
          .map((action) => (
            <button
              key={action}
              disabled={
                busy ||
                Boolean(pending) ||
                (action === "PORTAL" && !portalAvailable)
              }
              onClick={() => void record(action)}
            >
              {action === "CUSTOMER"
                ? "Set up billing"
                : action === "CHECKOUT"
                  ? "Prepare payment"
                  : "Manage subscription"}
            </button>
          ))}
        {checkoutResultAvailable &&
          status.kind === "CHECKOUT" &&
          status.request_state === "CONSUMED" && (
            <button
              disabled={busy || Boolean(pending)}
              onClick={() => void continueCheckout()}
            >
              Continue to secure payment
            </button>
          )}
        {portalAvailable &&
          status.kind === "PORTAL" &&
          status.request_state === "REQUESTED" &&
          !status.available_actions.includes("PORTAL") && (
            <button
              disabled={busy || Boolean(pending)}
              onClick={() => void record("PORTAL")}
            >
              Continue subscription request
            </button>
          )}
        {pending && (
          <button disabled={busy} onClick={() => void record(pending.action)}>
            Retry original request
          </button>
        )}
        <button disabled={busy} onClick={() => void refreshStatus()}>
          Refresh status
        </button>
      </div>
      {status.state === "DISABLED" && <p>Payment setup is currently paused.</p>}
      {status.state === "REVIEW_REQUIRED" && (
        <p>
          Your billing request needs review. Please contact support before
          starting another request.
        </p>
      )}
      <p>
        <Link href="/os/profile">Review account security</Link> ·{" "}
        <Link href="/os">Return to workspace</Link>
      </p>
      <p role="status" aria-live="polite">
        {message}
      </p>
    </section>
  );
}
