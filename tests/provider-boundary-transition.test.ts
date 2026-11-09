import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import { historicalCompositionBytes } from "./support/composition-policy-bytes";
import {
  historicalProviderBoundaryBytes,
  providerBoundaryTransition as transition,
} from "./support/provider-boundary-transition";

const sha = (bytes: Buffer) =>
  crypto.createHash("sha256").update(bytes).digest("hex");
const root = new URL("../", import.meta.url);
const original = fs.readFileSync(
  new URL("tests/fixtures/provider-boundary-historical.txt", root),
);
const successor = fs.readFileSync(new URL(transition.path, root));

test("provider source transition preserves the complete immutable manifest and exact predecessor/successor bytes", () => {
  const bytes = fs.readFileSync(
    new URL("packages/release/production-github-integration-v1.json", root),
  );
  assert.equal(
    sha(bytes),
    "380e941ae76c8fbc1ad9f86a09dede2f6859198dbaf0a8afed3a26654b60e5aa",
  );
  const manifest = JSON.parse(bytes.toString("utf8"));
  assert.deepEqual(
    manifest.sourceFiles.find(
      (f: { path: string }) => f.path === transition.path,
    ),
    {
      path: transition.path,
      sha256: transition.historicalSha256,
      bytes: transition.historicalBytes,
      appendOnlyIntegrationNotes: false,
    },
  );
  assert.equal(sha(original), transition.historicalSha256);
  assert.equal(original.length, transition.historicalBytes);
  assert.equal(sha(successor), transition.successorSha256);
  assert.equal(successor.length, transition.successorBytes);
  for (const source of [original, successor]) {
    assert.deepEqual(
      historicalProviderBoundaryBytes(
        transition.path,
        source,
        transition.historicalSha256,
      ),
      original,
    );
    assert.deepEqual(
      historicalCompositionBytes(
        transition.path,
        source,
        transition.historicalSha256,
      ),
      original,
    );
  }
});

test("provider source transition rejects altered old/new bytes, activation, append, truncation, paths and expected pins", () => {
  for (const source of [original, successor]) {
    const mutated = Buffer.from(source);
    mutated[0] ^= 1;
    for (const bytes of [
      mutated,
      Buffer.concat([source, Buffer.from("\n")]),
      source.subarray(0, -1),
      Buffer.from(
        source
          .toString()
          .replace(
            'process.env.KXRA_AI_ENABLED !== "true"',
            'process.env.KXRA_AI_ENABLED === "false"',
          ),
      ),
    ]) {
      assert.throws(() =>
        historicalProviderBoundaryBytes(
          transition.path,
          bytes,
          transition.historicalSha256,
        ),
      );
      assert.throws(() =>
        historicalCompositionBytes(
          transition.path,
          bytes,
          transition.historicalSha256,
        ),
      );
      // Neither a proposed new manifest hash nor self-consistent changed source
      // can bypass the original pin via the general unchanged-file fastpath.
      assert.throws(() =>
        historicalCompositionBytes(transition.path, bytes, sha(bytes)),
      );
    }
  }
  for (const expected of ["0".repeat(64), transition.successorSha256])
    assert.throws(() =>
      historicalCompositionBytes(transition.path, successor, expected),
    );
  for (const path of [
    ".env.example",
    "packages/workspace/other.ts",
    "./" + transition.path,
    "../" + transition.path,
    transition.path.replace("/", "//"),
    transition.path.replace("/", "/../"),
    "/" + transition.path,
    transition.path.replace("/", "\\"),
  ]) {
    assert.throws(() =>
      historicalProviderBoundaryBytes(
        path,
        successor,
        transition.historicalSha256,
      ),
    );
    assert.throws(() =>
      historicalCompositionBytes(path, successor, transition.historicalSha256),
    );
    // A self-consistent replacement pin must not route an alias through the
    // generic unchanged-hash case before the exact provider transition.
    if (path !== ".env.example" && path !== "packages/workspace/other.ts") {
      assert.throws(() =>
        historicalCompositionBytes(path, successor, sha(successor)),
      );
      assert.throws(() =>
        historicalProviderBoundaryBytes(path, successor, sha(successor)),
      );
    }
  }
});
