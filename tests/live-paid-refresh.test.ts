import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import {
  runPaidRefreshOnce,
  type PaidRefreshQuery,
} from "../packages/integrations/live-paid-refresh-worker";
import { readPaidRefreshPreflight } from "../packages/integrations/live-paid-refresh-preflight";
import { checkoutTermsPresentationDigest } from "../packages/integrations/live-checkout-consent";
import { paidRefreshProviderFixture as fixture } from "./support/paid-refresh-provider-fixture";
import { type ModernExecutionMode } from "../packages/integrations/modern-billing-scope";
for (const mode of ["LIVE", "STAGING_SANDBOX"] as const)
  test(`${mode} actual preflight → payment/consent → proof → fenced commit and exact ACK`, async () => {
    const f = fixture(mode),
      result = await runPaidRefreshOnce(f.options);
    assert.equal(result.outcomes[0].outcome, "ELIGIBLE");
    assert.equal(result.outcomes[0].acknowledged, 1);
    assert.equal(f.readsAtReserve(), 4);
    assert.equal(f.committed.length, 1);
    assert.equal(f.committed[0].entitlement_authority, false);
    assert.equal(
      (f.committed[0].execution_scope as { livemode: boolean }).livemode,
      mode === "LIVE",
    );
    assert.equal(
      f.calls.length,
      20,
      "Keep the successful-refresh read-allocation model current",
    );
    if (mode === "STAGING_SANDBOX")
      assert.ok(
        f.sql
          .filter((s) => !s.includes("scope_attestation"))
          .every((s) => s.includes("staging_sandbox_")),
      );
  });
test("default-off performs no SQL or provider reads", async () => {
  const f = fixture();
  await assert.rejects(
    runPaidRefreshOnce({ ...f.options, enabled: undefined }),
    /DISABLED/,
  );
  assert.equal(f.sql.length, 0);
  assert.equal(f.calls.length, 0);
});
test("superseded preflight generation stops before reservation", async () => {
  const f = fixture();
  f.setCurrent(false);
  await runPaidRefreshOnce(f.options);
  assert.equal(f.calls.length, 0);
  assert.equal(f.reserved(), false);
  assert.equal(f.committed.length, 0);
});
test("provider mode mismatch remains false and prevents reservation", async () => {
  const f = fixture();
  f.sub.livemode = true;
  await runPaidRefreshOnce(f.options);
  assert.equal(f.reserved(), false);
  assert.equal(f.sub.livemode, true);
});
test("nested wrong provider mode is rejected without rewritten payload", async () => {
  const f = fixture();
  Object.assign(f.sub, { nested: { livemode: true } });
  await assert.rejects(
    readPaidRefreshPreflight(f.preflight, f.subject),
    /MODE_MISMATCH/,
  );
  assert.equal(f.reserved(), false);
});
test("current invoice gross mismatch cannot reserve a read", async () => {
  const f = fixture();
  f.invoice.total = 3000;
  await runPaidRefreshOnce(f.options);
  assert.equal(f.reserved(), false);
});
test("refund evidence denies and never manufactures collected authority", async () => {
  const f = fixture();
  f.charge.refunded = true;
  f.charge.amount_refunded = 2900;
  const r = await runPaidRefreshOnce(f.options);
  assert.equal(r.outcomes[0].outcome, "DENIED");
  assert.equal(f.committed[0].payment_state, "REFUNDED");
  assert.equal(f.committed[0].eligibility, "DENY");
});
test("older wakeup is never ACKed with a newer proof", async () => {
  const f = fixture();
  f.wrongWake();
  const r = await runPaidRefreshOnce(f.options);
  assert.equal(r.outcomes[0].outcome, "ELIGIBLE");
  assert.equal(r.outcomes[0].acknowledged, 0);
  assert.ok(!f.sql.some((s) => s.includes("ack_live")));
});
test("0110 native source pins worker-only bounded due discovery and fences", () => {
  const s = fs.readFileSync(
    "supabase/migrations/0110_bounded_paid_proof_refresh.sql",
    "utf8",
  );
  assert.match(s, /n not between 1 and 20/);
  assert.match(s, /for update of binding skip locked limit n/);
  assert.match(s, /valid_until<=now\(\)\+interval '60 seconds'/);
  assert.match(
    s,
    /l\.claim_token=token and l\.lease_until>now\(\) and l\.binding_version=b\.version/,
  );
  assert.match(s, /session_user<>'kxra_billing_runner'/);
  assert.match(s, /current_setting\('role',true\)<>'kxra_billing_worker'/);
  assert.match(s, /state='SUPERSEDED'/);
  assert.ok(!s.includes("state='DONE'"));
  assert.ok(!/grant .* to (authenticated|anon|public);/i.test(s));
  for (const name of [
    "claim_live_paid_refresh",
    "live_paid_refresh_current",
    "reserve_live_paid_refresh",
    "commit_live_paid_refresh",
  ]) {
    assert.ok(s.includes(`function kxra_private.${name}(`));
    assert.ok(s.includes(`function kxra_private.staging_sandbox_${name}(`));
  }
  assert.ok(
    !/insert into kxra_private\.(live_paid_policies|live_billing_activation|modern_billing_execution_identity)/.test(
      s,
    ),
  );
});

test("provider generation change after preflight reads prevents reservation", async () => {
  const f = fixture();
  let reads = 0;
  const result = await runPaidRefreshOnce({
    ...f.options,
    transport: async (url, init) => {
      const response = await f.options.transport(url, init);
      if (++reads === 3) f.setCurrent(false);
      return response;
    },
  });
  assert.equal(result.outcomes[0].outcome, "UNVERIFIED");
  assert.equal(f.reserved(), false);
  assert.equal(f.calls.length, 4);
});
test("generation change during payment reads prevents proof commit", async () => {
  const f = fixture();
  let currentChecks = 0;
  await runPaidRefreshOnce({
    ...f.options,
    query: async (text, values) => {
      if (text.includes("refresh_current") && ++currentChecks === 4)
        f.setCurrent(false);
      return f.options.query(text, values);
    },
  });
  assert.equal(f.reserved(), true);
  assert.equal(f.committed.length, 0);
  assert.ok(!f.sql.some((s) => s.includes("ack_live")));
});
test("CAS stale outcome never acknowledges a wakeup", async () => {
  const f = fixture();
  const r = await runPaidRefreshOnce({
    ...f.options,
    query: async (text, values) => {
      if (text.includes("commit_live_paid_refresh"))
        return { rows: [{ value: "STALE" }] };
      return f.options.query(text, values);
    },
  });
  assert.equal(r.outcomes[0].outcome, "STALE");
  assert.equal(r.outcomes[0].acknowledged, 0);
});
test("provider failure has no automatic retry or replacement reservation", async () => {
  const f = fixture();
  let calls = 0;
  await runPaidRefreshOnce({
    ...f.options,
    transport: async () => {
      calls++;
      return new Response("", { status: 429 });
    },
  });
  assert.equal(calls, 1);
  assert.equal(f.reserved(), false);
  assert.equal(f.committed.length, 0);
});
test("bounded limit and private runtime guard run before SQL", async () => {
  const f = fixture();
  await assert.rejects(runPaidRefreshOnce({ ...f.options, limit: 21 }));
  await assert.rejects(
    runPaidRefreshOnce({ ...f.options, nodeEnv: "development" }),
    /RUNTIME_REQUIRED/,
  );
  assert.equal(f.sql.length, 0);
  assert.equal(f.calls.length, 0);
});
