import { z } from "zod";
import { databaseSsl } from "../db/ssl";

/** Non-secret opt-in is separate from all legacy/test billing flags. Existing
 * STRIPE_SECRET_KEY, worker DSN and CA settings are reused; nothing is provisioned.
 * Returned configuration contains credentials and MUST NEVER be logged/serialized.
 */
export function customerDispatchConfiguration(
  env: Record<string, string | undefined> = process.env,
) {
  if (env.KXRA_MODERN_BILLING_DISPATCH_ENABLED !== "true") return null;
  try {
    const environment = env.KXRA_ENVIRONMENT;
    const project =
      environment === "staging"
        ? "jlebgsxcvhvpueuibekd"
        : environment === "production"
          ? "lhbgeucifxxcdoyrnesf"
          : null;
    if (
      env.NODE_ENV !== "production" ||
      env.KXRA_AUTH_MODE === "fixture" ||
      !project ||
      env.NEXT_PUBLIC_SUPABASE_URL !== `https://${project}.supabase.co` ||
      !(
        environment === "production"
          ? /^(sk|rk)_live_[A-Za-z0-9_]{20,}$/
          : /^(sk|rk)_test_[A-Za-z0-9_]{20,}$/
      ).test(env.STRIPE_SECRET_KEY || "")
    )
      throw Error();
    const url = new URL(env.KXRA_BILLING_WORKER_DATABASE_URL || "");
    const username = decodeURIComponent(url.username),
      password = decodeURIComponent(url.password);
    const direct =
      url.hostname === `db.${project}.supabase.co` &&
      username === "kxra_billing_runner";
    const pooler =
      /^aws-[0-9]+-[a-z]+-[a-z]+-[0-9]+\.pooler\.supabase\.com$/.test(
        url.hostname,
      ) && username === `kxra_billing_runner.${project}`;
    if (
      !["postgres:", "postgresql:"].includes(url.protocol) ||
      !(direct || pooler) ||
      !password ||
      url.pathname !== "/postgres" ||
      (url.port && url.port !== "5432") ||
      url.hash
    )
      throw Error();
    for (const [key, value] of url.searchParams)
      if (key !== "sslmode" || !["require", "verify-full"].includes(value))
        throw Error();
    return {
      executionMode:
        environment === "production"
          ? ("LIVE" as const)
          : ("STAGING_SANDBOX" as const),
      runtime: {
        enabled: true as const,
        mode:
          environment === "production"
            ? ("live" as const)
            : ("staging_sandbox" as const),
        nodeEnv: "production",
        secretKey: env.STRIPE_SECRET_KEY!,
      },
      runtimeIdentity: {
        environment: environment as "staging" | "production",
        project_ref: project,
        supabase_url: `https://${project}.supabase.co`,
      },
      database: {
        host: url.hostname,
        port: 5432,
        database: "postgres",
        user: username,
        password,
        ssl: databaseSsl(env),
        connectionTimeoutMillis: 3000,
        application_name: "kxra-live-customer-once",
      },
    };
  } catch {
    throw Error("LIVE_CUSTOMER_DISPATCH_CONFIGURATION_INVALID");
  }
}
export type CustomerDispatchConfiguration = NonNullable<
  ReturnType<typeof customerDispatchConfiguration>
>;
/** Retained strict LIVE facade; staging must use the shared modern dispatcher. */
export function liveCustomerDispatchConfiguration(
  env: Record<string, string | undefined> = process.env,
) {
  const config = customerDispatchConfiguration(env);
  if (config && config.executionMode !== "LIVE")
    throw Error("LIVE_CUSTOMER_DISPATCH_CONFIGURATION_INVALID");
  return config;
}
export type LiveCustomerDispatchConfiguration = CustomerDispatchConfiguration;

/** Exactly one explicit canonical UUID; no watch, discovery, mode or actor override. */
export function parseLiveCustomerDispatchArguments(args: readonly string[]) {
  if (args.length !== 3 || args[0] !== "--once" || args[1] !== "--intent")
    throw Error("LIVE_CUSTOMER_DISPATCH_USAGE");
  return z.uuid().parse(args[2]);
}

/** Safe operator diagnostics only; never forward raw PG/provider/URL errors. */
export function liveCustomerDispatchFailureCode(error: unknown) {
  const allowed = new Set([
    "LIVE_CUSTOMER_DISPATCH_USAGE",
    "LIVE_CUSTOMER_DISPATCH_CONFIGURATION_INVALID",
    "LIVE_CUSTOMER_DISPATCH_SCOPE_UNAVAILABLE",
    "LIVE_CUSTOMER_DISPATCH_CLAIM_UNAVAILABLE",
    "LIVE_CUSTOMER_DISPATCH_CANONICAL_INVALID",
    "LIVE_CUSTOMER_DISPATCH_RECONCILIATION_REQUIRED",
    "LIVE_CUSTOMER_DISPATCH_RECEIPT_INVALID",
    "LIVE_CUSTOMER_DISPATCH_COMPLETION_UNCERTAIN",
    "LIVE_CUSTOMER_DISPATCH_COMPLETION_INVALID",
    "LIVE_CUSTOMER_DISPATCH_DATABASE_UNAVAILABLE",
  ]);
  return error instanceof Error && allowed.has(error.message)
    ? error.message
    : "LIVE_CUSTOMER_DISPATCH_NOT_CONFIRMED";
}
