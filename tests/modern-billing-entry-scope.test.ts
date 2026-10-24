import assert from "node:assert/strict";
import test from "node:test";
import {
  liveBillingEntryConfiguration,
  modernBillingViewConfiguration,
} from "../packages/authz/live-billing-entry";
import {
  modernEntrySql,
  unwrapModernEntryReceipt,
} from "../packages/authz/modern-billing-entry-scope";
import { liveEntryStatus } from "../packages/authz/live-billing-entry-contract";
import { modernBillingFixture } from "./support/modern-billing-scope";

const safe = {
  state: "FRESH",
  offer_key: null,
  request_id: null,
  kind: null,
  request_state: null,
  dispatch_ready: false,
  entitlement_authority: false,
  available_actions: ["CUSTOMER"],
};
const mode = (m: "LIVE" | "STAGING_SANDBOX") => {
  const c = modernBillingFixture(m);
  return { mode: m, project: c.execution.execution_scope.project_ref };
};

test("server environment fixes the mode and SQL operation without a caller-selected prefix", () => {
  for (const [environment, project, origin, expected] of [
    [
      "production",
      "lhbgeucifxxcdoyrnesf",
      "https://app.kxra-group.com",
      "LIVE",
    ],
    [
      "staging",
      "jlebgsxcvhvpueuibekd",
      "https://kxra-os-staging-example.vercel.app",
      "STAGING_SANDBOX",
    ],
  ] as const) {
    const c = liveBillingEntryConfiguration({
      NODE_ENV: "production",
      KXRA_LIVE_BILLING_ENTRY_ENABLED: "true",
      KXRA_ENVIRONMENT: environment,
      NEXT_PUBLIC_SUPABASE_URL: `https://${project}.supabase.co`,
      KXRA_ORIGIN: origin,
    });
    assert.equal(c?.mode, expected);
    for (const action of [
      "STATUS",
      "CUSTOMER",
      "CHECKOUT",
      "PORTAL",
      "RECONCILE",
    ] as const) {
      const sql = modernEntrySql(action, expected);
      assert.equal(
        sql.includes("staging_sandbox_"),
        expected === "STAGING_SANDBOX",
      );
      assert.ok(sql.startsWith("select kxra_private."));
    }
  }
  assert.throws(() => modernEntrySql("STATUS", "FORGED" as never));
  assert.throws(() => modernEntrySql("STATUS; drop table x" as never, "LIVE"));
});

test("authenticated tagged receipts are verified before their private scope is removed", () => {
  for (const m of ["LIVE", "STAGING_SANDBOX"] as const) {
    const execution_scope = modernBillingFixture(m).execution.execution_scope;
    const result = unwrapModernEntryReceipt(
      { ...safe, execution_scope },
      mode(m),
    );
    assert.deepEqual(liveEntryStatus.parse(result), safe);
    assert.equal(Object.hasOwn(result, "execution_scope"), false);
    assert.ok(!JSON.stringify(result).includes(execution_scope.account_id));
    assert.deepEqual(
      unwrapModernEntryReceipt(
        {
          execution_scope,
          id: "canonical",
          state: "REQUESTED",
          entitlement_authority: false,
        },
        mode(m),
      ),
      { id: "canonical", state: "REQUESTED", entitlement_authority: false },
    );
  }
});

test("missing, mixed mode, project, account, malformed and broadened receipts fail closed", () => {
  for (const m of ["LIVE", "STAGING_SANDBOX"] as const) {
    const s = modernBillingFixture(m).execution.execution_scope;
    const other = modernBillingFixture(
      m === "LIVE" ? "STAGING_SANDBOX" : "LIVE",
    ).execution.execution_scope;
    for (const value of [
      null,
      safe,
      { ...safe, execution_scope: other },
      { ...safe, execution_scope: { ...s, livemode: !s.livemode } },
      { ...safe, execution_scope: { ...s, scope_sha256: "bad" } },
      { ...safe, execution_scope: { ...s, secret: "unexpected" } },
    ])
      assert.throws(() => unwrapModernEntryReceipt(value, mode(m)));
    assert.throws(() =>
      unwrapModernEntryReceipt(
        { ...safe, execution_scope: s },
        { ...mode(m), project: "wrongproject" },
      ),
    );
    assert.throws(() =>
      liveEntryStatus.parse(
        unwrapModernEntryReceipt(
          { ...safe, execution_scope: s, customer_id: "cus_private" },
          mode(m),
        ),
      ),
    );
    assert.throws(() =>
      liveEntryStatus.parse(
        unwrapModernEntryReceipt(
          { ...safe, execution_scope: s, entitlement_authority: true },
          mode(m),
        ),
      ),
    );
  }
  const s = modernBillingFixture("LIVE").execution.execution_scope;
  assert.throws(() =>
    unwrapModernEntryReceipt(
      { ...safe, execution_scope: { ...s, account_id: "acct_unapproved" } },
      mode("LIVE"),
    ),
  );
});

test("current paid customer view configuration is independent of new-entry enablement", () => {
  const env = {
    NODE_ENV: "production",
    KXRA_ENVIRONMENT: "production",
    NEXT_PUBLIC_SUPABASE_URL: "https://lhbgeucifxxcdoyrnesf.supabase.co",
    KXRA_ORIGIN: "https://app.kxra-group.com",
    KXRA_LIVE_BILLING_ENTRY_ENABLED: "false",
  };
  assert.equal(liveBillingEntryConfiguration(env), null);
  assert.equal(modernBillingViewConfiguration(env)?.mode, "LIVE");
  assert.equal(
    modernBillingViewConfiguration({ ...env, NODE_ENV: "development" }),
    null,
  );
  assert.equal(
    modernBillingViewConfiguration({
      ...env,
      NEXT_PUBLIC_SUPABASE_URL: "https://jlebgsxcvhvpueuibekd.supabase.co",
    }),
    null,
  );
});
