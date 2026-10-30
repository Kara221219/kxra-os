import assert from "node:assert/strict";
import test from "node:test";
import {
  billingRefreshSchedulerConfiguration,
  pacedBillingReads,
  runBillingRefreshScheduler,
  type RefreshSchedule,
} from "../packages/integrations/billing-refresh-scheduler";

const plan: RefreshSchedule = {
  maximum_due_workspaces: 16,
  concurrency: 16,
  poll_interval_ms: 1_000,
  scheduler_jitter_ms: 1_000,
  proof_ttl_seconds: 120,
  provider_reads_per_second: 16,
  maximum_provider_reads: 32_000,
  maximum_invocations: 10_000,
  duration_ms: 180_000,
  reviewed_monthly_read_allocation: 1_000_000_000,
  other_monthly_read_reserve: 10_000,
  read_allowance_review_sha256: "a".repeat(64),
};
class Clock {
  time = 0;
  timers: { at: number; finish: () => void }[] = [];
  now = () => this.time;
  wait = (ms: number, signal?: AbortSignal) =>
    new Promise<void>((resolve, reject) => {
      if (signal?.aborted) {
        reject(Error("aborted"));
        return;
      }
      if (ms <= 0) {
        resolve();
        return;
      }
      this.timers.push({
        at: this.time + ms,
        finish: () => (signal?.aborted ? reject(Error("aborted")) : resolve()),
      });
    });
  async complete<T>(operation: Promise<T>): Promise<T> {
    let done = false;
    void operation
      .finally(() => {
        done = true;
      })
      .catch(() => {});
    for (let step = 0; step < 100_000 && !done; step++) {
      await new Promise<void>((resolve) => setImmediate(resolve));
      if (done) break;
      assert.ok(
        this.timers.length,
        "virtual operation stalled without a timer",
      );
      const next = Math.min(...this.timers.map((t) => t.at));
      this.time = Math.max(this.time, next);
      const due = this.timers.filter((t) => t.at <= this.time);
      this.timers = this.timers.filter((t) => t.at > this.time);
      for (const timer of due) timer.finish();
    }
    assert.equal(done, true, "virtual step budget");
    return operation;
  }
}
const result = (outcome?: string) => ({
  processed: outcome ? 1 : 0,
  outcomes: outcome
    ? [{ outcome, acknowledged: 0, org_id: "PRIVATE_NOT_LOGGED" }]
    : [],
});

test("scheduler default-off does not inspect settings or credentials", () => {
  const source = new Proxy(
    {},
    {
      get(_target, key) {
        assert.equal(key, "KXRA_BILLING_REFRESH_SCHEDULER_ENABLED");
        return undefined;
      },
    },
  );
  assert.equal(billingRefreshSchedulerConfiguration(source), null);
});

test("operator schedule rejects unsafe capacity, missing gates and arbitrary fields", () => {
  const env = {
    KXRA_BILLING_REFRESH_SCHEDULER_ENABLED: "true",
    KXRA_BILLING_HTTP_ENABLED: "true",
    KXRA_PAID_PROOF_REFRESH_ENABLED: "true",
    KXRA_BILLING_REFRESH_SCHEDULE: JSON.stringify(plan),
  };
  assert.deepEqual(billingRefreshSchedulerConfiguration(env), plan);
  for (const bad of [
    { ...env, KXRA_BILLING_HTTP_ENABLED: "false" },
    { ...env, KXRA_BILLING_REFRESH_SCHEDULE: "{}" },
    {
      ...env,
      KXRA_BILLING_REFRESH_SCHEDULE: JSON.stringify({
        ...plan,
        poll_interval_ms: 60_000,
      }),
    },
    {
      ...env,
      KXRA_BILLING_REFRESH_SCHEDULE: JSON.stringify({
        ...plan,
        secret: "PRIVATE",
      }),
    },
    {
      ...env,
      KXRA_BILLING_REFRESH_SCHEDULE: JSON.stringify({
        ...plan,
        concurrency: 17,
      }),
    },
  ])
    assert.throws(
      () => billingRefreshSchedulerConfiguration(bad),
      /SCHEDULE_INVALID/,
    );
});

