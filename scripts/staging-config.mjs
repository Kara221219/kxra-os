const placeholder = /^(?:replace|your_|change|example|test|todo)/i;
const secretNames = [
  "KXRA_PUBLIC_INGRESS_SECRET",
  "KXRA_JOIN_SECRET",
  "SUPABASE_STORAGE_SECRET_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "TRIGGER_SECRET_KEY",
  "RESEND_API_KEY",
  "RESEND_WEBHOOK_SECRET",
  "KXRA_EMAIL_SECRET_KEY",
  "KXRA_EMAIL_WORKER_TRIGGER_SECRET",
];
const forbiddenFixtureNames = [
  "KXRA_RUNTIME",
  "KXRA_LOCAL_SECRET",
  "KXRA_PG_PORT",
  "KXRA_CI_RUN_ID",
];
const marketingForbiddenNames = [
  "DATABASE_URL",
  "KXRA_JOIN_SECRET",
  "KXRA_WORKER_DATABASE_URL",
  "KXRA_AI_WORKER_DATABASE_URL",
  "KXRA_BRAND_SOURCE_WORKER_DATABASE_URL",
  "KXRA_EMAIL_WORKER_DATABASE_URL",
  "KXRA_BILLING_WORKER_DATABASE_URL",
  "KXRA_EMAIL_SECRET_KEY",
  "KXRA_EMAIL_FROM",
  "KXRA_EMAIL_WORKER_TRIGGER_SECRET",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_STORAGE_SECRET_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_PORTAL_CONFIGURATION_ID",
  "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
  "TRIGGER_SECRET_KEY",
  "RESEND_API_KEY",
  "RESEND_WEBHOOK_SECRET",
  "POSTHOG_KEY",
  "SENTRY_DSN",
];

function present(environment, name) {
  return typeof environment[name] === "string" && environment[name].length > 0;
}

function required(environment, name, findings) {
  if (!present(environment, name)) findings.push(`${name}: required`);
  return environment[name] || "";
}

function exactUrl(value, name, findings, path = "/") {
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== path
    )
      findings.push(
        `${name}: must be an exact HTTPS ${path === "/" ? "origin" : `URL ending ${path}`}`,
      );
    return url;
  } catch {
    findings.push(`${name}: invalid URL`);
    return null;
  }
}

function secret(value, name, findings, prefix) {
  if (
    value.length < 32 ||
    placeholder.test(value) ||
    (prefix && !value.startsWith(prefix))
  )
    findings.push(`${name}: invalid secret format`);
}

function stripeTestSecret(value, name, findings) {
  if (
    value.length < 32 ||
    placeholder.test(value) ||
    !/^(?:sk|rk)_test_[A-Za-z0-9_]+$/.test(value)
  )
    findings.push(`${name}: invalid secret format`);
}

function databaseUrl(value, name, findings, forbiddenUsers, expectedUser) {
  let url;
  try {
    url = new URL(value);
  } catch {
    findings.push(`${name}: invalid PostgreSQL URL`);
    return null;
  }
  if (!["postgres:", "postgresql:"].includes(url.protocol))
    findings.push(`${name}: invalid PostgreSQL scheme`);
  if (!url.hostname || !url.username || !url.password)
    findings.push(`${name}: incomplete PostgreSQL authority`);
  const baseUser = decodeURIComponent(url.username).split(".")[0];
  if (forbiddenUsers.has(baseUser))
    findings.push(`${name}: privileged database user prohibited`);
  if (expectedUser && baseUser !== expectedUser)
    findings.push(`${name}: ${expectedUser} database user required`);
  if (url.searchParams.get("sslmode") !== "verify-full")
    findings.push(`${name}: sslmode=verify-full is required`);
  return url;
}

