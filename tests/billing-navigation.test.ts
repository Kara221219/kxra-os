import assert from "node:assert/strict";
import test from "node:test";
import {
  billingResultDestination,
  openBillingResult,
} from "../packages/workspace/billing-navigation";
const request_id = "a1000000-0000-4000-8000-000000000001",
  now = 1_800_000_000_000;
const packet = (kind: "CHECKOUT" | "PORTAL" = "CHECKOUT") => ({
  state: "READY",
  request_id,
  url:
    kind === "CHECKOUT"
      ? "https://checkout.stripe.com/c/pay/cs_test_SYNTHETICsession#opaque"
      : "https://billing.stripe.com/p/session/test_SYNTHETICsession",
  expires_at: now / 1000 + 1200,
  delivery_ready: true,
  dispatch_ready: false,
  entitlement_authority: false,
});

test("only verified current matching READY result navigates to its intended Stripe product", () => {
  for (const kind of ["CHECKOUT", "PORTAL"] as const) {
    const calls: string[] = [];
    const value = packet(kind);
    openBillingResult(value, request_id, kind, (url) => calls.push(url), now);
    assert.deepEqual(calls, [value.url]);
    assert.equal(
      billingResultDestination(value, request_id, kind, now),
      value.url,
    );
  }
});

test("wrong request, authority claims, pending states and extra data never navigate", () => {
  for (const value of [
    { ...packet(), request_id: "a2000000-0000-4000-8000-000000000002" },
    { ...packet(), state: "QUEUED" },
    { ...packet(), delivery_ready: false },
    { ...packet(), dispatch_ready: true },
    { ...packet(), entitlement_authority: true },
    { ...packet(), paid: true },
    { ...packet(), customer_id: "cus_private" },
    null,
  ]) {
    let calls = 0;
    assert.throws(() =>
      openBillingResult(value, request_id, "CHECKOUT", () => calls++, now),
    );
    assert.equal(calls, 0);
  }
});

test("expired, malformed and implausibly long-lived results remain unavailable", () => {
  for (const expires_at of [
    now / 1000,
    now / 1000 - 1,
    now / 1000 + 86461,
    Infinity,
    0,
    "tomorrow",
  ])
    assert.throws(() =>
      billingResultDestination(
        { ...packet(), expires_at },
        request_id,
        "CHECKOUT",
        now,
      ),
    );
  assert.throws(() =>
    billingResultDestination(packet(), "invalid", "CHECKOUT", now),
  );
  assert.throws(() =>
    billingResultDestination(packet(), request_id, "OTHER" as never, now),
  );
  assert.throws(() =>
    billingResultDestination(packet(), request_id, "CHECKOUT", NaN),
  );
});

test("phishing hosts, credentials, ports, schemes and wrong product paths are rejected", () => {
  for (const url of [
    "https://checkout.stripe.com.evil.invalid/c/pay/cs_test_SYNTHETICsession",
    "https://evil.invalid/c/pay/cs_test_SYNTHETICsession",
    "http://checkout.stripe.com/c/pay/cs_test_SYNTHETICsession",
    "https://user:secret@checkout.stripe.com/c/pay/cs_test_SYNTHETICsession",
    "https://checkout.stripe.com:8443/c/pay/cs_test_SYNTHETICsession",
    "javascript:alert(1)",
    packet("PORTAL").url,
    "https://checkout.stripe.com/c/pay/notasession",
  ])
    assert.throws(() =>
      billingResultDestination(
        { ...packet(), url },
        request_id,
        "CHECKOUT",
        now,
      ),
    );
  for (const url of [
    packet().url,
    "https://billing.stripe.com/other",
    "https://billing.stripe.com/p/session/",
  ])
    assert.throws(() =>
      billingResultDestination(
        { ...packet("PORTAL"), url },
        request_id,
        "PORTAL",
        now,
      ),
    );
});
