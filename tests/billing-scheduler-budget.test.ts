import assert from "node:assert/strict";
import test from "node:test";
import { createSchedulerReadBudget } from "../packages/integrations/billing-scheduler-budget";

test("parallel local admission cannot spend more than the durably granted32 permits", async () => {
  let calls = 0;
  const allow = createSchedulerReadBudget(
    async (text, values) => {
      assert.equal(
        text,
        "select kxra_private.reserve_modern_scheduler_reads($1::text,$2::bigint) value",
      );
      assert.deepEqual(values, ["a".repeat(64), 64]);
      calls++;
      return {
        rows: [
          {
            value:
              calls === 1
                ? {
                    state: "GRANTED",
                    reserved_reads: 32,
                    remaining_reads: 32,
                    valid_until: Math.floor(Date.now() / 1000) + 55,
                  }
                : { state: "UNAVAILABLE" },
          },
        ],
      };
    },
    "a".repeat(64),
    64,
  );
  const outcomes = await Promise.all(Array.from({ length: 40 }, allow));
  assert.equal(outcomes.filter(Boolean).length, 32);
  assert.ok(calls > 1);
});
test("a process restart cannot reclaim abandoned permits or trust malformed grants", async () => {
  let used = 0;
  const query = async () => {
    if (used >= 64) return { rows: [{ value: { state: "UNAVAILABLE" } }] };
    used += 32;
    return {
      rows: [
        {
          value: {
            state: "GRANTED",
            reserved_reads: 32,
            remaining_reads: 64 - used,
            valid_until: Math.floor(Date.now() / 1000) + 55,
          },
        },
      ],
    };
  };
  assert.equal(
    await createSchedulerReadBudget(query, "a".repeat(64), 64)(),
    true,
  );
  assert.equal(
    await createSchedulerReadBudget(query, "a".repeat(64), 64)(),
    true,
  );
  assert.equal(
    await createSchedulerReadBudget(query, "a".repeat(64), 64)(),
    false,
  );
  assert.equal(used, 64);
  for (const value of [
    undefined,
    { state: "GRANTED", reserved_reads: 33, remaining_reads: 0 },
    { state: "GRANTED", reserved_reads: 32, remaining_reads: -1 },
  ]) {
    assert.equal(
      await createSchedulerReadBudget(
        async () => ({ rows: [{ value }] }),
        "a".repeat(64),
        64,
      )(),
      false,
    );
  }
});
test("expired permits cannot cross their expiry or a month boundary", async () => {
  let now = 100,
    calls = 0;
  const allow = createSchedulerReadBudget(
    async () => {
      calls++;
      return {
        rows: [
          {
            value:
              calls === 1
                ? {
                    state: "GRANTED",
                    reserved_reads: 32,
                    remaining_reads: 0,
                    valid_until: 110,
                  }
                : { state: "UNAVAILABLE" },
          },
        ],
      };
    },
    "a".repeat(64),
    32,
    () => now,
  );
  assert.equal(await allow(), true);
  now = 110;
  assert.equal(await allow(), false);
  assert.equal(calls, 2);
});
