// Exact reviewed UI source transition only. No release or runtime authority.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import assert from "node:assert/strict";
const repo = path.resolve(import.meta.dirname, "..");
export const ownerOverviewTransitionAnchors = Object.freeze({
  "apps/os/components/TeamWorkspace.tsx":
    "32360768f2ab8caba9e9f3859d8a9a7c1ce8e04cf15d10de56b65b036e75764e",
  "apps/os/app/os/[[...segments]]/page.tsx":
    "8d08643000c3b03bc3061e198fbaef275c0968001a853c027bcbfe8d77566604",
  "scripts/session-attestation-payload.mjs":
    "4473ed9f541553dd3e211b43c10f3b98e6a3f0d7f064b67d262f80e85d142c70",
  "tests/production-session-composition.test.ts":
    "253b17f0f1daa7463ad40f8568e069909f3e7c5fa414860a8a5d17f5fdf2fd7f",
});
export const ownerOverviewTransitionPaths = Object.freeze(
  Object.keys(ownerOverviewTransitionAnchors),
);
export function assertOwnerOverviewSourceTransition(
  file,
  priorSha256,
  root = repo,
  bytes,
) {
  if (!ownerOverviewTransitionPaths.includes(file)) return false;
  const record = JSON.parse(
    fs.readFileSync(
      path.join(
        root,
        "packages/release/owner-overview-source-transition-v1.json",
      ),
      "utf8",
    ),
  );
  assert.equal(
    record.classification,
    "LOCAL_OWNER_UI_SOURCE_TRANSITION_NOT_RELEASE_AUTHORIZATION",
  );
  assert.equal(record.baseCommit, "7f1d1112f81a35d304a7e8810d4f68a5e4b2572c");
  for (const flag of [
    "authorization",
    "fullReleaseEligible",
    "defaultEnabled",
    "customerPolicyChanged",
    "numberedMigrationsChanged",
  ])
    assert.equal(record[flag], false);
  assert.deepEqual(
    record.transitions.map((item) => item.path).sort(),
    [...ownerOverviewTransitionPaths].sort(),
  );
  for (const item of record.transitions)
    assert.equal(
      item.priorSha256,
      ownerOverviewTransitionAnchors[item.path],
      "OWNER_UI_HISTORICAL_HASH_CHANGED",
    );
  const transition = record.transitions.find((item) => item.path === file);
  assert.equal(
    priorSha256,
    transition.priorSha256,
    "OWNER_UI_HISTORICAL_HASH_CHANGED",
  );
  const actual = crypto
    .createHash("sha256")
    .update(bytes || fs.readFileSync(path.join(root, file)))
    .digest("hex");
  assert.equal(actual, transition.sha256, "UNREVIEWED_OWNER_UI_SOURCE");
  return true;
}
