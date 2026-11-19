import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  hostedPairedSetupPayload,
  assertHostedPairedSetupTransition,
} from "../scripts/hosted-paired-setup-payload.mjs";
test("hosted setup overlay preserves historical exact source and release boundaries", () => {
  const spec = hostedPairedSetupPayload();
  for (const change of spec.transitions)
    assertHostedPairedSetupTransition(change.path, change.priorSha256);
  assert.equal(spec.transitions.length, 6);
});
test("unknown source edits, changed prior hashes and activation edits cannot pass overlay", () => {
  const spec = hostedPairedSetupPayload(),
    root = fs.mkdtempSync(path.join(os.tmpdir(), "kxra-hosted-setup-pins-"));
  try {
    for (const file of [
      ...spec.sourceFiles,
      ...spec.preservedSources,
      { path: "packages/release/hosted-paired-setup-v1.json" },
    ]) {
      const target = path.join(root, file.path);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(file.path, target);
    }
    const change = spec.transitions[0];
    assert.throws(() =>
      assertHostedPairedSetupTransition(change.path, "0".repeat(64), root),
    );
    fs.appendFileSync(path.join(root, change.path), "\n// unknown edit\n");
    assert.throws(() => hostedPairedSetupPayload(root));
    fs.copyFileSync(change.path, path.join(root, change.path));
    const manifest = path.join(
      root,
      "packages/release/hosted-paired-setup-v1.json",
    );
    fs.writeFileSync(
      manifest,
      JSON.stringify({ ...spec, defaultEnabled: true }),
    );
    assert.throws(() => hostedPairedSetupPayload(root));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
