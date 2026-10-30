import { billingBodyBuffer } from "./billing-body-buffer";
import {
  bindModernExecution,
  modernExecution,
  assertModernScopeTag,
  assertModernProviderMode,
  assertModernModeTag,
  modernCatalogueRow,
  modernScopeMetadata,
  modernScopeTagSchema,
  type ModernExecutionDependencies,
  type ModernExecutionMode,
  type ModernScopeTag,
} from "./modern-billing-scope";
import crypto from "node:crypto";
import { z } from "zod";
import { approvedPlan } from "../workspace/approved-catalogue";
import {
  LIVE_STRIPE_API_VERSION,
  type LiveBillingPrincipal,
  type LiveBillingTransport,
} from "./live-catalogue-stripe";

/** UNWIRED server-only Customer creation contract; NO default connection or environment reads.
 * Canonical resolver must claim the durable0102 intent once, under verified server authority.
 * Never resolve a client-supplied actor/org/offer or retry an uncertain creation automatically.
 */
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const id = (prefix: string) =>
  z.string().regex(new RegExp(`^${prefix}_[A-Za-z0-9]{6,}$`));
const offer = z.enum(["KXRA_STARTER_V1", "KXRA_TEAM_V1", "KXRA_BUSINESS_V1"]);
const ids = {
  KXRA_STARTER_V1: ["price_1UTbq7C84VkhhIRzkBHEHivV", "prod_VUb2kv7rUiTeiu"],
  KXRA_TEAM_V1: ["price_1UTbrLC84VkhhIRzMN225zAr", "prod_VUb3rh9e9eNw5a"],
  KXRA_BUSINESS_V1: ["price_1UTlt5C84VkhhIRzGztXl6ey", "prod_VUlPLWhBBf7lmP"],
} as const;
const mappingSchema = z
  .object({
    version: z.literal(1),
    mode: z.enum(["live", "staging_sandbox"]),
    enabled: z.literal(true),
    account_id: id("acct"),
    offer_key: offer,
    revision: z.number().int().positive(),
    price_id: id("price"),
    product_id: id("prod"),
    portal_configuration_id: id("bpc"),
    activation_review_sha256: digest,
    terms_review_sha256: digest,
    tax_review_sha256: digest,
    tax_behavior: z.enum(["inclusive", "exclusive"]),
    automatic_tax: z.boolean(),
    payment_method: z.literal("card"),
  })
  .strict();
const intentSchema = z
  .object({
    id: z.uuid(),
    actor_id: z.uuid(),
    org_id: z.uuid(),
    offer_key: offer,
    mapping_revision: z.number().int().positive(),
    version: z.number().int().positive(),
    state: z.literal("REQUESTED"),
    terms_review_sha256: digest,
    auth_time: z.number().int().positive(),
    created_at: z.number().int().positive(),
    expires_at: z.number().int().positive(),
  })
  .strict();
export type LiveCustomerIntent = z.infer<typeof intentSchema>;
export type LiveCustomerMapping = z.infer<typeof mappingSchema>;
export type LiveCustomerDependencies = ModernExecutionDependencies & {
  runtime?: {
    enabled: boolean;
    mode: "live" | "staging_sandbox";
    nodeEnv: string;
    secretKey: string;
  };
  transport: LiveBillingTransport;
  resolveIntent: (
    id: string,
    principal: LiveBillingPrincipal,
  ) => Promise<{
    intent: unknown;
    mapping: unknown;
    execution_scope?: unknown;
  } | null>;
  stillCurrent: (
    intent: Readonly<LiveCustomerIntent>,
    mapping: Readonly<LiveCustomerMapping>,
  ) => Promise<boolean>;
  nowSeconds?: () => number;
};
const metadataSchema = z
  .object({
    kxra_customer_intent: z.uuid(),
    kxra_org: z.uuid(),
    kxra_actor: z.uuid(),
    kxra_offer: offer,
    kxra_mapping_revision: z.string().regex(/^[1-9][0-9]*$/),
    kxra_intent_version: z.string().regex(/^[1-9][0-9]*$/),
    kxra_terms_sha256: digest,
    kxra_execution_scope: z.uuid(),
    kxra_execution_mode: z.enum(["LIVE", "STAGING_SANDBOX"]),
    kxra_execution_sha256: digest,
    kxra_execution_project: z.string(),
  })
  .strict();
