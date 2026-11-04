import test from "node:test";
import assert from "node:assert/strict";
import { reviewGet, reviewPost } from "../packages/review-operations/commands";
import {
  parseReviewDetail,
  parseReviewQueue,
  parseReviewReceipt,
} from "../packages/review-operations/public";
const id = "11111111-1111-4111-8111-111111111111",
  expires_at = "2027-01-01T00:00:00Z";
const detail = {
  request_id: id,
  kind: "AI",
  subject_id: id,
  organization_name: "Synthetic customer",
  legal_name: "Synthetic business",
  country: "NZ",
  region: "Auckland",
  provider: "OPENAI",
  model: "synthetic-model",
  endpoint_id: "",
  policy_version: "SYNTHETIC_ONLY",
  reason: "READY",
  can_decide: true,
  can_withdraw: false,
  request_current: true,
  prior_review: null,
  expires_at,
  receipt: null,
};
test("operator public projection is exact and excludes every private evidence/key/identity field", () => {
  assert.deepEqual(parseReviewDetail(detail), detail);
  for (const name of [
    "fingerprint",
    "key",
    "encrypted_key",
    "account_reference_sha256",
    "provider_evidence_sha256",
    "target_org_id",
    "subject_actor",
    "policy",
  ])
    assert.throws(
      () => parseReviewDetail({ ...detail, [name]: "MUST_NOT_RETURN" }),
      /REVIEW_RESPONSE_INVALID/,
    );
  assert.throws(
    () => parseReviewDetail({ ...detail, request_current: false }),
    /REVIEW_RESPONSE_INVALID/,
  );
  assert.throws(() => parseReviewDetail({ ...detail, reason: "APPROVED" }));
});
test("historical receipt cannot claim current entitlement or provider acceptance", () => {
  const receipt = {
    operation_id: id,
    request_id: id,
    kind: "AI",
    subject_id: id,
    review_id: id,
    state: "ELIGIBLE",
    expires_at,
    entitlement_authority: false,
    provider_acceptance: false,
  };
  assert.deepEqual(parseReviewReceipt(receipt), receipt);
  for (const patch of [
    { provider_acceptance: true },
    { entitlement_authority: true },
    { state: "WITHDRAWN" },
    { fingerprint: "secret" },
  ])
    assert.throws(() => parseReviewReceipt({ ...receipt, ...patch }));
  assert.doesNotThrow(() =>
    parseReviewDetail({
      ...detail,
      request_current: false,
      can_decide: false,
      receipt,
    }),
  );
  assert.throws(() => parseReviewDetail({ ...detail, receipt }));
});
test("queue only carries unopened public subjects and bounded authorized pagination", () => {
  const row = {
    ...detail,
    request_id: null,
    expires_at: null,
    request_current: false,
  };
  assert.equal(
    parseReviewQueue({ items: [row], next_cursor: null }).items.length,
    1,
  );
  assert.throws(() => parseReviewQueue({ items: [detail], next_cursor: null }));
  assert.throws(() =>
    parseReviewQueue({ items: Array(21).fill(row), next_cursor: null }),
  );
  assert.throws(() =>
    parseReviewQueue({ items: [row], next_cursor: "secret" }),
  );
});
test("review commands deny caller authority, private subject replacement and unattested decisions", () => {
  const decision = {
    expires_at,
    state: "ELIGIBLE",
    account_mode: "CUSTOMER_BILLED",
    account_reference_sha256: "a".repeat(64),
    provider_evidence_sha256: "b".repeat(64),
  };
  assert.equal(
    reviewPost.parse({
      action: "DECIDE",
      request_id: id,
      operation_id: id,
      decision,
      attested: true,
    }).action,
    "DECIDE",
  );
  for (const patch of [
    { role: "KXRA_OWNER" },
    { target_org_id: id },
    { reviewer_id: id },
    { policy_id: id },
    { attested: false },
    { subject_id: id },
  ])
    assert.throws(() =>
      reviewPost.parse({
        action: "DECIDE",
        request_id: id,
        operation_id: id,
        decision,
        attested: true,
        ...patch,
      }),
    );
  assert.throws(() =>
    reviewPost.parse({
      action: "WITHDRAW",
      request_id: id,
      operation_id: id,
      attested: true,
      decision: { state: "ELIGIBLE" },
    }),
  );
  assert.throws(() => reviewGet.parse({ request_id: id, after: "AI:" + id }));
  assert.throws(() => reviewGet.parse({ org_id: id }));
});