function common(environment, findings) {
  if (environment.KXRA_ENVIRONMENT !== "staging")
    findings.push("KXRA_ENVIRONMENT: staging required");
  if (environment.NODE_ENV !== "production")
    findings.push("NODE_ENV: production required");
  if (environment.VERCEL !== "1")
    findings.push("VERCEL: trusted edge required");
  if (environment.VERCEL_ENV !== "preview")
    findings.push("VERCEL_ENV: preview required; production is prohibited");
  if (!["staging", "preview"].includes(environment.VERCEL_TARGET_ENV))
    findings.push(
      "VERCEL_TARGET_ENV: staging or branch-specific preview required",
    );
  if (environment.KXRA_AUTH_MODE === "fixture")
    findings.push("KXRA_AUTH_MODE: fixture prohibited");
  const encodedDatabaseCa = required(
    environment,
    "KXRA_DATABASE_CA_CERT_BASE64",
    findings,
  );
  let databaseCa = "";
  try {
    databaseCa = Buffer.from(encodedDatabaseCa, "base64").toString("utf8");
  } catch {}
  if (
    !/^[A-Za-z0-9+/]+={0,2}$/.test(encodedDatabaseCa) ||
    !/^-----BEGIN CERTIFICATE-----\n(?:[A-Za-z0-9+/=]+\n)+-----END CERTIFICATE-----\n?$/.test(
      databaseCa,
    )
  )
    findings.push(
      "KXRA_DATABASE_CA_CERT_BASE64: valid Base64 PEM certificate required",
    );
  for (const name of forbiddenFixtureNames)
    if (present(environment, name))
      findings.push(`${name}: fixture value prohibited`);
  for (const name of Object.keys(environment))
    if (
      /^KXRA_STAGING_(?:PROJECT_REF|MIGRATOR_DATABASE_URL|MIGRATION_CONFIRMATION|SEED_CONFIRMATION|APP_PASSWORD|PUBLIC_INGRESS_PASSWORD|ROLE_CONFIRMATION|EMAIL_WORKER_PASSWORD|EMAIL_WORKER_ROLE_CONFIRMATION|OWNER_USER_ID|OWNER_EMAIL|OWNER_DISPLAY_NAME|OWNER_CONFIRMATION)$/.test(
        name,
      ) &&
      present(environment, name)
    )
      findings.push(
        `${name}: operator-only value prohibited in hosted application`,
      );
  for (const name of Object.keys(environment))
    if (
      /^NEXT_PUBLIC_.*(?:SECRET|SERVICE_ROLE|DATABASE|PRIVATE|TOKEN)/.test(name)
    )
      findings.push(`${name}: server secret may not be public`);
  for (const name of ["SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_ANON_KEY"])
    if (present(environment, name))
      findings.push(`${name}: legacy key prohibited`);
}

