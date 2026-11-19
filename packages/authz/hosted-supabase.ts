/** Shipping authentication has one provider: Supabase. Its production-only
 * implementation cannot issue local principals; configuration is bound to the
 * intended hosted project rather than a development fixture selector. Presence
 * of a public key is not proof of key/project compatibility or acceptance. */
export function hostedSupabaseConfiguration(
  environment: Record<string, string | undefined> = process.env,
) {
  if (
    environment.NODE_ENV !== "production" ||
    !environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  )
    return null;
  const project: "jlebgsxcvhvpueuibekd" | "lhbgeucifxxcdoyrnesf" | null =
    environment.KXRA_ENVIRONMENT === "staging"
      ? "jlebgsxcvhvpueuibekd"
      : environment.KXRA_ENVIRONMENT === "production"
        ? "lhbgeucifxxcdoyrnesf"
        : null;
  if (
    !project ||
    environment.NEXT_PUBLIC_SUPABASE_URL !== `https://${project}.supabase.co`
  )
    return null;
  try {
    const origin = new URL(environment.KXRA_ORIGIN || "");
    const hostname = origin.hostname.toLowerCase().replace(/\.$/, "");
    if (
      origin.protocol !== "https:" ||
      origin.origin !== environment.KXRA_ORIGIN ||
      origin.username ||
      origin.password ||
      origin.pathname !== "/" ||
      origin.search ||
      origin.hash ||
      hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      hostname.includes(":") ||
      /^\d+\.\d+\.\d+\.\d+$/.test(hostname)
    )
      return null;
    return { origin: origin.origin, project };
  } catch {
    return null;
  }
}
