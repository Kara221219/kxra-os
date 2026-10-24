import assert from "node:assert/strict";
import test from "node:test";
import { modernBillingFixture } from "./support/modern-billing-scope";
import {
  validateModernBillingConfiguration,
  assertModernProviderMode,
  assertModernScopeTag,
  modernScopeDigest,
} from "../packages/integrations/modern-billing-scope";
for (const mode of ["LIVE", "STAGING_SANDBOX"] as const)
  test(`${mode}: reviewed immutable config binds key/project/catalogue and mode`, () => {
    const f = modernBillingFixture(mode),
      key =
        mode === "LIVE"
          ? "sk_live_SYNTHETIC_NOT_A_CREDENTIAL_000000"
          : "sk_test_SYNTHETIC_NOT_A_CREDENTIAL_000000";
    const c = validateModernBillingConfiguration(
      f.execution,
      f.runtimeIdentity,
      key,
      mode,
    );
    assert.equal(c.execution_scope.livemode, mode === "LIVE");
    assert.equal(c.catalogue.length, 3);
    assert.ok(Object.isFrozen(c));
    assertModernProviderMode(
      {
        livemode: c.execution_scope.livemode,
        nested: { livemode: c.execution_scope.livemode },
      },
      c.execution_scope,
    );
    assert.throws(() =>
      assertModernProviderMode(
        { livemode: !c.execution_scope.livemode },
        c.execution_scope,
      ),
    );
  });
test("no missing/unbound/disabled context becomes provider authority", () => {
  const f = modernBillingFixture();
  for (const x of [undefined, {}, { ...f.execution, enabled: false }])
    assert.throws(() =>
      validateModernBillingConfiguration(
        x,
        f.runtimeIdentity,
        "sk_live_SYNTHETIC_NOT_A_CREDENTIAL_000000",
        "LIVE",
      ),
    );
});
test("sandbox never accepts production project/runtime or live credentials/catalogue", () => {
  const f = modernBillingFixture("STAGING_SANDBOX");
  const key = "sk_test_SYNTHETIC_NOT_A_CREDENTIAL_000000";
  assert.throws(() =>
    validateModernBillingConfiguration(
      f.execution,
      { ...f.runtimeIdentity, environment: "production" },
      key,
      "STAGING_SANDBOX",
    ),
  );
  assert.throws(() =>
    validateModernBillingConfiguration(
      f.execution,
      {
        ...f.runtimeIdentity,
        project_ref: "lhbgeucifxxcdoyrnesf",
        supabase_url: "https://lhbgeucifxxcdoyrnesf.supabase.co",
      },
      key,
      "STAGING_SANDBOX",
    ),
  );
  assert.throws(() =>
    validateModernBillingConfiguration(
      f.execution,
      f.runtimeIdentity,
      "sk_live_SYNTHETIC_NOT_A_CREDENTIAL_000000",
      "STAGING_SANDBOX",
    ),
  );
  const bad = structuredClone(f.execution);
  bad.catalogue[0].price_id =
    modernBillingFixture().execution.catalogue[0].price_id;
  assert.throws(() =>
    validateModernBillingConfiguration(
      bad,
      f.runtimeIdentity,
      key,
      "STAGING_SANDBOX",
    ),
  );
});
test("LIVE entry rejects genuine false scope and test credentials", () => {
  const f = modernBillingFixture("STAGING_SANDBOX");
  assert.throws(() =>
    validateModernBillingConfiguration(
      f.execution,
      f.runtimeIdentity,
      "sk_test_SYNTHETIC_NOT_A_CREDENTIAL_000000",
      "LIVE",
    ),
  );
  const live = modernBillingFixture();
  assert.throws(() =>
    validateModernBillingConfiguration(
      live.execution,
      live.runtimeIdentity,
      "sk_test_SYNTHETIC_NOT_A_CREDENTIAL_000000",
      "LIVE",
    ),
  );
});
test("scope digest binds all catalogue/context/review fields rather than only mode", () => {
  const f = modernBillingFixture("STAGING_SANDBOX");
  for (const mutate of [
    (x: typeof f.execution) =>
      (x.execution_scope.account_id = "acct_SYNTHETICother123"),
    (x: typeof f.execution) => (x.review_sha256 = "b".repeat(64)),
    (x: typeof f.execution) => (x.catalogue[1].people = 999),
    (x: typeof f.execution) =>
      (x.catalogue[0].price_id = "price_SYNTHETICother123"),
  ]) {
    const x = structuredClone(f.execution);
    mutate(x);
    assert.throws(() =>
      validateModernBillingConfiguration(
        x,
        f.runtimeIdentity,
        "sk_test_SYNTHETIC_NOT_A_CREDENTIAL_000000",
        "STAGING_SANDBOX",
      ),
    );
  }
});
test("canonical tag and nested provider account/mode cannot be substituted", () => {
  const f = modernBillingFixture(),
    s = f.execution.execution_scope;
  assert.throws(() =>
    assertModernScopeTag(
      { ...s, scope_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" },
      s,
    ),
  );
  assert.throws(() =>
    assertModernProviderMode(
      { livemode: true, product: { livemode: false } },
      s,
    ),
  );
  assert.throws(() =>
    assertModernProviderMode(
      { livemode: true, account: "acct_OTHERaccount123" },
      s,
    ),
  );
});
test("digest ordering is canonical and safe objects are not mutated to pass scope checks", () => {
  const f = modernBillingFixture("STAGING_SANDBOX"),
    s = f.execution.execution_scope,
    { scope_sha256, ...base } = s;
  assert.equal(
    modernScopeDigest(
      base,
      f.execution.review_sha256,
      [...f.execution.catalogue].reverse(),
    ),
    scope_sha256,
  );
  const raw = { livemode: false };
  assertModernProviderMode(raw, s);
  assert.deepEqual(raw, { livemode: false });
  assert.throws(() =>
    assertModernProviderMode(
      raw,
      modernBillingFixture().execution.execution_scope,
    ),
  );
  assert.deepEqual(raw, { livemode: false });
});
