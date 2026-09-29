import assert from "node:assert/strict";
import { test } from "node:test";
import { verifyStagingConfiguration } from "../scripts/staging-config.mjs";

const secret = (character: string) => character.repeat(72);
const certificate = `-----BEGIN CERTIFICATE-----\n${"A".repeat(64)}\n-----END CERTIFICATE-----\n`;
const common = {
  KXRA_ENVIRONMENT: "staging",
  NODE_ENV: "production",
  VERCEL: "1",
  VERCEL_ENV: "preview",
  VERCEL_TARGET_ENV: "staging",
  KXRA_AUTH_MODE: "supabase",
  KXRA_DATABASE_CA_CERT_BASE64: Buffer.from(certificate).toString("base64"),
};
const os = {
  ...common,
  KXRA_ORIGIN: "https://app-staging.kxra-group.com",
  NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: `sb_publishable_${secret("p")}`,
  DATABASE_URL:
    "postgresql://kxra_app:private-password@db.abcdefghijklmnopqrst.supabase.co:5432/postgres?sslmode=verify-full",
  KXRA_JOIN_SECRET: secret("j"),
  KXRA_AI_ENABLED: "false",
  KXRA_STORAGE_ENABLED: "false",
  KXRA_BILLING_ENABLED: "false",
  KXRA_WHATSAPP_ENABLED: "false",
  KXRA_TELEMETRY_ENABLED: "false",
  KXRA_PUBLIC_WEB_ENABLED: "false",
  KXRA_EMAIL_ENABLED: "false",
};
const marketing = {
  ...common,
  KXRA_MARKETING_ORIGIN: "https://staging.kxra-group.com",
  KXRA_PRIVATE_APP_URL: "https://app-staging.kxra-group.com/login",
  KXRA_PUBLIC_DATABASE_URL:
    "postgresql://kxra_public_ingress:private-password@db.abcdefghijklmnopqrst.supabase.co:5432/postgres?sslmode=verify-full",
  KXRA_PUBLIC_INGRESS_SECRET: secret("i"),
};
const emailWorker = {
  ...common,
  KXRA_STAGING_CAPABILITY_PROFILE: "transactional-email",
  KXRA_EMAIL_WORKER_ORIGIN: "https://email-worker-staging.vercel.app",
  KXRA_ORIGIN: "https://app-staging.kxra-group.com",
  KXRA_EMAIL_WORKER_DATABASE_URL:
    "postgresql://kxra_email_runner:private-password@db.abcdefghijklmnopqrst.supabase.co:5432/postgres?sslmode=verify-full",
  KXRA_EMAIL_ENABLED: "true",
  KXRA_EMAIL_SECRET_KEY: "e".repeat(43),
  KXRA_EMAIL_WORKER_TRIGGER_SECRET: secret("t"),
  KXRA_EMAIL_FROM: "KXRA Group <notifications@mail.kxra-group.com>",
  RESEND_API_KEY: `re_${secret("r")}`,
  RESEND_WEBHOOK_SECRET: `whsec_${secret("w")}`,
};

test("staging preflight accepts the separated disabled core profiles", () => {
  assert.deepEqual(verifyStagingConfiguration("os", os), {
    ok: true,
    findings: [],
  });
  assert.deepEqual(verifyStagingConfiguration("marketing", marketing), {
    ok: true,
    findings: [],
  });
  assert.deepEqual(verifyStagingConfiguration("email-worker", emailWorker), {
    ok: true,
    findings: [],
  });
});

test("transactional-email staging keeps provider and webhook custody separated", () => {
  assert.equal(
    verifyStagingConfiguration("os", {
      ...os,
      KXRA_STAGING_CAPABILITY_PROFILE: "transactional-email",
      KXRA_EMAIL_ENABLED: "true",
      KXRA_EMAIL_SECRET_KEY: "e".repeat(43),
    }).ok,
    true,
  );
  const worker = verifyStagingConfiguration("email-worker", {
    ...emailWorker,
    DATABASE_URL: os.DATABASE_URL,
  });
  assert.equal(worker.ok, false);
  assert.ok(
    worker.findings.includes(
      "DATABASE_URL: unrelated credential prohibited in email worker",
    ),
  );
  assert.equal(
    verifyStagingConfiguration("os", {
      ...os,
      KXRA_STAGING_CAPABILITY_PROFILE: "transactional-email",
      KXRA_EMAIL_ENABLED: "true",
      KXRA_EMAIL_SECRET_KEY: "e".repeat(43),
      RESEND_WEBHOOK_SECRET: `whsec_${secret("w")}`,
    }).ok,
    false,
  );
});

