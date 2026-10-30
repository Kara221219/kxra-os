import assert from "node:assert/strict";
import { test, mock } from "node:test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import vm from "node:vm";
import { transformSync } from "esbuild";
import * as recovery from "../packages/authz/recovery-intent";
import * as stepup from "../packages/authz/recovery-stepup";
import * as diagnostics from "../packages/authz/recovery-diagnostics";

const require = createRequire(import.meta.url);
const routePath = "apps/os/app/api/password-reset/route.ts";
const current = readFileSync(routePath, "utf8");
// Differential tests execute both complete handlers with identical synthetic dependencies.
const baseline = readFileSync(
  "tests/fixtures/recovery-confirm-09c2f14.ts.fixture",
  "utf8",
);
assert.equal(
  createHash("sha256").update(baseline).digest("hex"),
  "f3d5e0f5e64c89169df681a4fec2f99e7ee13c5e410f14938ae26a703ff3e32e",
);
const secret = "synthetic-recovery-key-".repeat(4);
const sentinel = "PLANTED_SECRET_password_token_email_url_sql";
const id = "synthetic-user";
const email = "owner@fixture.invalid";
const providerError = (code: string, status = 401) => ({
  code,
  status,
  message: sentinel,
  body: { password: sentinel },
  stack: sentinel,
});
type Scenario = {
  input?: Record<string, unknown>;
  step?: string;
  error?: unknown;
  user?: { id: string; email?: string } | null;
  claims?: Record<string, unknown>;
  sessionId?: string;
  updateId?: string;
  profile?: string | null;
  invited?: boolean;
  invalidSecret?: boolean;
  noUrl?: boolean;
  originError?: boolean;
  logThrows?: boolean;
  logRejects?: boolean;
  action?: "request" | "reauthenticate";
  mfa?: boolean;
  mfaInvalid?: boolean;
  mfaCrossUser?: boolean;
  mfaCrossSession?: boolean;
  rateDenied?: boolean;
  nonceError?: boolean;
  sessionClaimMismatch?: boolean;
  local?: boolean;
};

