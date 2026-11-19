// Exact local UI successor. Never release authorization or runtime authority.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import assert from "node:assert/strict";
const repo = path.resolve(import.meta.dirname, "..");
const hash = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
// Both predecessors and successors are anchored here, never trusted from JSON.
const expected = {
  version: 1,
  classification:
    "LOCAL_CUSTOMER_FIRST_USE_SOURCE_TRANSITION_NOT_RELEASE_AUTHORIZATION",
  baseCommit: "b78cedcbc1af87be789b8b20e2b89c992e6612e3",
  authorization: false,
  fullReleaseEligible: false,
  defaultEnabled: false,
  customerPolicyChanged: false,
  numberedMigrationsChanged: false,
  transitions: [
    {
      path: "apps/os/app/os/[[...segments]]/page.tsx",
      priorSha256:
        "7b112f91e130f680aa13609e1a72377d9f0e5295bad60de5979d92f19b439a6a",
      sha256:
        "195c5edf66f329529f30a50b17fefed77dc2ec23beccba244f932bdccde4704b",
    },
    {
      path: "apps/os/components/TeamWorkspace.tsx",
      priorSha256:
        "8d6be8aa5578e47d24909f9f36ca7a00d03fb1b8ce742309dfdd6b3cc09256ee",
      sha256:
        "807a801bfdf545143e4969706e166248a6f5a8bbda6321ad6c3c3b59631aa07d",
    },
  ],
};
export const customerFirstUseTransitionAnchors = Object.freeze(
  Object.fromEntries(
    expected.transitions.map((item) => [item.path, item.priorSha256]),
  ),
);
export function assertCustomerFirstUseSourceTransition(
  file,
  priorSha256,
  root = repo,
  bytes,
) {
  if (!Object.hasOwn(customerFirstUseTransitionAnchors, file)) return false;
  assert.equal(
    hash(
      fs.readFileSync(
        path.join(
          root,
          "packages/release/owner-overview-source-transition-v1.json",
        ),
      ),
    ),
    "cf1d8351a6d3bb3d65b847255e3f94677020dc7ca18499b92025a59adb40bd24",
    "CUSTOMER_FIRST_USE_PREDECESSOR_CHANGED",
  );
  const record = JSON.parse(
    fs.readFileSync(
      path.join(
        root,
        "packages/release/customer-first-use-source-transition-v1.json",
      ),
      "utf8",
    ),
  );
  assert.deepEqual(record, expected, "CUSTOMER_FIRST_USE_MAPPING_CHANGED");
  const transition = expected.transitions.find((item) => item.path === file);
  assert.equal(
    priorSha256,
    transition.priorSha256,
    "CUSTOMER_FIRST_USE_HISTORICAL_HASH_CHANGED",
  );
  assert.equal(
    hash(bytes ?? fs.readFileSync(path.join(root, file))),
    transition.sha256,
    "UNREVIEWED_OWNER_UI_SOURCE: UNREVIEWED_CUSTOMER_FIRST_USE_SOURCE",
  );
  return true;
}