test("OS staging rejects production, fixtures, legacy keys and enabled credentials", () => {
  const result = verifyStagingConfiguration("os", {
    ...os,
    VERCEL_ENV: "production",
    VERCEL_TARGET_ENV: "production",
    KXRA_RUNTIME: "/tmp/fixture",
    SUPABASE_ANON_KEY: "legacy",
    KXRA_STORAGE_ENABLED: "true",
    SUPABASE_STORAGE_SECRET_KEY: `sb_secret_${secret("s")}`,
    NEXT_PUBLIC_PRIVATE_TOKEN: "leak",
    KXRA_STAGING_MIGRATOR_DATABASE_URL:
      "postgresql://postgres:secret@db.example.supabase.co:5432/postgres?sslmode=verify-full",
    KXRA_STAGING_SEED_CONFIRMATION: "SEED:example:branch",
    KXRA_STAGING_APP_PASSWORD: secret("a"),
  });
  assert.equal(result.ok, false);
  for (const expected of [
    "VERCEL_ENV: preview required; production is prohibited",
    "VERCEL_TARGET_ENV: staging or branch-specific preview required",
    "KXRA_RUNTIME: fixture value prohibited",
    "SUPABASE_ANON_KEY: legacy key prohibited",
    "KXRA_STORAGE_ENABLED: must remain false for core staging",
    "SUPABASE_STORAGE_SECRET_KEY: disabled capability credential prohibited",
    "NEXT_PUBLIC_PRIVATE_TOKEN: server secret may not be public",
    "KXRA_STAGING_MIGRATOR_DATABASE_URL: operator-only value prohibited in hosted application",
    "KXRA_STAGING_SEED_CONFIRMATION: operator-only value prohibited in hosted application",
    "KXRA_STAGING_APP_PASSWORD: operator-only value prohibited in hosted application",
  ])
    assert.ok(result.findings.includes(expected), expected);
});

test("staging preflight requires a declared Vercel target and permits a preview fallback", () => {
  const missingTarget = { ...os };
  delete (missingTarget as Partial<typeof os>).VERCEL_TARGET_ENV;
  assert.ok(
    verifyStagingConfiguration("os", missingTarget).findings.includes(
      "VERCEL_TARGET_ENV: staging or branch-specific preview required",
    ),
  );
  assert.equal(
    verifyStagingConfiguration("os", {
      ...os,
      VERCEL_TARGET_ENV: "preview",
    }).ok,
    true,
  );
});

test("marketing staging rejects private OS credentials and privileged database roles", () => {
  const result = verifyStagingConfiguration("marketing", {
    ...marketing,
    DATABASE_URL: os.DATABASE_URL,
    NEXT_PUBLIC_SUPABASE_URL: os.NEXT_PUBLIC_SUPABASE_URL,
    KXRA_PUBLIC_DATABASE_URL:
      "postgresql://postgres:password@db.abcdefghijklmnopqrst.supabase.co:5432/postgres",
  });
  assert.equal(result.ok, false);
  assert.ok(
    result.findings.includes(
      "DATABASE_URL: private OS credential prohibited in marketing",
    ),
  );
  assert.ok(
    result.findings.includes(
      "NEXT_PUBLIC_SUPABASE_URL: private OS credential prohibited in marketing",
    ),
  );
  assert.ok(
    result.findings.includes(
      "KXRA_PUBLIC_DATABASE_URL: privileged database user prohibited",
    ),
  );
  assert.ok(
    result.findings.includes(
      "KXRA_PUBLIC_DATABASE_URL: sslmode=verify-full is required",
    ),
  );
  assert.ok(
    result.findings.includes(
      "KXRA_PUBLIC_DATABASE_URL: kxra_public_ingress database user required",
    ),
  );
});

test("staging profiles require the exact bounded runtime login", () => {
  assert.ok(
    verifyStagingConfiguration("os", {
      ...os,
      DATABASE_URL:
        "postgresql://ordinary_user:private-password@db.abcdefghijklmnopqrst.supabase.co:5432/postgres?sslmode=verify-full",
    }).findings.includes("DATABASE_URL: kxra_app database user required"),
  );
  assert.ok(
    verifyStagingConfiguration("marketing", {
      ...marketing,
      KXRA_PUBLIC_DATABASE_URL:
        "postgresql://ordinary_user:private-password@db.abcdefghijklmnopqrst.supabase.co:5432/postgres?sslmode=verify-full",
    }).findings.includes(
      "KXRA_PUBLIC_DATABASE_URL: kxra_public_ingress database user required",
    ),
  );
});

test("staging preflight never accepts reused or placeholder secrets", () => {
  const repeated = secret("r");
  const result = verifyStagingConfiguration("marketing", {
    ...marketing,
    KXRA_PUBLIC_INGRESS_SECRET: repeated,
    RESEND_API_KEY: repeated,
  });
  assert.equal(result.ok, false);
  assert.ok(
    result.findings.includes(
      "RESEND_API_KEY: private OS credential prohibited in marketing",
    ),
  );
  assert.ok(
    result.findings.includes(
      "RESEND_API_KEY: must differ from KXRA_PUBLIC_INGRESS_SECRET",
    ),
  );
  assert.equal(
    verifyStagingConfiguration("os", {
      ...os,
      KXRA_JOIN_SECRET: "REPLACE_WITH_GENERATED_SERVER_ONLY_SECRET",
    }).ok,
    false,
  );
});
