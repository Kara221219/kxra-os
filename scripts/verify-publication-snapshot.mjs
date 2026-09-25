import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const directory = path.join(root, "apps", "marketing", "content");
const manifest = JSON.parse(
  fs.readFileSync(path.join(directory, "publication-manifest.json"), "utf8"),
);
const bytes = fs.readFileSync(path.join(directory, manifest.snapshot));
const snapshot = JSON.parse(bytes.toString("utf8"));
assert.equal(
  crypto.createHash("sha256").update(bytes).digest("hex"),
  manifest.sha256,
  "Public snapshot hash differs from its review manifest",
);
assert.equal(manifest.publicationEnabled, false);
assert.equal(snapshot.publicationEnabled, false);
assert.equal(snapshot.status, manifest.status);
console.log(
  `Public snapshot ${snapshot.snapshotId} matches its exact disabled review manifest.`,
);
