"use client";
import { useEffect, useState } from "react";
import { ActionForm } from "./TeamActionForm";
type Pilot = {
  subscription: {
    mode: "FIXTURE" | "TEST_STRIPE";
    state: string;
    version: number;
    period_end: string;
    cancel_at_period_end: boolean;
  } | null;
  test_billing: {
    requests_available: boolean;
    bound: boolean;
    pending_binding?: boolean;
    recovery?: {
      request_id: string;
      include_setup: boolean;
      expired: boolean;
      state: string;
    } | null;
    reconciliation_required: boolean;
  };
  approved_catalogue: {
    offer_key: string;
    name: string;
    monthly_amount_minor: number;
    people: number;
  }[];
  seat_capacity: number;
  offer: {
    name?: string;
    offer_key: string;
    monthly_amount_minor: number;
    people: number;
  };
  seats_reserved: number;
  entitled: boolean;
  assigned: boolean;
  proposed_capacity: {
    rooms: { value: number };
    monthly_drafts: { value: number };
  };
};
export function WorkspacePilot({ local }: { local: boolean }) {
  const [data, setData] = useState<Pilot | null>(null),
    [notice, setNotice] = useState("Loading pilot preview…"),
    [version, setVersion] = useState(0);
  useEffect(() => {
    const c = new AbortController();
    setData(null);
    fetch("/api/team-space/pilot", { cache: "no-store", signal: c.signal })
      .then(async (r) => {
        const v = await r.json();
        if (!r.ok) throw Error(v.error || "Pilot unavailable");
        if (!c.signal.aborted) {
          setData(v);
          setNotice("");
        }
      })
      .catch((e) => {
        if (!c.signal.aborted)
          setNotice(e instanceof Error ? e.message : "Pilot unavailable");
      });
    return () => c.abort();
  }, [version]);
  const state = data?.subscription?.state;
  const actions = !state
    ? ["ACTIVATE"]
    : state === "CANCELLED" || state === "PENDING"
      ? ["ACTIVATE", "RECONCILE"]
      : state === "PAST_DUE"
        ? ["RECOVER", "CANCEL_NOW", "RECONCILE"]
        : state === "PAUSED"
          ? ["RESUME", "CANCEL_NOW", "RECONCILE"]
          : [
              ...(data?.subscription?.cancel_at_period_end
                ? []
                : ["RENEW", "CANCEL_AT_END"]),
              "PAST_DUE",
              "PAUSE",
              "CANCEL_NOW",
              "RECONCILE",
            ];
  return (
    <section className="panel" aria-label="Workspace pilot preview">
      <h2>
        {local
          ? "Workspace pilot · billing simulation"
          : "Workspace pilot · test billing"}
      </h2>
      <p>
        Approved monthly workspace catalogue: Starter £29 for one user, Team £79
        for up to five users, Business £199 for up to 15 users. Tax, AI usage,
        trial/refund and service terms remain unapproved. Existing legacy pilot
        assignments retain their original offer; no subscription is converted.
      </p>
      <p>
        {local
          ? "Local fixture simulation only. No payment provider, invoice, charge or checkout is activated. This does not establish a paid subscription."
          : "Isolated Stripe test-mode contracts only. Provider configuration and hosted acceptance are separate prerequisites; no live charge is enabled."}
        Existing tenants are not automatically assigned this pilot.
      </p>
      <p role="status">{notice}</p>
      {data && (
        <>
          <p>
            {data.assigned
              ? `${state} · Revision ${data.subscription!.version} · Period ends ${new Date(data.subscription!.period_end).toISOString()}${data.subscription!.cancel_at_period_end ? " · Cancellation scheduled at period end" : ""}`
              : data.test_billing.pending_binding
                ? "Pending provider checkout: no subscription or paid access established."
                : "Unassigned: existing workspace behaviour retained."}
          </p>
          <p>
            Reserved people/invitations: {data.seats_reserved} /{" "}
            {data.seat_capacity}.{" "}
            {data.assigned
              ? data.entitled
                ? "Pilot work enabled under the current recorded test period."
                : "Pilot new work disabled; existing history remains readable."
              : data.test_billing.pending_binding
                ? "New work is disabled while the checkout awaits an accepted subscription."
                : local
                  ? "Recorded plan seat enforcement starts only after explicit fixture activation."
                  : "Recorded plan seat enforcement starts with an accepted test subscription."}
          </p>
          <p>
            Unapproved capacity proposals: {data.proposed_capacity.rooms.value}{" "}
            rooms / {data.proposed_capacity.monthly_drafts.value} monthly
            drafts. Configurable internal proposals, not enforced or published
            entitlements. Existing safety limits continue to apply.
          </p>
          <p>
            Recorded offer: {data.offer.name || "Legacy workspace pilot"} · £
            {(data.offer.monthly_amount_minor / 100).toFixed(2)}
            /workspace/month. Checkout remains disabled.
          </p>
          {local && !data.assigned && !data.test_billing?.pending_binding && (
            <ActionForm
              path="/pilot/catalogue"
              title="Select local simulation plan"
              onSaved={() => setVersion((n) => n + 1)}
              build={(d, id) => ({
                request_id: id,
                offer_key: d.get("offer_key"),
              })}
            >
              <label>
                Approved workspace plan
                <select name="offer_key" required>
                  {data.approved_catalogue.map((p) => (
                    <option key={p.offer_key} value={p.offer_key}>
                      {p.name} · £{(p.monthly_amount_minor / 100).toFixed(2)}
                      /month · {p.people} users
                    </option>
                  ))}
                </select>
              </label>
              <p>
                Selection records a pending local fixture plan and reserves its
                seat limit. A separate simulated activation is required for
                work. No checkout, charge, AI credits or provider connection is
                created.
              </p>
            </ActionForm>
          )}
          {data.test_billing?.pending_binding && (
            <p className="notice">
              {data.test_billing.recovery?.expired
                ? "Earlier checkout expired. Operator reconciliation is required before any new attempt."
                : data.test_billing.recovery
                  ? "An earlier checkout request is retained on the server. A verified test checkout resumes that exact request after configuration is accepted; reloading never creates a new subscription."
                  : "The original checkout requester or an operator must resolve the pending request."}
            </p>
          )}
          {!local &&
            data.test_billing?.requests_available &&
            !data.test_billing.recovery?.expired && (
              <>
                <p>
                  {data.test_billing.reconciliation_required
                    ? "Conflicting event order: new work paused until reconciliation."
                    : "Configuration will be verified with the test provider before continuing."}
                </p>
                {(data.test_billing.bound
                  ? (["portal", "reconcile"] as const)
                  : (["checkout"] as const)
                ).map((kind) => (
                  <TestBillingRequest
                    key={
                      kind +
                      ":" +
                      (data.test_billing.recovery?.request_id || "new")
                    }
                    kind={kind}
                    recovery={
                      kind === "checkout" ? data.test_billing.recovery : null
                    }
                    onSaved={() => setVersion((n) => n + 1)}
                  />
                ))}
              </>
            )}
          {local &&
            !data.test_billing?.pending_binding &&
            data.subscription?.mode !== "TEST_STRIPE" &&
            actions.map((action) => (
              <ActionForm
                key={action}
                path="/pilot/events"
                title={`Simulate ${action}`}
                onSaved={() => setVersion((n) => n + 1)}
                build={(_d, id) => ({
                  request_id: id,
                  version: data.subscription?.version ?? 0,
                  action,
                })}
              >
                <p>
                  Record an idempotent synthetic lifecycle event. No real money
                  or provider request. Cancellation stops new drafts/conversions
                  and fences late draft publication; it does not delete history.
                </p>
              </ActionForm>
            ))}
        </>
      )}
    </section>
  );
}

