import crypto from "node:crypto";
import {
  modernScopeDigest,
  type ModernExecutionMode,
  type ModernBillingConfiguration,
} from "../../packages/integrations/modern-billing-scope";
/** SYNTHETIC metadata only: not provider accounts, approvals, catalogue resources or credentials. */
export function modernBillingFixture(mode: ModernExecutionMode = "LIVE") {
  const catalogue: ModernBillingConfiguration["catalogue"] = [
    {
      offer_key: "KXRA_STARTER_V1",
      price_id:
        mode === "LIVE"
          ? "price_1UTbq7C84VkhhIRzkBHEHivV"
          : "price_SYNTHETICsandboxStarter",
      product_id:
        mode === "LIVE"
          ? "prod_VUb2kv7rUiTeiu"
          : "prod_SYNTHETICsandboxStarter",
      monthly_amount_minor: 2900,
      people: 1,
      currency: "gbp",
      interval: "month",
    },
    {
      offer_key: "KXRA_TEAM_V1",
      price_id:
        mode === "LIVE"
          ? "price_1UTbrLC84VkhhIRzMN225zAr"
          : "price_SYNTHETICsandboxTeam",
      product_id:
        mode === "LIVE" ? "prod_VUb3rh9e9eNw5a" : "prod_SYNTHETICsandboxTeam",
      monthly_amount_minor: 7900,
      people: 5,
      currency: "gbp",
      interval: "month",
    },
    {
      offer_key: "KXRA_BUSINESS_V1",
      price_id:
        mode === "LIVE"
          ? "price_1UTlt5C84VkhhIRzGztXl6ey"
          : "price_SYNTHETICsandboxBusiness",
      product_id:
        mode === "LIVE"
          ? "prod_VUlPLWhBBf7lmP"
          : "prod_SYNTHETICsandboxBusiness",
      monthly_amount_minor: 19900,
      people: 15,
      currency: "gbp",
      interval: "month",
    },
  ];
  const review_sha256 = crypto
    .createHash("sha256")
    .update("SYNTHETIC_NOT_REVIEWED_" + mode)
    .digest("hex");
  const material = {
    scope_id:
      mode === "LIVE"
        ? "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
        : "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    execution_mode: mode,
    project_ref: "jlebgsxcvhvpueuibekd" as const,
    account_id:
      mode === "LIVE" ? "acct_1Rv3KdC84VkhhIRz" : "acct_SYNTHETICsandbox123",
    api_version: "2025-07-30.basil" as const,
    catalogue_revision: 1,
    livemode: mode === "LIVE",
  };
  const execution: ModernBillingConfiguration = {
    execution_scope: {
      ...material,
      scope_sha256: modernScopeDigest(material, review_sha256, catalogue),
    },
    enabled: true,
    review_sha256,
    catalogue,
  };
  return {
    execution,
    runtimeIdentity: {
      environment: "staging" as const,
      project_ref: material.project_ref,
      supabase_url: `https://${material.project_ref}.supabase.co`,
    },
  };
}
