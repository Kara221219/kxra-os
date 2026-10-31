import test from "node:test";
import assert from "node:assert/strict";
import {
  ciPhaseConfiguration,
  serviceVerificationCommands,
  runPrerequisitePhases,
  disposablePostgresCleanupPassed,
} from "../scripts/ci-phases.mjs";

test("full CI owns a fresh browser runtime after a separate nonrecursive service phase", () => {
  const browser = ciPhaseConfiguration([]);
  const services = ciPhaseConfiguration(["--services-only"]);
  assert.equal(browser.needsServicePhase, true);
  assert.equal(services.needsServicePhase, false);
  assert.notEqual(browser.runtimeDirectory, services.runtimeDirectory);
  assert.equal(browser.runtimeDirectory, "ci");
  assert.equal(services.runtimeDirectory, "ci-services");
  assert.equal(browser.diagnosticsAllowed, true);
  assert.equal(services.diagnosticsAllowed, false);
  assert.equal(Object.isFrozen(browser), true);
});

test("service phase preserves full services and original restart/restore proof before browser work", () => {
  assert.deepEqual(serviceVerificationCommands, [
    ["test:dependencies"],
    ["test"],
    ["test:migrations"],
    ["test:restart"],
    ["test:restore"],
  ]);
  assert.equal(Object.isFrozen(serviceVerificationCommands), true);
  assert.ok(serviceVerificationCommands.every(Object.isFrozen));
});

test("focused workspace mode stays separate and incompatible modes are rejected", () => {
  const focused = ciPhaseConfiguration(["--team-workspace"]);
  assert.equal(focused.runtimeDirectory, "team-ci");
  assert.equal(focused.needsServicePhase, false);
  assert.equal(focused.diagnosticsAllowed, false);
  assert.throws(
    () => ciPhaseConfiguration(["--services-only", "--team-workspace"]),
    /CI_PHASE_CONFLICT/,
  );
});

test("a failed or uncertain child cleanup prevents every subsequent fixture", () => {
  for (const status of [1, null]) {
    const started: string[] = [];
    assert.throws(
      () =>
        runPrerequisitePhases((flag: string) => {
          started.push(flag);
          return flag === "--room-delivery-only" ? status : 0;
        }),
      /CI_PREREQUISITE_FAILED/,
    );
    assert.deepEqual(started, ["--services-only", "--room-delivery-only"]);
  }
  assert.equal(disposablePostgresCleanupPassed(0, 3), true);
  for (const [stop, probe] of [
    [1, 3],
    [null, 3],
    [0, 0],
    [0, 1],
    [0, null],
  ])
    assert.equal(disposablePostgresCleanupPassed(stop, probe), false);
});