test("one idle probe per tick, no fanout without a durable claim, hard invocation cap", async () => {
  const c = new Clock();
  let calls = 0;
  const summary = await c.complete(
    runBillingRefreshScheduler(
      { ...plan, maximum_invocations: 4 },
      {
        now: c.now,
        wait: c.wait,
        invoke: async (claimed) => {
          calls++;
          claimed(0);
          return result();
        },
      },
    ),
  );
  assert.equal(calls, 4);
  assert.equal(c.time, 4_000);
  assert.equal(summary.maximum_active, 1);
  assert.equal(summary.empty_probes, 4);
  assert.equal(summary.state, "INVOCATION_LIMIT");
});

test("16 synchronized tenants refresh before unchanged120s expiry under55s receipt load", async () => {
  const c = new Clock(),
    tenants = Array.from({ length: 16 }, () => ({
      expires: 120_000,
      claimed: false,
      commits: 0,
    }));
  const snapshots: unknown[] = [];
  const summary = await c.complete(
    runBillingRefreshScheduler(plan, {
      now: c.now,
      wait: c.wait,
      progress: (r) => {
        snapshots.push(r);
      },
      invoke: async (claimed) => {
        // Synthetic atomic SQL equivalent; native tests separately prove real SKIP LOCKED/CAS.
        const tenant = tenants.find(
          (t) => !t.claimed && t.expires - c.time <= 60_000,
        );
        if (!tenant) {
          claimed(0);
          return result();
        }
        tenant.claimed = true;
        claimed(1);
        await c.wait(55_000);
        assert.ok(
          c.time < tenant.expires,
          "proof expired before refresh completed",
        );
        tenant.expires = c.time + 120_000;
        tenant.claimed = false;
        tenant.commits++;
        return result("ELIGIBLE");
      },
    }),
  );
  assert.equal(summary.maximum_active, 16);
  assert.equal(summary.unavailable, 0);
  assert.equal(summary.unverified, 0);
  assert.ok(tenants.every((t) => t.commits >= 1));
  assert.doesNotMatch(
    JSON.stringify(snapshots),
    /PRIVATE_NOT_LOGGED|org_id|tenant/,
  );
});

test("100 due tenants stay bounded; overload cannot manufacture or extend expired access", async () => {
  const c = new Clock();
  let due = 100,
    completed = 0,
    expiredDenied = 0,
    active = 0,
    high = 0;
  const summary = await c.complete(
    runBillingRefreshScheduler(
      { ...plan, duration_ms: 60_000, maximum_provider_reads: 1_000 },
      {
        now: c.now,
        wait: c.wait,
        invoke: async (claimed) => {
          if (!due) {
            claimed(0);
            return result();
          }
          due--;
          active++;
          high = Math.max(high, active);
          claimed(1);
          await c.wait(55_000);
          active--;
          // Synthetic existing proof expires at60s. A late failed recheck cannot
          // turn that expired old proof into continued access.
          if (c.time >= 60_000) {
            expiredDenied++;
            return result("UNVERIFIED");
          }
          completed++;
          return result("ELIGIBLE");
        },
      },
    ),
  );
  assert.equal(high, 16);
  assert.ok(due > 0 && completed <= 16);
  assert.ok(expiredDenied > 0 || due >= 84);
  assert.ok(summary.unverified >= expiredDenied);
  assert.equal(summary.entitlement_authority, false);
});

test("operational failure pauses new admission for2min; DENIED does not retry a payment", async () => {
  const c = new Clock(),
    starts: number[] = [];
  const summary = await c.complete(
    runBillingRefreshScheduler(
      {
        ...plan,
        concurrency: 1,
        maximum_due_workspaces: 1,
        duration_ms: 125_000,
      },
      {
        now: c.now,
        wait: c.wait,
        invoke: async (claimed) => {
          starts.push(c.time);
          claimed(1);
          return result(starts.length === 1 ? "UNVERIFIED" : "DENIED");
        },
      },
    ),
  );
  assert.equal(starts[0], 0);
  assert.ok(starts[1] >= 120_000);
  assert.equal(summary.circuit_pauses, 1);
  assert.ok(summary.denied > 0);
});

