import assert from "node:assert/strict";
import test from "node:test";
import { assessBillingRefreshCapacity } from "../packages/integrations/billing-refresh-capacity";

const plan = {
  maximum_due_workspaces: 1,
  parallel_invocations: 1,
  schedule_interval_ms: 1_000,
  scheduler_jitter_ms: 0,
  first_claim_delay_ms: 1_000,
  proof_ttl_seconds: 120,
};

test("hourly and minute polling cannot fit the packaged refresh deadline", () => {
  for (const interval of [3_600_000, 60_000]) {
    const result = assessBillingRefreshCapacity({
      ...plan,
      schedule_interval_ms: interval,
    });
    assert.equal(result.state, "INSUFFICIENT_HEADROOM");
    assert.equal(result.hosted_acceptance, false);
    assert.equal(result.activation_authority, false);
  }
});

test("longer proof TTL does not expand the60s due-discovery window", () => {
  assert.deepEqual(
    assessBillingRefreshCapacity({ ...plan, proof_ttl_seconds: 300 }),
    assessBillingRefreshCapacity(plan),
  );
});

test("synchronized workspace load, scheduler jitter and strict expiry consume headroom", () => {
  assert.equal(assessBillingRefreshCapacity(plan).headroom_ms, 4_000);
  assert.equal(
    assessBillingRefreshCapacity({ ...plan, maximum_due_workspaces: 5 }).state,
    "INSUFFICIENT_HEADROOM",
  );
  assert.equal(
    assessBillingRefreshCapacity({ ...plan, scheduler_jitter_ms: 4_000 }).state,
    "INSUFFICIENT_HEADROOM",
  );
  const parallel = assessBillingRefreshCapacity({
    ...plan,
    maximum_due_workspaces: 5,
    parallel_invocations: 5,
  });
  assert.equal(parallel.state, "PROJECTED_HEADROOM");
  assert.equal(parallel.hosted_acceptance, false);
});

test("short proofs must accommodate the30s completion cooldown", () => {
  for (const ttl of [1, 30, 60]) {
    assert.equal(
      assessBillingRefreshCapacity({ ...plan, proof_ttl_seconds: ttl }).state,
      "INSUFFICIENT_HEADROOM",
    );
  }
});

test("queued waves each occupy a full receipt duration rather than sharing one55s slot", () => {
  const result = assessBillingRefreshCapacity({
    ...plan,
    maximum_due_workspaces: 2,
  });
  assert.equal(result.waves, 2);
  assert.equal(result.worst_case_completion_ms, 112_000);
  assert.equal(result.state, "INSUFFICIENT_HEADROOM");
});

test("fanout includes delayed first durable claim and denies exact expiry or unknown latency", () => {
  const parallel = {
    ...plan,
    maximum_due_workspaces: 16,
    parallel_invocations: 16,
  };
  assert.equal(
    assessBillingRefreshCapacity({ ...parallel, first_claim_delay_ms: 3_999 })
      .headroom_ms,
    1,
  );
  assert.equal(
    assessBillingRefreshCapacity({ ...parallel, first_claim_delay_ms: 4_000 })
      .state,
    "INSUFFICIENT_HEADROOM",
  );
  assert.equal(
    assessBillingRefreshCapacity({ ...parallel, first_claim_delay_ms: 10_000 })
      .worst_case_completion_ms,
    66_000,
  );
  const { first_claim_delay_ms: _omitted, ...unknown } = parallel;
  assert.equal(
    assessBillingRefreshCapacity(unknown).state,
    "INSUFFICIENT_HEADROOM",
  );
});

test("malformed/nonfinite plans and caller credential fields are rejected", () => {
  for (const invalid of [
    null,
    { ...plan, maximum_due_workspaces: 0 },
    { ...plan, parallel_invocations: Infinity },
    { ...plan, schedule_interval_ms: -1 },
    { ...plan, scheduler_jitter_ms: NaN },
    { ...plan, proof_ttl_seconds: 301 },
    { ...plan, secret: "unexpected" },
  ])
    assert.throws(() => assessBillingRefreshCapacity(invalid));
});
