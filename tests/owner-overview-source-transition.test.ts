import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {
  assertOwnerOverviewSourceTransition,
  ownerOverviewTransitionAnchors,
} from "../scripts/owner-overview-source-transition.mjs";
const root = path.resolve(import.meta.dirname, "..");
const hash = (bytes: Buffer) =>
  crypto.createHash("sha256").update(bytes).digest("hex");

test("owner UI source transition preserves historical application and session manifests byte for byte", () => {
  const expected = {
    "production-apps-integration-v1.json":
      "b1a12b9c83899054db6b47e27a4929439133c2bb3b01969e3d503191beecad30",
    "custom-app-session-attestation-v1.json":
      "a1ac3e8bac6d1f77082baf3c1578d4fe8988fd91bbcc2c5fcc56e24e27fbc4a3",
  };
  for (const [file, sha] of Object.entries(expected))
    assert.equal(
      hash(fs.readFileSync(path.join(root, "packages/release", file))),
      sha,
    );
  const manifests = [
    "production-apps-integration-v1.json",
    "production-session-integration-v1.json",
  ].flatMap(
    (file) =>
      JSON.parse(
        fs.readFileSync(path.join(root, "packages/release", file), "utf8"),
      ).integratedSourceFiles,
  );
  for (const [file, prior] of Object.entries(ownerOverviewTransitionAnchors))
    assert.equal(
      manifests.find((item: { path: string }) => item.path === file).sha256,
      prior,
    );
});
for (const [file, prior] of Object.entries(ownerOverviewTransitionAnchors))
  test(`${file}: only exact reviewed complete bytes and historical anchor are accepted`, () => {
    const bytes = fs.readFileSync(path.join(root, file));
    assert.equal(
      assertOwnerOverviewSourceTransition(file, prior, root, bytes),
      true,
    );
    const changed = Buffer.from(bytes);
    changed[0] ^= 1;
    for (const bad of [
      changed,
      bytes.subarray(0, -1),
      Buffer.concat([bytes, Buffer.from("\n// extra\n")]),
    ])
      assert.throws(
        () => assertOwnerOverviewSourceTransition(file, prior, root, bad),
        /UNREVIEWED_OWNER_UI_SOURCE/,
      );
    for (const badHash of ["0".repeat(64), hash(bytes)])
      assert.throws(
        () => assertOwnerOverviewSourceTransition(file, badHash, root, bytes),
        /OWNER_UI_HISTORICAL_HASH_CHANGED/,
      );
  });
test("owner UI overlay cannot apply to any other path or substitute another reviewed file", () => {
  for (const file of [
    ".env.example",
    "apps/os/lib/auth.ts",
    "__proto__",
    "../apps/os/app/os/[[...segments]]/page.tsx",
  ])
    assert.equal(
      assertOwnerOverviewSourceTransition(
        file,
        "0".repeat(64),
        root,
        Buffer.from("x"),
      ),
      false,
    );
  const rows = Object.entries(ownerOverviewTransitionAnchors);
  for (const [file, prior] of rows)
    for (const [other] of rows)
      if (file !== other)
        assert.throws(
          () =>
            assertOwnerOverviewSourceTransition(
              file,
              prior,
              root,
              fs.readFileSync(path.join(root, other)),
            ),
          /UNREVIEWED_OWNER_UI_SOURCE/,
        );
});
