import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { exampleCustomApp } from "../packages/custom-apps/contract";
import {
  validAppValues,
  emptyAppValues,
} from "../packages/custom-apps/records";
import { acquireNativeFixtureLease } from "../scripts/native-fixture-lease.mjs";
test("typed records require exactly the pinned fields and preserve value types", () => {
  const good = { brief: "Synthetic record", priority: "High", reviewed: true };
  assert.ok(validAppValues(exampleCustomApp, good));
  assert.equal(
    validAppValues(exampleCustomApp, emptyAppValues(exampleCustomApp)),
    false,
  );
  for (const data of [
    null,
    [],
    {},
    { ...good, extra: 1 },
    { ...good, brief: null },
    { ...good, reviewed: "false" },
    { ...good, priority: "Unknown" },
    { ...good, brief: " " },
    { ...good, brief: "x".repeat(4001) },
    Object.assign(Object.create({ brief: "inherited" }), {
      priority: "High",
      reviewed: true,
    }),
  ])
    assert.equal(validAppValues(exampleCustomApp, data), false);
  assert.equal(
    validAppValues(
      {
        ...exampleCustomApp,
        fields: [
          {
            key: "yes",
            label: "Required consent",
            type: "checkbox",
            required: true,
          },
        ],
      },
      { yes: false },
    ),
    false,
  );
});
test("fixture lease refuses an occupied target and only releases its own token", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kxra-lease-unit-")),
    file = path.join(dir, "lease");
  try {
    const release = acquireNativeFixtureLease("custom-app-unit", file);
    const original = fs.readFileSync(file, "utf8");
    assert.throws(() => acquireNativeFixtureLease("other", file), /held/);
    assert.equal(fs.readFileSync(file, "utf8"), original);
    release();
    assert.equal(fs.existsSync(file), false);
    fs.mkdirSync(file);
    assert.throws(() => acquireNativeFixtureLease("other", file), /held/);
    fs.rmdirSync(file);
    const releaseChanged = acquireNativeFixtureLease("unit", file);
    // codeql[js/file-system-race] The test replaces the lease after the owner read to prove release refuses a foreign token.
    fs.writeFileSync(file, JSON.stringify({ token: "foreign" }));
    assert.throws(releaseChanged, /ownership changed/);
    assert.equal(JSON.parse(fs.readFileSync(file, "utf8")).token, "foreign");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
