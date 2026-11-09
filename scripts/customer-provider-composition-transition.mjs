// Offline, exact-byte verification only. Never release or dispatch authority.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
const root = path.resolve(import.meta.dirname, "..");
const sha = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
export const customerProviderCompositionTransitions = Object.freeze({
  "tests/support/composition-policy-bytes.ts": Object.freeze({
    historical:
      "4224467ce6833e5129b22188b0c29659a3c667b38256b7431e9c627486690316",
    successor:
      "0bec576342da26b62bb992404e03f21db5103803394b8f95db3f060b73f65afd",
  }),
  "scripts/hosted-paired-setup-payload.mjs": Object.freeze({
    historical:
      "66577b16812a33ea0f2757dd7f217b0300a3e09794fffc933e17b99e25790833",
    successor:
      "bc2d23b706f1b4b0d4d814c2f9899a527fbee36f7ed7b0f0c90c1159c54d5447",
  }),
});
const manifests = Object.freeze({
  "production-github-integration-v1.json":
    "380e941ae76c8fbc1ad9f86a09dede2f6859198dbaf0a8afed3a26654b60e5aa",
  "production-paired-integration-v1.json":
    "38b9b43a226211647d61529b250e2040213c9f9e7ceedcc19a3e2055cf24af33",
  "hosted-paired-setup-v1.json":
    "53e708b1017cdcc09f86206c8d75cd6f640ab54907fe13cbdacebb9b41ab705a",
});
function canonicalRelativePath(file) {
  assert.ok(
    typeof file === "string" &&
      !path.isAbsolute(file) &&
      !file.includes("\\") &&
      file.split("/").every((part) => part && part !== "." && part !== ".."),
    "PROVIDER_COMPOSITION_NONCANONICAL_PATH",
  );
}
export function readCustomerProviderCompositionFile(repo, file) {
  canonicalRelativePath(file);
  const base = fs.realpathSync(repo);
  const target = path.resolve(base, file);
  assert.ok(
    target.startsWith(base + path.sep),
    "PROVIDER_COMPOSITION_PATH_ESCAPE",
  );
  assert.equal(fs.realpathSync(target), target, "PROVIDER_COMPOSITION_SYMLINK");
  assert.ok(fs.lstatSync(target).isFile(), "PROVIDER_COMPOSITION_NOT_REGULAR");
  return fs.readFileSync(target);
}
const implementation = fs.readFileSync(fileURLToPath(import.meta.url));
export function assertCustomerProviderCompositionRoot(repo = root) {
  assert.deepEqual(
    readCustomerProviderCompositionFile(
      repo,
      "scripts/customer-provider-composition-transition.mjs",
    ),
    implementation,
    "PROVIDER_COMPOSITION_MAPPING_CHANGED",
  );
  // Anchor original manifests before any old/new-source fastpath. A changed
  // manifest or caller-supplied expected hash cannot bless a different source.
  for (const [name, expected] of Object.entries(manifests))
    assert.equal(
      sha(
        readCustomerProviderCompositionFile(repo, "packages/release/" + name),
      ),
      expected,
      "PROVIDER_COMPOSITION_MANIFEST_CHANGED",
    );
}
export function assertCustomerProviderCompositionTransition(
  file,
  historical,
  repo = root,
) {
  canonicalRelativePath(file);
  if (!Object.hasOwn(customerProviderCompositionTransitions, file))
    return false;
  const transition = customerProviderCompositionTransitions[file];
  assertCustomerProviderCompositionRoot(repo);
  assert.equal(
    historical,
    transition.historical,
    "PROVIDER_COMPOSITION_HISTORICAL_PIN_CHANGED",
  );
  const actual = sha(readCustomerProviderCompositionFile(repo, file));
  assert.ok(
    actual === transition.historical || actual === transition.successor,
    "UNREVIEWED_PROVIDER_COMPOSITION_SOURCE",
  );
  return true;
}