export type LiveCustomerResult = Readonly<{
  intent_id: string;
  org_id: string;
  actor_id: string;
  offer_key: string;
  mapping_revision: number;
  intent_version: number;
  account_id: string;
  livemode: boolean;
  execution_scope: ModernScopeTag;
  outcome: "BOUND" | "UNCERTAIN" | "QUARANTINED";
  customer_id: string | null;
  metadata: z.infer<typeof metadataSchema> | null;
  reason: string;
  result_sha256: string;
  entitlement_authority: false;
}>;
class CreationFault extends Error {
  constructor(readonly reason: string) {
    super(reason);
  }
}
const customerSchema = z.object({
  id: id("cus"),
  object: z.literal("customer"),
  livemode: z.boolean(),
  deleted: z.literal(false).optional(),
  created: z.number().int().positive(),
  balance: z.literal(0),
  currency: z.union([z.literal("gbp"), z.null()]),
  default_source: z.null(),
  invoice_settings: z.object({ default_payment_method: z.null() }),
  test_clock: z.null(),
  metadata: metadataSchema,
});

async function createCustomerCore(
  deps: LiveCustomerDependencies,
  input: unknown,
  principalInput: LiveBillingPrincipal,
  expectedMode: ModernExecutionMode,
): Promise<LiveCustomerResult> {
  deps = bindModernExecution(deps, deps.runtime?.secretKey || "", expectedMode);
  const execution = modernExecution(deps),
    scope = execution.execution_scope;
  const runtime = deps.runtime;
  if (
    !runtime?.enabled ||
    runtime.mode !== (scope.livemode ? "live" : "staging_sandbox") ||
    runtime.nodeEnv !== "production"
  )
    throw Error("LIVE_CUSTOMER_DISABLED");
  if (!/^(sk|rk)_(live|test)_[A-Za-z0-9_]{20,}$/.test(runtime.secretKey))
    throw Error("LIVE_CUSTOMER_LIVE_KEY_REQUIRED");
  const { intent_id } = z.object({ intent_id: z.uuid() }).strict().parse(input);
  const principal = z
    .object({ actor_id: z.uuid(), org_id: z.uuid() })
    .strict()
    .parse(principalInput);
  const canonical = await deps.resolveIntent(intent_id, principal);
  if (!canonical) throw Error("LIVE_CUSTOMER_NOT_AUTHORIZED");
  assertModernScopeTag(canonical.execution_scope, scope);
  const intent = intentSchema.parse(canonical.intent),
    mapping = mappingSchema.parse(canonical.mapping);
  const row = modernCatalogueRow(execution, mapping.offer_key);
  if (
    mapping.mode !== (scope.livemode ? "live" : "staging_sandbox") ||
    mapping.account_id !== scope.account_id ||
    mapping.price_id !== row.price_id ||
    mapping.product_id !== row.product_id
  )
    throw Error("MODERN_CUSTOMER_MAPPING_MISMATCH");
  const now = deps.nowSeconds || (() => Math.floor(Date.now() / 1000));
  const started = now();
  if (
    intent.id !== intent_id ||
    intent.actor_id !== principal.actor_id ||
    intent.org_id !== principal.org_id
  )
    throw Error("LIVE_CUSTOMER_NOT_AUTHORIZED");
  if (
    intent.offer_key !== mapping.offer_key ||
    intent.mapping_revision !== mapping.revision ||
    intent.terms_review_sha256 !== mapping.terms_review_sha256
  )
    throw Error("LIVE_CUSTOMER_MAPPING_CHANGED");
  if (
    intent.created_at > started ||
    intent.expires_at <= started ||
    intent.expires_at - intent.created_at > 300 ||
    intent.auth_time > started + 60 ||
    intent.auth_time < started - 900
  )
    throw Error("LIVE_CUSTOMER_INTENT_EXPIRED");
  const metadata = metadataSchema.parse({
    ...modernScopeMetadata(scope),
    kxra_customer_intent: intent.id,
    kxra_org: intent.org_id,
    kxra_actor: intent.actor_id,
    kxra_offer: intent.offer_key,
    kxra_mapping_revision: String(intent.mapping_revision),
    kxra_intent_version: String(intent.version),
    kxra_terms_sha256: intent.terms_review_sha256,
  });
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(metadata))
    body.set(`metadata[${key}]`, value);
  // No email/name/address/tax identity or payment method is sent. Collection belongs to the separately reviewed checkout UI.
  const nonce = crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        execution_scope: scope,
        intent,
        mapping,
        body: body.toString(),
      }),
    )
    .digest("hex");
  let attempted = false,
    observedCustomer: string | null = null;
  const deadline = Date.now() + 30_000;
  let calls = 0;
  function result(
    outcome: LiveCustomerResult["outcome"],
    reason: string,
    customer: string | null,
    verifiedMetadata: LiveCustomerResult["metadata"],
  ): LiveCustomerResult {
    const safe = {
      intent_id,
      org_id: intent.org_id,
      actor_id: intent.actor_id,
      offer_key: intent.offer_key,
      mapping_revision: intent.mapping_revision,
      intent_version: intent.version,
      account_id: mapping.account_id,
      livemode: scope.livemode,
      execution_scope: scope,
      outcome,
      customer_id: customer,
      metadata: verifiedMetadata,
      reason,
      entitlement_authority: false as const,
    };
    return Object.freeze({
      ...safe,
      result_sha256: crypto
        .createHash("sha256")
        .update(JSON.stringify(safe))
        .digest("hex"),
    });
  }
  async function request<T extends z.ZodType>(
    path: string,
    schema: T,
    post = false,
  ): Promise<z.infer<T>> {
    if (++calls > 4 || Date.now() >= deadline)
      throw new CreationFault("OBSERVATION_BUDGET_EXCEEDED");
    if (post) attempted = true; // A thrown transport or unreadable POST response can still have executed.
    let response: Response;
    try {
      response = await deps.transport(`https://api.stripe.com/v1/${path}`, {
        method: post ? "POST" : "GET",
        redirect: "error",
        signal: AbortSignal.timeout(
          Math.max(1, Math.min(15_000, deadline - Date.now())),
        ),
        headers: {
          Authorization: `Bearer ${runtime!.secretKey}`,
          "Stripe-Version": LIVE_STRIPE_API_VERSION,
          ...(post
            ? {
                "Content-Type": "application/x-www-form-urlencoded",
                "Idempotency-Key": `kxra-customer-${nonce}`,
              }
            : {}),
        },
        ...(post ? { body: body.toString() } : {}),
      });
    } catch {
      throw new CreationFault("PROVIDER_OUTCOME_UNVERIFIED");
    }
    if (!response.ok || !response.body)
      throw new CreationFault("PROVIDER_RESPONSE_UNVERIFIED");
    const reader = response.body.getReader();
    const chunks = billingBodyBuffer(100_000);
    let bytes = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > 100_000 || Date.now() >= deadline) {
          void reader.cancel().catch(() => {});
          throw new CreationFault("RESPONSE_BUDGET_EXCEEDED");
        }
        try {
          chunks.append(value);
        } catch (error) {
          void reader.cancel().catch(() => {});
          throw error;
        }
      }
    } finally {
      reader.releaseLock();
    }
    const raw = JSON.parse(chunks.finish().toString("utf8"));
    assertModernProviderMode(raw, scope);
    return schema.parse(raw);
  }
  try {
    const account = await request(
      "account",
      z.object({
        id: z.literal(mapping.account_id),
        object: z.literal("account"),
        charges_enabled: z.literal(true),
      }),
    );
    if (account.id !== mapping.account_id)
      throw new CreationFault("ACCOUNT_MISMATCH");
    const price = await request(
      `prices/${mapping.price_id}?expand[]=product`,
      z.object({
        id: z.literal(mapping.price_id),
        object: z.literal("price"),
        active: z.literal(true),
        livemode: z.boolean(),
        currency: z.literal("gbp"),
        unit_amount: z.number().int(),
        type: z.literal("recurring"),
        billing_scheme: z.literal("per_unit"),
        tax_behavior: z.literal(mapping.tax_behavior),
        transform_quantity: z.null(),
        custom_unit_amount: z.null(),
        recurring: z.object({
          interval: z.literal("month"),
          interval_count: z.literal(1),
          usage_type: z.literal("licensed"),
        }),
        product: z.object({
          id: z.literal(mapping.product_id),
          object: z.literal("product"),
          active: z.literal(true),
          livemode: z.boolean(),
        }),
      }),
    );
    if (
      price.unit_amount !== approvedPlan(intent.offer_key).monthly_amount_minor
    )
      throw new CreationFault("CATALOGUE_AMOUNT_MISMATCH");
    if (
      !(await deps.stillCurrent(
        Object.freeze({ ...intent }),
        Object.freeze({ ...mapping }),
      )) ||
      now() >= intent.expires_at
    )
      throw new CreationFault("INTENT_CHANGED_BEFORE_POST");
    const created = await request("customers", customerSchema, true);
    observedCustomer = created.id;
    if (
      JSON.stringify(created.metadata) !== JSON.stringify(metadata) ||
      created.created < intent.created_at - 1 ||
      created.created > now() + 60
    )
      throw new CreationFault("CUSTOMER_PROVENANCE_MISMATCH");
    const verified = await request(`customers/${created.id}`, customerSchema);
    if (JSON.stringify(verified) !== JSON.stringify(created))
      throw new CreationFault("CUSTOMER_CHANGED_DURING_READ");
    if (
      !(await deps.stillCurrent(
        Object.freeze({ ...intent }),
        Object.freeze({ ...mapping }),
      )) ||
      now() >= intent.expires_at ||
      Date.now() >= deadline
    )
      throw new CreationFault("INTENT_CHANGED_AFTER_POST");
    // BOUND is a proposed trusted-worker completion receipt; transport alone creates NO DB binding.
    return result(
      "BOUND",
      "VERIFIED_LIVE_CUSTOMER",
      created.id,
      verified.metadata,
    );
  } catch (error) {
    const reason =
      error instanceof CreationFault
        ? error.reason
        : "PROVIDER_SCHEMA_OR_READ_UNVERIFIED";
    return result(
      attempted ? "UNCERTAIN" : "QUARANTINED",
      reason,
      observedCustomer,
      null,
    );
  }
}

