import { runPaidRefreshOnce } from "../packages/integrations/live-paid-refresh-worker";
/** Explicit once only. Disabled before loading connection settings or credentials.
 * Existing private worker settings; no setup, provisioning, or provider mutation. */
async function main() {
  if (process.argv.slice(2).join(" ") !== "--once")
    throw Error("PAID_REFRESH_ONCE_ONLY");
  if (process.env.KXRA_PAID_PROOF_REFRESH_ENABLED !== "true")
    throw Error("PAID_REFRESH_DISABLED");
  const environment = process.env.KXRA_ENVIRONMENT;
  if (environment !== "production" && environment !== "staging")
    throw Error("PAID_REFRESH_ENVIRONMENT_REQUIRED");
  return runPaidRefreshOnce({
    enabled: true,
    mode: environment === "production" ? "LIVE" : "STAGING_SANDBOX",
    runtimeIdentity: {
      environment,
      project_ref:
        environment === "production"
          ? (process.env.KXRA_PRODUCTION_PROJECT_REF ?? "")
          : (process.env.KXRA_STAGING_PROJECT_REF ?? ""),
      supabase_url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    },
    secretKey: process.env.STRIPE_SECRET_KEY ?? "",
    origin: process.env.KXRA_ORIGIN ?? "",
  });
}
main()
  .then((result) => console.log(JSON.stringify(result)))
  .catch(() => {
    console.error(
      "Paid proof refresh stopped; inspect private worker configuration and receipts.",
    );
    process.exitCode = 1;
  });
