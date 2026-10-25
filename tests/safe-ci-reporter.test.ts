import test from "node:test";
import assert from "node:assert/strict";
import { safeTestIdentity } from "./support/safe-ci-reporter";
test("generic failure identity exports only an enum, viewport and public source line", () => {
  assert.deepEqual(
    safeTestIdentity("/runner/tests/e2e/cases.spec.ts", "mobile", 123),
    { suite: "CASES", viewport: "MOBILE", sourceLine: 123 },
  );
  const value = safeTestIdentity(
    "/private/COOKIE_SENTINEL_DO_NOT_EXPORT.spec.ts",
    "desktop",
    1,
  );
  assert.deepEqual(value, {
    suite: "OTHER",
    viewport: "DESKTOP",
    sourceLine: 1,
  });
  assert.equal(
    JSON.stringify(value).includes("COOKIE_SENTINEL_DO_NOT_EXPORT"),
    false,
  );
});
test("generic failure identity rejects unsupported projects and invalid line values", () => {
  for (const line of [-1, NaN, Infinity, 100001, 1.5])
    assert.throws(
      () => safeTestIdentity("cases.spec.ts", "mobile", line),
      /SAFE_REPORTER_IDENTITY_REJECTED/,
    );
  assert.throws(
    () => safeTestIdentity("cases.spec.ts", "POISON_PRIVATE_NAME", 1),
    /SAFE_REPORTER_IDENTITY_REJECTED/,
  );
});
