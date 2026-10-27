import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  ciBrowserArtifacts,
  ciLogDestination,
  ciPreserveOutput,
  ciScreenshotPath,
} from "../scripts/ci-output-policy.mjs";

test("bounded output mode retains neither raw server logs nor browser artifacts", () => {
  const environment = { KXRA_CI_BOUNDED_OUTPUT: "true" };
  for (const name of [
    "application.log",
    "marketing-production.log",
    "postgres.log",
  ])
    assert.equal(
      ciLogDestination("/generated-fixture", name, environment),
      os.devNull,
    );
  assert.deepEqual(ciBrowserArtifacts(environment), {
    trace: "off",
    screenshot: "off",
  });
  assert.equal(ciPreserveOutput(environment), "never");
  assert.equal(
    ciScreenshotPath(".runtime/reference-baseline/home.png", environment),
    undefined,
  );
  assert.deepEqual(environment, { KXRA_CI_BOUNDED_OUTPUT: "true" });
});

test("existing diagnostics remain the default and unsafe log paths are rejected", () => {
  assert.equal(
    ciLogDestination("/generated-fixture", "application.log", {}),
    path.join("/generated-fixture", "application.log"),
  );
  assert.equal(ciPreserveOutput({}), "always");
  assert.equal(
    ciScreenshotPath(".runtime/reference-baseline/home.png", {}),
    ".runtime/reference-baseline/home.png",
  );
  assert.deepEqual(ciBrowserArtifacts({}), {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  });
  for (const name of [
    "../private.log",
    "/private.log",
    "other/trace.log",
    "a.log\n",
  ])
    assert.throws(
      () =>
        ciLogDestination("/generated-fixture", name, {
          KXRA_CI_BOUNDED_OUTPUT: "true",
        }),
      /CI_LOG_NAME_REJECTED/,
    );
});

test("disabled Next development MCP logger does not create or retain a raw log", () => {
  const require = createRequire(import.meta.url);
  const {
    FileLogger,
  } = require("next/dist/server/dev/browser-logs/file-logger.js");
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "kxra-disabled-logger-"),
  );
  const logger = new FileLogger();
  try {
    logger.initialize(directory, false);
    logger.logServer("ERROR", "SYNTHETIC_NOT_RETAINED");
    logger.logBrowser("ERROR", "SYNTHETIC_NOT_RETAINED");
    logger.forceFlush();
    assert.equal(logger.isEnabled(), false);
    assert.equal(fs.existsSync(path.join(directory, "logs")), false);
  } finally {
    logger.destroy();
    fs.rmSync(directory, { recursive: true });
  }
});
