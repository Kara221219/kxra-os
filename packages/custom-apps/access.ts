/** Server configuration only. Never derive this capability from HTTP/JWT metadata. */
export function productionCustomAppsEnabled(
  env: Record<string, string | undefined> = process.env,
) {
  return env.KXRA_CUSTOM_APPS_ENABLED === "true";
}
export function customAppsIdentityAllowed(
  source: string | undefined,
  fixture: boolean,
  env: Record<string, string | undefined> = process.env,
) {
  return fixture
    ? !env.VERCEL_ENV && source === "fixture"
    : productionCustomAppsEnabled(env) && source === "supabase";
}

/** Only a verified, hook-issued top-level claim is accepted; user/app metadata is never inspected. */
export function customAppsProviderSessionVersion(
  claims: Record<string, unknown>,
) {
  const v = claims.kxra_session_version;
  return typeof v === "number" &&
    Number.isInteger(v) &&
    v > 0 &&
    v <= 2147483647
    ? v
    : undefined;
}
