import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  ciPhaseConfiguration,
  roomVerificationPhases,
} from "../scripts/ci-phases.mjs";

test("complete room operation suites run on distinct fresh serial CI fixtures without consuming original service quotas", () => {
  assert.deepEqual(
    roomVerificationPhases.flatMap((p) => [...p.files]).sort(),
    [
      "tests/operations/hosted-room-boundary.test.ts",
      "tests/operations/hosted-room-operations.test.ts",
      "tests/operations/room-maintenance-boundary.test.ts",
      "tests/operations/room-maintenance.test.ts",
    ].sort(),
  );
  const directories = [
    ciPhaseConfiguration([]).runtimeDirectory,
    ciPhaseConfiguration(["--services-only"]).runtimeDirectory,
  ];
  for (const phase of roomVerificationPhases) {
    const config = ciPhaseConfiguration([phase.flag]);
    assert.equal(config.needsServicePhase, false);
    assert.equal(config.diagnosticsAllowed, false);
    assert.ok(!directories.includes(config.runtimeDirectory));
    directories.push(config.runtimeDirectory);
    for (const file of phase.files) assert.ok(fs.statSync(file).isFile());
    assert.throws(
      () => ciPhaseConfiguration([phase.flag, "--services-only"]),
      /CI_PHASE_CONFLICT/,
    );
  }
  assert.throws(
    () => ciPhaseConfiguration(["--unreviewed-phase"]),
    /CI_PHASE_UNKNOWN/,
  );
  const source = fs.readFileSync("scripts/ci.mjs", "utf8");
  assert.match(source, /runPrerequisitePhases\s*\(/);
  assert.match(source, /\.\.\.phase\.operations\.files/);
});
