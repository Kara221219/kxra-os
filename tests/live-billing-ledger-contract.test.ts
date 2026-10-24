import { modernBillingFixture } from "./support/modern-billing-scope";
import assert from "node:assert/strict";
import test from "node:test";
import {
  requestLiveLedgerCommand,
  claimLiveLedgerCommand,
  finishLiveLedgerCommand,
  recordLiveLedgerCommand,
  liveLedgerOutcome,
} from "../packages/integrations/live-billing-ledger";
const enabled = { enabled: true, mode: "live" as const };
const intent = "33333333-3333-4333-8333-333333333333";
const receipt = {
  event_id: "evt_synthetic123",
  payload_sha256: "a".repeat(64),
  account_id: "acct_1Rv3KdC84VkhhIRz",
  mode: "live",
  execution_scope: modernBillingFixture().execution.execution_scope,
  customer_id: "cus_synthetic123",
  subscription_id: "sub_synthetic123",
  checkout_intent_id: intent,
  offer_key: "KXRA_STARTER_V1",
  mapping_revision: 1,
};
for (const plan of ["KXRA_STARTER_V1", "KXRA_TEAM_V1", "KXRA_BUSINESS_V1"])
  test(`server derives identity for ${plan}`, () => {
    const c = requestLiveLedgerCommand(
      { intent_id: intent, kind: "CHECKOUT", offer_key: plan },
      enabled,
    );
    assert.equal(c.role, "AUTHENTICATED_SERVER");
    assert.equal(c.entitlement_authority, false);
    assert.deepEqual(c.values, [intent, "CHECKOUT", plan]);
    assert.ok(!c.text.includes(plan));
    assert.ok(Object.isFrozen(c.values));
  });
for (const extra of [
  { actor_id: intent },
  { org_id: intent },
  { role: "OWNER" },
  { price_id: "price_legacy499" },
  { amount: 1 },
  { people: 999 },
  { state: "ACTIVE" },
])
  test(`request rejects client authority ${Object.keys(extra)[0]}`, () =>
    assert.throws(() =>
      requestLiveLedgerCommand(
        {
          intent_id: intent,
          kind: "CHECKOUT",
          offer_key: "KXRA_STARTER_V1",
          ...extra,
        },
        enabled,
      ),
    ));
test("all builders are disabled without explicit configuration", () => {
  for (const config of [undefined, { enabled: false, mode: "live" as const }]) {
    assert.throws(() => requestLiveLedgerCommand({}, config));
    assert.throws(() => claimLiveLedgerCommand({}, config));
    assert.throws(() => finishLiveLedgerCommand({}, config));
    assert.throws(() => recordLiveLedgerCommand({}, config));
  }
});
test("worker command schemas reject arbitrary SQL, payloads and session secrets", () => {
  assert.throws(() =>
    claimLiveLedgerCommand({ intent_id: "x'); drop table x;--" }, enabled),
  );
  assert.throws(() =>
    recordLiveLedgerCommand(
      { ...receipt, raw: "credential-bearing payload" },
      enabled,
    ),
  );
  assert.throws(() =>
    finishLiveLedgerCommand(
      {
        intent_id: intent,
        outcome: "CONSUMED",
        provider_session_id: "cs_test_synthetic123",
        result_sha256: receipt.payload_sha256,
      },
      enabled,
    ),
  );
  assert.throws(() =>
    finishLiveLedgerCommand(
      {
        intent_id: intent,
        outcome: "CONSUMED",
        provider_session_id: null,
        result_sha256: receipt.payload_sha256,
        redirect_url: "https://billing.stripe.com/p/session?secret=synthetic",
      },
      enabled,
    ),
  );
});
for (const change of [
  { mode: "sandbox" },
  { account_id: "acct_other123" },
  { mapping_revision: 0 },
  { payload_sha256: "invalid" },
  { offer_key: "WORKSPACE_PILOT_V1" },
])
  test(`receipt rejects mismatched ${Object.keys(change)[0]}`, () =>
    assert.throws(() =>
      recordLiveLedgerCommand({ ...receipt, ...change }, enabled),
    ));
test("receipt uses parameterized hash-only metadata and worker authority", () => {
  const c = recordLiveLedgerCommand(receipt, enabled);
  assert.equal(c.role, "BILLING_WORKER");
  assert.equal(c.entitlement_authority, false);
  assert.deepEqual(JSON.parse(c.values[0] as string), receipt);
  assert.ok(!c.text.includes(receipt.event_id));
  assert.equal(
    claimLiveLedgerCommand({ intent_id: intent }, enabled).role,
    "BILLING_WORKER",
  );
  assert.equal(
    finishLiveLedgerCommand(
      {
        intent_id: intent,
        outcome: "UNCERTAIN",
        provider_session_id: null,
        result_sha256: receipt.payload_sha256,
      },
      enabled,
    ).entitlement_authority,
    false,
  );
});
test("outcomes never imply payment or entitlement", () => {
  for (const value of [
    "DUPLICATE",
    "CONFLICT",
    "RECONCILE_REQUIRED",
    "UNCERTAIN",
    "CONSUMED",
  ])
    assert.equal(liveLedgerOutcome(value), value);
  for (const value of ["APPLIED", "ACTIVE", "PAID", "ENTITLED"])
    assert.throws(() => liveLedgerOutcome(value));
});