async function invoke(source: string, scenario: Scenario) {
  const calls: string[] = [];
  const events: unknown[] = [];
  const now = Math.floor(Date.now() / 1000);
  const normalUser = { id, email };
  const sessionKey = "12345678-1234-4123-8123-123456789012";
  let currentToken = "a".repeat(120);
  let mfaVerified = false;
  const claims = scenario.claims ?? {
    sub: id,
    session_id: "12345678-1234-4123-8123-123456789012",
    aal: "aal1",
    amr: [{ method: "recovery", timestamp: now }],
  };
  const step = async <T>(name: string, value: T): Promise<T> => {
    calls.push(name);
    if (scenario.step === `${name}:throw`) throw new Error(sentinel);
    return value;
  };
  const auth = {
    getUser: () =>
      step("getUser", {
        data: {
          user: scenario.user === undefined ? normalUser : scenario.user,
        },
        error: scenario.step === "getUser:error" ? scenario.error : null,
      }),
    getClaims: (token?: string) =>
      step("getClaims", {
        data: {
          claims:
            token === "upgraded-token"
              ? {
                  ...claims,
                  sub: scenario.mfaCrossUser ? "other" : id,
                  session_id: scenario.mfaCrossSession
                    ? "22345678-1234-4123-8123-123456789012"
                    : sessionKey,
                  aal: "aal2",
                  amr: [
                    ...((claims.amr as object[]) ?? []),
                    { method: "totp", timestamp: now },
                  ],
                }
              : {
                  ...claims,
                  ...(scenario.sessionClaimMismatch
                    ? { session_id: "wrong-session" }
                    : {}),
                },
        },
        error: scenario.step === "getClaims:error" ? scenario.error : null,
      }),
    setSession: () =>
      step("setSession", {
        data: { user: { id: scenario.sessionId ?? id } },
        error: scenario.step === "setSession:error" ? scenario.error : null,
      }),
    updateUser: (attributes: { password: string; nonce?: string }) => {
      if (attributes.nonce) calls.push("nonceForwarded");
      if (scenario.mfa)
        assert.equal(
          mfaVerified,
          true,
          "no password update before provider MFA success",
        );
      return step("updateUser", {
        data: { user: { id: scenario.updateId ?? id } },
        error: scenario.step === "updateUser:error" ? scenario.error : null,
      });
    },
    getSession: async () => ({
      data: { session: { access_token: currentToken, user: normalUser } },
      error: null,
    }),
    mfa: {
      getAuthenticatorAssuranceLevel: async () => ({
        data: {
          currentLevel: currentToken === "upgraded-token" ? "aal2" : "aal1",
          nextLevel: scenario.mfa ? "aal2" : "aal1",
        },
        error: null,
      }),
      listFactors: async () => ({
        data: {
          all: [
            {
              id: "32345678-1234-4123-8123-123456789012",
              factor_type: "totp",
              status: "verified",
            },
          ],
        },
        error: null,
      }),
      challengeAndVerify: async ({ code }: { code: string }) => {
        calls.push("mfaChallenge");
        if (scenario.mfaInvalid || code !== "123456")
          return {
            data: null,
            error: providerError("mfa_verification_failed"),
          };
        mfaVerified = true;
        currentToken = "upgraded-token";
        return {
          data: { access_token: currentToken, user: normalUser },
          error: null,
        };
      },
    },
    reauthenticate: async () =>
      step("reauthenticate", {
        error: scenario.nonceError ? providerError("unexpected_failure") : null,
      }),
    signOut: () =>
      step("signOut", {
        error: scenario.step === "signOut:error" ? scenario.error : null,
      }),
    resetPasswordForEmail: () => step("resetPasswordForEmail", { error: null }),
  };
  const environment = {
    KXRA_JOIN_SECRET: scenario.invalidSecret ? "" : secret,
    NEXT_PUBLIC_SUPABASE_URL: scenario.noUrl ? "" : "https://synthetic.invalid",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "synthetic-public",
    KXRA_ORIGIN: "http://127.0.0.1:3000",
  };
  const mockRequire = (name: string): unknown => {
    if (name === "node:crypto" || name === "zod") return require(name);
    if (name === "@supabase/supabase-js")
      return {
        createClient: () => {
          calls.push("createClient");
          return { auth };
        },
      };
    if (name.endsWith("packages/db"))
      return {
        localMode: () => scenario.local ?? false,
        query: async (_actor: unknown, sql: string) => {
          if (sql.includes("consume_rate_limit"))
            return step("rateLimit", [{ allowed: !scenario.rateDenied }]);
          if (sql.includes("account_state"))
            return step(
              "profile",
              scenario.profile === null
                ? []
                : [{ account_state: scenario.profile ?? "ACTIVE" }],
            );
          if (sql.includes("active_invited_password_recovery"))
            return step("invited", [{ allowed: scenario.invited ?? false }]);
          if (sql.includes("record_password_event")) return step("audit", []);
          throw Error("Unexpected synthetic SQL");
        },
      };
    if (name.endsWith("packages/integrations/email"))
      return {
        renderEmail: () => {
          throw Error("Unexpected email render");
        },
      };
    if (name === "#kxra/local-runtime")
      return new Proxy(
        {},
        {
          get: () => () => {
            throw Error("Unexpected local runtime");
          },
        },
      );
    if (name.endsWith("lib/auth"))
      return {
        sameOrigin: () => {
          calls.push("origin");
          if (scenario.originError) throw Error(sentinel);
        },
      };
    if (name.endsWith("lib/http"))
      return {
        readJson: (request: Request) => request.json(),
        privateJson: (body: unknown, status = 200) =>
          new Response(JSON.stringify(body), {
            status,
            headers: {
              "Cache-Control": "private, no-store",
              "Referrer-Policy": "no-referrer",
            },
          }),
      };
    if (name.endsWith("authz/recovery-stepup")) return stepup;
    if (name.endsWith("authz/recovery-intent")) return recovery;
    if (name.endsWith("authz/recovery-diagnostics")) return diagnostics;
    throw Error(`Unexpected synthetic import ${name}`);
  };
  const log = (...args: unknown[]) => {
    events.push(args);
    if (scenario.logThrows) throw Error(sentinel);
    if (scenario.logRejects) return Promise.reject(Error(sentinel));
  };
  const module = {
    exports: {} as { POST: (request: Request) => Promise<Response> },
  };
  const code = transformSync(source, {
    loader: "ts",
    format: "cjs",
    target: "node22",
  }).code;
  // No network, filesystem or real process/environment is exposed to the handler.
  const rawInput =
    scenario.action === "request"
      ? { action: "request", email }
      : scenario.action === "reauthenticate"
        ? {
            action: "reauthenticate",
            accessToken: "a".repeat(120),
            refreshToken: "abc123def456",
            intent: recovery.sealHostedRecoveryIntent(email, secret),
            ...scenario.input,
          }
        : {
            action: "confirm",
            accessToken: "a".repeat(120),
            refreshToken: "abc123def456",
            intent: recovery.sealHostedRecoveryIntent(email, secret),
            password: `SyntheticPassword-${sentinel}`,
            confirmation: `SyntheticPassword-${sentinel}`,
            ...scenario.input,
          };
  const request = new Request("http://127.0.0.1:3000/api/password-reset", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://127.0.0.1:3000",
    },
    body: JSON.stringify(rawInput),
  });
  // Recompile with a captured writer; preserve the actual diagnostic implementation.
  const capturedRequire = (name: string) =>
    name.endsWith("authz/recovery-diagnostics")
      ? {
          createRecoveryConfirmationDiagnostics: () =>
            diagnostics.createRecoveryConfirmationDiagnostics((event) =>
              log("KXRA recovery confirmation", event),
            ),
        }
      : mockRequire(name);
  vm.runInNewContext(
    `(function(require,module,exports,process,console){${code}\n})`,
    {},
  )(
    capturedRequire,
    module,
    module.exports,
    { env: environment },
    { warn: log },
  );
  const response = await module.exports.POST(request);
  await new Promise<void>((resolve) => setImmediate(resolve));
  return {
    status: response.status,
    body: await response.json(),
    headers: Object.fromEntries(response.headers),
    calls,
    events,
  };
}

