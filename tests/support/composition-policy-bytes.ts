import assert from "node:assert/strict";
import {
  historicalProviderBoundaryBytes,
  providerBoundaryTransition,
} from "./provider-boundary-transition";
import crypto from "node:crypto";
import path from "node:path";

/** Historical manifests stay immutable. Exactly one reviewed default-off
 * fixture flag may follow their complete, byte-identical environment file.
 * This does not normalize arbitrary environment changes or affect runtime.
 */
export const pairedSetupEnvironmentAppend =
  "\n# Owned disposable paired setup UI acceptance only; never hosted or ordinary auth.\nKXRA_PAIRED_SETUP_UI_PROOF=0\n";
const sha = (bytes: Buffer) =>
  crypto.createHash("sha256").update(bytes).digest("hex");
export function historicalCompositionBytes(
  file: string,
  bytes: Buffer,
  expected: string,
) {
  assert.ok(
    typeof file === "string" &&
      !path.isAbsolute(file) &&
      !file.includes("\\") &&
      file.split("/").every((part) => part && part !== "." && part !== ".."),
    "NONCANONICAL_POLICY_SOURCE_PATH",
  );
  // Check the immutable provider predecessor before the general unchanged case.
  // A rewritten manifest cannot authorize another provider source through it.
  if (file === providerBoundaryTransition.path)
    return historicalProviderBoundaryBytes(file, bytes, expected);
  if (sha(bytes) === expected) return bytes;
  assert.equal(file, ".env.example", "UNREVIEWED_POLICY_SOURCE_TRANSITION");
  const append = Buffer.from(pairedSetupEnvironmentAppend);
  assert.ok(bytes.length > append.length);
  assert.deepEqual(bytes.subarray(-append.length), append);
  const historical = bytes.subarray(0, -append.length);
  assert.equal(sha(historical), expected, "HISTORICAL_POLICY_SOURCE_CHANGED");
  return historical;
}
