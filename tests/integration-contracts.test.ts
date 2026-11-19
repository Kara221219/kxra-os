import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  integrationDeviceCommand,
  integrationHumanCommand,
} from "../packages/integration/contracts";
import { exampleCustomApp } from "../packages/custom-apps/contract";
test("device contract cannot approve, change principal, grant scope or publish an app", () => {
  const envelope = { task_id: crypto.randomUUID(), fence: crypto.randomUUID() };
  for (const action of [
    "approve",
    "enqueue",
    "connect_fixture",
    "IMPORT_APP",
    "PUBLISH_LOCAL",
    "DELEGATE",
  ])
    assert.equal(
      integrationDeviceCommand.safeParse({
        ...envelope,
        command: { action, connection_id: crypto.randomUUID() },
      }).success,
      false,
    );
  const valid = {
    ...envelope,
    command: { action: "app_propose", schema: exampleCustomApp },
  };
  assert.equal(integrationDeviceCommand.safeParse(valid).success, true);
  assert.equal(
    integrationDeviceCommand.safeParse({
      ...valid,
      user_id: crypto.randomUUID(),
    }).success,
    false,
  );
  assert.equal(
    integrationDeviceCommand.safeParse({
      ...envelope,
      command: {
        action: "app_propose",
        schema: { ...exampleCustomApp, code: "alert(1)" },
      },
    }).success,
    false,
  );
});
test("human delegation requires explicit account, task and proposal scope", () => {
  const valid = {
    operation: "DELEGATE",
    task_id: crypto.randomUUID(),
    connection_id: crypto.randomUUID(),
    allow_proposal: false,
  };
  assert.equal(integrationHumanCommand.safeParse(valid).success, true);
  const { allow_proposal, ...missing } = valid;
  assert.equal(integrationHumanCommand.safeParse(missing).success, false);
  assert.equal(
    integrationHumanCommand.safeParse({ ...valid, secret_hash: "a".repeat(64) })
      .success,
    false,
  );
});
