import assert from "node:assert/strict";
import test from "node:test";
import { assessBillingReadAllowance } from "../packages/integrations/billing-read-allowance";

const plan = {
  workspaces: 1,
  proof_ttl_seconds: 300,
  reviewed_monthly_read_allocation: 10_000,
  other_monthly_read_reserve: 0,
  maximum_provider_reads: 1_000,
  duration_ms: 3_600_000,
};
test("even one monthly payer cannot sustain strict five-minute evidence under the standard minimum allocation", () => {
  const result = assessBillingReadAllowance(plan);
  assert.equal(result.minimum_monthly_reads, 172_780);
  assert.equal(result.state, "INSUFFICIENT_REVIEWED_ALLOWANCE");
  assert.equal(result.provider_allocation_verified, false);
});
test("more frequent proofs and synchronized tenants consume additional allowance", () => {
  const result = assessBillingReadAllowance({
    ...plan,
    workspaces: 16,
    proof_ttl_seconds: 120,
  });
  assert.equal(result.minimum_monthly_reads, 6_911_680);
  assert.equal(result.state, "INSUFFICIENT_REVIEWED_ALLOWANCE");
});
test("a reviewed exception must cover repeated run budgets as well as minimum successful work", () => {
  assert.equal(
    assessBillingReadAllowance({
      ...plan,
      reviewed_monthly_read_allocation: 200_000,
    }).state,
    "INSUFFICIENT_REVIEWED_ALLOWANCE",
  );
  const result = assessBillingReadAllowance({
    ...plan,
    reviewed_monthly_read_allocation: 1_000_000,
    other_monthly_read_reserve: 100_000,
  });
  assert.equal(result.state, "WITHIN_REVIEWED_ALLOWANCE");
  assert.equal(result.activation_authority, false);
});
