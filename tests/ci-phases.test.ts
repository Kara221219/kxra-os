import test from "node:test";
import assert from "node:assert/strict";
import {
  ciPhaseConfiguration,
  serviceVerificationCommands,
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
