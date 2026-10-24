import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseAuthTransport } from "../packages/integrations/supabase-auth-transport";
import {
  hostedSelfServiceConfiguration,
  hostedRegistration,
  hostedProvision,
} from "../packages/authz/hosted-self-service";
import { registerHostedSelfService } from "../packages/integrations/hosted-signup";

const environment = {
  KXRA_HOSTED_SELF_SERVICE_ENABLED: "true",
  NODE_ENV: "production",
  KXRA_ENVIRONMENT: "staging",
  KXRA_ORIGIN: "https://synthetic-staging.example.invalid",
  NEXT_PUBLIC_SUPABASE_URL: "https://jlebgsxcvhvpueuibekd.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "synthetic-public-key-not-a-credential",
};
const registration = {
  action: "register",
  email: "Synthetic@Example.test",
  password: "SyntheticPassword42",
  confirmation: "SyntheticPassword42",
};

test("hosted signup configuration is server-owned, project-bound and disabled by default", () => {
  assert.equal(hostedSelfServiceConfiguration({}), null);
  assert.equal(
    hostedSelfServiceConfiguration({
      ...environment,
      KXRA_HOSTED_SELF_SERVICE_ENABLED: "false",
    }),
    null,
  );
  assert.equal(
    hostedSelfServiceConfiguration({
      ...environment,
      KXRA_AUTH_MODE: "fixture",
    }),
    null,
  );
  assert.equal(
    hostedSelfServiceConfiguration({ ...environment, NODE_ENV: "development" }),
    null,
  );
  assert.equal(
    hostedSelfServiceConfiguration({
      ...environment,
      KXRA_ENVIRONMENT: "production",
    }),
    null,
  );
  assert.equal(
    hostedSelfServiceConfiguration({
      ...environment,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
    }),
    null,
  );
  for (const origin of [
    "http://127.0.0.1:3000",
    "https://example.invalid/path",
    "https://user:password@example.invalid",
    "https://example.invalid?x=1",
    "https://example.invalid/",
  ])
    assert.equal(
      hostedSelfServiceConfiguration({ ...environment, KXRA_ORIGIN: origin }),
      null,
    );
  assert.deepEqual(hostedSelfServiceConfiguration(environment), {
    origin: environment.KXRA_ORIGIN,
    project: "jlebgsxcvhvpueuibekd",
  });
  assert.equal(
    hostedSelfServiceConfiguration({
      ...environment,
      KXRA_ENVIRONMENT: "production",
      NEXT_PUBLIC_SUPABASE_URL: "https://lhbgeucifxxcdoyrnesf.supabase.co",
    })?.project,
    "lhbgeucifxxcdoyrnesf",
  );
});

test("signup inputs reject caller identity, role, tenant and paid authority", () => {
  for (const extra of [
    { user_id: crypto.randomUUID() },
    { role: "KXRA_OWNER" },
    { org_id: crypto.randomUUID() },
    { paid_access: true },
    { email_verified: true },
    { source: "supabase" },
  ]) {
    assert.throws(() =>
      hostedRegistration.parse({ ...registration, ...extra }),
    );
    assert.throws(() =>
      hostedProvision.parse({
        action: "provision",
        request_id: crypto.randomUUID(),
        workspace_name: "Synthetic workspace",
        ...extra,
      }),
    );
  }
  assert.throws(() =>
    hostedRegistration.parse({ ...registration, confirmation: "different" }),
  );
  assert.throws(() =>
    hostedRegistration.parse({
      ...registration,
      password: "weakweakweak",
      confirmation: "weakweakweak",
    }),
  );
});

test("provider signup uses a generated one-use proof digest and returns no identity/paid receipt", async () => {
  let prepared: string[] = [];
  let input: unknown;
  const value = await registerHostedSelfService(
    registration,
    environment.KXRA_ORIGIN,
    {
      prepare: async (...args) => {
        prepared = args;
      },
      signUp: async (body) => {
        input = body;
        return { error: null };
      },
    },
  );
  const body = input as {
    email: string;
    options: {
      data: { kxra_self_service_challenge: string };
      emailRedirectTo: string;
    };
  };
  assert.equal(body.email, "synthetic@example.test");
  assert.match(
    body.options.data.kxra_self_service_challenge,
    /^[A-Za-z0-9_-]{43}$/,
  );
  assert.equal(
    prepared[0],
    crypto.createHash("sha256").update(body.email).digest("hex"),
  );
  assert.equal(
    prepared[1],
    crypto
      .createHash("sha256")
      .update(body.options.data.kxra_self_service_challenge)
      .digest("hex"),
  );
  assert.match(prepared[2], /^[a-f0-9-]{36}$/);
  assert.equal(
    body.options.emailRedirectTo,
    environment.KXRA_ORIGIN + "/auth/callback?next=/signup",
  );
  assert.deepEqual(value, { next: "/signup?verify=1" });
});

