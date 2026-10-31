import { test } from "node:test";
import assert from "node:assert/strict";
import { sprintPackages } from "../apps/marketing/lib/business-sprints";
import { sprintConstraints as publicConstraints } from "../packages/business-sprints";
import {
  sprintOptions,
  sprintConstraints,
} from "../packages/business-sprints/options";

test("compact sprint choices match the full catalogue in value and order", () => {
  assert.deepEqual(
    sprintOptions,
    sprintPackages.map(({ key, name }) => ({ key, name })),
  );
  assert.equal(new Set(sprintOptions.map(({ key }) => key)).size, 3);
});

test("compact constraints retain exact public formatting and trim only outer context", () => {
  assert.equal(publicConstraints, sprintConstraints);
  for (const { key, name } of sprintPackages) {
    for (const context of [
      "",
      " \n\t ",
      "  Team of two\nKeep internal spacing. \t",
    ]) {
      assert.equal(
        sprintConstraints(key, context),
        `Requested package: ${name}\n${context.trim()}`,
      );
    }
  }
});

test("compact constraints reject invalid and nonexact package keys", () => {
  for (const key of [
    "",
    "invented",
    "Decision-Review",
    " decision-review",
    "implementation ",
    "__proto__",
  ]) {
    assert.throws(() => sprintConstraints(key, "context"), {
      message: "SPRINT_PACKAGE_INVALID",
    });
  }
});
