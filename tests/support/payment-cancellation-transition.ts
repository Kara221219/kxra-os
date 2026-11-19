import assert from "node:assert/strict";
import crypto from "node:crypto";

/** Exact local source overlay for eb818e889ef0b71735c22a05f3bb655f95c3b914.
 * Historical manifests are not rewritten or normalized. Only these three
 * complete reviewed files and their composition verifier may replace their exact historical hash. This helper
 * is test-only and grants no release, provider or entitlement authority.
 */
export const paymentCancellationTransitions = Object.freeze({
  "packages/integrations/live-catalogue-stripe.ts": Object.freeze({
    historical:
      "113f0a152b0f3320ee5d25a1187c22c76bb43ee8d277b0101f9bc612212f9e99",
    reviewed:
      "d465000cfa069ea925b741f01d5c2005e40146c41dd494fd60d1e747f57c98c0",
  }),
  "tests/live-catalogue-stripe.test.ts": Object.freeze({
    historical:
      "063d7a6ad3715212b7ca3e229526b82c30276455b8705f43fe2f1e871ca0c123",
    reviewed:
      "8bd2a6649dcfca48f8efa4d9d7c0a676f1bd72cf0336f64f48ac0e26c22c9a56",
  }),
  "tests/production-payment-integration.test.ts": Object.freeze({
    historical:
      "41db660046e61c38f622dbceff5b06f1ca7117c8157e500751826eda4f650867",
    reviewed:
      "f550003036694333ba8ba82d00bcd2b8b3dd398cb9a5e6d69bf94cf01bb2fe2f",
  }),
  "tests/synchronous-portal.test.ts": Object.freeze({
    historical:
      "9ccca8578dbf8426115c3bea17a0722c065fa0c6cde75506f170a5fd5b218b33",
    reviewed:
      "74f3c7e68e71e2f90bb25bb3b6f8c888c42ff02b00f4a27c703bdef714104ef4",
  }),
});
export function isPaymentCancellationTransitionFile(file: string) {
  return Object.hasOwn(paymentCancellationTransitions, file);
}
export function verifyPaymentCancellationTransition(
  file: string,
  bytes: Buffer,
  historicalHash: string,
) {
  assert.ok(
    isPaymentCancellationTransitionFile(file),
    "UNREVIEWED_PAYMENT_CANCELLATION_PATH",
  );
  const transition =
    paymentCancellationTransitions[
      file as keyof typeof paymentCancellationTransitions
    ];
  assert.equal(
    historicalHash,
    transition.historical,
    "PAYMENT_CANCELLATION_HISTORICAL_HASH_CHANGED",
  );
  assert.equal(
    crypto.createHash("sha256").update(bytes).digest("hex"),
    transition.reviewed,
    "UNREVIEWED_PAYMENT_CANCELLATION_SOURCE",
  );
}
