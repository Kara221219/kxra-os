import test from "node:test";
import assert from "node:assert/strict";
import {
  billingEntryRequestTimeoutMs,
  billingStatusConfirmsRequest,
  type BillingPendingRequest,
} from "../packages/workspace/billing-entry-recovery";
import { liveEntryStatus } from "../packages/authz/live-billing-entry-contract";
const request: BillingPendingRequest = {
  action: "CHECKOUT",
  request_id: "30000000-0000-4000-8000-000000000001",
  offer_key: "KXRA_STARTER_V1",
};
const status = liveEntryStatus.parse({
  state: "BOUND",
  offer_key: request.offer_key,
  request_id: request.request_id,
  kind: request.action,
  request_state: "CONSUMED",
  available_actions: [],
  dispatch_ready: false,
  entitlement_authority: false,
});
test("status recovery keeps the existing 35-second overall client request budget", () => {
  assert.equal(billingEntryRequestTimeoutMs, 35_000);
});
for (const [action, states, requestStates] of [
  [
    "CUSTOMER",
    ["CUSTOMER_PENDING", "BOUND"],
    ["REQUESTED", "INFLIGHT", "BOUND"],
  ],
  [
    "CHECKOUT",
    ["REQUEST_PENDING", "BOUND"],
    ["REQUESTED", "INFLIGHT", "CONSUMED"],
  ],
] as const)
  test(`${action}: exact current recorded status releases only the UI acknowledgement latch`, () => {
    for (const state of states)
      for (const request_state of requestStates) {
        const next = liveEntryStatus.parse({
          ...status,
          state,
          request_state,
          kind: action,
        });
        assert.equal(
          billingStatusConfirmsRequest({ ...request, action }, next),
          true,
        );
        assert.equal(next.dispatch_ready, false);
        assert.equal(next.entitlement_authority, false);
      }
  });
for (const [label, patch] of [
  ["different request", { request_id: "30000000-0000-4000-8000-000000000002" }],
  ["missing request", { request_id: null }],
  ["different plan", { offer_key: "KXRA_TEAM_V1" }],
  ["missing plan", { offer_key: null }],
  ["different action", { kind: "PORTAL" }],
  ["missing action", { kind: null }],
  ["disabled", { state: "DISABLED" }],
  ["fresh", { state: "FRESH" }],
  ["review", { state: "REVIEW_REQUIRED" }],
  ["uncertain", { request_state: "UNCERTAIN" }],
  ["quarantined", { request_state: "QUARANTINED" }],
  ["absent outcome", { request_state: null }],
  ["customer-only outcome", { request_state: "BOUND" }],
] as const)
  test(`${label} status preserves the original checkout request`, () => {
    assert.equal(
      billingStatusConfirmsRequest(
        request,
        liveEntryStatus.parse({ ...status, ...patch }),
      ),
      false,
    );
  });
test("portal delivery, reconciliation and invalid authority flags cannot be recovered as checkout", () => {
  for (const action of ["PORTAL", "RECONCILE"] as const)
    for (const request_state of [
      "REQUESTED",
      "INFLIGHT",
      "BOUND",
      "CONSUMED",
      "UNCERTAIN",
      "QUARANTINED",
    ] as const)
      assert.equal(
        billingStatusConfirmsRequest(
          { ...request, action },
          { ...status, kind: action, request_state },
        ),
        false,
      );
  for (const patch of [
    { entitlement_authority: true },
    { dispatch_ready: true },
    { paid: true },
  ])
    assert.throws(() => liveEntryStatus.parse({ ...status, ...patch }));
});
