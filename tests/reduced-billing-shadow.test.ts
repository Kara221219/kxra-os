import assert from "node:assert/strict";
import test from "node:test";
import { runPaidRefreshOnce } from "../packages/integrations/live-paid-refresh-worker";
import {
  observeReducedBillingShadow,
  runReducedBillingShadowOnce,
  validateReducedShadowConsent,
  createReducedShadowSnapshot,
} from "../packages/integrations/reduced-billing-shadow";
import { reducedBillingCostAndRisk } from "../packages/integrations/reduced-billing-cost";
import { paidRefreshProviderFixture } from "./support/paid-refresh-provider-fixture";

async function setup(mode: "LIVE" | "STAGING_SANDBOX" = "STAGING_SANDBOX") {
  const f = paidRefreshProviderFixture(mode);
  await runPaidRefreshOnce(f.options);
  assert.equal(f.calls.length, 20);
  const proof = f.committed[0],
    claim = {
      subject: f.subject,
      consent: {
        source_job_id: proof.reconciliation_id,
        source_sha256: proof.evidence_sha256,
        proof,
      },
    };
  f.calls.length = 0;
  const options = {
    ...f.options,
    enabled: true,
    claim,
    stillCurrent: async () => true,
  };
  return { f, claim, options };
}
for (const mode of ["LIVE", "STAGING_SANDBOX"] as const)
  test(`${mode} reduced shadow executes actual seven-GET graph using immutable strict consent; never commits access`, async () => {
    const { f, options } = await setup(mode);
    const result = await observeReducedBillingShadow(options);
    assert.equal(result.outcome, "COLLECTED");
    assert.equal(result.reads, 7);
    assert.equal(f.calls.length, 7);
    assert.equal(new Set(f.calls).size, 7);
    assert.ok(!f.calls.some((p) => p.includes("checkout/sessions")));
    assert.equal(result.entitlement_authority, false);
    assert.equal(result.observation_model, "REDUCED_SHADOW_V1");
    assert.equal(
      f.committed.length,
      1,
      "Only original strict setup may commit paid authority",
    );
  });
test("default-off denies before configuration, SQL, or provider access", async () => {
  await assert.rejects(
    runReducedBillingShadowOnce({
      enabled: false,
      query: async () => assert.fail("SQL"),
      transport: async () => assert.fail("provider"),
    } as any),
    /DISABLED/,
  );
  await assert.rejects(
    observeReducedBillingShadow({ enabled: false } as any),
    /DISABLED/,
  );
});
test("missing, tampered, foreign, wrong-mode or changed-terms consent cannot bootstrap unknown purchases", async () => {
  const { f, claim } = await setup();
  for (const bad of [
    null,
    { ...claim, consent: null },
    { ...claim, consent: { ...claim.consent, source_sha256: "0".repeat(64) } },
    { ...claim, subject: { ...claim.subject, customer_id: "cus_foreign123" } },
    { ...claim, subject: { ...claim.subject, org_id: crypto.randomUUID() } },
    {
      ...claim,
      subject: {
        ...claim.subject,
        policy: {
          ...claim.subject.policy,
          terms_review_sha256: "b".repeat(64),
        },
      },
    },
    {
      ...claim,
      consent: {
        ...claim.consent,
        proof: { ...claim.consent.proof, consent_state: "UNVERIFIED" },
      },
    },
  ])
    assert.throws(() => validateReducedShadowConsent(bad, "STAGING_SANDBOX"));
  assert.throws(() => validateReducedShadowConsent(claim, "LIVE"));
  assert.equal(f.calls.length, 0);
});
test("current generation loss during a provider read prevents a positive shadow observation", async () => {
  const { f, options } = await setup();
  let current = true;
  const result = await observeReducedBillingShadow({
    ...options,
    stillCurrent: async () => current,
    transport: async (url, init) => {
      const response = await f.options.transport(url, init);
      current = false;
      return response;
    },
  });
  assert.equal(result.outcome, "UNVERIFIED");
  assert.equal(result.reads, 1);
});
test("refund/dispute/current inactive state remain restrictive", async () => {
  for (const state of ["refund", "dispute", "inactive"]) {
    const { f, options } = await setup();
    if (state === "refund") {
      f.charge.refunded = true;
      f.charge.amount_refunded = f.charge.amount_captured;
    }
    if (state === "dispute") f.charge.disputed = true;
    if (state === "inactive") f.sub.status = "canceled";
    const result = await observeReducedBillingShadow(options);
    assert.equal(result.outcome, "DENIED");
    assert.equal(result.entitlement_authority, false);
  }
});
test("429 uses bounded Retry-After without in-process retry, raw body or credential output", async () => {
  const { f, options } = await setup();
  const result = await observeReducedBillingShadow({
    ...options,
    transport: async () =>
      new Response("SYNTHETIC_PRIVATE_PROVIDER_BODY", {
        status: 429,
        headers: { "retry-after": "999999" },
      }),
  });
  assert.equal(result.outcome, "UNVERIFIED");
  assert.equal(result.reads, 1);
  assert.equal(result.retry_after_seconds, 3600);
  assert.doesNotMatch(
    JSON.stringify(result),
    /SYNTHETIC_PRIVATE|sk_test|Authorization/,
  );
  assert.equal(f.committed.length, 1);
});
test("known limitation: an unreported provider change after its one observation is not an atomic snapshot", async () => {
  const { f, options } = await setup();
  let chargeReads = 0;
  const result = await observeReducedBillingShadow({
    ...options,
    transport: async (url, init) => {
      const response = await f.options.transport(url, init);
      if (url.includes("/charges/")) {
        chargeReads++;
        f.charge.refunded = true;
        f.charge.amount_refunded = f.charge.amount_captured;
      }
      return response;
    },
  });
  assert.equal(result.outcome, "COLLECTED");
  assert.equal(chargeReads, 1);
  assert.equal(
    result.entitlement_authority,
    false,
    "Explicit financial-age policy and SQL integration are still required",
  );
});
test("tiny chunks and oversized backing views are bounded in the shadow transport", async () => {
  const input = {
    secretKey: "synthetic",
    apiVersion: "2025-07-30.basil",
    stillCurrent: async () => true,
  };
  let cancelled = false;
  const snapshot = createReducedShadowSnapshot({
    ...input,
    transport: async () =>
      new Response(
        new ReadableStream({
          pull(c) {
            c.enqueue(new Uint8Array([32]));
          },
          cancel() {
            cancelled = true;
          },
        }),
      ),
  });
  await assert.rejects(
    snapshot.transport("https://api.stripe.com/v1/account", {
      method: "GET",
      redirect: "error",
      headers: {
        Authorization: "Bearer synthetic",
        "Stripe-Version": input.apiVersion,
      },
    }),
  );
  assert.equal(cancelled, true);
});
test("read-cost/risk table uses the measured seven-GET path and never enables a proposed age", () => {
  const rows = reducedBillingCostAndRisk(16);
  assert.deepEqual(
    rows.map((r) => r.scheduled_gets_30_days),
    [322560, 80640, 13440, 3360],
  );
  assert.deepEqual(
    rows.map(
      (r) => r.worst_case_missed_event_new_authorization_exposure_seconds,
    ),
    [900, 3600, 21600, 86400],
  );
  assert.ok(
    rows.every(
      (r) => !r.implemented_financial_age_change && !r.entitlement_authority,
    ),
  );
});
