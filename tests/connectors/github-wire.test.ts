import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  LocalGithubAdapter,
  FixtureCredentialBroker,
} from "../../packages/connectors/github";
import { githubCommand } from "../../packages/connectors/github-contracts";
import { acquireNativeFixtureLock } from "../../scripts/native-fixture-lock.mjs";
test("GitHub transport refuses real endpoints, URL credentials, nonloopback hosts and redirects as configuration", () => {
  for (const origin of [
    "https://api.github.com",
    "http://localhost:1234",
    "http://127.0.0.1.evil:1234",
    "http://user@127.0.0.1:1234",
    "http://127.0.0.1:1234/path",
    "http://[::1]:1234",
  ])
    assert.throws(() => new LocalGithubAdapter(origin));
});
test("customer commands cannot inject provider credentials, identity, write payload replacement or worker receipts", () => {
  assert.equal(
    githubCommand.safeParse({
      action: "connect_fixture",
      allow_write: true,
      token: "not-a-real-token",
    }).success,
    false,
  );
  assert.equal(
    githubCommand.safeParse({ action: "record_outcome", outcome: "ACCEPTED" })
      .success,
    false,
  );
  assert.equal(
    githubCommand.safeParse({
      action: "dispatch",
      connection_id: crypto.randomUUID(),
      write_id: crypto.randomUUID(),
      body: "changed",
    }).success,
    false,
  );
});
test("native fixture lock preserves another owner's lock and releases only its own", () => {
  const root = fs.mkdtempSync(
      path.join(os.tmpdir(), "kxra-fixture-lock-test-"),
    ),
    lock = path.join(root, "lock");
  const release = acquireNativeFixtureLock(lock);
  const owner = fs.readFileSync(lock, "utf8");
  assert.throws(() => acquireNativeFixtureLock(lock), /lease is held/);
  assert.equal(fs.readFileSync(lock, "utf8"), owner);
  release();
  assert.equal(fs.existsSync(lock), false);
  fs.rmdirSync(root);
});