function TestBillingRequest({
  kind,
  onSaved,
  recovery,
}: {
  recovery?: {
    request_id: string;
    include_setup: boolean;
    expired: boolean;
  } | null;
  kind: "checkout" | "portal" | "reconcile";
  onSaved: () => void;
}) {
  const [nonce, setNonce] = useState<string | null>(
      recovery?.request_id ?? null,
    ),
    [setup, setSetup] = useState(recovery?.include_setup ?? false),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        setBusy(true);
        setNotice("Checking reviewed test billing configuration…");
        const id = nonce || crypto.randomUUID();
        setNonce(id);
        try {
          const r = await fetch(`/api/team-space/pilot/billing/${kind}`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              request_id: id,
              ...(kind === "checkout" ? { include_setup: setup } : {}),
            }),
          });
          const result = await r.json();
          if (!r.ok)
            throw Error(
              result.error ||
                "Test billing request failed; retry the same request.",
            );
          if (kind === "reconcile") {
            setNotice("Test subscription snapshot recorded.");
            onSaved();
          } else {
            const u = new URL(result.url);
            if (
              u.protocol !== "https:" ||
              u.hostname !==
                (kind === "checkout"
                  ? "checkout.stripe.com"
                  : "billing.stripe.com")
            )
              throw Error("Invalid billing redirect");
            window.location.assign(u.href);
          }
        } catch (error) {
          setNotice(
            error instanceof Error ? error.message : "Test billing unavailable",
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      {kind === "checkout" && (
        <label>
          <input
            type="checkbox"
            checked={setup}
            disabled={!!nonce || busy}
            onChange={(e) => setSetup(e.target.checked)}
          />{" "}
          Include optional £199 one-time workflow onboarding in test checkout
        </label>
      )}
      <p>
        Test mode only. Retry keeps the same request. A return URL does not
        grant workspace access.
      </p>
      <button disabled={busy}>
        {busy
          ? "Checking…"
          : kind === "checkout"
            ? "Request verified test checkout"
            : kind === "portal"
              ? "Open test billing portal"
              : "Reconcile test subscription"}
      </button>
      <p role="status">{notice}</p>
    </form>
  );
}
