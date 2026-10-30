import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  recoveryStepUp,
  validateRecoveryClientSession,
  recoveryProviderRequirement,
} from "../packages/authz/recovery-stepup";
const user = "fixture-user";
const sid = "12345678-1234-4123-8123-123456789012";
const factor = "22345678-1234-4123-8123-123456789012";
const now = Math.floor(Date.now() / 1000);
const sentinel = "PLANTED_PASSWORD_TOKEN_NONCE_IDENTITY";
function fixture(change: Record<string, unknown> = {}) {
  let token = "original",
    used = false;
  const calls: string[] = [];
  const original = { sub: user, session_id: sid, aal: "aal1" };
  const upgraded = {
    ...original,
    aal: "aal2",
    amr: [{ method: "totp", timestamp: now }],
    ...((change.claims ?? {}) as object),
  };
  const auth = {
    mfa: {
      getAuthenticatorAssuranceLevel: async () => ({
        data: change.assurance ?? { currentLevel: "aal1", nextLevel: "aal2" },
        error: change.assuranceError ?? null,
      }),
      listFactors: async () => ({
        data: {
          all: change.factors ?? [
            {
              id: factor,
              factor_type: "totp",
              status: "verified",
              friendly_name: "KXRA OS",
            },
          ],
        },
        error: change.factorsError ?? null,
      }),
      challengeAndVerify: async (input: { factorId: string; code: string }) => {
        calls.push("challenge");
        assert.equal(input.factorId, factor);
        if (used || input.code !== "123456" || change.challengeError)
          return { data: null, error: { message: sentinel } };
        used = true;
        token = "upgraded";
        return {
          data: {
            access_token: change.missingToken ? undefined : token,
            user: { id: change.returnedUser ?? user },
          },
          error: null,
        };
      },
    },
    getSession: async () => ({
      data: {
        session: {
          access_token:
            change.currentDrift && token === "upgraded" ? "other" : token,
          user: { id: user },
        },
      },
      error: change.sessionError ?? null,
    }),
    getClaims: async (input: string) => ({
      data: {
        claims:
          input === "upgraded"
            ? upgraded
            : { ...original, ...((change.original ?? {}) as object) },
      },
      error: change.claimsError ?? null,
    }),
    getUser: async () => ({
      data: {
        user: {
          id: change.verifiedUser ?? user,
          email: change.email ?? "fixture@invalid.test",
        },
      },
      error: change.userError ?? null,
    }),
  };
  return { client: { auth } as unknown as SupabaseClient, original, calls };
}
test("existing factor upgrades same subject/session to AAL2 in one request", async () => {
  const x = fixture();
  assert.deepEqual(await recoveryStepUp(x.client, x.original, "123456", now), {
    state: "READY",
    aal: "aal2",
  });
  assert.deepEqual(x.calls, ["challenge"]);
});
test("missing code asks for existing factor without challenge", async () => {
  const x = fixture();
  assert.deepEqual(await recoveryStepUp(x.client, x.original, undefined, now), {
    state: "TOTP_REQUIRED",
  });
  assert.deepEqual(x.calls, []);
});
for (const code of ["", "12345", "1234567", sentinel, "000000"])
  test(`invalid proof rejected (${code.length} chars)`, async () => {
    const x = fixture();
    assert.notEqual(
      (await recoveryStepUp(x.client, x.original, code, now)).state,
      "READY",
    );
  });
