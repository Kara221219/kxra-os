import crypto from "node:crypto";
import { z } from "zod";
import { approvedPlan } from "../workspace/approved-catalogue";
export type ModernExecutionMode = "LIVE" | "STAGING_SANDBOX";
export const MODERN_BILLING_API_VERSION = "2025-07-30.basil";
export const MODERN_STAGING_PROJECT = "jlebgsxcvhvpueuibekd";
export const MODERN_PRODUCTION_PROJECT = "lhbgeucifxxcdoyrnesf";
const digest = z.string().regex(/^[a-f0-9]{64}$/),
  pid = (p: string) => z.string().regex(new RegExp(`^${p}_[A-Za-z0-9]{6,}$`));
const offer = z.enum(["KXRA_STARTER_V1", "KXRA_TEAM_V1", "KXRA_BUSINESS_V1"]);
export const modernScopeTagSchema = z
  .object({
    scope_id: z.uuid(),
    execution_mode: z.enum(["LIVE", "STAGING_SANDBOX"]),
    project_ref: z.enum([MODERN_STAGING_PROJECT, MODERN_PRODUCTION_PROJECT]),
    account_id: pid("acct"),
    api_version: z.literal(MODERN_BILLING_API_VERSION),
    catalogue_revision: z.number().int().positive(),
    scope_sha256: digest,
    livemode: z.boolean(),
  })
  .strict();
export type ModernScopeTag = z.infer<typeof modernScopeTagSchema>;
const rowSchema = z
  .object({
    offer_key: offer,
    price_id: pid("price"),
    product_id: pid("prod"),
    monthly_amount_minor: z.number().int().positive(),
    people: z.number().int().positive(),
    currency: z.literal("gbp"),
    interval: z.literal("month"),
  })
  .strict();
export type ModernCatalogueRow = z.infer<typeof rowSchema>;
export type ModernBillingConfiguration = {
  execution_scope: Readonly<ModernScopeTag>;
  enabled: true;
  review_sha256: string;
  catalogue: readonly Readonly<ModernCatalogueRow>[];
};
export type ModernRuntimeIdentity = {
  environment: "production" | "staging";
  project_ref: string;
  supabase_url: string;
};
const liveIds = {
  KXRA_STARTER_V1: ["price_1UTbq7C84VkhhIRzkBHEHivV", "prod_VUb2kv7rUiTeiu"],
  KXRA_TEAM_V1: ["price_1UTbrLC84VkhhIRzMN225zAr", "prod_VUb3rh9e9eNw5a"],
  KXRA_BUSINESS_V1: ["price_1UTlt5C84VkhhIRzGztXl6ey", "prod_VUlPLWhBBf7lmP"],
} as const;
export function modernScopeDigest(
  scope: Omit<ModernScopeTag, "scope_sha256">,
  review: string,
  catalogue: readonly Readonly<ModernCatalogueRow>[],
) {
  const rows = [...catalogue].sort((a, b) =>
    a.offer_key.localeCompare(b.offer_key),
  );
  const material = [
    "scope-v1",
    scope.scope_id,
    scope.execution_mode,
    scope.project_ref,
    scope.account_id,
    scope.api_version,
    String(scope.catalogue_revision),
    review,
    ...rows.flatMap((r) => [
      r.offer_key,
      r.price_id,
      r.product_id,
      String(r.monthly_amount_minor),
      String(r.people),
      r.currency,
      r.interval,
    ]),
  ].join("|");
  return crypto.createHash("sha256").update(material).digest("hex");
}
/** Private runtime identity and attested DB configuration only. No caller-selectable mode,
 * environment reads, credentials in DTOs, automatic setup or synthesized sandbox IDs.
 */
