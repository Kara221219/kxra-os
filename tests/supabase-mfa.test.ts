import assert from "node:assert/strict";
import { test } from "node:test";
import {
  beginHostedTotp,
  hostedTotpEnrollmentResponseFailure,
  hostedTotpTimestamp,
  hostedMfaGate,
  prepareHostedTotp,
  requiresHostedMfa,
  removeHostedTotp,
  verifyHostedTotp,
  type HostedMfaApi,
} from "../packages/authz/supabase-mfa";

const factorOne = "30000000-0000-4000-8000-000000000041";
const factorOld = "30000000-0000-4000-8000-000000000042";
const factorNew = "30000000-0000-4000-8000-000000000043";
const factorVerified = "30000000-0000-4000-8000-000000000044";

function api(overrides: Partial<HostedMfaApi> = {}): HostedMfaApi {
  return {
    async enroll() {
      return {
        data: {
          id: factorOne,
          type: "totp",
          totp: {
            qr_code: "data:image/svg+xml;utf-8,<svg></svg>",
            secret: "ABCDEFGHIJKLMNOP",
          },
        },
        error: null,
      };
    },
    async challengeAndVerify() {
      return {
        data: {
          access_token: "access",
          refresh_token: "refresh",
          user: { id: "user-1" },
        },
        error: null,
      };
    },
    async unenroll({ factorId }) {
      return { data: { id: factorId }, error: null };
    },
    async listFactors() {
      return { data: { all: [], totp: [] }, error: null };
    },
    async getAuthenticatorAssuranceLevel() {
      return {
        data: { currentLevel: "aal1", nextLevel: "aal1" },
        error: null,
      };
    },
    ...overrides,
  };
}

test("hosted TOTP enrollment accepts only a bounded inline QR response", async () => {
  assert.deepEqual(await beginHostedTotp(api()), {
    factorId: factorOne,
    qrCode: "data:image/svg+xml;utf-8,<svg></svg>",
    secret: "ABCDEFGHIJKLMNOP",
  });
  await assert.rejects(
    beginHostedTotp(
      api({
        async enroll() {
          return {
            data: {
              id: factorOne,
              type: "totp",
              totp: {
                qr_code: "https://attacker.invalid/qr",
                secret: "ABCDEFGHIJKLMNOP",
              },
            },
            error: null,
          };
        },
      }),
    ),
    /MFA_ENROLLMENT_RESPONSE_INVALID/,
  );
});

test("hosted TOTP enrollment diagnostics classify shape only", () => {
  assert.equal(
    hostedTotpEnrollmentResponseFailure({
      id: factorOne,
      type: "totp",
      totp: {
        qr_code: "data:image/svg+xml;utf-8,<svg></svg>",
        secret: "ABCDEFGHIJKLMNOP",
      },
    }),
    undefined,
  );
  assert.equal(
    hostedTotpEnrollmentResponseFailure({
      id: factorOne,
      type: "totp",
      totp: {
        qr_code: "data:image/png;base64,redacted",
        secret: "ABCDEFGHIJKLMNOP",
      },
    }),
    "qr_scheme",
  );
});

test("hosted sign-in requires the one verified KXRA TOTP factor", async () => {
  assert.deepEqual(
    await hostedMfaGate(
      api({
        async getAuthenticatorAssuranceLevel() {
          return {
            data: { currentLevel: "aal1", nextLevel: "aal2" },
            error: null,
          };
        },
        async listFactors() {
          return {
            data: {
              all: [
                {
                  id: factorVerified,
                  factor_type: "totp",
                  friendly_name: "KXRA OS",
                  status: "verified",
                },
              ],
              totp: [],
            },
            error: null,
          };
        },
      }),
    ),
    { challengeRequired: true, factorId: factorVerified },
  );
  assert.deepEqual(
    await hostedMfaGate(
      api({
        async getAuthenticatorAssuranceLevel() {
          return {
            data: { currentLevel: "aal2", nextLevel: "aal2" },
            error: null,
          };
        },
      }),
    ),
    { challengeRequired: false },
  );
});

