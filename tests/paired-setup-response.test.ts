import { test } from "node:test";
import assert from "node:assert/strict";
import { pairedSetupPrewriteRejection } from "../packages/workspace/paired-setup-response";
test("only exact pre-write error/status pairs release a request", () => {
  for (const [code, status] of Object.entries({
    PAIRED_SETUP_DISABLED: 503,
    METHOD_NOT_ALLOWED: 405,
    ORIGIN_REJECTED: 403,
    JSON_REQUIRED: 415,
    INVALID_COMMAND: 400,
    BODY_TOO_LARGE: 413,
    REQUEST_TIMEOUT: 408,
    REQUEST_ABORTED: 400,
    IDENTITY_REQUIRED: 401,
  })) {
    assert.equal(pairedSetupPrewriteRejection(status, { error: code }), code);
    assert.equal(
      pairedSetupPrewriteRejection(status + 1, { error: code }),
      null,
    );
    assert.equal(
      pairedSetupPrewriteRejection(status, { error: code, extra: "untrusted" }),
      null,
    );
  }
});
test("SQL failures, generic auth/proxy errors, malformed payloads and unknown outcomes remain held", () => {
  for (const [status, value] of [
    [503, { error: "SETUP_UNAVAILABLE" }],
    [403, { error: "SETUP_UNAVAILABLE" }],
    [401, { error: "Unauthorized" }],
    [503, {}],
    [503, null],
    [503, []],
    [503, { error: "toString" }],
    [503, { error: 503 }],
  ] as const)
    assert.equal(pairedSetupPrewriteRejection(status, value), null);
});
