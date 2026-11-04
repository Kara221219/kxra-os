import { test } from "node:test";
import assert from "node:assert/strict";
import { parseAiSetupStatus } from "../../packages/admission/ai-setup-status";
const base = {
  admission_id: "11111111-1111-4111-8111-111111111111",
  provider: "OPENAI",
  model: "synthetic-model",
  endpoint_id: "",
  state: "ELIGIBLE",
  reason: "CLEARED",
  next_action: "RESUBMIT_SAME_DETAILS",
  expires_at: "2026-11-05T00:00:00Z",
};
test("status accepts only the fixed public projection and copies it", () => {
  assert.deepEqual(parseAiSetupStatus(base), base);
  assert.notEqual(parseAiSetupStatus(base), base);
  for (const field of [
    "key",
    "encrypted_key",
    "fingerprint",
    "evidence",
    "org_id",
    "actor_id",
    "endpoint_url",
  ])
    assert.throws(
      () => parseAiSetupStatus({ ...base, [field]: "SECRET" }),
      /AI_SETUP_STATUS_INVALID/,
    );
});
test("status rejects malformed identity, metadata and prototype state names", () => {
  for (const patch of [
    { admission_id: "bad" },
    { provider: "FIXTURE" },
    { model: "<script>" },
    { endpoint_id: "https://provider.test" },
    { expires_at: "bad" },
    { state: "toString" },
    { state: "__proto__" },
    { state: "constructor" },
    { next_action: "APPROVE" },
    { reason: "UNKNOWN" },
    { state: "BLOCKED" },
    { reason: "SAVED" },
  ])
    assert.throws(
      () => parseAiSetupStatus({ ...base, ...patch }),
      /AI_SETUP_STATUS_INVALID/,
    );
  for (const value of [null, [], {}, "secret"])
    assert.throws(() => parseAiSetupStatus(value), /AI_SETUP_STATUS_INVALID/);
});
test("resume distinguishes waiting, blocked, new authority and saved without granting write authority", () => {
  for (const [state, reason, next_action] of [
    ["REVIEW_REQUIRED", "AWAITING_PROVIDER_REVIEW", "WAIT_FOR_REVIEW"],
    ["BLOCKED", "PROVIDER_REVIEW_BLOCKED", "CONTACT_SUPPORT"],
    ["NEW_INTENT_REQUIRED", "BUSINESS_REVIEW_UNBOUND", "CREATE_NEW_INTENT"],
    [
      "NEW_INTENT_REQUIRED",
      "BUSINESS_REVIEW_REQUIRED",
      "COMPLETE_BUSINESS_REVIEW",
    ],
    ["SAVED", "SAVED", "USE_CONNECTIONS"],
  ])
    assert.equal(
      parseAiSetupStatus({ ...base, state, reason, next_action }).next_action,
      next_action,
    );
});
