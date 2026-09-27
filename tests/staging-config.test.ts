import assert from "node:assert/strict";
import { test } from "node:test";
import { verifyStagingConfiguration } from "../scripts/staging-config.mjs";

const secret = (character: string) => character.repeat(72);
const common = {
  KXRA_ENVIRONMENT: "staging",
  NODE_ENV: "production",
  VERCEL: "1",
  VERCEL_ENV: "preview",
  VERCEL_TARGET_ENV: "staging",
  KXRA_AUTH_MODE: "supabase",
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
    "postgresql://kxra_public_ingress:private-password@db.abcdefghijklmnopqrst.supabase.co:5432/postgres?sslmode=require",
  KXRA_PUBLIC_INGRESS_SECRET: secret("i"),
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
      "KXRA_PUBLIC_DATABASE_URL: sslmode=require or verify-full is required",
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