export type LiveCustomerCommand = Readonly<{
  text: string;
  values: readonly unknown[];
  role: "AUTHENTICATED_SERVER" | "BILLING_WORKER";
  entitlement_authority: false;
}>;
function command(
  text: string,
  values: unknown[],
  role: LiveCustomerCommand["role"],
): LiveCustomerCommand {
  return Object.freeze({
    text,
    values: Object.freeze(values),
    role,
    entitlement_authority: false,
  });
}
function enabled(
  config: { enabled: boolean; mode: "live" | "staging_sandbox" } | undefined,
  expectedMode: ModernExecutionMode,
) {
  if (
    config?.enabled !== true ||
    config.mode !== (expectedMode === "LIVE" ? "live" : "staging_sandbox")
  )
    throw Error("LIVE_CUSTOMER_DISABLED");
}
function requestLiveCustomerCommandCore(
  input: unknown,
  config: { enabled: boolean; mode: "live" | "staging_sandbox" } | undefined,
  expectedMode: ModernExecutionMode,
) {
  enabled(config, expectedMode);
  const r = z
    .object({ intent_id: z.uuid(), offer_key: offer })
    .strict()
    .parse(input);
  return command(
    `select kxra_private.${expectedMode === "LIVE" ? "" : "staging_sandbox_"}request_live_customer_intent($1::uuid,$2::text) value`,
    [r.intent_id, r.offer_key],
    "AUTHENTICATED_SERVER",
  );
}
function claimLiveCustomerCommandCore(
  input: unknown,
  config: { enabled: boolean; mode: "live" | "staging_sandbox" } | undefined,
  expectedMode: ModernExecutionMode,
) {
  enabled(config, expectedMode);
  const r = z.object({ intent_id: z.uuid() }).strict().parse(input);
  return command(
    `select kxra_private.${expectedMode === "LIVE" ? "" : "staging_sandbox_"}claim_live_customer_intent($1::uuid) value`,
    [r.intent_id],
    "BILLING_WORKER",
  );
}
function finishLiveCustomerCommandCore(
  input: unknown,
  config: { enabled: boolean; mode: "live" | "staging_sandbox" } | undefined,
  expectedMode: ModernExecutionMode,
) {
  enabled(config, expectedMode);
  const r = z
    .object({
      intent_id: z.uuid(),
      org_id: z.uuid(),
      actor_id: z.uuid(),
      offer_key: offer,
      mapping_revision: z.number().int().positive(),
      intent_version: z.number().int().positive(),
      account_id: id("acct"),
      livemode: z.boolean(),
      execution_scope: modernScopeTagSchema,
      outcome: z.enum(["BOUND", "UNCERTAIN", "QUARANTINED"]),
      customer_id: id("cus").nullable(),
      metadata: metadataSchema.nullable(),
      reason: z.string().regex(/^[A-Z_]{3,100}$/),
      result_sha256: digest,
      entitlement_authority: z.literal(false),
    })
    .strict()
    .parse(input);
  const tag = assertModernModeTag(r.execution_scope, expectedMode);
  if (r.livemode !== tag.livemode || r.account_id !== tag.account_id)
    throw Error("MODERN_CUSTOMER_RECEIPT_SCOPE_MISMATCH");
  if (r.outcome === "BOUND" && (!r.customer_id || !r.metadata))
    throw Error("LIVE_CUSTOMER_PROVENANCE_REQUIRED");
  return command(
    `select kxra_private.${expectedMode === "LIVE" ? "" : "staging_sandbox_"}finish_live_customer_intent($1::uuid,$2::jsonb) value`,
    [r.intent_id, JSON.stringify(r)],
    "BILLING_WORKER",
  );
}