test("shutdown stops admission and drains the existing bounded job without replacing it", async () => {
  const c = new Clock(),
    stop = new AbortController();
  let calls = 0;
  const summary = await c.complete(
    runBillingRefreshScheduler(
      { ...plan, concurrency: 1, maximum_due_workspaces: 1 },
      {
        now: c.now,
        wait: c.wait,
        signal: stop.signal,
        invoke: async (claimed) => {
          calls++;
          claimed(1);
          stop.abort();
          await c.wait(55_000);
          return result("ELIGIBLE");
        },
      },
    ),
  );
  assert.equal(calls, 1);
  assert.equal(summary.state, "STOPPED");
  assert.equal(summary.eligible, 1);
  assert.equal(c.time, 55_000);
});

test("paced reads serialize actual starts despite event-loop stalls; never serialize responses", async () => {
  const c = new Clock(),
    starts: number[] = [];
  const limiter = pacedBillingReads(
    { provider_reads_per_second: 4, maximum_provider_reads: 32 },
    {
      now: c.now,
      wait: async (ms) => {
        await c.wait(ms);
        if (c.time === 250) c.time = 5_000;
      },
      fetch: async () => {
        starts.push(c.time);
        return new Response("{}");
      },
    },
  );
  await c.complete(
    Promise.all(
      Array.from({ length: 4 }, () =>
        limiter.fetch("https://api.stripe.com/v1/account"),
      ),
    ),
  );
  assert.equal(starts.length, 4);
  for (let i = 1; i < starts.length; i++)
    assert.ok(starts[i] - starts[i - 1] >= 250);
});

test("paced read cap, queued cancellation and wrong destinations/mutations never call provider", async () => {
  const c = new Clock(),
    abort = new AbortController();
  let calls = 0,
    exhausted = 0;
  const limiter = pacedBillingReads(
    { provider_reads_per_second: 1, maximum_provider_reads: 2 },
    {
      now: c.now,
      wait: c.wait,
      exhausted: () => {
        exhausted++;
      },
      fetch: async () => {
        calls++;
        return new Response("{}");
      },
    },
  );
  await c.complete(limiter.fetch("https://api.stripe.com/v1/account"));
  const queued = limiter.fetch("https://api.stripe.com/v1/account", {
    signal: abort.signal,
  });
  abort.abort();
  await c.complete(assert.rejects(queued));
  await assert.rejects(limiter.fetch("https://api.stripe.com/v1/account"));
  await assert.rejects(limiter.fetch("https://evil.example/v1/account"));
  await assert.rejects(
    limiter.fetch("https://api.stripe.com/v1/customers", {
      method: "POST",
      body: "PRIVATE",
    }),
  );
  assert.equal(calls, 1);
  assert.equal(exhausted, 1);
  assert.deepEqual(limiter.counts(), { reserved: 2, started: 1 });
});

test("malformed worker receipts pause without exposing arbitrary errors", async () => {
  const c = new Clock(),
    progress: unknown[] = [];
  const summary = await c.complete(
    runBillingRefreshScheduler(
      { ...plan, duration_ms: 1_000, maximum_provider_reads: 32 },
      {
        now: c.now,
        wait: c.wait,
        invoke: async () => {
          throw Error("SECRET_KEY_PRIVATE_CUSTOMER_URL");
        },
        progress: (r) => {
          progress.push(r);
          throw Error("observer failure");
        },
      },
    ),
  );
  assert.equal(summary.unavailable, 1);
  assert.equal(summary.circuit_pauses, 1);
  assert.doesNotMatch(JSON.stringify(progress), /SECRET|PRIVATE|URL/);
});
