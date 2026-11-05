import { test } from "node:test";
import { assertSessionAttestationSourceTransition } from "../scripts/session-attestation-payload.mjs";
import assert from "node:assert/strict";
import fs from "node:fs";
import { customAppsProductionPayload } from "../scripts/custom-apps-production-payload.mjs";

test("Combined production-app source and prior composition policies remain byte pinned", () => {
  const m = JSON.parse(
    fs.readFileSync(
      "packages/release/production-apps-integration-v1.json",
      "utf8",
    ),
  );
  assert.equal(m.authorization, false);
  assert.equal(m.fullReleaseEligible, false);
  assert.equal(m.defaultEnabled, false);
  assert.equal(m.numberedMigrationsChanged, false);
  assert.equal(m.customerPolicyChanged, false);
  for (const f of [...m.integratedSourceFiles, ...m.preservedCompositionFiles])
    assertSessionAttestationSourceTransition(f.path, f.sha256);
  const { spec } = customAppsProductionPayload();
  assert.equal(spec.functions.length, 15);
  assert.equal(spec.tables.length, 6);
  assert.equal(spec.authorityFenceTables.length, 27);
});