for (const [name, change] of Object.entries({
  missingFactor: { factors: [] },
  unverified: {
    factors: [{ id: factor, factor_type: "totp", status: "unverified" }],
  },
  ambiguous: {
    factors: [
      { id: factor, factor_type: "totp", status: "verified" },
      {
        id: "32345678-1234-4123-8123-123456789012",
        factor_type: "totp",
        status: "verified",
      },
    ],
  },
  phoneOnly: {
    factors: [{ id: factor, factor_type: "phone", status: "verified" }],
  },
  malformedFactor: {
    factors: [{ id: sentinel, factor_type: "totp", status: "verified" }],
  },
  lookupFailure: { factorsError: { message: sentinel } },
  assuranceFailure: { assuranceError: { message: sentinel } },
  badAssurance: { assurance: { currentLevel: "bad", nextLevel: "aal2" } },
  sessionMissing: { original: { session_id: undefined } },
  differentOriginalSession: {
    original: { session_id: "32345678-1234-4123-8123-123456789012" },
  },
  returnedUserMismatch: { returnedUser: "other-user" },
  providerUserMismatch: { verifiedUser: "other-user" },
  claimsUserMismatch: { claims: { sub: "other-user" } },
  claimsSessionMismatch: {
    claims: { session_id: "32345678-1234-4123-8123-123456789012" },
  },
  aal1: { claims: { aal: "aal1" } },
  noMfaMethod: { claims: { amr: [{ method: "password", timestamp: now }] } },
  oldProof: { claims: { amr: [{ method: "totp", timestamp: now - 61 }] } },
  futureProof: { claims: { amr: [{ method: "totp", timestamp: now + 61 }] } },
  currentClientDrift: { currentDrift: true },
  missingToken: { missingToken: true },
  claimsError: { claimsError: { message: sentinel } },
  challengeError: { challengeError: true },
}))
  test(`step-up fails closed: ${name}`, async () => {
    const x = fixture(change);
    const result = await recoveryStepUp(x.client, x.original, "123456", now);
    assert.notEqual(result.state, "READY");
    assert.equal(JSON.stringify(result).includes(sentinel), false);
  });
test("provider-rejected replay cannot become READY", async () => {
  const x = fixture();
  assert.equal(
    (await recoveryStepUp(x.client, x.original, "123456", now)).state,
    "READY",
  );
  assert.notEqual(
    (await recoveryStepUp(x.client, x.original, "123456", now)).state,
    "READY",
  );
});
test("no factor required keeps aal1; never enrolls or unenrolls", async () => {
  const x = fixture({ assurance: { currentLevel: "aal1", nextLevel: "aal1" } });
  assert.deepEqual(await recoveryStepUp(x.client, x.original, undefined, now), {
    state: "READY",
    aal: "aal1",
  });
  assert.deepEqual(x.calls, []);
});
for (const [name, change] of Object.entries({
  wrongSub: { original: { sub: "other-user" } },
  wrongSession: { original: { session_id: "other-session" } },
  wrongEmail: { email: "other@invalid.test" },
  userFailure: { userError: { message: sentinel } },
  sessionFailure: { sessionError: { message: sentinel } },
  claimsFailure: { claimsError: { message: sentinel } },
  invalidAal: { original: { aal: "other" } },
}))
  test(`established session rejects ${name}`, async () => {
    const x = fixture(change);
    assert.equal(
      await validateRecoveryClientSession(
        x.client,
        x.original,
        "fixture@invalid.test",
      ),
      null,
    );
  });
test("established current session verified before nonce or MFA actions", async () => {
  const x = fixture();
  assert.equal(
    (
      await validateRecoveryClientSession(
        x.client,
        x.original,
        "fixture@invalid.test",
      )
    )?.session_id,
    sid,
  );
});
for (const [code, expected] of [
  ["reauthentication_needed", "NONCE"],
  ["reauthentication_not_valid", "NONCE"],
  ["insufficient_aal", "TOTP"],
  ["mfa_verification_failed", "TOTP"],
  [sentinel, "OTHER"],
])
  test(`exact code distinction ${expected}`, () =>
    assert.equal(
      recoveryProviderRequirement({ code, message: sentinel }),
      expected,
    ));
test("throwing provider getters do not escape or disclose", () =>
  assert.equal(
    recoveryProviderRequirement(
      new Proxy(
        {},
        {
          get() {
            throw Error(sentinel);
          },
        },
      ),
    ),
    "OTHER",
  ));
