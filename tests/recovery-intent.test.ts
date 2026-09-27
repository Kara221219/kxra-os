import assert from "node:assert/strict";
import { test } from "node:test";
import {
  authCallbackDestination,
  openRecoveryIntent,
  sealRecoveryIntent,
} from "../packages/authz/recovery-intent";

const userId = "30000000-0000-4000-8000-000000000051";
const secret = "r".repeat(64);

test("authentication callbacks allow only exact internal destinations", () => {
  assert.equal(authCallbackDestination("/join/finish"), "/join/finish");
  assert.equal(authCallbackDestination("/reset-password"), "/reset-password");
  assert.equal(authCallbackDestination("//attacker.invalid"), "/os");
  assert.equal(authCallbackDestination("/reset-password?next=evil"), "/os");
  assert.equal(authCallbackDestination(null), "/os");
});

test("hosted recovery intent binds one user for ten minutes", () => {
  const issued = sealRecoveryIntent(userId, secret, 1_000_000);
  assert.deepEqual(openRecoveryIntent(issued, secret, 1_599_999), {
    userId,
    expiresAt: 1_600_000,
  });
  assert.equal(openRecoveryIntent(issued, secret, 1_600_000), null);
});

test("hosted recovery intent rejects tamper, wrong key and malformed identity", () => {
  const issued = sealRecoveryIntent(userId, secret, 1_000_000);
  assert.equal(openRecoveryIntent(`${issued}x`, secret, 1_000_001), null);
  assert.equal(openRecoveryIntent(issued, "s".repeat(64), 1_000_001), null);
  assert.throws(() => sealRecoveryIntent("not-a-user", secret), /invalid/);
});