function osConfiguration(environment, findings) {
  const profile = environment.KXRA_STAGING_CAPABILITY_PROFILE;
  const emailProfile =
    profile === "transactional-email" ||
    profile === "transactional-email-and-billing";
  const billingProfile =
    profile === "subscription-billing" ||
    profile === "transactional-email-and-billing";
  if (
    present(environment, "KXRA_STAGING_CAPABILITY_PROFILE") &&
    !emailProfile &&
    !billingProfile
  )
    findings.push(
      "KXRA_STAGING_CAPABILITY_PROFILE: unsupported capability profile",
    );
  const origin = exactUrl(
    required(environment, "KXRA_ORIGIN", findings),
    "KXRA_ORIGIN",
    findings,
  );
  const supabase = exactUrl(
    required(environment, "NEXT_PUBLIC_SUPABASE_URL", findings),
    "NEXT_PUBLIC_SUPABASE_URL",
    findings,
  );
  if (supabase && !/^[a-z0-9]{20}\.supabase\.co$/.test(supabase.hostname))
    findings.push("NEXT_PUBLIC_SUPABASE_URL: hosted project URL required");
  secret(
    required(environment, "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", findings),
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    findings,
    "sb_publishable_",
  );
  databaseUrl(
    required(environment, "DATABASE_URL", findings),
    "DATABASE_URL",
    findings,
    new Set(["postgres", "supabase_admin", "service_role"]),
    "kxra_app",
  );
  const joinSecret = required(environment, "KXRA_JOIN_SECRET", findings);
  if (joinSecret.length < 64 || placeholder.test(joinSecret))
    findings.push(
      "KXRA_JOIN_SECRET: generated 64-plus-character secret required",
    );
  for (const name of [
    "KXRA_AI_ENABLED",
    "KXRA_STORAGE_ENABLED",
    "KXRA_WHATSAPP_ENABLED",
    "KXRA_TELEMETRY_ENABLED",
    "KXRA_PUBLIC_WEB_ENABLED",
  ])
    if (environment[name] !== "false")
      findings.push(`${name}: must remain false for core staging`);
  if (environment.KXRA_BILLING_ENABLED !== (billingProfile ? "true" : "false"))
    findings.push(
      `KXRA_BILLING_ENABLED: must be ${billingProfile ? "true" : "false"} for this staging profile`,
    );
  if (environment.KXRA_EMAIL_ENABLED !== (emailProfile ? "true" : "false"))
    findings.push(
      `KXRA_EMAIL_ENABLED: must be ${emailProfile ? "true" : "false"} for this staging profile`,
    );
  for (const name of [
    "SUPABASE_STORAGE_SECRET_KEY",
    "KXRA_WORKER_DATABASE_URL",
    "KXRA_AI_WORKER_DATABASE_URL",
    "KXRA_BRAND_SOURCE_WORKER_DATABASE_URL",
    "KXRA_EMAIL_WORKER_DATABASE_URL",
    "KXRA_EMAIL_WORKER_TRIGGER_SECRET",
    "KXRA_EMAIL_FROM",
    "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
    "TRIGGER_SECRET_KEY",
    "RESEND_API_KEY",
    "POSTHOG_KEY",
    "SENTRY_DSN",
  ])
    if (present(environment, name))
      findings.push(`${name}: disabled capability credential prohibited`);
  if (billingProfile) {
    databaseUrl(
      required(environment, "KXRA_BILLING_WORKER_DATABASE_URL", findings),
      "KXRA_BILLING_WORKER_DATABASE_URL",
      findings,
      new Set([
        "postgres",
        "supabase_admin",
        "service_role",
        "kxra_app",
        "kxra_public_ingress",
        "kxra_email_runner",
      ]),
      "kxra_billing_runner",
    );
    stripeTestSecret(
      required(environment, "STRIPE_SECRET_KEY", findings),
      "STRIPE_SECRET_KEY",
      findings,
    );
    secret(
      required(environment, "STRIPE_WEBHOOK_SECRET", findings),
      "STRIPE_WEBHOOK_SECRET",
      findings,
      "whsec_",
    );
    const portalConfiguration = required(
      environment,
      "STRIPE_PORTAL_CONFIGURATION_ID",
      findings,
    );
    if (!/^bpc_[A-Za-z0-9_]{6,}$/.test(portalConfiguration))
      findings.push(
        "STRIPE_PORTAL_CONFIGURATION_ID: test portal configuration required",
      );
  } else
    for (const name of [
      "KXRA_BILLING_WORKER_DATABASE_URL",
      "STRIPE_SECRET_KEY",
      "STRIPE_WEBHOOK_SECRET",
      "STRIPE_PORTAL_CONFIGURATION_ID",
    ])
      if (present(environment, name))
        findings.push(`${name}: disabled capability credential prohibited`);
  if (emailProfile) {
    const emailSecret = required(
      environment,
      "KXRA_EMAIL_SECRET_KEY",
      findings,
    );
    if (!/^[A-Za-z0-9_-]{43}$/.test(emailSecret))
      findings.push("KXRA_EMAIL_SECRET_KEY: 32-byte base64url secret required");
    if (present(environment, "RESEND_WEBHOOK_SECRET"))
      findings.push(
        "RESEND_WEBHOOK_SECRET: provider credential prohibited in OS",
      );
  } else
    for (const name of ["KXRA_EMAIL_SECRET_KEY", "RESEND_WEBHOOK_SECRET"])
      if (present(environment, name))
        findings.push(`${name}: disabled capability credential prohibited`);
  if (origin && supabase && origin.hostname === supabase.hostname)
    findings.push("KXRA_ORIGIN: application and Supabase hosts must differ");
}