const cases: Array<{
  name: string;
  scenario: Scenario;
  reason?: string;
  state?: string;
  stage?: string;
}> = [
  {
    name: "existing profile audit acknowledgement corrected",
    scenario: {},
    reason: "SUCCESS",
    state: "PROVIDER_CONFIRMED_CHANGED",
    stage: "COMPLETE",
  },
  {
    name: "invited account success",
    scenario: { profile: null, invited: true },
    reason: "SUCCESS",
    state: "PROVIDER_CONFIRMED_CHANGED",
  },
  {
    name: "invalid input",
    scenario: { input: { password: "short", confirmation: "short" } },
    reason: "INPUT_INVALID",
  },
  {
    name: "mismatched confirmation",
    scenario: { input: { confirmation: "DifferentSyntheticPassword" } },
    reason: "INPUT_INVALID",
  },
  {
    name: "wrong local token",
    scenario: { input: { token: "a".repeat(40) } },
    reason: "MISSING_RECOVERY_INPUT",
  },
  {
    name: "missing hosted inputs",
    scenario: { input: { accessToken: undefined } },
    reason: "MISSING_RECOVERY_INPUT",
  },
  {
    name: "local fixture confirmation unchanged",
    scenario: { local: true, input: { token: "a".repeat(40) } },
  },
  { name: "local fixture missing token unchanged", scenario: { local: true } },
  {
    name: "missing refresh token",
    scenario: { input: { refreshToken: undefined } },
    reason: "MISSING_RECOVERY_INPUT",
  },
  {
    name: "missing intent",
    scenario: { input: { intent: undefined } },
    reason: "MISSING_RECOVERY_INPUT",
  },
  {
    name: "getUser absent",
    scenario: { user: null },
    reason: "PROVIDER_USER_REJECTED",
  },
  {
    name: "claims subject mismatch",
    scenario: { claims: { sub: "different" } },
    reason: "IDENTITY_MISMATCH",
  },
  {
    name: "missing email",
    scenario: { user: { id } },
    reason: "IDENTITY_MISMATCH",
  },
  {
    name: "tampered intent",
    scenario: { input: { intent: "t".repeat(120) } },
    reason: "INTENT_INVALID",
  },
  {
    name: "expired intent",
    scenario: {
      input: {
        intent: recovery.sealHostedRecoveryIntent(
          email,
          secret,
          Date.now() - 3_700_000,
        ),
      },
    },
    reason: "INTENT_INVALID",
  },
  {
    name: "intent email mismatch",
    scenario: {
      input: {
        intent: recovery.sealHostedRecoveryIntent(
          "other@fixture.invalid",
          secret,
        ),
      },
    },
    reason: "EMAIL_BINDING_MISMATCH",
  },
  {
    name: "missing signing config",
    scenario: { invalidSecret: true },
    reason: "INTENT_INVALID",
  },
  {
    name: "missing provider config",
    scenario: { noUrl: true },
    reason: "UNCLASSIFIED_EXCEPTION",
    stage: "VERIFY_USER",
  },
  {
    name: "missing AMR",
    scenario: { claims: { sub: id } },
    reason: "RECOVERY_METHOD_INVALID",
  },
  {
    name: "password AMR",
    scenario: {
      claims: {
        sub: id,
        amr: [{ method: "password", timestamp: Math.floor(Date.now() / 1000) }],
      },
    },
    reason: "RECOVERY_METHOD_INVALID",
  },
  {
    name: "session identity mismatch",
    scenario: { sessionId: "different" },
    reason: "SESSION_REJECTED",
  },
  {
    name: "missing eligibility",
    scenario: { profile: null },
    reason: "ELIGIBILITY_DENIED",
  },
  {
    name: "suspended",
    scenario: { profile: "SUSPENDED" },
    reason: "ELIGIBILITY_DENIED",
  },
  {
    name: "revoked",
    scenario: { profile: "REVOKED" },
    reason: "ELIGIBILITY_DENIED",
  },
  {
    name: "update identity mismatch",
    scenario: { updateId: "different" },
    reason: "PASSWORD_UPDATE_REJECTED",
    state: "ATTEMPTED_UNCONFIRMED",
  },
  {
    name: "audit failed",
    scenario: { step: "audit:throw" },
    reason: "AUDIT_FAILED",
    state: "PROVIDER_CONFIRMED_CHANGED",
  },
  {
    name: "signout rejected",
    scenario: {
      step: "signOut:error",
      error: providerError("session_expired"),
    },
    reason: "SIGN_OUT_FAILED",
    state: "PROVIDER_CONFIRMED_CHANGED",
  },
  {
    name: "signout thrown",
    scenario: { step: "signOut:throw" },
    reason: "UNCLASSIFIED_EXCEPTION",
    stage: "SIGN_OUT",
    state: "PROVIDER_CONFIRMED_CHANGED",
  },
  { name: "origin rejected", scenario: { originError: true } },
  { name: "request email action unchanged", scenario: { action: "request" } },
];
for (const name of [
  "getUser",
  "getClaims",
  "setSession",
  "profile",
  "invited",
  "updateUser",
]) {
  cases.push({
    name: `${name} thrown`,
    scenario: {
      step: `${name}:throw`,
      ...(name === "invited" ? { profile: null } : {}),
    },
    reason: "UNCLASSIFIED_EXCEPTION",
    state: name === "updateUser" ? "ATTEMPTED_UNCONFIRMED" : "NOT_ATTEMPTED",
  });
}
for (const [step, reason] of [
  ["getUser", "PROVIDER_USER_REJECTED"],
  ["getClaims", "CLAIMS_REJECTED"],
  ["setSession", "SESSION_REJECTED"],
  ["updateUser", "PASSWORD_UPDATE_REJECTED"],
]) {
  for (const code of [
    "insufficient_aal",
    "reauthentication_needed",
    "reauthentication_not_valid",
    "mfa_verification_failed",
  ]) {
    cases.push({
      name: `${step} mocked401 ${code}`,
      scenario: { step: `${step}:error`, error: providerError(code) },
      reason,
      state: step === "updateUser" ? "ATTEMPTED_UNCONFIRMED" : "NOT_ATTEMPTED",
    });
  }
}
for (const code of ["weak_password", "same_password", sentinel])
  cases.push({
    name: `update category ${code === sentinel ? "unknown" : code}`,
    scenario: { step: "updateUser:error", error: providerError(code, 400) },
    reason: "PASSWORD_UPDATE_REJECTED",
    state: "ATTEMPTED_UNCONFIRMED",
  });

