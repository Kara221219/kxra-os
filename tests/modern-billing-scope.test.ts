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
  const bad = {
    ...f.execution,
    execution_scope: { ...f.execution.execution_scope },
    catalogue: f.execution.catalogue.map((r) => ({ ...r })),
  };
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
    (x: {
      execution_scope: typeof f.execution.execution_scope;
      review_sha256: string;
      catalogue: { people: number; price_id: string }[];
    }) =>
      Object.assign(x.execution_scope, {
        account_id: "acct_SYNTHETICother123",
      }),
    (x: {
      execution_scope: typeof f.execution.execution_scope;
      review_sha256: string;
      catalogue: { people: number; price_id: string }[];
    }) => (x.review_sha256 = "b".repeat(64)),
    (x: {
      execution_scope: typeof f.execution.execution_scope;
      review_sha256: string;
      catalogue: { people: number; price_id: string }[];
    }) => (x.catalogue[1].people = 999),
    (x: {
      execution_scope: typeof f.execution.execution_scope;
      review_sha256: string;
      catalogue: { people: number; price_id: string }[];
    }) => (x.catalogue[0].price_id = "price_SYNTHETICother123"),
  ]) {
    const x = {
      ...f.execution,
      execution_scope: { ...f.execution.execution_scope },
      catalogue: f.execution.catalogue.map((r) => ({ ...r })),
    };
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

test("LIVE staging context is rejected even with valid scope hash and live account/catalogue", () => {
  const f = modernBillingFixture();
  const { scope_sha256, ...base } = f.execution.execution_scope;
  const stage = { ...base, project_ref: "jlebgsxcvhvpueuibekd" as const };
  const execution = {
    ...f.execution,
    execution_scope: {
      ...stage,
      scope_sha256: modernScopeDigest(
        stage,
        f.execution.review_sha256,
        f.execution.catalogue,
      ),
    },
  };
  assert.throws(() =>
    validateModernBillingConfiguration(
      execution,
      {
        environment: "staging",
        project_ref: stage.project_ref,
        supabase_url: `https://${stage.project_ref}.supabase.co`,
      },
      "sk_live_SYNTHETIC_NOT_A_CREDENTIAL_000000",
      "LIVE",
    ),
  );
});
test("validated catalogue array and rows cannot mutate after scope digest validation", () => {
  const f = modernBillingFixture(),
    c = validateModernBillingConfiguration(
      f.execution,
      f.runtimeIdentity,
      "sk_live_SYNTHETIC_NOT_A_CREDENTIAL_000000",
      "LIVE",
    );
  assert.ok(Object.isFrozen(c.catalogue));
  assert.ok(Object.isFrozen(c.catalogue[0]));
  assert.throws(() =>
    Array.prototype.push.call(c.catalogue, { ...c.catalogue[0] }),
  );
  assert.throws(() => Array.prototype.splice.call(c.catalogue, 0, 1));
  assert.equal(
    Reflect.set(c.catalogue, 0, {
      ...c.catalogue[0],
      price_id: "price_OTHER123",
    }),
    false,
  );
  assert.equal(
    Reflect.set(c.catalogue[0], "price_id", "price_OTHER123"),
    false,
  );
  assert.equal(c.catalogue.length, 3);
});
