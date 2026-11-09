import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

/** Test-only exact source successor from accepted 29364435. Historical manifests
 * stay immutable; no normalization, release authority or runtime bypass. Both
 * complete byte sequences and the caller's original pin must match these anchors.
 */
export const providerBoundaryTransition = Object.freeze({
  path: "packages/workspace/provider.ts",
  historicalSha256:
    "2743f1d65537aa6edcb3961be0b05a404d959349f2b0b85969baeb48dd5d630d",
  historicalBytes: 11668,
  successorSha256:
    "29d8160858f122ac498e4cd39b506305087baa94e70995e2379c84b635e1dbca",
  successorBytes: 16156,
});
const sha = (bytes: Buffer) =>
  crypto.createHash("sha256").update(bytes).digest("hex");
export function historicalProviderBoundaryBytes(
  file: string,
  bytes: Buffer,
  expected: string,
) {
  const transition = providerBoundaryTransition;
  assert.equal(file, transition.path, "UNREVIEWED_PROVIDER_SOURCE_PATH");
  assert.equal(
    expected,
    transition.historicalSha256,
    "PROVIDER_HISTORICAL_PIN_CHANGED",
  );
  if (sha(bytes) === transition.historicalSha256) {
    assert.equal(bytes.length, transition.historicalBytes);
    return bytes;
  }
  assert.equal(
    sha(bytes),
    transition.successorSha256,
    "UNREVIEWED_PROVIDER_SOURCE_TRANSITION",
  );
  assert.equal(bytes.length, transition.successorBytes);
  const snapshot = fileURLToPath(
    new URL("../fixtures/provider-boundary-historical.txt", import.meta.url),
  );
  assert.equal(
    fs.realpathSync(snapshot),
    snapshot,
    "PROVIDER_HISTORICAL_SNAPSHOT_SYMLINK",
  );
  assert.ok(fs.lstatSync(snapshot).isFile());
  const historical = fs.readFileSync(snapshot);
  assert.equal(historical.length, transition.historicalBytes);
  assert.equal(
    sha(historical),
    transition.historicalSha256,
    "PROVIDER_HISTORICAL_BYTES_CHANGED",
  );
  return historical;
}
