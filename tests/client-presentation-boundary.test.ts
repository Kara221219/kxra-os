import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import ts from "typescript";
import { classifications, recordInput } from "../packages/domain";
import { classifications as displayClassifications } from "../packages/domain/classification-values";
import {
  boardLenses,
  boardBriefInput,
  boardReviewInput,
  rankOptions,
} from "../packages/workrooms";
import { boardLenses as displayLenses } from "../packages/workrooms/board-lenses";
import {
  liveWorkspaceAccess,
  ownerLiveWorkspaceBilling,
  liveWorkspacePresentation,
} from "../packages/workspace/live-start";
import { liveWorkspacePresentation as presentWorkspace } from "../packages/workspace/live-start-presentation";
import { approvedPlan } from "../packages/workspace/approved-catalogue";

const root = path.resolve(import.meta.dirname, "..");

test("client display constants are the same values used by authoritative server schemas", () => {
  assert.strictEqual(classifications, displayClassifications);
  assert.strictEqual(boardLenses, displayLenses);
  for (const classification of displayClassifications) {
    assert.equal(
      recordInput.parse({
        kind: "note",
        title: "Synthetic note",
        classification,
      }).classification,
      classification,
    );
  }
  assert.equal(
    recordInput.safeParse({
      kind: "note",
      title: "Synthetic note",
      classification: "UNREVIEWED",
    }).success,
    false,
  );
  assert.equal(
    recordInput.safeParse({
      kind: "note",
      title: "Synthetic note",
      classification: "FACT",
      role: "owner",
    }).success,
    false,
  );
  assert.equal(
    displayLenses.reduce((total, lens) => total + lens.weight, 0),
    100,
  );
  assert.deepEqual(
    rankOptions(
      ["A", "B"],
      [
        [5, 5, 5, 5, 5],
        [0, 0, 0, 0, 0],
      ],
    ).ranked.map((option) => option.score),
    [100, 0],
  );
  const brief = {
    request_id: "11111111-1111-4111-8111-111111111111",
    title: "Synthetic decision",
    question: "Which isolated experiment should we run?",
    evidence: "",
    constraints: "",
    options: ["A", "B"],
  };
  assert.equal(boardBriefInput.safeParse(brief).success, true);
  assert.equal(
    boardBriefInput.safeParse({ ...brief, options: ["A", "a"] }).success,
    false,
  );
  assert.equal(
    boardReviewInput.safeParse({
      version: 1,
      source: "OWNER_REVIEW",
      rationale: "Synthetic rationale with enough detail",
      uncertainty: "Synthetic unknowns",
      scores: [
        [6, 0, 0, 0, 0],
        [0, 0, 0, 0, 0],
      ],
    }).success,
    false,
  );
});

test("pure presentation retains expiry and server-owned pending/quarantine boundaries", () => {
  assert.strictEqual(liveWorkspacePresentation, presentWorkspace);
  const access = liveWorkspaceAccess.parse({
    lane: "LIVE",
    entitled: true,
    reconciliation_required: false,
    quarantined: false,
    proof_valid_until: "2030-01-01T00:00:00Z",
  });
  const now = Date.parse("2029-01-01T00:00:00Z");
  assert.equal(presentWorkspace(access, now).blocked, false);
  for (const change of [
    { entitled: false },
    { quarantined: true },
    { reconciliation_required: true },
    { proof_valid_until: null },
    { proof_valid_until: "2028-01-01T00:00:00Z" },
  ]) {
    assert.equal(presentWorkspace({ ...access, ...change }, now).blocked, true);
  }
  assert.equal(
    liveWorkspaceAccess.safeParse({
      ...access,
      lane: "PENDING",
      entitled: true,
    }).success,
    false,
  );
  assert.equal(
    liveWorkspaceAccess.safeParse({ ...access, entitlement_authority: true })
      .success,
    false,
  );
  const plan = approvedPlan("KXRA_STARTER_V1");
  const owner = {
    lane: "LIVE",
    offer: {
      offer_key: plan.offer_key,
      name: plan.name,
      currency: plan.currency,
      monthly_amount_minor: plan.monthly_amount_minor,
      people: plan.people,
    },
    customer_bound: false,
    subscription_bound: false,
    policy_ready: false,
    consent_required: true,
  };
  assert.equal(
    ownerLiveWorkspaceBilling(owner).offer?.monthly_amount_minor,
    plan.monthly_amount_minor,
  );
  // Use the approved catalogue's canonical fields; owner validation must still reject drift.
  assert.throws(() =>
    ownerLiveWorkspaceBilling({
      ...owner,
      offer: { ...owner.offer, monthly_amount_minor: 1 },
    }),
  );
});

for (const relative of [
  "packages/domain/classification-values.ts",
  "packages/workrooms/board-lenses.ts",
  "packages/workspace/live-start-presentation.ts",
]) {
  test(`${relative} emits no schema dependency or runtime import`, () => {
    const source = fs.readFileSync(path.join(root, relative), "utf8");
    const output = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
        verbatimModuleSyntax: true,
      },
    }).outputText;
    assert.doesNotMatch(
      output,
      /\bimport\b|\bexport\s*\{[^}]*\}\s*from\b|\brequire\s*\(|\bzod\b/,
    );
  });
}
