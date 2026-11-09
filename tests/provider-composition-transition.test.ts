import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import {
  assertCustomerProviderCompositionTransition,
  customerProviderCompositionTransitions as transitions,
} from "../scripts/customer-provider-composition-transition.mjs";
import {
  assertHostedPairedSetupTransition,
  hostedPairedSetupPayload,
} from "../scripts/hosted-paired-setup-payload.mjs";
const root = path.resolve(import.meta.dirname, "..");
const sha = (bytes: Buffer) =>
  crypto.createHash("sha256").update(bytes).digest("hex");
const manifests = [
  "production-github-integration-v1.json",
  "production-paired-integration-v1.json",
  "hosted-paired-setup-v1.json",
];
const bytes = (file: string) => fs.readFileSync(path.join(root, file));

test("offline composition mapping is frozen and contains only the two exact required source transitions", () => {
  assert.deepEqual(transitions, {
    "tests/support/composition-policy-bytes.ts": {
      historical:
        "4224467ce6833e5129b22188b0c29659a3c667b38256b7431e9c627486690316",
      successor:
        "47cc0ec9e28f9c722de10511838f8e280e55de65f5e67e5245c90c2e0aa6831e",
    },
    "scripts/hosted-paired-setup-payload.mjs": {
      historical:
        "66577b16812a33ea0f2757dd7f217b0300a3e09794fffc933e17b99e25790833",
      successor:
        "bc2d23b706f1b4b0d4d814c2f9899a527fbee36f7ed7b0f0c90c1159c54d5447",
    },
  });
  assert.equal(
    Reflect.set(transitions, "packages/workspace/unreviewed.ts", {}),
    false,
  );
  for (const [file, transition] of Object.entries(transitions)) {
    assert.equal(Reflect.set(transition, "successor", "0".repeat(64)), false);
    assert.equal(Reflect.deleteProperty(transitions, file), false);
    assert.equal(sha(bytes(file)), transition.successor);
    assert.equal(
      assertCustomerProviderCompositionTransition(
        file,
        transition.historical,
        root,
      ),
      true,
    );
    assertHostedPairedSetupTransition(file, transition.historical, root);
    for (const invalid of [transition.successor, "0".repeat(64), ""])
      assert.throws(
        () => assertCustomerProviderCompositionTransition(file, invalid, root),
        /PROVIDER_COMPOSITION_HISTORICAL_PIN_CHANGED/,
      );
  }
  for (const file of [
    "__proto__",
    "packages/workspace/provider.ts",
    "apps/os/lib/auth.ts",
  ])
    assert.equal(
      assertCustomerProviderCompositionTransition(file, "0".repeat(64), root),
      false,
    );
});

