import assert from "node:assert/strict";
import { test } from "node:test";
import {
  authCallbackDestination,
  recentRecoveryAuthentication,
} from "../packages/authz/recovery-intent";

test("authentication callbacks allow only exact internal destinations", () => {
  assert.equal(authCallbackDestination("/join/finish"), "/join/finish");
  assert.equal(authCallbackDestination("/reset-password"), "/os");
  assert.equal(authCallbackDestination("//attacker.invalid"), "/os");
  assert.equal(authCallbackDestination("/reset-password?next=evil"), "/os");
  assert.equal(authCallbackDestination(null), "/os");
});

test("hosted recovery accepts only one recent verified recovery method", () => {
  const now = 2_000_000;
  assert.equal(
    recentRecoveryAuthentication(
      { amr: [{ method: "recovery", timestamp: now - 30 }] },
      now,
    ),
    true,
  );
  assert.equal(
    recentRecoveryAuthentication(
      { amr: [{ method: "password", timestamp: now - 30 }] },
      now,
    ),
    false,
  );
  assert.equal(
    recentRecoveryAuthentication(
      { amr: [{ method: "recovery", timestamp: now - 601 }] },
      now,
    ),
    false,
  );
  assert.equal(
    recentRecoveryAuthentication(
      { amr: [{ method: "recovery", timestamp: now + 61 }] },
      now,
    ),
    false,
  );
  assert.equal(
    recentRecoveryAuthentication(
      {
        amr: [
          { method: "recovery", timestamp: now - 20 },
          { method: "password", timestamp: now - 10 },
        ],
      },
      now,
    ),
    false,
  );
  assert.equal(recentRecoveryAuthentication({ amr: ["recovery"] }, now), false);
});