test("denied admission makes no provider call and provider failures disclose no account detail", async () => {
  let calls = 0;
  await assert.rejects(
    registerHostedSelfService(registration, environment.KXRA_ORIGIN, {
      prepare: async () => {
        throw Error("ADMISSION_DENIED");
      },
      signUp: async () => {
        calls++;
        return { error: null };
      },
    }),
    /ADMISSION_DENIED/,
  );
  assert.equal(calls, 0);
  for (const failure of [false, true])
    await assert.rejects(
      registerHostedSelfService(registration, environment.KXRA_ORIGIN, {
        prepare: async () => {},
        signUp: async () => {
          if (failure) throw Error("private provider detail");
          return {
            error: {
              message: "private provider detail",
              code: "account_exists",
            },
          };
        },
      }),
      { message: "HOSTED_SIGNUP_PROVIDER_UNAVAILABLE" },
    );
});

test("real Supabase SDK signup contract uses PKCE and the scoped callback over a stubbed transport", async () => {
  let calls = 0;
  const sdk = createClient(
    "https://jlebgsxcvhvpueuibekd.supabase.co",
    "synthetic-publishable-key-not-real",
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
        flowType: "pkce",
      },
      global: {
        fetch: createSupabaseAuthTransport({
          project: "jlebgsxcvhvpueuibekd",
          fetch: async (url, init) => {
            calls++;
            const target = new URL(
              url instanceof Request ? url.url : String(url),
            );
            assert.equal(
              target.origin,
              "https://jlebgsxcvhvpueuibekd.supabase.co",
            );
            assert.equal(target.pathname, "/auth/v1/signup");
            assert.equal(
              target.searchParams.get("redirect_to"),
              environment.KXRA_ORIGIN + "/auth/callback?next=/signup",
            );
            const body = JSON.parse(
              url instanceof Request ? await url.text() : String(init?.body),
            );
            assert.equal(body.email, "synthetic@example.test");
            assert.match(
              body.data.kxra_self_service_challenge,
              /^[A-Za-z0-9_-]{43}$/,
            );
            assert.equal(body.code_challenge_method, "s256");
            return new Response(
              JSON.stringify({
                user: {
                  id: crypto.randomUUID(),
                  email: body.email,
                  aud: "authenticated",
                  created_at: new Date().toISOString(),
                  app_metadata: { provider: "email" },
                  user_metadata: {},
                  identities: [],
                },
                session: null,
              }),
              { status: 200, headers: { "content-type": "application/json" } },
            );
          },
        }),
      },
    },
  );
  await registerHostedSelfService(registration, environment.KXRA_ORIGIN, {
    prepare: async () => {},
    signUp: (value) => sdk.auth.signUp(value),
  });
  assert.equal(calls, 1);
});

test("hosted recovery presentation cannot offer revoked accounts a provisioning or admission-renewal form", async () => {
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { SelfServiceSignup } =
    await import("../apps/os/components/SelfServiceSignup");
  const review = renderToStaticMarkup(
    createElement(SelfServiceSignup, {
      verified: true,
      signedIn: true,
      mode: "hosted",
      accountState: "REVIEW_REQUIRED",
    }),
  );
  assert.match(review, /Workspace access review required/);
  assert.match(review, /https:\/\/kxra-group.com\/contact/);
  assert.match(review, /name="logout" value="1"/);
  assert.doesNotMatch(
    review,
    /name="workspace_name"|name="password"|Create or recover workspace/,
  );
  const existing = renderToStaticMarkup(
    createElement(SelfServiceSignup, {
      verified: true,
      signedIn: true,
      mode: "hosted",
      accountState: "EXISTING",
      existingWorkspaceName: "Canonical synthetic name",
    }),
  );
  assert.match(existing, /readonly=""/i);
  assert.match(existing, /Canonical synthetic name/);
  const invited = renderToStaticMarkup(
    createElement(SelfServiceSignup, {
      verified: true,
      signedIn: true,
      mode: "hosted",
      accountState: "EXISTING_ACCOUNT",
    }),
  );
  assert.match(invited, /Use your existing account/);
  assert.match(invited, /href="\/os"/);
  assert.doesNotMatch(invited, /name="workspace_name"/);
});
