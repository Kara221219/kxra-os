import assert from "node:assert/strict";
import { rootCertificates } from "node:tls";
import test from "node:test";
import { runCheckoutWorkerOnce } from "../packages/integrations/checkout-worker";
import {
  checkoutDispatchConfiguration,
  parseCheckoutDispatchArguments,
} from "../packages/integrations/checkout-dispatch-config";
import { checkoutTermsPresentationDigest } from "../packages/integrations/live-checkout-consent";
import { modernBillingFixture } from "./support/modern-billing-scope";
import type { LiveCustomerExecute } from "../packages/integrations/live-customer-worker";
const now = 1_800_000_000,
  id = "33333333-3333-4333-8333-333333333333",
  actor = "11111111-1111-4111-8111-111111111111",
  org = "22222222-2222-4222-8222-222222222222",
  hash = "a".repeat(64);
function fixture(mode: "LIVE" | "STAGING_SANDBOX" = "STAGING_SANDBOX") {
  const scoped = modernBillingFixture(mode),
    scope = scoped.execution.execution_scope,
    row = scoped.execution.catalogue[0];
  const origin =
    mode === "LIVE"
      ? "https://app.kxra-group.com"
      : "https://kxra-os-staging.vercel.app";
  const env = {
    KXRA_MODERN_BILLING_DISPATCH_ENABLED: "true",
    NODE_ENV: "production",
    KXRA_ENVIRONMENT: scoped.runtimeIdentity.environment,
    NEXT_PUBLIC_SUPABASE_URL: scoped.runtimeIdentity.supabase_url,
    KXRA_ORIGIN: origin,
    STRIPE_SECRET_KEY: `sk_${scope.livemode ? "live" : "test"}_SYNTHETIC_NOT_A_REAL_CREDENTIAL_00000`,
    KXRA_BILLING_WORKER_DATABASE_URL: `postgresql://kxra_billing_runner.${scope.project_ref}:synthetic@aws-0-eu-west-2.pooler.supabase.com:5432/postgres`,
    KXRA_DATABASE_CA_CERT_BASE64: Buffer.from(rootCertificates[0]).toString(
      "base64",
    ),
  };
  const intent = {
    id,
    actor_id: actor,
    org_id: org,
    kind: "CHECKOUT",
    state: "REQUESTED",
    customer_id: "cus_syntheticCheckout",
    subscription_id: null,
    offer_key: row.offer_key,
    mapping_revision: 1,
    terms_review_sha256: hash,
    created_at: now - 20,
    expires_at: now + 1000,
  };
  const mapping = {
    version: 1,
    mode: scope.livemode ? "live" : "staging_sandbox",
    enabled: true,
    account_id: scope.account_id,
    offer_key: row.offer_key,
    revision: 1,
    price_id: row.price_id,
    product_id: row.product_id,
    portal_configuration_id: "bpc_syntheticCheckout",
    activation_review_sha256: hash,
    terms_review_sha256: hash,
    tax_review_sha256: hash,
    tax_behavior: "inclusive",
    automatic_tax: false,
    payment_method: "card",
  };
  const terms = {
    terms_review_sha256: hash,
    terms_url: `${origin}/legal/terms?sha256=${hash}`,
    message: `SYNTHETIC_ONLY reviewed fixture [terms](${origin}/legal/terms?sha256=${hash})`,
  };
  const presentation = {
    ...terms,
    presentation_sha256: checkoutTermsPresentationDigest(terms),
  };
  const canonical = {
    intent,
    mapping,
    observed_version: 0,
    execution_scope: scope,
    entitlement_authority: false,
  };
  let active = false,
    claims = 0,
    currents = 0,
    posts = 0,
    finishes = 0,
    presentations = 0;
  let killBefore = false,
    killAfter = false,
    lateKill = false,
    postFailure = false,
    finishFailure = false,
    policyMissing = false,
    policyDrift = false,
    badTerms = false,
    badPrice = false,
    badMode = false,
    badUrl = false;
  let receipt: unknown;
  let attestation: unknown = scoped.execution;
  const sql: string[] = [];
  const execute: LiveCustomerExecute = async (command) => {
    assert.equal(active, false);
    active = true;
    sql.push(command.text);
    try {
      if (command.text.includes("modern_billing_scope_attestation"))
        return structuredClone(attestation);
      if (command.text.includes("checkout_dispatch_presentation")) {
        presentations++;
        if (policyMissing || intent.kind !== "CHECKOUT")
          throw Error("Explicit reviewed checkout policy unavailable");
        const p = structuredClone(presentation);
        if (policyDrift && presentations > 1)
          p.presentation_sha256 = "b".repeat(64);
        return { request_id: id, presentation: p, execution_scope: scope };
      }
      if (command.text.includes("claim_live_billing_intent")) {
        claims++;
        if (claims > 1) throw Error("Consumed hold");
        return structuredClone(canonical);
      }
      if (command.text.includes("current_live_billing_intent")) {
        currents++;
        return !killBefore && !(killAfter && posts > 0);
      }
      if (command.text.includes("finish_live_billing_intent")) {
        finishes++;
        receipt = {
          id: command.values[0],
          outcome: command.values[1],
          provider_session_id: command.values[2],
          hash: command.values[3],
        };
        if (finishFailure) throw Error("PRIVATE_COMMIT_RESULT_LOST");
        return lateKill ? "UNCERTAIN" : command.values[1];
      }
      assert.fail("Unexpected SQL");
    } finally {
      active = false;
    }
  };
  const fetcher: typeof fetch = async (input, init) => {
    assert.equal(
      active,
      false,
      "Provider HTTP must be outside all SQL transactions",
    );
    const url = String(input);
    if (url.endsWith("/account"))
      return Response.json({
        id: scope.account_id,
        object: "account",
        charges_enabled: true,
        business_profile: {
          terms_of_service_url: badTerms
            ? "https://foreign.test/legal"
            : terms.terms_url,
        },
      });
    if (url.includes("/prices/"))
      return Response.json({
        id: row.price_id,
        object: "price",
        livemode: badMode ? !scope.livemode : scope.livemode,
        active: true,
        currency: "gbp",
        unit_amount: badPrice ? 49900 : row.monthly_amount_minor,
        type: "recurring",
        billing_scheme: "per_unit",
        tax_behavior: "inclusive",
        recurring: {
          interval: "month",
          interval_count: 1,
          usage_type: "licensed",
        },
        transform_quantity: null,
        custom_unit_amount: null,
        product: {
          id: row.product_id,
          object: "product",
          livemode: scope.livemode,
          active: true,
        },
      });
    if (url.includes("/customers/"))
      return Response.json({
        id: intent.customer_id,
        object: "customer",
        livemode: scope.livemode,
      });
    assert.equal(url, "https://api.stripe.com/v1/checkout/sessions");
    assert.equal(init?.method, "POST");
    posts++;
    if (postFailure) throw Error("PRIVATE_POST_MAY_HAVE_EXECUTED");
    const body = new URLSearchParams(init.body as string),
      metadata: Record<string, string> = {};
    for (const [key, value] of body)
      if (key.startsWith("metadata[")) metadata[key.slice(9, -1)] = value;
    return Response.json({
      id: `cs_${scope.livemode ? "live" : "test"}_syntheticCheckout`,
      object: "checkout.session",
      livemode: scope.livemode,
      customer: intent.customer_id,
      url: badUrl
        ? "https://foreign.test/token"
        : "https://checkout.stripe.com/c/pay/SYNTHETIC_BEARER_MUST_NOT_PERSIST",
      created: now,
      expires_at: now + 1800,
      mode: "subscription",
      status: "open",
      client_reference_id: id,
      consent_collection: { terms_of_service: "required" },
      custom_text: { terms_of_service_acceptance: { message: terms.message } },
      metadata,
    });
  };
  return {
    env,
    canonical,
    sql,
    presentation,
    run: () =>
      runCheckoutWorkerOnce(id, {
        environment: env,
        execute,
        fetch: fetcher,
        nowSeconds: () => now,
      }),
    count: () => ({ claims, currents, posts, finishes, presentations }),
    receipt: () => receipt,
    change: (
      flag:
        | "killBefore"
        | "killAfter"
        | "lateKill"
        | "postFailure"
        | "finishFailure"
        | "policyMissing"
        | "policyDrift"
        | "badTerms"
        | "badPrice"
        | "badMode"
        | "badUrl",
    ) => {
      if (flag === "killBefore") killBefore = true;
      if (flag === "killAfter") killAfter = true;
      if (flag === "lateKill") lateKill = true;
      if (flag === "postFailure") postFailure = true;
      if (flag === "finishFailure") finishFailure = true;
      if (flag === "policyMissing") policyMissing = true;
      if (flag === "policyDrift") policyDrift = true;
      if (flag === "badTerms") badTerms = true;
      if (flag === "badPrice") badPrice = true;
      if (flag === "badMode") badMode = true;
      if (flag === "badUrl") badUrl = true;
    },
    attestation: (value: unknown) => {
      attestation = value;
    },
  };
}
for (const mode of ["STAGING_SANDBOX", "LIVE"] as const)
  test(`${mode}: shared checkout returns READY only after canonical CONSUMED, without URL/ID output`, async () => {
    const f = fixture(mode),
      result = await f.run();
    assert.deepEqual(result, {
      state: "READY",
      request_id: id,
      entitlement_authority: false,
    });
    assert.equal(f.count().claims, 1);
    assert.equal(f.count().posts, 1);
    assert.equal(f.count().finishes, 1);
    assert.equal(f.count().currents, 2);
    assert.doesNotMatch(
      JSON.stringify([result, f.receipt()]),
      /BEARER|checkout\.stripe|expires_at/,
    );
    assert.ok(
      f.sql
        .filter((s) => !s.includes("modern_billing_scope_attestation"))
        .every((s) =>
          mode === "LIVE"
            ? !s.includes("staging_sandbox_")
            : s.includes("staging_sandbox_"),
        ),
    );
  });