for (const entry of cases)
  test(`actual route differential: ${entry.name}`, async () => {
    const before = await invoke(baseline, entry.scenario);
    const after = await invoke(current, entry.scenario);
    // Intended changes: verified current-session reads, rate limits, fresh
    // eligibility check, explicit step-up response and audit acknowledgement.
    // Every original guard/provider call still appears in the same order.
    let cursor = 0;
    for (const call of after.calls) if (call === before.calls[cursor]) cursor++;
    assert.equal(
      cursor,
      before.calls.length,
      "original security calls remain ordered",
    );
    assert.deepEqual(after.headers, before.headers);
    const requirement =
      entry.scenario.step === "updateUser:error"
        ? stepup.recoveryProviderRequirement(entry.scenario.error)
        : "OTHER";
    if (requirement !== "OTHER") {
      assert.equal(after.status, 409);
      assert.equal(after.body.recoveryStep, requirement);
    } else if (entry.reason === "SUCCESS") {
      assert.equal(after.status, 200);
      assert.equal(after.body.next, "/login?reset=1");
    } else {
      assert.equal(after.status, before.status);
      assert.deepEqual(after.body, before.body);
    }
    const events = after.events as Array<
      [string, diagnostics.RecoveryDiagnostic]
    >;
    assert.equal(events.length, entry.reason ? 1 : 0);
    if (entry.reason) {
      assert.equal(
        events[0][1].reason,
        entry.reason,
        JSON.stringify({
          calls: after.calls,
          status: after.status,
          body: after.body,
        }),
      );
      assert.equal(
        events[0][1].credentialState,
        entry.state ?? "NOT_ATTEMPTED",
      );
      if (entry.stage) assert.equal(events[0][1].stage, entry.stage);
      if (entry.name.includes("mocked401")) {
        assert.equal(events[0][1].providerStatus, 401);
        assert.equal(events[0][1].providerCategory, "REAUTH_REQUIRED");
      }
      const serialized = JSON.stringify(events);
      for (const planted of [
        sentinel,
        email,
        secret,
        "a".repeat(120),
        "abc123def456",
        "http://127.0.0.1",
        "different",
      ])
        assert.equal(
          serialized.includes(planted),
          false,
          "private input not in diagnostics",
        );
      assert.equal(
        after.calls.filter((v) => v === "updateUser").length,
        before.calls.filter((v) => v === "updateUser").length,
      );
    }
  });