function emailWorkerConfiguration(environment, findings) {
  if (environment.KXRA_STAGING_CAPABILITY_PROFILE !== "transactional-email")
    findings.push(
      "KXRA_STAGING_CAPABILITY_PROFILE: transactional-email required",
    );
  exactUrl(
    required(environment, "KXRA_EMAIL_WORKER_ORIGIN", findings),
    "KXRA_EMAIL_WORKER_ORIGIN",
    findings,
  );
  exactUrl(
    required(environment, "KXRA_ORIGIN", findings),
    "KXRA_ORIGIN",
    findings,
  );
  databaseUrl(
    required(environment, "KXRA_EMAIL_WORKER_DATABASE_URL", findings),
    "KXRA_EMAIL_WORKER_DATABASE_URL",
    findings,
    new Set([
      "postgres",
      "supabase_admin",
      "service_role",
      "kxra_app",
      "kxra_public_ingress",
    ]),
    "kxra_email_runner",
  );
  if (environment.KXRA_EMAIL_ENABLED !== "true")
    findings.push("KXRA_EMAIL_ENABLED: true required");
  const emailSecret = required(environment, "KXRA_EMAIL_SECRET_KEY", findings);
  if (!/^[A-Za-z0-9_-]{43}$/.test(emailSecret))
    findings.push("KXRA_EMAIL_SECRET_KEY: 32-byte base64url secret required");
  const triggerSecret = required(
    environment,
    "KXRA_EMAIL_WORKER_TRIGGER_SECRET",
    findings,
  );
  if (!/^[A-Za-z0-9_-]{64,128}$/.test(triggerSecret))
    findings.push(
      "KXRA_EMAIL_WORKER_TRIGGER_SECRET: 64-128 base64url characters required",
    );
  secret(
    required(environment, "RESEND_API_KEY", findings),
    "RESEND_API_KEY",
    findings,
    "re_",
  );
  secret(
    required(environment, "RESEND_WEBHOOK_SECRET", findings),
    "RESEND_WEBHOOK_SECRET",
    findings,
    "whsec_",
  );
  if (
    !/^KXRA Group <[a-z0-9._%+-]+@mail\.kxra-group\.com>$/.test(
      environment.KXRA_EMAIL_FROM || "",
    )
  )
    findings.push(
      "KXRA_EMAIL_FROM: reviewed mail.kxra-group.com sender required",
    );
  for (const name of [
    "DATABASE_URL",
    "KXRA_PUBLIC_DATABASE_URL",
    "KXRA_JOIN_SECRET",
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_STORAGE_SECRET_KEY",
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "TRIGGER_SECRET_KEY",
    "POSTHOG_KEY",
    "SENTRY_DSN",
  ])
    if (present(environment, name))
      findings.push(`${name}: unrelated credential prohibited in email worker`);
}

function marketingConfiguration(environment, findings) {
  const marketing = exactUrl(
    required(environment, "KXRA_MARKETING_ORIGIN", findings),
    "KXRA_MARKETING_ORIGIN",
    findings,
  );
  const privateApp = exactUrl(
    required(environment, "KXRA_PRIVATE_APP_URL", findings),
    "KXRA_PRIVATE_APP_URL",
    findings,
    "/login",
  );
  if (marketing && privateApp && marketing.hostname === privateApp.hostname)
    findings.push("KXRA_PRIVATE_APP_URL: separate application host required");
  databaseUrl(
    required(environment, "KXRA_PUBLIC_DATABASE_URL", findings),
    "KXRA_PUBLIC_DATABASE_URL",
    findings,
    new Set(["postgres", "supabase_admin", "service_role", "kxra_app"]),
    "kxra_public_ingress",
  );
  const ingressSecret = required(
    environment,
    "KXRA_PUBLIC_INGRESS_SECRET",
    findings,
  );
  if (ingressSecret.length < 64 || placeholder.test(ingressSecret))
    findings.push(
      "KXRA_PUBLIC_INGRESS_SECRET: generated 64-plus-character secret required",
    );
  for (const name of marketingForbiddenNames)
    if (present(environment, name))
      findings.push(`${name}: private OS credential prohibited in marketing`);
}

export function verifyStagingConfiguration(kind, environment) {
  if (!["os", "marketing", "email-worker"].includes(kind))
    return {
      ok: false,
      findings: ["kind: expected os, marketing or email-worker"],
    };
  const findings = [];
  common(environment, findings);
  if (kind === "os") osConfiguration(environment, findings);
  else if (kind === "marketing") marketingConfiguration(environment, findings);
  else emailWorkerConfiguration(environment, findings);
  const values = new Map();
  for (const name of secretNames) {
    if (!present(environment, name)) continue;
    const previous = values.get(environment[name]);
    if (previous) findings.push(`${name}: must differ from ${previous}`);
    else values.set(environment[name], name);
  }
  return { ok: findings.length === 0, findings: [...new Set(findings)].sort() };
}
