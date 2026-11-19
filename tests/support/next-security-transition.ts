import assert from "node:assert/strict";
import crypto from "node:crypto";

/** Reviewed Next 16.4.6 production lock. Historical manifests keep the prior
 * hash. This overlay grants no release or deployment authority.
 */
export const nextSecurityTransitions = Object.freeze({
  "package-lock.json": Object.freeze({
    historical:
      "ce48430caddc9238be58bc3b72a9d8a3a168e7cd21ff3907b59f06f5505e6314",
    reviewed:
      "6943a99e8571e5c597229a758e1c467f6476ad9cab61bd58dac0d047ff9366cb",
  }),
});

export function isNextSecurityTransitionFile(file: string) {
  return Object.hasOwn(nextSecurityTransitions, file);
}

export function verifyNextSecurityTransition(
  file: string,
  bytes: Buffer,
  historicalHash: string,
) {
  assert.ok(
    isNextSecurityTransitionFile(file),
    "UNREVIEWED_NEXT_SECURITY_PATH",
  );
  const transition =
    nextSecurityTransitions[file as keyof typeof nextSecurityTransitions];
  assert.equal(
    historicalHash,
    transition.historical,
    "NEXT_SECURITY_HISTORICAL_HASH_CHANGED",
  );
  assert.equal(
    crypto.createHash("sha256").update(bytes).digest("hex"),
    transition.reviewed,
    "UNREVIEWED_NEXT_SECURITY_SOURCE",
  );
}
