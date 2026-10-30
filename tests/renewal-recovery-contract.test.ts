import assert from "node:assert/strict";
import test from "node:test";
import { reviewRenewalRecoveryTransition } from "./support/renewal-policy-review-contract";
const anchor = 1_800_000_000;
const org = "11111111-1111-4111-8111-111111111111";
const fixture = (now: number) => ({
  policy: "PRESERVE_ADR0047_WORKSPACE_PROPOSAL",
  reviewed_workspace_terms_sha256: "a".repeat(64),
  principal_org_id: org,
  evidence_org_id: org,
  current_generation: true,
  active_verified_member: true,
  current_legal_acceptance: true,
  prior_collected_payment_verified: true,
  same_subscription_and_customer: true,
  refunded_or_disputed: false,
  subscription_state: "past_due",
  prior_paid_period_end: anchor,
  renewal_period_start: anchor,
  renewal_period_end: anchor + 30 * 86_400,
  renewal_first_failure_at: anchor + 1,
  renewal_latest_failure_at: anchor + 1,
  first_failure_anchor_current: true,
  observed_at: now,
  observation_valid_until: now + 120,
});
test("accepted seven-day boundary stops generation/export before bounded read-only recovery", () => {
  const before = anchor + 1 + 7 * 86_400 - 1;
  assert.equal(
    reviewRenewalRecoveryTransition(fixture(before), before).state,
    "GRACE_WORK_PROPOSAL",
  );
  const at = before + 1;
  const readOnly = reviewRenewalRecoveryTransition(fixture(at), at);
  assert.equal(readOnly.state, "READ_ONLY_PROPOSAL");
  assert.equal(readOnly.proposed_generation_and_export, false);
  assert.equal(readOnly.entitlement_authority, false);
  const suspended = anchor + 1 + 30 * 86_400;
  assert.equal(
    reviewRenewalRecoveryTransition(fixture(suspended), suspended).state,
    "SUSPENDED_PROPOSAL",
  );
});
test("repeated/later payment-failure observations cannot restart the grace clock", () => {
  const now = anchor + 8 * 86_400;
  const initial = reviewRenewalRecoveryTransition(fixture(now), now);
  const repeated = reviewRenewalRecoveryTransition(
    { ...fixture(now), renewal_latest_failure_at: now - 1 },
    now,
  );
  assert.equal(initial.grace_until, repeated.grace_until);
  assert.equal(repeated.state, "READ_ONLY_PROPOSAL");
});
test("fresh unpaid signup, foreign tenant, stale evidence, revoked generation and refunds cannot gain grace", () => {
  const now = anchor + 1_000;
  for (const patch of [
    { prior_collected_payment_verified: false },
    { same_subscription_and_customer: false },
    { evidence_org_id: "22222222-2222-4222-8222-222222222222" },
    { current_generation: false },
    { active_verified_member: false },
    { current_legal_acceptance: false },
    { refunded_or_disputed: true },
    { subscription_state: "incomplete" },
    { observation_valid_until: now },
    { observed_at: now - 301 },
    { renewal_period_start: anchor + 1 },
    { first_failure_anchor_current: false },
  ])
    assert.equal(
      reviewRenewalRecoveryTransition({ ...fixture(now), ...patch }, now).state,
      "DENY",
    );
});
