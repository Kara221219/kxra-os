"use client";
import React, { useState } from "react";
import { BUSINESS_DECLARATION_VERSION } from "../../../packages/admission/constants";
export default function BusinessAdmission() {
  const [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  return (
    <section className="panel">
      <h1>Business details and AI costs</h1>
      <p>
        KXRA is for business customers. Applications are welcome worldwide.
        Availability depends on applicable restrictions, payment support, your
        selected AI provider and location review. Submitting these details does
        not enable payment.
      </p>
      <p>
        Connect an AI-provider account you are authorised to use. You pay that
        provider directly for AI usage. Your KXRA workspace subscription does
        not include AI-provider credits.
      </p>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy) return;
          setBusy(true);
          setNotice("");
          const data = new FormData(event.currentTarget);
          try {
            const response = await fetch("/api/business-admission", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                legal_name: data.get("legal_name"),
                country: data.get("country"),
                region: data.get("region"),
                provider: data.get("provider"),
                business_use: data.get("business_use") === "on",
                authorised: data.get("authorised") === "on",
                provider_costs: data.get("provider_costs") === "on",
                declaration_version: BUSINESS_DECLARATION_VERSION,
              }),
            });
            const result = await response.json();
            if (!response.ok)
              throw Error(result.error || "Unable to save business details");
            setNotice(
              result.state === "ELIGIBLE"
                ? "Business review is current. Checkout performs its own current eligibility check."
                : result.state === "BLOCKED"
                  ? "Payment is unavailable for this application. Contact info@kxra-group.com."
                  : "Business details saved. Review is required before payment. Contact info@kxra-group.com.",
            );
          } catch (error) {
            setNotice(
              error instanceof Error ? error.message : "Unable to continue",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Business legal name
          <input
            name="legal_name"
            autoComplete="organization"
            minLength={2}
            maxLength={160}
            required
          />
        </label>
        <label>
          Business country or territory (two-letter code)
          <input
            name="country"
            autoComplete="country"
            minLength={2}
            maxLength={2}
            placeholder="GB"
            required
          />
        </label>
        <label>
          Business state, province or region
          <input
            name="region"
            autoComplete="address-level1"
            maxLength={120}
            required
          />
        </label>
        <label>
          AI provider you intend to connect
          <input name="provider" maxLength={80} required />
        </label>
        <p>
          A provider name is a request for review, not confirmation that the
          provider is enabled. Do not enter API keys or sensitive personal
          information here.
        </p>
        <label>
          <input type="checkbox" name="business_use" required /> I am applying
          for business use.
        </label>
        <label>
          <input type="checkbox" name="authorised" required /> I am authorised
          to act for this business.
        </label>
        <label>
          <input type="checkbox" name="provider_costs" required /> I understand
          that I connect and pay for my own AI-provider account and usage.
        </label>
        <button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Submit business details for review"}
        </button>
      </form>
      <p role="status">{notice}</p>
      <a href="/billing">Continue to workspace billing</a>
    </section>
  );
}