test("default-off command and private origin/mode configuration reject unsafe dispatch before work", async () => {
  assert.equal(
    (
      await runCheckoutWorkerOnce(id, {
        environment: {},
        execute: async () => assert.fail("No SQL"),
        fetch: async () => assert.fail("No HTTP"),
      })
    ).state,
    "DISABLED",
  );
  const f = fixture();
  for (const origin of [
    "http://kxra-os-staging.vercel.app",
    "https://evil.test",
    "https://kxra-os-staging.vercel.app/path",
  ])
    assert.throws(
      () => checkoutDispatchConfiguration({ ...f.env, KXRA_ORIGIN: origin }),
      { message: "CHECKOUT_DISPATCH_CONFIGURATION_INVALID" },
    );
  assert.equal(parseCheckoutDispatchArguments(["--once", "--request", id]), id);
  for (const args of [
    ["--watch"],
    ["--once", "--request", "bad"],
    ["--once", "--request", id, "--mode", "LIVE"],
  ])
    assert.throws(() => parseCheckoutDispatchArguments(args));
});
test("wrong scope and missing/unapproved policy refuse before consuming request", async () => {
  const wrong = fixture();
  wrong.attestation(modernBillingFixture("LIVE").execution);
  await assert.rejects(wrong.run());
  assert.equal(wrong.count().claims, 0);
  assert.equal(wrong.count().posts, 0);
  const missing = fixture();
  missing.change("policyMissing");
  await assert.rejects(missing.run());
  assert.equal(missing.count().claims, 0);
  assert.equal(missing.count().posts, 0);
  const portal = fixture();
  portal.canonical.intent.kind = "PORTAL";
  await assert.rejects(portal.run());
  assert.equal(portal.count().claims, 0);
  assert.equal(portal.count().posts, 0);
});
for (const flag of [
  "policyDrift",
  "badTerms",
  "badPrice",
  "badMode",
  "killBefore",
] as const)
  test(`${flag}: no checkout POST and permanent hold recorded`, async () => {
    const f = fixture();
    f.change(flag);
    const result = await f.run();
    assert.equal(result.state, "RECORDED");
    assert.equal(f.count().posts, 0);
    assert.equal(f.count().finishes, 1);
    assert.equal((f.receipt() as { outcome: string }).outcome, "UNCERTAIN");
  });
for (const flag of ["postFailure", "badUrl", "killAfter", "lateKill"] as const)
  test(`${flag}: one attempted POST cannot yield READY or auto-retry`, async () => {
    const f = fixture();
    f.change(flag);
    assert.equal((await f.run()).state, "RECORDED");
    assert.equal(f.count().posts, 1);
    assert.equal(f.count().finishes, 1);
    await assert.rejects(f.run());
    assert.equal(f.count().posts, 1);
  });
test("lost completion response preserves original request and never resends provider POST", async () => {
  const f = fixture();
  f.change("finishFailure");
  await assert.rejects(f.run(), {
    message: "CHECKOUT_DISPATCH_COMPLETION_UNCERTAIN",
  });
  assert.equal(f.count().posts, 1);
  assert.equal(f.count().finishes, 1);
});