/** Only answers whether the claimed canonical intent is still eligible; no table access. */
function currentLiveCustomerCommandCore(
  input: unknown,
  config: { enabled: boolean; mode: "live" | "staging_sandbox" } | undefined,
  expectedMode: ModernExecutionMode,
) {
  enabled(config, expectedMode);
  const r = z
    .object({
      intent_id: z.uuid(),
      intent_version: z.number().int().positive(),
    })
    .strict()
    .parse(input);
  return command(
    `select kxra_private.${expectedMode === "LIVE" ? "" : "staging_sandbox_"}live_customer_intent_current($1::uuid,$2::integer) value`,
    [r.intent_id, r.intent_version],
    "BILLING_WORKER",
  );
}

export function createLiveStripeCustomer(
  deps: LiveCustomerDependencies,
  input: unknown,
  principal: LiveBillingPrincipal,
) {
  return createCustomerCore(deps, input, principal, "LIVE");
}
export function createStagingSandboxStripeCustomer(
  deps: LiveCustomerDependencies,
  input: unknown,
  principal: LiveBillingPrincipal,
) {
  return createCustomerCore(deps, input, principal, "STAGING_SANDBOX");
}

export function requestLiveCustomerCommand(
  input: unknown,
  config?: { enabled: boolean; mode: "live" },
) {
  return requestLiveCustomerCommandCore(input, config, "LIVE");
}
export function requestStagingSandboxCustomerCommand(
  input: unknown,
  config?: { enabled: boolean; mode: "staging_sandbox" },
) {
  return requestLiveCustomerCommandCore(input, config, "STAGING_SANDBOX");
}

