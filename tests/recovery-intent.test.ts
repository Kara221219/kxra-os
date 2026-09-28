import assert from "node:assert/strict";
import { test } from "node:test";
import {
  authCallbackDestination,
  hostedRecoveryIntentMatches,
  openHostedRecoveryIntent,
  recoveryAuthenticationMatchesIntent,
  sealHostedRecoveryIntent,
  validSupabaseRefreshTokenShape,
} from "../packages/authz/recovery-intent";

test("authentication callbacks allow only exact internal destinations", () => {
  assert.equal(authCallbackDestination("/join/finish"), "/join/finish");
  assert.equal(authCallbackDestination("/reset-password"), "/os");
  assert.equal(authCallbackDestination("//attacker.invalid"), "/os");
  assert.equal(authCallbackDestination("/reset-password?next=evil"), "/os");
  assert.equal(authCallbackDestination(null), "/os");
});

test("hosted recovery binds a provider authentication method to a signed email intent", () => {
  const now = 2_000_000_000_000;
  const secret = "s".repeat(64);
  const sealed = sealHostedRecoveryIntent("Owner@Example.com", secret, now);
  const intent = openHostedRecoveryIntent(sealed, secret, now + 1_000);
  assert.ok(intent);
  assert.equal(hostedRecoveryIntentMatches(intent, "owner@example.com"), true);
  assert.equal(hostedRecoveryIntentMatches(intent, "other@example.com"), false);
  const issued = Math.floor(now / 1000);
  assert.equal(
    recoveryAuthenticationMatchesIntent(
      { amr: [{ method: "otp", timestamp: issued + 30 }] },
      intent,
    ),
    true,
  );
  assert.equal(
    recoveryAuthenticationMatchesIntent(
      { amr: [{ method: "recovery", timestamp: issued + 30 }] },
      intent,
    ),
    true,
  );
  assert.equal(
    recoveryAuthenticationMatchesIntent(
      { amr: [{ method: "password", timestamp: issued + 30 }] },
      intent,
    ),
    false,
  );
  assert.equal(
    recoveryAuthenticationMatchesIntent(
      { amr: [{ method: "otp", timestamp: issued - 61 }] },
      intent,
    ),
    false,
  );
  assert.equal(
    recoveryAuthenticationMatchesIntent(
      { amr: [{ method: "otp", timestamp: issued + 3_661 }] },
      intent,
    ),
    false,
  );
  assert.equal(
    recoveryAuthenticationMatchesIntent(
      {
        amr: [
          { method: "otp", timestamp: issued + 20 },
          { method: "password", timestamp: issued + 30 },
        ],
      },
      intent,
    ),
    false,
  );
  assert.equal(
    recoveryAuthenticationMatchesIntent({ amr: ["otp"] }, intent),
    false,
  );
  assert.equal(openHostedRecoveryIntent(`${sealed}x`, secret, now), null);
  assert.equal(openHostedRecoveryIntent(sealed, "t".repeat(64), now), null);
  assert.equal(openHostedRecoveryIntent(sealed, secret, now + 3_600_001), null);
});

test("hosted recovery accepts Supabase legacy and signed refresh-token shapes", () => {
  assert.equal(validSupabaseRefreshTokenShape("abc123def456"), true);
  assert.equal(validSupabaseRefreshTokenShape("ABC123def456"), false);
  assert.equal(validSupabaseRefreshTokenShape("abc123def45"), false);
  assert.equal(validSupabaseRefreshTokenShape("signed-token-format"), true);
  assert.equal(validSupabaseRefreshTokenShape("x".repeat(10_001)), false);
});