export function validateModernBillingConfiguration(
  input: unknown,
  runtime: ModernRuntimeIdentity,
  secretKey: string | undefined,
  expected: ModernExecutionMode,
): Readonly<ModernBillingConfiguration> {
  const c = z
      .object({
        execution_scope: modernScopeTagSchema,
        enabled: z.literal(true),
        review_sha256: digest,
        catalogue: z.array(rowSchema).length(3),
      })
      .strict()
      .parse(input),
    s = c.execution_scope;
  if (
    s.execution_mode !== expected ||
    s.livemode !== (expected === "LIVE") ||
    new Set(c.catalogue.map((r) => r.offer_key)).size !== 3 ||
    new Set(c.catalogue.map((r) => r.price_id)).size !== 3
  )
    throw Error("MODERN_BILLING_SCOPE_MISMATCH");
  if (
    runtime.project_ref !== s.project_ref ||
    runtime.supabase_url !== `https://${s.project_ref}.supabase.co` ||
    runtime.environment !==
      (s.project_ref === MODERN_PRODUCTION_PROJECT ? "production" : "staging")
  )
    throw Error("MODERN_BILLING_PROJECT_MISMATCH");
  if (
    expected === "STAGING_SANDBOX" &&
    (s.project_ref !== MODERN_STAGING_PROJECT ||
      runtime.environment !== "staging")
  )
    throw Error("MODERN_SANDBOX_STAGING_ONLY");
  if (
    secretKey !== undefined &&
    !(
      expected === "LIVE"
        ? /^(sk|rk)_live_[A-Za-z0-9_]{20,}$/
        : /^(sk|rk)_test_[A-Za-z0-9_]{20,}$/
    ).test(secretKey)
  )
    throw Error("MODERN_BILLING_KEY_MODE_MISMATCH");
  if (
    expected === "LIVE" &&
    (s.account_id !== "acct_1Rv3KdC84VkhhIRz" ||
      s.project_ref !== MODERN_PRODUCTION_PROJECT ||
      runtime.environment !== "production")
  )
    throw Error("MODERN_LIVE_ACCOUNT_MISMATCH");
  for (const r of c.catalogue) {
    const p = approvedPlan(r.offer_key);
    if (
      r.monthly_amount_minor !== p.monthly_amount_minor ||
      r.people !== p.people
    )
      throw Error("MODERN_CATALOGUE_TERMS_MISMATCH");
    if (
      expected === "LIVE"
        ? r.price_id !== liveIds[r.offer_key][0] ||
          r.product_id !== liveIds[r.offer_key][1]
        : Object.values(liveIds).some(
            ([price, product]) =>
              r.price_id === price || r.product_id === product,
          )
    )
      throw Error("MODERN_CATALOGUE_MODE_MISMATCH");
  }
  const { scope_sha256, ...material } = s;
  if (
    modernScopeDigest(material, c.review_sha256, c.catalogue) !== scope_sha256
  )
    throw Error("MODERN_SCOPE_DIGEST_MISMATCH");
  return Object.freeze({
    ...c,
    execution_scope: Object.freeze({ ...s }),
    catalogue: Object.freeze(c.catalogue.map((r) => Object.freeze({ ...r }))),
  });
}
export function assertModernScopeTag(
  actual: unknown,
  expected: ModernScopeTag,
) {
  const a = modernScopeTagSchema.parse(actual);
  if (
    JSON.stringify(a) !== JSON.stringify(modernScopeTagSchema.parse(expected))
  )
    throw Error("MODERN_CANONICAL_SCOPE_MISMATCH");
  return a;
}
/** Checks raw provider values in place. Never substitutes true for false or rewrites IDs. */
export function assertModernProviderMode(
  value: unknown,
  scope: ModernScopeTag,
): void {
  if (Array.isArray(value)) {
    for (const item of value) assertModernProviderMode(item, scope);
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (key === "livemode" && item !== scope.livemode)
      throw Error("MODERN_PROVIDER_MODE_MISMATCH");
    if (
      key === "account" &&
      typeof item === "string" &&
      item.startsWith("acct_") &&
      item !== scope.account_id
    )
      throw Error("MODERN_PROVIDER_ACCOUNT_MISMATCH");
    assertModernProviderMode(item, scope);
  }
}
export function modernCatalogueRow(c: ModernBillingConfiguration, key: string) {
  const r = c.catalogue.find((r) => r.offer_key === key);
  if (!r) throw Error("MODERN_CATALOGUE_REQUIRED");
  return r;
}
export type ModernExecutionDependencies = {
  execution?: ModernBillingConfiguration;
  runtimeIdentity?: ModernRuntimeIdentity;
};
const context = Symbol("verified-modern-billing-scope");
export function bindModernExecution<T extends ModernExecutionDependencies>(
  deps: T,
  key: string | undefined,
  expected: ModernExecutionMode,
): T {
  if (!deps.runtimeIdentity) throw Error("MODERN_RUNTIME_IDENTITY_REQUIRED");
  const execution = validateModernBillingConfiguration(
    deps.execution,
    deps.runtimeIdentity,
    key,
    expected,
  );
  return Object.assign({ ...deps }, { [context]: execution });
}
export function modernExecution(
  deps: object,
): Readonly<ModernBillingConfiguration> {
  const c = (deps as { [context]?: ModernBillingConfiguration })[context];
  if (!c) throw Error("MODERN_EXECUTION_NOT_BOUND");
  return c;
}

export function assertModernModeTag(input: unknown, mode: ModernExecutionMode) {
  const s = modernScopeTagSchema.parse(input);
  if (
    s.execution_mode !== mode ||
    s.livemode !== (mode === "LIVE") ||
    (mode === "STAGING_SANDBOX" && s.project_ref !== MODERN_STAGING_PROJECT) ||
    (mode === "LIVE" &&
      (s.account_id !== "acct_1Rv3KdC84VkhhIRz" ||
        s.project_ref !== MODERN_PRODUCTION_PROJECT))
  )
    throw Error("MODERN_EXECUTION_MODE_MISMATCH");
  return s;
}
export function modernScopeMetadata(s: ModernScopeTag) {
  return {
    kxra_execution_scope: s.scope_id,
    kxra_execution_mode: s.execution_mode,
    kxra_execution_sha256: s.scope_sha256,
    kxra_execution_project: s.project_ref,
  };
}
