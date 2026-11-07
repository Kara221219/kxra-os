import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {
  isPaymentCancellationTransitionFile,
  paymentCancellationTransitions,
  verifyPaymentCancellationTransition,
} from "./support/payment-cancellation-transition";
const root = path.resolve(import.meta.dirname, ".."),
  sha = (bytes: Buffer) =>
    crypto.createHash("sha256").update(bytes).digest("hex");

test("cancellation overlay preserves historical payment and paired manifests byte for byte", () => {
  const bytes = fs.readFileSync(
    path.join(root, "packages/release/production-payment-integration-v1.json"),
  );
  assert.equal(
    sha(bytes),
    "2320140c02adfd04835866033afca8b91b9beda4e9be2d100e544294b9cc6b70",
  );
  const historical = JSON.parse(bytes.toString());
  const pairedBytes = fs.readFileSync(
    path.join(root, "packages/release/production-paired-integration-v1.json"),
  );
  assert.equal(
    sha(pairedBytes),
    "38b9b43a226211647d61529b250e2040213c9f9e7ceedcc19a3e2055cf24af33",
  );
  const paired = JSON.parse(pairedBytes.toString());
  assert.deepEqual(Object.keys(paymentCancellationTransitions).sort(), [
    "packages/integrations/live-catalogue-stripe.ts",
    "tests/live-catalogue-stripe.test.ts",
    "tests/production-payment-integration.test.ts",
    "tests/synchronous-portal.test.ts",
  ]);
  for (const [file, transition] of Object.entries(
    paymentCancellationTransitions,
  ))
    assert.equal(
      [
        ...historical.paymentSourceFiles,
        ...paired.integratedSourceFiles,
        ...paired.preservedCompositionFiles,
      ].find((entry: { path: string }) => entry.path === file).sha256,
      transition.historical,
    );
});

for (const [file, transition] of Object.entries(
  paymentCancellationTransitions,
)) {
  test(`${file}: accepts only the reviewed complete source and exact prior hash`, () => {
    const bytes = fs.readFileSync(path.join(root, file));
    verifyPaymentCancellationTransition(file, bytes, transition.historical);
    assert.equal(sha(bytes), transition.reviewed);
    assert.notEqual(transition.historical, transition.reviewed);
    const changedByte = Buffer.from(bytes);
    changedByte[0] ^= 1;
    for (const invalid of [
      Buffer.concat([bytes, Buffer.from("\n// Unreviewed extra change\n")]),
      bytes.subarray(0, -1),
      changedByte,
    ])
      assert.throws(
        () =>
          verifyPaymentCancellationTransition(
            file,
            invalid,
            transition.historical,
          ),
        /UNREVIEWED_PAYMENT_CANCELLATION_SOURCE/,
      );
    for (const substitutedHash of ["0".repeat(64), transition.reviewed])
      assert.throws(
        () => verifyPaymentCancellationTransition(file, bytes, substitutedHash),
        /PAYMENT_CANCELLATION_HISTORICAL_HASH_CHANGED/,
      );
    for (const wrongPath of [
      ".env.example",
      `${file}.other`,
      `../${file}`,
      "toString",
      "__proto__",
    ])
      assert.throws(
        () =>
          verifyPaymentCancellationTransition(
            wrongPath,
            bytes,
            transition.historical,
          ),
        /UNREVIEWED_PAYMENT_CANCELLATION_PATH/,
      );
  });
}

test("cancellation overlay cannot substitute another reviewed file's bytes or hash", () => {
  const rows = Object.entries(paymentCancellationTransitions);
  for (const [file, transition] of rows)
    for (const [other, otherTransition] of rows) {
      if (file === other) continue;
      const bytes = fs.readFileSync(path.join(root, other));
      assert.throws(() =>
        verifyPaymentCancellationTransition(file, bytes, transition.historical),
      );
      assert.throws(() =>
        verifyPaymentCancellationTransition(
          file,
          bytes,
          otherTransition.historical,
        ),
      );
    }
  assert.equal(
    isPaymentCancellationTransitionFile(
      "packages/integrations/live-paid-access.ts",
    ),
    false,
  );
  assert.equal(isPaymentCancellationTransitionFile(".env.example"), false);
});