for (const failure of ["throws", "rejects"] as const)
  test(`logger ${failure} cannot change success, rejection or post-update uncertainty`, async () => {
    for (const scenario of [
      { profile: null, invited: true },
      {},
      { step: "updateUser:error", error: providerError("insufficient_aal") },
      { step: "signOut:throw" },
    ]) {
      const normal = await invoke(current, scenario);
      const broken = await invoke(current, {
        ...scenario,
        logThrows: failure === "throws",
        logRejects: failure === "rejects",
      });
      assert.deepEqual({ ...broken, events: [] }, { ...normal, events: [] });
    }
  });

test("diagnostic helper rejects arbitrary categories/statuses and throwing objects, emits once", async () => {
  const events: diagnostics.RecoveryDiagnostic[] = [];
  const report = diagnostics.createRecoveryConfirmationDiagnostics((event) =>
    events.push(event),
  );
  report.mark(
    sentinel as diagnostics.RecoveryStage,
    sentinel as diagnostics.RecoveryReason,
    { code: sentinel, status: sentinel, password: sentinel },
  );
  report.emit();
  report.emit();
  assert.equal(events.length, 1);
  assert.deepEqual(events[0], {
    event: "KXRA_RECOVERY_CONFIRM_RESULT",
    stage: "INPUT",
    reason: "UNCLASSIFIED_EXCEPTION",
    credentialState: "NOT_ATTEMPTED",
    providerStatus: null,
    providerCategory: "OTHER",
  });
  const trapped = diagnostics.createRecoveryConfirmationDiagnostics((event) =>
    events.push(event),
  );
  trapped.mark(
    "UPDATE_PASSWORD",
    "PASSWORD_UPDATE_REJECTED",
    new Proxy(
      {},
      {
        get() {
          throw Error(sentinel);
        },
      },
    ),
  );
  trapped.emit();
  assert.equal(events[1].providerCategory, "OTHER");
  assert.equal(JSON.stringify(events).includes(sentinel), false);
});

