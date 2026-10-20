import { test } from "node:test";
import assert from "node:assert/strict";
import {
  boardBriefInput,
  boardPrompt,
  rankOptions,
} from "../packages/workrooms";
test("advisory scores are deterministic, ties remain unresolved and malformed scores fail", () => {
  assert.deepEqual(
    rankOptions(
      ["A", "B"],
      [
        [5, 5, 5, 5, 5],
        [0, 0, 0, 0, 0],
      ],
    ).ranked.map((x) => x.score),
    [100, 0],
  );
  assert.equal(
    rankOptions(
      ["A", "B"],
      [
        [3, 3, 3, 3, 3],
        [3, 3, 3, 3, 3],
      ],
    ).recommendation,
    null,
  );
  assert.equal(
    rankOptions(
      ["A", "B"],
      [
        [5, 0, 0, 0, 0],
        [0, 5, 0, 0, 0],
      ],
    ).tied,
    true,
  );
  assert.throws(() =>
    rankOptions(
      ["A", "B"],
      [
        [NaN, 1, 1, 1, 1],
        [1, 1, 1, 1, 1],
      ],
    ),
  );
  assert.throws(() =>
    rankOptions(
      ["A", "B"],
      [
        [6, 1, 1, 1, 1],
        [1, 1, 1, 1, 1],
      ],
    ),
  );
});
test("advisory briefs reject impersonated identity and duplicate options", () => {
  const brief = {
    request_id: crypto.randomUUID(),
    title: "Synthetic review",
    question: "Which test should we run?",
    options: ["A", "B"],
    evidence: "",
    constraints: "",
  };
  assert.equal(
    boardBriefInput.safeParse({ ...brief, role: "owner" }).success,
    false,
  );
  assert.equal(
    boardBriefInput.safeParse({ ...brief, options: ["A", "a"] }).success,
    false,
  );
  assert.match(boardPrompt(boardBriefInput.parse(brief)), /None supplied/);
  assert.match(boardPrompt(brief), /never approval or execution/);
});
