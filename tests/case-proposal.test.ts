import test from "node:test";
import assert from "node:assert/strict";
import {
  matchesCaseProposal,
  savedCaseIdentity,
  renderedCaseVersion,
  syntheticCaseReviewNote,
  type CaseProposalScope,
} from "./support/case-proposal";
const expected: CaseProposalScope = {
  origin: "http://127.0.0.1:3210",
  room: "10000000-0000-4000-8000-000000000001",
  prefix: "remodel",
  sourceId: "20000000-0000-4000-8000-000000000002",
  sourceVersion: 4,
  target: "MILESTONE_PLANNED",
};
const body = {
  request_id: "30000000-0000-4000-8000-000000000003",
  source_id: expected.sourceId,
  source_version: 4,
  target_stage: expected.target,
  note: syntheticCaseReviewNote,
};
const url = `${expected.origin}/api/team-space/${expected.room}/remodel-propose`;
function request(value: unknown = body, endpoint = url, method = "POST") {
  return {
    method: () => method,
    url: () => endpoint,
    postDataJSON: () => value,
  };
}
test("proposal matching requires the exact fixture endpoint and reviewed source tuple", () => {
  assert.equal(matchesCaseProposal(request(), expected), true);
  for (const [key, value] of Object.entries({
    request_id: "invalid",
    source_id: expected.room,
    source_version: 3,
    target_stage: "HANDOFF",
    note: "different",
  }))
    assert.equal(
      matchesCaseProposal(request({ ...body, [key]: value }), expected),
      false,
    );
  for (const endpoint of [
    url + "?unexpected=1",
    url + "#fragment",
    url.replace("3210", "3211"),
    url.replace(expected.room, expected.sourceId),
    url.replace("remodel-propose", "travel-propose"),
  ])
    assert.equal(matchesCaseProposal(request(body, endpoint), expected), false);
  assert.equal(matchesCaseProposal(request(body, url, "GET"), expected), false);
});
test("malformed, extra or unavailable payloads fail closed without exposing them", () => {
  for (const value of [null, [], "poison", { ...body, token: "poison" }])
    assert.equal(matchesCaseProposal(request(value), expected), false);
  assert.equal(
    matchesCaseProposal(
      {
        ...request(),
        postDataJSON: () => {
          throw Error("Synthetic malformed input");
        },
      },
      expected,
    ),
    false,
  );
  assert.equal(
    matchesCaseProposal(request(), { ...expected, sourceVersion: NaN }),
    false,
  );
});

test("passive save identity is scoped without a pre-proposal server read", () => {
  const saved = request(
    { request_id: expected.sourceId, title: "Synthetic record" },
    `${expected.origin}/api/team-space/${expected.room}/remodel-save`,
  );
  assert.deepEqual(savedCaseIdentity(saved, expected.origin), {
    room: expected.room,
    prefix: "remodel",
    title: "Synthetic record",
    sourceId: expected.sourceId,
  });
  assert.equal(savedCaseIdentity(saved, "http://127.0.0.1:3211"), null);
  assert.equal(
    savedCaseIdentity(
      request(
        { request_id: "invalid", title: "Synthetic record" },
        saved.url(),
      ),
      expected.origin,
    ),
    null,
  );
  assert.equal(
    savedCaseIdentity(request(null, saved.url()), expected.origin),
    null,
  );
});
test("rendered revision accepts only the fixed source metadata marker", () => {
  assert.equal(renderedCaseVersion("Stage ESTIMATE_DRAFT · Revision 4"), 4);
  for (const text of [
    null,
    "Revision 4",
    "User content Stage BRIEF · Revision 4",
    "Stage BRIEF · Revision 0",
    "Stage BRIEF · Revision 999999999999999999999",
  ])
    assert.throws(
      () => renderedCaseVersion(text),
      /SYNTHETIC_CASE_REVISION_UNAVAILABLE/,
    );
});
