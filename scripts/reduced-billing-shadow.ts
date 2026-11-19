import { runReducedBillingShadowOnce } from "../packages/integrations/reduced-billing-shadow";
async function main() {
  if (
    process.argv.slice(2).join(" ") !== "--once" ||
    process.env.KXRA_REDUCED_BILLING_SHADOW_ENABLED !== "true" ||
    process.env.KXRA_PAID_PROOF_REFRESH_ENABLED !== "true"
  )
    throw Error("REDUCED_BILLING_SHADOW_DISABLED");
  const environment = process.env.KXRA_ENVIRONMENT;
  if (environment !== "production" && environment !== "staging")
    throw Error("REDUCED_SHADOW_ENVIRONMENT_REQUIRED");
  return runReducedBillingShadowOnce({
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
    readReview: process.env.KXRA_REDUCED_BILLING_READ_REVIEW_SHA256 ?? "",
    readCeiling: Number(process.env.KXRA_REDUCED_BILLING_READ_CEILING),
  });
}
void main()
  .then((result) => console.log(JSON.stringify(result)))
  .catch(() => {
    console.error(
      "Reduced billing shadow stopped; inspect private configuration and finite receipts.",
    );
    process.exitCode = 1;
  });
