import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  recoveryBrowserLaunchOptions,
  recoveryBrowserFailureCategory,
} from "../scripts/recovery-ui-browser.mjs";

test("Linux Actions uses installed Chrome with native sandbox and no fallback overrides", () => {
  const env = { HOME: "/synthetic-owned-profile" };
  const options = recoveryBrowserLaunchOptions("linux", "true", env);
  assert.deepEqual(options, {
    host: "127.0.0.1",
    headless: true,
    chromiumSandbox: true,
    channel: "chrome",
    env,
    timeout: 30000,
  });
  assert.equal("args" in options, false);
  assert.equal("executablePath" in options, false);
  assert.equal("ignoreDefaultArgs" in options, false);
});

test("Mac and non-Actions Linux retain the downloaded browser and native sandbox", () => {
  for (const [platform, actions] of [
    ["darwin", "true"],
    ["darwin", undefined],
    ["linux", undefined],
    ["linux", "TRUE"],
    ["win32", "true"],
  ]) {
    const options = recoveryBrowserLaunchOptions(platform, actions, {});
    assert.equal("channel" in options, false);
    assert.equal(options.chromiumSandbox, true);
    assert.equal(options.timeout, 30000);
  }
});

test("startup error classification returns only finite categories and excludes planted secrets", () => {
  const secret = "PLANTED_PASSWORD_TOKEN_PRIVATE_URL";
  for (const [message, expected] of [
    [`${secret} No usable sandbox`, "NATIVE_SANDBOX_UNAVAILABLE"],
    [`Failed to move to new namespace ${secret}`, "NATIVE_SANDBOX_UNAVAILABLE"],
    [`Executable doesn't exist ${secret}`, "BROWSER_BINARY_UNAVAILABLE"],
    [
      `Chromium distribution 'chrome' is not found ${secret}`,
      "BROWSER_BINARY_UNAVAILABLE",
    ],
    [`WebSocket error ${secret}`, "BROWSER_CONNECTION_FAILED"],
    [secret, "BROWSER_FAILURE_UNCLASSIFIED"],
  ]) {
    const result = recoveryBrowserFailureCategory(Error(message));
    assert.equal(result, expected);
    assert.equal(result.includes(secret), false);
  }
  assert.equal(
    recoveryBrowserFailureCategory({ name: "TimeoutError", message: secret }),
    "BROWSER_OPERATION_TIMEOUT",
  );
  assert.equal(
    recoveryBrowserFailureCategory(null),
    "BROWSER_FAILURE_UNCLASSIFIED",
  );
  assert.equal(
    recoveryBrowserFailureCategory({
      message: "x".repeat(32768) + "No usable sandbox",
    }),
    "BROWSER_FAILURE_UNCLASSIFIED",
  );
});

test("harness keeps one launch, distinct phases, original bounds and request/privacy guards", () => {
  const source = fs.readFileSync(
    "scripts/verify-recovery-stepup-forms.mjs",
    "utf8",
  );
  assert.equal((source.match(/chromium\.launchServer\(/g) || []).length, 1);
  for (const text of [
    "BROWSER_LAUNCH",
    "BROWSER_CONNECT",
    "180000",
    "10000",
    'serviceWorkers: "block"',
    'req.method() === "POST"',
    "rawErrorDiscarded: true",
    "ownedBrowserGroupAbsent: true",
  ])
    assert.ok(source.includes(text), text);
  assert.equal(source.includes("--no-sandbox"), false);
  assert.equal(source.includes("console.error(error"), false);
});
