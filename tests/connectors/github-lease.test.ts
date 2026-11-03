import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LocalGithubAdapter,
  fixtureGithubToken,
  type CredentialBroker,
} from "../../packages/connectors/github";
import {
  githubConnection,
  githubWrite,
} from "../../packages/connectors/github-contracts";
import { localModeConfiguration } from "../../packages/authz/local-guard";
assert.ok(
  localModeConfiguration(process.env),
  "Explicit disposable wire-test environment required",
);
const id = "10000000-0000-4000-8000-000000000001",
  wid = "20000000-0000-4000-8000-000000000001";
const connection = githubConnection.parse({
  id,
  org_id: id,
  user_id: id,
  session_version: 1,
  state: "ACTIVE",
  allow_write: true,
  grant_version: 1,
  credential_ref: `fixture:github:${id}:v1`,
  expires_at: new Date(Date.now() + 3600000).toISOString(),
  created_at: new Date().toISOString(),
  binding: {
    provider: "github",
    api_version: "2026-03-10",
    owner: "fixture-org",
    repo: "fixture-repo",
    issue_number: 1,
    repository_id: 404,
    account_id: 101,
    installation_id: 303,
    author_id: 202,
  },
});
const lease = {
  reference: connection.credential_ref!,
  version: 1,
  expiresAt: connection.expires_at,
  token: fixtureGithubToken,
};
function broker(value: unknown): CredentialBroker {
  return {
    resolve: async () =>
      value as Awaited<ReturnType<CredentialBroker["resolve"]>>,
  };
}
function write() {
  return githubWrite.parse({
    id: wid,
    connection_id: id,
    read_id: id,
    payload: {
      org_id: id,
      user_id: id,
      connection_id: id,
      binding: connection.binding,
      credential_ref: lease.reference,
      grant_version: 1,
      scope: "issues:write",
      session_version: 1,
      body: `Fixture approval\n\n<!-- kxra-write:${wid} -->`,
    },
    digest: "a".repeat(64),
    expires_at: new Date(Date.now() + 60000).toISOString(),
    state: "DISPATCHING",
    attempt_id: wid,
    dispatch_at: new Date().toISOString(),
    cancel_requested: false,
    reason: "DISPATCH_STARTED",
    provider_comment_id: null,
    created_at: new Date().toISOString(),
  });
}
test("bad credential reference/version/token/expiry is rejected before any provider HTTP", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    throw Error("HTTP must not begin");
  };
  try {
    for (const bad of [
      { ...lease, reference: "fixture:github:wrong:v1" },
      { ...lease, version: 2 },
      { ...lease, token: "planted-invalid-fixture-value" },
      { ...lease, expiresAt: new Date(Date.now() - 1000).toISOString() },
      { ...lease, expiresAt: new Date(Date.now() + 7200000).toISOString() },
    ]) {
      const adapter = new LocalGithubAdapter(
        "http://127.0.0.1:42222",
        broker(bad),
      );
      await assert.rejects(
        adapter.preflight(connection, true),
        /GRANT_UNAVAILABLE/,
      );
    }
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = original;
  }
});
test("approval expiring after claim is definite local nonexecution before HTTP", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    throw Error("HTTP must not begin");
  };
  try {
    const claimed = write();
    claimed.expires_at = new Date(Date.now() - 1).toISOString();
    const result = await new LocalGithubAdapter(
      "http://127.0.0.1:42222",
      broker(lease),
    ).send(connection, claimed);
    assert.equal(result.outcome, "NOT_EXECUTED");
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = original;
  }
});
test("a transport failure after HTTP starts remains uncertain rather than a local rejection", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    throw Error("Synthetic acknowledgement failure");
  };
  try {
    const result = await new LocalGithubAdapter(
      "http://127.0.0.1:42222",
      broker(lease),
    ).send(connection, write());
    assert.equal(result.outcome, "UNCERTAIN");
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = original;
  }
});