test("hosted sign-in rejects missing and ambiguous verified factors", async () => {
  const assurance = async () => ({
    data: { currentLevel: "aal1", nextLevel: "aal2" },
    error: null,
  });
  await assert.rejects(
    hostedMfaGate(api({ getAuthenticatorAssuranceLevel: assurance })),
    /MFA_FACTOR_AMBIGUOUS/,
  );
  await assert.rejects(
    hostedMfaGate(
      api({
        getAuthenticatorAssuranceLevel: assurance,
        async listFactors() {
          return {
            data: {
              all: [factorOne, factorVerified].map((id) => ({
                id,
                factor_type: "totp",
                friendly_name: "KXRA OS",
                status: "verified",
              })),
              totp: [],
            },
            error: null,
          };
        },
      }),
    ),
    /MFA_FACTOR_AMBIGUOUS/,
  );
});

test("only an enrolled hosted AAL1 identity is stopped at the application gate", () => {
  assert.equal(requiresHostedMfa("supabase", "ENROLLED", "aal1"), true);
  assert.equal(requiresHostedMfa("supabase", "ENROLLED", "aal2"), false);
  assert.equal(requiresHostedMfa("supabase", "NOT_ENROLLED", "aal1"), false);
  assert.equal(requiresHostedMfa("fake-provider", "ENROLLED", "aal1"), false);
});

test("recent hosted owner proof uses the latest TOTP AMR timestamp", () => {
  assert.equal(
    hostedTotpTimestamp({
      aal: "aal2",
      amr: [
        { method: "password", timestamp: 100 },
        { method: "totp", timestamp: 200 },
        { method: "totp", timestamp: 300 },
      ],
    }),
    300,
  );
  assert.equal(
    hostedTotpTimestamp({
      aal: "aal1",
      amr: [{ method: "totp", timestamp: 300 }],
    }),
    undefined,
  );
  assert.equal(hostedTotpTimestamp({ aal: "aal2", amr: ["totp"] }), undefined);
});

test("hosted TOTP preparation reconciles a verified KXRA factor", async () => {
  let enrolled = false;
  assert.deepEqual(
    await prepareHostedTotp(
      api({
        async enroll() {
          enrolled = true;
          return { data: null, error: { message: "must not enroll" } };
        },
        async listFactors() {
          return {
            data: {
              all: [
                {
                  id: factorVerified,
                  factor_type: "totp",
                  friendly_name: "KXRA OS",
                  status: "verified",
                },
              ],
              totp: [],
            },
            error: null,
          };
        },
      }),
    ),
    { state: "ENROLLED", factorId: factorVerified },
  );
  assert.equal(enrolled, false);
});

test("hosted TOTP preparation removes an interrupted factor before restarting", async () => {
  const calls: string[] = [];
  const result = await prepareHostedTotp(
    api({
      async listFactors() {
        return {
          data: {
            all: [
              {
                id: factorOld,
                factor_type: "totp",
                friendly_name: "KXRA OS",
                status: "unverified",
              },
            ],
            totp: [],
          },
          error: null,
        };
      },
      async unenroll({ factorId }) {
        calls.push(`remove:${factorId}`);
        return { data: { id: factorId }, error: null };
      },
      async enroll() {
        calls.push("enroll");
        return {
          data: {
            id: factorNew,
            type: "totp",
            totp: {
              qr_code: "data:image/svg+xml;utf-8,<svg></svg>",
              secret: "ABCDEFGHIJKLMNOP",
            },
          },
          error: null,
        };
      },
    }),
    factorOld,
  );
  assert.deepEqual(calls, [`remove:${factorOld}`, "enroll"]);
  assert.equal(result.state, "ENROLLING");
  assert.equal(result.factorId, factorNew);
});

test("hosted TOTP verification requires an exact six-digit proof", async () => {
  await verifyHostedTotp(api(), factorOne, "123456");
  await assert.rejects(
    verifyHostedTotp(api(), factorOne, "12345x"),
    /MFA_PROOF_INVALID/,
  );
  await assert.rejects(
    verifyHostedTotp(
      api({
        async challengeAndVerify() {
          return { data: null, error: { message: "provider details" } };
        },
      }),
      factorOne,
      "123456",
    ),
    /MFA_VERIFICATION_FAILED/,
  );
});

test("hosted TOTP removal verifies the factor before unenrollment", async () => {
  const calls: string[] = [];
  await removeHostedTotp(
    api({
      async challengeAndVerify() {
        calls.push("verify");
        return {
          data: {
            access_token: "access",
            refresh_token: "refresh",
            user: { id: "user-1" },
          },
          error: null,
        };
      },
      async unenroll({ factorId }) {
        calls.push("unenroll");
        return { data: { id: factorId }, error: null };
      },
    }),
    factorOne,
    "123456",
  );
  assert.deepEqual(calls, ["verify", "unenroll"]);
});
