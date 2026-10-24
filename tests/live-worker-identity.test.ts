import assert from "node:assert/strict";
import test from "node:test";
import { requireLiveBillingWorkerIdentity } from "../packages/integrations/live-worker-identity";

test("existing LOGIN runner with worker capability is the sole accepted identity pair", () => {
  assert.doesNotThrow(() =>
    requireLiveBillingWorkerIdentity({
      session_user: "kxra_billing_runner",
      current_user: "kxra_billing_worker",
    }),
  );
});

test("capability login, admin/owner SET ROLE and runner without SET ROLE are rejected", () => {
  for (const [session_user, current_user] of [
    ["kxra_billing_worker", "kxra_billing_worker"],
    ["postgres", "kxra_billing_worker"],
    ["supabase_admin", "kxra_billing_worker"],
    ["owner", "kxra_billing_worker"],
    ["kxra_app", "kxra_billing_worker"],
    ["kxra_billing_runner", "kxra_billing_runner"],
    ["kxra_billing_runner", "authenticated"],
    ["kxra_billing_runner", "postgres"],
  ])
    assert.throws(
      () => requireLiveBillingWorkerIdentity({ session_user, current_user }),
      { message: "LIVE_BILLING_WORKER_IDENTITY_INVALID" },
    );
});

test("missing, inherited and role-only forged identity context cannot authorize worker writes", () => {
  for (const input of [
    undefined,
    null,
    true,
    "kxra_billing_runner",
    [],
    {},
    { current_user: "kxra_billing_worker" },
    { session_user: "kxra_billing_runner" },
    { role: "kxra_billing_worker", sub: "synthetic" },
    Object.create({
      session_user: "kxra_billing_runner",
      current_user: "kxra_billing_worker",
    }),
    {
      session_user: "kxra_billing_runner",
      current_user: "kxra_billing_worker",
      actor_id: "synthetic-client-authority",
    },
  ])
    assert.throws(() => requireLiveBillingWorkerIdentity(input), {
      message: "LIVE_BILLING_WORKER_IDENTITY_INVALID",
    });
});

test("identity rejection never discloses input values", () => {
  assert.throws(
    () =>
      requireLiveBillingWorkerIdentity({
        session_user: "synthetic-private-detail",
        current_user: "kxra_billing_worker",
      }),
    (error) => {
      assert.equal(
        (error as Error).message,
        "LIVE_BILLING_WORKER_IDENTITY_INVALID",
      );
      assert.doesNotMatch(String(error), /synthetic-private-detail/);
      return true;
    },
  );
});
