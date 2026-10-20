import { test } from "node:test";
import assert from "node:assert/strict";
import { sprintDraft, sprintConstraints } from "../packages/business-sprints";
test("sprint drafts require review and never infer implementation prices", () => {
  const draft = sprintDraft(
    "improvement-sprint",
    "Late enquiries",
    "Track handoffs",
    "Two people",
  );
  assert.equal(draft.price_minor, 75000);
  assert.equal(draft.payment_gate, "PAID_IN_FULL");
  assert.equal(draft.review_required, true);
  assert.match(draft.scope, /Late enquiries/);
  assert.match(draft.assumptions, /Two people/);
  assert.equal(
    sprintDraft("implementation", "Need a build", "Useful MVP", "").price_minor,
    null,
  );
  assert.throws(
    () => sprintConstraints("invented", "x"),
    /SPRINT_PACKAGE_INVALID/,
  );
});
