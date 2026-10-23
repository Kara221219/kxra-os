import { test } from "node:test";
import assert from "node:assert/strict";
import {
  approvedCatalogue,
  approvedPlan,
} from "../packages/workspace/approved-catalogue";
import { workspaceCatalogueSelect } from "../apps/os/lib/workspace-pilot";
test("approved per-workspace monthly prices and capacities are immutable; other commercial terms stay unapproved", () => {
  assert.deepEqual(
    approvedCatalogue.map((p) => [
      p.name,
      p.monthly_amount_minor,
      p.people,
      p.currency,
      p.billing_unit,
      p.interval,
    ]),
    [
      ["KXRA Starter", 2900, 1, "GBP", "WORKSPACE", "month"],
      ["KXRA Team", 7900, 5, "GBP", "WORKSPACE", "month"],
      ["KXRA Business", 19900, 15, "GBP", "WORKSPACE", "month"],
    ],
  );
  for (const p of approvedCatalogue) {
    assert.equal(p.live_charges, false);
    assert.equal(p.checkout_enabled, false);
    assert.equal(p.tax_behavior, "UNSPECIFIED");
    assert.equal(p.ai_credit_budget, null);
    assert.equal(p.trial_terms, null);
    assert.equal(p.refund_terms, null);
    assert.ok(Object.isFrozen(p));
  }
  for (const bad of [
    "__proto__",
    "constructor",
    "WORKSPACE_PILOT_V1",
    "starter",
    "",
  ])
    assert.throws(() => approvedPlan(bad));
});
test("hosted catalogue mutation is closed before any database or provider access", async () => {
  const previous = process.env.VERCEL_ENV;
  process.env.VERCEL_ENV = "production";
  try {
    await assert.rejects(
      () =>
        workspaceCatalogueSelect({} as never, {
          request_id: crypto.randomUUID(),
          offer_key: "KXRA_TEAM_V1",
        }),
      /guarded local fixture runtime/,
    );
  } finally {
    if (previous === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = previous;
  }
});