test("default console writer emits only the finite event and survives console failure", () => {
  const calls: unknown[][] = [];
  const logger = mock.method(console, "warn", (...args: unknown[]) => {
    calls.push(args);
  });
  try {
    const report = diagnostics.createRecoveryConfirmationDiagnostics();
    report.mark(
      "UPDATE_PASSWORD",
      "PASSWORD_UPDATE_REJECTED",
      providerError("same_password", 400),
    );
    report.attempted();
    report.emit();
    assert.equal(calls.length, 1);
    assert.equal(
      (calls[0][1] as diagnostics.RecoveryDiagnostic).providerCategory,
      "SAME_PASSWORD",
    );
    assert.equal(JSON.stringify(calls).includes(sentinel), false);
    logger.mock.mockImplementation(() => {
      throw Error(sentinel);
    });
    assert.doesNotThrow(() =>
      diagnostics.createRecoveryConfirmationDiagnostics().emit(),
    );
  } finally {
    logger.mock.restore();
  }
});

test("pathological logger thenables and non-numeric/out-of-range status cannot escape", () => {
  for (const status of [99, 600, Infinity, NaN, 401.5, "401"]) {
    const events: diagnostics.RecoveryDiagnostic[] = [];
    const report = diagnostics.createRecoveryConfirmationDiagnostics(
      (event) => {
        events.push(event);
        return new Proxy(
          {},
          {
            get() {
              throw Error(sentinel);
            },
          },
        );
      },
    );
    report.mark("VERIFY_USER", "PROVIDER_USER_REJECTED", {
      status,
      code: sentinel,
      nested: sentinel,
    });
    assert.doesNotThrow(() => report.emit());
    assert.equal(events[0].providerStatus, null);
    assert.equal(JSON.stringify(events).includes(sentinel), false);
  }
});

