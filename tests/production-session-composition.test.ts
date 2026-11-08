import { assertOwnerOverviewSourceTransition } from "../scripts/owner-overview-source-transition.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import { sessionAttestationPayload } from "../scripts/session-attestation-payload.mjs";

test("Original-session production composition pins complete runtime and unchanged prior release policies", () => {
  const m = JSON.parse(
    fs.readFileSync(
      "packages/release/production-session-integration-v1.json",
      "utf8",
    ),
  );
  for (const k of [
    "authorization",
    "fullReleaseEligible",
    "defaultEnabled",
    "numberedMigrationsChanged",
    "customerPolicyChanged",
  ])
    assert.equal(m[k], false, k);
  for (const f of [...m.integratedSourceFiles, ...m.preservedCompositionFiles])
    if (!assertOwnerOverviewSourceTransition(f.path, f.sha256))
      assert.equal(
        crypto
          .createHash("sha256")
          .update(fs.readFileSync(f.path))
          .digest("hex"),
        f.sha256,
        f.path,
      );
  const { spec } = sessionAttestationPayload();
  assert.equal(spec.tables.length, 1);
  assert.equal(spec.functions.length, 8);
  assert.equal(spec.existingSessionsBackfilled, false);
});
