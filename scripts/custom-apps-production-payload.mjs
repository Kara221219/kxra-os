// Offline byte and inventory verification only. No database/hosting/activation port.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import assert from "node:assert/strict";
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
export function customAppsProductionPayload(
  root = path.resolve(import.meta.dirname, ".."),
) {
  const spec = JSON.parse(
    fs.readFileSync(
      path.join(root, "database/production/custom-apps-v1.manifest.json"),
      "utf8",
    ),
  );
  assert.equal(spec.classification, "REVIEW_ONLY_NOT_HOSTED_AUTHORIZATION");
  for (const k of [
    "defaultEnabled",
    "hostedEligible",
    "numberedMigrationsChanged",
    "policyOrFinancialDataSeeded",
    "hostedExecutorImplemented",
  ])
    assert.equal(spec[k], false);
  assert.equal(spec.payload, "database/production/custom-apps-v1.sql");
  const file = path.join(root, spec.payload);
  assert.equal(fs.realpathSync(file), file);
  assert.equal(fs.lstatSync(file).isFile(), true);
  const bytes = fs.readFileSync(file);
  assert.equal(
    sha(bytes),
    spec.payloadSha256,
    "Unreviewed custom-app production payload bytes",
  );
  const sql = bytes.toString("utf8");
  assert.deepEqual(
    [...sql.matchAll(/create table ([\w.]+)\(/g)].map((m) => m[1]).sort(),
    spec.tables,
  );
  assert.deepEqual(
    [...sql.matchAll(/create function ([\w.]+)\(/g)].map((m) => m[1]).sort(),
    spec.functions,
  );
  assert.deepEqual(
    [
      ...sql.matchAll(
        /create trigger a00_custom_app_authority .*? on ([\w.]+) for each statement/g,
      ),
    ]
      .map((m) => m[1])
      .sort(),
    spec.authorityFenceTables,
  );
  for (const source of spec.localEngineSources)
    assert.equal(
      sha(fs.readFileSync(path.join(root, source.path))),
      source.sha256,
    );
  return { spec, sql };
}
export function assertCustomAppsCatalogDelta(before, after, spec) {
  const key = (r) => r.schema + "." + r.name;
  const oldTables = new Set(before.tables.map(key)),
    oldFunctions = new Set(
      before.functions.map((r) => key(r) + "(" + r.arguments + ")"),
    );
  assert.deepEqual(
    after.tables
      .filter((r) => !oldTables.has(key(r)))
      .map(key)
      .sort(),
    [...spec.tables, "kxra.custom_app_reviews_sequence_seq"].sort(),
  );
  assert.deepEqual(
    after.functions
      .filter((r) => !oldFunctions.has(key(r) + "(" + r.arguments + ")"))
      .map(key)
      .sort(),
    spec.functions,
  );
  for (const section of Object.keys(before)) {
    for (const row of before[section])
      assert.ok(
        after[section].some((r) => JSON.stringify(r) === JSON.stringify(row)),
        "Canonical catalogue row changed in " + section,
      );
  }
}
