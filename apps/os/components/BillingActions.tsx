"use client";

import { useEffect, useState } from "react";

type Plan = {
  id: string;
  name: string;
  amount_minor: string;
  currency: string;
  billing_interval: string;
  commercial_copy: string;
};

async function createSession(
  kind: "checkout" | "portal",
  planVersionId?: string,
) {
  const response = await fetch(`/api/billing-sessions/${kind}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      request_id: crypto.randomUUID(),
      ...(planVersionId ? { plan_version_id: planVersionId } : {}),
    }),
  });
  const result = (await response.json()) as {
    url?: string;
    error?: string;
  };
  if (!response.ok || !result.url)
    throw new Error(result.error || "Billing session unavailable");
  const target = new URL(result.url);
  const expected =
    kind === "checkout" ? "checkout.stripe.com" : "billing.stripe.com";
  if (target.protocol !== "https:" || target.hostname !== expected)
    throw new Error("Billing redirect unavailable");
  window.location.assign(target.href);
}

function price(plan: Plan) {
  const minor = BigInt(plan.amount_minor);
  const symbols: Record<string, string> = { GBP: "£", USD: "$", EUR: "€" };
  const amount = `${minor / 100n}.${String(minor % 100n).padStart(2, "0")}`;
  return `${symbols[plan.currency] || `${plan.currency} `}${amount}`;
}

export default function BillingActions({
  enabled,
  customerReady,
  plans,
}: {
  enabled: boolean;
  customerReady: boolean;
  plans: Plan[];
}) {
  const [hydrated, setHydrated] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  useEffect(() => setHydrated(true), []);

  async function open(kind: "checkout" | "portal", plan?: string) {
    setBusy(plan || kind);
    setMessage("");
    try {
      await createSession(kind, plan);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Billing session unavailable",
      );
      setBusy(null);
    }
  }

  return (
    <section className="panel" style={{ marginTop: 24 }}>
      <div className="record-top">
        <div>
          <p className="eyebrow">Subscription</p>
          <h2>Plans and billing</h2>
        </div>
        <span className={`badge${enabled ? "" : " amber"}`}>
          {enabled ? "Test billing available" : "Billing not connected"}
        </span>
      </div>
      <p>
        Packaged tools use a separate subscription. Custom implementation is
        quoted independently and is never included by subscribing.
      </p>
      <div className="record-list">
        {plans.map((plan) => (
          <article className="record" key={plan.id}>
            <div className="record-top">
              <h3>{plan.name}</h3>
              <strong>
                {price(plan)} / {plan.billing_interval.toLowerCase()}
              </strong>
            </div>
            <p>{plan.commercial_copy}</p>
            <button
              type="button"
              disabled={!hydrated || !enabled || !customerReady || !!busy}
              onClick={() => open("checkout", plan.id)}
            >
              {busy === plan.id ? "Opening secure checkout…" : "Choose plan"}
            </button>
          </article>
        ))}
        {!plans.length && (
          <div className="empty">
            No subscription plan has completed commercial approval.
          </div>
        )}
      </div>
      <div className="record-actions" style={{ marginTop: 16 }}>
        <button
          type="button"
          disabled={!hydrated || !enabled || !customerReady || !!busy}
          onClick={() => open("portal")}
        >
          {busy === "portal" ? "Opening billing portal…" : "Manage billing"}
        </button>
      </div>
      {!customerReady && (
        <p className="subtle">
          Billing becomes available after KXRA links this organization to its
          test billing customer record.
        </p>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