test("the composed hosted verifier rejects source or original-manifest edits even with rewritten expected pins", () => {
  const temporary = fs.mkdtempSync(
    path.join(os.tmpdir(), "kxra-provider-composition-"),
  );
  const write = (file: string, value: Buffer) => {
    fs.mkdirSync(path.dirname(path.join(temporary, file)), { recursive: true });
    fs.writeFileSync(path.join(temporary, file), value);
  };
  try {
    const spec = hostedPairedSetupPayload(root);
    const files = new Set<string>([
      ...manifests.map((name) => "packages/release/" + name),
      ...Object.keys(transitions),
      "scripts/customer-provider-composition-transition.mjs",
      ...[...spec.sourceFiles, ...spec.preservedSources].map(
        (file: { path: string }) => file.path,
      ),
    ]);
    for (const file of files) write(file, bytes(file));
    assert.doesNotThrow(() => hostedPairedSetupPayload(temporary));
    // Reprove the original hosted overlay negatives from a complete current
    // root, rather than relying on old fixtures missing the new dependency.
    const originalChange = spec.transitions[0];
    assert.throws(() =>
      assertHostedPairedSetupTransition(
        originalChange.path,
        "0".repeat(64),
        temporary,
      ),
    );
    write(
      originalChange.path,
      Buffer.concat([
        bytes(originalChange.path),
        Buffer.from("\n// unreviewed original source\n"),
      ]),
    );
    assert.throws(() => hostedPairedSetupPayload(temporary));
    write(originalChange.path, bytes(originalChange.path));
    const hostedManifest = "packages/release/hosted-paired-setup-v1.json";
    write(
      hostedManifest,
      Buffer.from(JSON.stringify({ ...spec, defaultEnabled: true })),
    );
    assert.throws(() => hostedPairedSetupPayload(temporary));
    write(hostedManifest, bytes(hostedManifest));
    for (const [file, transition] of Object.entries(transitions)) {
      const mutated = Buffer.from(bytes(file));
      mutated[0] ^= 1;
      const other = Object.keys(transitions).find((name) => name !== file)!;
      for (const altered of [
        mutated,
        bytes(file).subarray(0, -1),
        Buffer.concat([bytes(file), Buffer.from("\n")]),
        Buffer.alloc(0),
        bytes(other),
      ]) {
        write(file, altered);
        assert.throws(
          () =>
            assertHostedPairedSetupTransition(
              file,
              transition.historical,
              temporary,
            ),
          /UNREVIEWED_PROVIDER_COMPOSITION_SOURCE/,
        );
        assert.throws(
          () =>
            assertHostedPairedSetupTransition(file, sha(altered), temporary),
          /PROVIDER_COMPOSITION_HISTORICAL_PIN_CHANGED/,
        );
        if (file === "scripts/hosted-paired-setup-payload.mjs")
          assert.throws(
            () => hostedPairedSetupPayload(temporary),
            /UNREVIEWED_PROVIDER_COMPOSITION_SOURCE/,
          );
      }
      write(file, bytes(file));
    }
    for (const name of manifests) {
      const manifest = "packages/release/" + name;
      write(manifest, Buffer.concat([bytes(manifest), Buffer.from("\n")]));
      for (const [file, transition] of Object.entries(transitions))
        assert.throws(
          () =>
            assertHostedPairedSetupTransition(
              file,
              transition.historical,
              temporary,
            ),
          /PROVIDER_COMPOSITION_MANIFEST_CHANGED/,
        );
      assert.throws(
        () => hostedPairedSetupPayload(temporary),
        /PROVIDER_COMPOSITION_MANIFEST_CHANGED/,
      );
      write(manifest, bytes(manifest));
    }
    const mapping = "scripts/customer-provider-composition-transition.mjs";
    for (const changed of [
      Buffer.from("export const changed = true;\n"),
      Buffer.concat([bytes(mapping), Buffer.from("\n")]),
    ]) {
      write(mapping, changed);
      assert.throws(
        () => hostedPairedSetupPayload(temporary),
        /PROVIDER_COMPOSITION_MAPPING_CHANGED/,
      );
      for (const [file, transition] of Object.entries(transitions))
        assert.throws(
          () =>
            assertHostedPairedSetupTransition(
              file,
              transition.historical,
              temporary,
            ),
          /PROVIDER_COMPOSITION_MAPPING_CHANGED/,
        );
    }
    fs.unlinkSync(path.join(temporary, mapping));
    assert.throws(() => hostedPairedSetupPayload(temporary), /ENOENT/);
    for (const [file, transition] of Object.entries(transitions))
      assert.throws(
        () =>
          assertHostedPairedSetupTransition(
            file,
            transition.historical,
            temporary,
          ),
        /ENOENT/,
      );
    write(mapping, bytes(mapping));
    for (const [file, transition] of Object.entries(transitions)) {
      for (const alias of [
        "./" + file,
        file.replace("/", "//"),
        "../" + file,
        path.join(temporary, file),
        file.replace("/", "/../"),
      ])
        assert.throws(
          () =>
            assertHostedPairedSetupTransition(
              alias,
              transition.successor,
              temporary,
            ),
          /PROVIDER_COMPOSITION_NONCANONICAL_PATH/,
        );
      fs.unlinkSync(path.join(temporary, file));
      fs.symlinkSync(path.join(root, file), path.join(temporary, file));
      assert.throws(
        () =>
          assertHostedPairedSetupTransition(
            file,
            transition.historical,
            temporary,
          ),
        /PROVIDER_COMPOSITION_SYMLINK/,
      );
      if (file === "scripts/hosted-paired-setup-payload.mjs")
        assert.throws(
          () => hostedPairedSetupPayload(temporary),
          /PROVIDER_COMPOSITION_SYMLINK/,
        );
      fs.unlinkSync(path.join(temporary, file));
      write(file, bytes(file));
    }
    // The full hosted payload cannot take a symlinked manifest or mapping even
    // when the escaped bytes exactly match the expected content.
    for (const file of [
      mapping,
      ...manifests.map((name) => "packages/release/" + name),
    ]) {
      fs.unlinkSync(path.join(temporary, file));
      fs.symlinkSync(path.join(root, file), path.join(temporary, file));
      assert.throws(
        () => hostedPairedSetupPayload(temporary),
        /PROVIDER_COMPOSITION_SYMLINK/,
      );
      fs.unlinkSync(path.join(temporary, file));
      write(file, bytes(file));
    }
    const support = path.join(temporary, "tests/support");
    fs.renameSync(support, support + "-owned");
    fs.symlinkSync(path.join(root, "tests/support"), support);
    const source = "tests/support/composition-policy-bytes.ts";
    assert.throws(
      () =>
        assertHostedPairedSetupTransition(
          source,
          transitions[source].historical,
          temporary,
        ),
      /PROVIDER_COMPOSITION_SYMLINK/,
    );
    fs.unlinkSync(support);
    fs.renameSync(support + "-owned", support);
    // Manifest-controlled source lists must never choose whether the manifest
    // or its verifier's own source is checked.
    for (const mutate of [
      (value: typeof spec) => {
        value.sourceFiles = value.sourceFiles.filter(
          (item: { path: string }) =>
            item.path !== "scripts/hosted-paired-setup-payload.mjs",
        );
      },
      (value: typeof spec) => {
        value.sourceFiles = [];
      },
      (value: typeof spec) => {
        value.sourceFiles.find(
          (item: { path: string }) =>
            item.path === "scripts/hosted-paired-setup-payload.mjs",
        ).sha256 = sha(bytes("scripts/hosted-paired-setup-payload.mjs"));
      },
      (value: typeof spec) => {
        value.preservedSources = [];
      },
    ]) {
      const value = JSON.parse(bytes(hostedManifest).toString());
      mutate(value);
      write(hostedManifest, Buffer.from(JSON.stringify(value)));
      assert.throws(
        () => hostedPairedSetupPayload(temporary),
        /PROVIDER_COMPOSITION_MANIFEST_CHANGED/,
      );
    }
    write(hostedManifest, bytes(hostedManifest));
    // Changing a source pin and bytes together in the original paired manifest
    // still cannot pass the composed verifier's former equality fastpath.
    const file = "tests/support/composition-policy-bytes.ts";
    const altered = Buffer.concat([bytes(file), Buffer.from("\n// changed\n")]);
    const manifest = "packages/release/production-paired-integration-v1.json";
    const changed = JSON.parse(bytes(manifest).toString());
    changed.integratedSourceFiles.find(
      (entry: { path: string }) => entry.path === file,
    ).sha256 = sha(altered);
    write(file, altered);
    write(manifest, Buffer.from(JSON.stringify(changed)));
    assert.throws(
      () => assertHostedPairedSetupTransition(file, sha(altered), temporary),
      /PROVIDER_COMPOSITION_MANIFEST_CHANGED/,
    );
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});