export function claimLiveCustomerCommand(
  input: unknown,
  config?: { enabled: boolean; mode: "live" },
) {
  return claimLiveCustomerCommandCore(input, config, "LIVE");
}
export function claimStagingSandboxCustomerCommand(
  input: unknown,
  config?: { enabled: boolean; mode: "staging_sandbox" },
) {
  return claimLiveCustomerCommandCore(input, config, "STAGING_SANDBOX");
}

export function finishLiveCustomerCommand(
  input: unknown,
  config?: { enabled: boolean; mode: "live" },
) {
  return finishLiveCustomerCommandCore(input, config, "LIVE");
}
export function finishStagingSandboxCustomerCommand(
  input: unknown,
  config?: { enabled: boolean; mode: "staging_sandbox" },
) {
  return finishLiveCustomerCommandCore(input, config, "STAGING_SANDBOX");
}

export function currentLiveCustomerCommand(
  input: unknown,
  config?: { enabled: boolean; mode: "live" },
) {
  return currentLiveCustomerCommandCore(input, config, "LIVE");
}
export function currentStagingSandboxCustomerCommand(
  input: unknown,
  config?: { enabled: boolean; mode: "staging_sandbox" },
) {
  return currentLiveCustomerCommandCore(input, config, "STAGING_SANDBOX");
}