test("recovery without factor proof requests MFA and never updates or sends email", async () => {
  const r = await invoke(current, { mfa: true });
  assert.equal(r.status, 409);
  assert.equal(r.body.recoveryStep, "TOTP");
  assert.equal(r.calls.includes("updateUser"), false);
  assert.equal(r.calls.includes("reauthenticate"), false);
});
test("same-request bound recovery plus existing factor succeeds", async () => {
  const r = await invoke(current, { mfa: true, input: { mfaCode: "123456" } });
  assert.equal(r.status, 200);
  assert.equal(r.body.next, "/login?reset=1");
  assert.equal(r.calls.filter((x) => x === "updateUser").length, 1);
  assert.ok(r.calls.indexOf("mfaChallenge") < r.calls.indexOf("updateUser"));
});
for (const [name, scenario] of Object.entries({
  invalid: { mfaInvalid: true },
  crossUser: { mfaCrossUser: true },
  crossSession: { mfaCrossSession: true },
}))
  test(`MFA ${name} never updates`, async () => {
    const r = await invoke(current, {
      mfa: true,
      input: { mfaCode: "123456" },
      ...scenario,
    });
    assert.equal(r.status, 409);
    assert.equal(r.calls.includes("updateUser"), false);
  });
test("explicit nonce request alone sends once without password update", async () => {
  const r = await invoke(current, { action: "reauthenticate" });
  assert.equal(r.status, 202);
  assert.equal(r.calls.filter((x) => x === "reauthenticate").length, 1);
  assert.equal(r.calls.includes("updateUser"), false);
  assert.equal(r.events.length, 0);
});
for (const [name, scenario] of Object.entries({
  revoked: { profile: "REVOKED" },
  limited: { rateDenied: true },
  wrongSession: { sessionClaimMismatch: true },
  tamperedIntent: { input: { intent: "x".repeat(120) } },
  passwordIncluded: { input: { password: "SyntheticPassword123" } },
}))
  test(`nonce action ${name} cannot send`, async () => {
    const r = await invoke(current, { action: "reauthenticate", ...scenario });
    assert.equal(r.calls.includes("reauthenticate"), false);
    assert.equal(r.calls.includes("updateUser"), false);
  });
test("MFA plus nonce forwarded only in validated confirmation", async () => {
  const r = await invoke(current, {
    mfa: true,
    input: { mfaCode: "123456", nonce: "654321" },
  });
  assert.equal(r.status, 200);
  assert.equal(r.calls.filter((x) => x === "nonceForwarded").length, 1);
  assert.equal(r.calls.includes("reauthenticate"), false);
});
test("unknown provider401 stays generic without nonce/MFA send", async () => {
  const r = await invoke(current, {
    step: "updateUser:error",
    error: providerError("unmapped"),
  });
  assert.equal(r.status, 409);
  assert.equal(r.body.error, "Reset unavailable");
  assert.equal(r.body.recoveryStep, undefined);
  assert.equal(r.calls.includes("reauthenticate"), false);
});

test("invalid and replayed nonce errors never trigger another send or acknowledge change", async () => {
  for (const code of [
    "reauthentication_needed",
    "reauthentication_not_valid",
  ]) {
    const r = await invoke(current, {
      input: { nonce: "123456" },
      step: "updateUser:error",
      error: providerError(code, 422),
    });
    assert.equal(r.status, 409);
    assert.equal(r.body.recoveryStep, "NONCE");
    assert.equal(r.calls.includes("reauthenticate"), false);
    assert.equal(r.calls.includes("audit"), false);
    assert.equal(
      (r.events as any)[0][1].credentialState,
      "ATTEMPTED_UNCONFIRMED",
    );
  }
});
test("malformed nonce never reaches provider or sends", async () => {
  const r = await invoke(current, { input: { nonce: sentinel } });
  assert.equal(r.status, 400);
  assert.equal(r.calls.includes("updateUser"), false);
  assert.equal(r.calls.includes("reauthenticate"), false);
});
test("revoked/replayed recovery session never reaches password mutation", async () => {
  const r = await invoke(current, {
    step: "getUser:error",
    error: providerError("session_not_found"),
  });
  assert.equal(r.status, 409);
  assert.equal(r.calls.includes("updateUser"), false);
  assert.equal(r.calls.includes("reauthenticate"), false);
});
