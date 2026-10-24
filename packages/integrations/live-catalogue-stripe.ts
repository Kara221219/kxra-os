import crypto from "node:crypto";
import { z } from "zod";
import { approvedPlan } from "../workspace/approved-catalogue";
import { verifyBillingWebhook } from "./billing";

/** Additive, UNWIRED server-only contract. No env reads, default fetch, DB writes or entitlements.
 * The integration owner must supply reviewed DB configuration and an authenticated, authorized
 * intent resolver. Never pass request bodies as configuration, principal or resolver results.
 */
export const LIVE_STRIPE_API_VERSION = "2025-07-30.basil";
const account = "acct_1Rv3KdC84VkhhIRz";
const id = (prefix: string) =>
  z.string().regex(new RegExp(`^${prefix}_[A-Za-z0-9]{6,}$`));
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const offer = z.enum(["KXRA_STARTER_V1", "KXRA_TEAM_V1", "KXRA_BUSINESS_V1"]);
const catalogueIds = {
  KXRA_STARTER_V1: ["price_1UTbq7C84VkhhIRzkBHEHivV", "prod_VUb2kv7rUiTeiu"],
  KXRA_TEAM_V1: ["price_1UTbrLC84VkhhIRzMN225zAr", "prod_VUb3rh9e9eNw5a"],
  KXRA_BUSINESS_V1: ["price_1UTlt5C84VkhhIRzGztXl6ey", "prod_VUlPLWhBBf7lmP"],
} as const;
const mappingSchema = z
  .object({
    version: z.literal(1),
    mode: z.literal("live"),
    enabled: z.literal(true),
    account_id: z.literal(account),
    offer_key: offer,
    revision: z.number().int().positive(),
    price_id: id("price"),
    product_id: id("prod"),
    portal_configuration_id: id("bpc"),
    // References attest a separately approved commercial configuration; they do not invent terms.
    activation_review_sha256: digest,
    terms_review_sha256: digest,
    tax_review_sha256: digest,
    tax_behavior: z.enum(["inclusive", "exclusive"]),
    automatic_tax: z.boolean(),
    payment_method: z.literal("card"),
  })
  .strict()
  .refine(
    (m) =>
      m.price_id === catalogueIds[m.offer_key][0] &&
      m.product_id === catalogueIds[m.offer_key][1],
    "APPROVED_CATALOGUE_IDS_REQUIRED",
  );
export type LiveCatalogueMapping = z.infer<typeof mappingSchema>;
const principalSchema = z
  .object({ actor_id: z.uuid(), org_id: z.uuid() })
  .strict();
export type LiveBillingPrincipal = z.infer<typeof principalSchema>;
const intentSchema = z
  .object({
    id: z.uuid(),
    actor_id: z.uuid(),
    org_id: z.uuid(),
    kind: z.enum(["CHECKOUT", "PORTAL", "RECONCILE"]),
    state: z.literal("REQUESTED"),
    customer_id: id("cus"),
    subscription_id: id("sub").nullable(),
    offer_key: offer,
    mapping_revision: z.number().int().positive(),
    terms_review_sha256: digest,
    created_at: z.number().int().positive(),
    expires_at: z.number().int().positive(),
  })
  .strict();
export type LiveBillingIntent = z.infer<typeof intentSchema>;
export type LiveBillingTransport = (
  url: string,
  init: RequestInit,
) => Promise<Response>;
export type LiveBillingDependencies = {
  // Must come from private server runtime, independently of HTTP input. Missing means disabled.
  runtime?: {
    enabled: boolean;
    nodeEnv: string;
    secretKey: string;
    origin: string;
  };
  transport: LiveBillingTransport;
  // Must check active verified identity, billing authority and RLS tenant membership atomically.
  resolveIntent: (
    id: string,
    principal: LiveBillingPrincipal,
  ) => Promise<{
    intent: unknown;
    mapping: unknown;
  } | null>;
  nowSeconds?: () => number;
};
function fail(code: string): never {
  throw new Error(`LIVE_BILLING_${code}`);
}
function parseMapping(input: unknown) {
  return mappingSchema.parse(input);
}
function runtime(deps: LiveBillingDependencies) {
  const r = deps.runtime;
  if (!r?.enabled || r.nodeEnv !== "production") fail("DISABLED");
  if (!/^(sk|rk)_live_[A-Za-z0-9_]{20,}$/.test(r.secretKey))
    fail("LIVE_KEY_REQUIRED");
  let origin: URL;
  try {
    origin = new URL(r.origin);
  } catch {
    fail("ORIGIN_INVALID");
  }
  if (
    origin.protocol !== "https:" ||
    origin.origin !== r.origin ||
    origin.username ||
    origin.password
  )
    fail("ORIGIN_INVALID");
  return r;
}
async function request(
  deps: LiveBillingDependencies,
  path: string,
  body?: URLSearchParams,
  key?: string,
) {
  const r = runtime(deps);
  let response: Response;
  try {
    response = await deps.transport(`https://api.stripe.com/v1/${path}`, {
      method: body ? "POST" : "GET",
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
      headers: {
        Authorization: `Bearer ${r.secretKey}`,
        "Stripe-Version": LIVE_STRIPE_API_VERSION,
        ...(body
          ? {
              "Content-Type": "application/x-www-form-urlencoded",
              "Idempotency-Key": key!,
            }
          : {}),
      },
      ...(body ? { body: body.toString() } : {}),
    });
  } catch {
    // A failed POST may already have executed. Persist intent, inspect outcome, then
    // retry only that SAME intent/key; never generate a replacement automatically.
    fail(body ? "PROVIDER_OUTCOME_UNCERTAIN" : "PROVIDER_UNAVAILABLE");
  }
  if (!response.ok || !response.body)
    fail(body ? "PROVIDER_OUTCOME_UNCERTAIN" : "PROVIDER_RESPONSE");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 100_000) {
        await reader.cancel();
        fail("RESPONSE_TOO_LARGE");
      }
      chunks.push(value);
    }
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "LIVE_BILLING_RESPONSE_TOO_LARGE"
    )
      throw error;
    fail(body ? "PROVIDER_OUTCOME_UNCERTAIN" : "PROVIDER_STREAM_INVALID");
  } finally {
    reader.releaseLock();
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    fail("PROVIDER_JSON");
  }
}
const priceSchema = z.object({
  id: id("price"),
  object: z.literal("price"),
  livemode: z.literal(true),
  active: z.literal(true),
  currency: z.literal("gbp"),
  unit_amount: z.number().int(),
  type: z.literal("recurring"),
  billing_scheme: z.literal("per_unit"),
  tax_behavior: z.enum(["inclusive", "exclusive"]),
  recurring: z.object({
    interval: z.literal("month"),
    interval_count: z.literal(1),
    usage_type: z.literal("licensed"),
  }),
  transform_quantity: z.null().optional(),
  custom_unit_amount: z.null().optional(),
  product: z.union([
    id("prod"),
    z.object({
      id: id("prod"),
      object: z.literal("product"),
      livemode: z.literal(true),
      active: z.literal(true),
    }),
  ]),
});
function validatePrice(
  input: unknown,
  mapping: LiveCatalogueMapping,
  expanded = false,
) {
  const price = priceSchema.parse(input);
  const plan = approvedPlan(mapping.offer_key);
  if (
    price.id !== mapping.price_id ||
    price.unit_amount !== plan.monthly_amount_minor ||
    price.tax_behavior !== mapping.tax_behavior ||
    (typeof price.product === "string" ? price.product : price.product.id) !==
      mapping.product_id ||
    (expanded && typeof price.product === "string")
  )
    fail("PRICE_MAPPING_MISMATCH");
  return price;
}
async function providerBinding(
  deps: LiveBillingDependencies,
  mapping: LiveCatalogueMapping,
  intent: LiveBillingIntent,
) {
  const a = z
    .object({
      id: z.literal(account),
      object: z.literal("account"),
      charges_enabled: z.literal(true),
    })
    .parse(await request(deps, "account"));
  if (a.id !== mapping.account_id) fail("ACCOUNT_MISMATCH");
  validatePrice(
    await request(deps, `prices/${mapping.price_id}?expand[]=product`),
    mapping,
    true,
  );
  const customer = z
    .object({
      id: id("cus"),
      object: z.literal("customer"),
      livemode: z.literal(true),
      deleted: z.literal(false).optional(),
    })
    .parse(await request(deps, `customers/${intent.customer_id}`));
  if (customer.id !== intent.customer_id) fail("CUSTOMER_MISMATCH");
}
async function canonical(
  deps: LiveBillingDependencies,
  input: unknown,
  principalInput: LiveBillingPrincipal,
) {
  runtime(deps);
  const { intent_id } = z.object({ intent_id: z.uuid() }).strict().parse(input);
  const principal = principalSchema.parse(principalInput);
  const resolved = await deps.resolveIntent(intent_id, principal);
  if (!resolved) fail("INTENT_NOT_AUTHORIZED");
  const intent = intentSchema.parse(resolved.intent);
  const mapping = parseMapping(resolved.mapping);
  const now = (deps.nowSeconds || (() => Math.floor(Date.now() / 1000)))();
  if (
    intent.id !== intent_id ||
    intent.actor_id !== principal.actor_id ||
    intent.org_id !== principal.org_id
  )
    fail("INTENT_NOT_AUTHORIZED");
  if (
    intent.offer_key !== mapping.offer_key ||
    intent.mapping_revision !== mapping.revision ||
    intent.terms_review_sha256 !== mapping.terms_review_sha256
  )
    fail("INTENT_MAPPING_CHANGED");
  if (
    intent.created_at > now ||
    intent.expires_at <= now ||
    intent.expires_at - intent.created_at > 1800
  )
    fail("INTENT_EXPIRED");
  return { intent, mapping, now };
}

export async function createLiveCatalogueSession(
  deps: LiveBillingDependencies,
  input: unknown,
  principal: LiveBillingPrincipal,
) {
  const { intent, mapping, now } = await canonical(deps, input, principal);
  if (intent.kind === "RECONCILE") fail("SESSION_KIND");
  if (intent.kind === "CHECKOUT" && intent.subscription_id)
    fail("EXISTING_SUBSCRIPTION");
  if (intent.kind === "PORTAL" && !intent.subscription_id)
    fail("SUBSCRIPTION_REQUIRED");
  await providerBinding(deps, mapping, intent);
  const r = runtime(deps);
  const body = new URLSearchParams({ customer: intent.customer_id });
  const checkout = intent.kind === "CHECKOUT";
  if (checkout) {
    body.set("mode", "subscription");
    body.set("line_items[0][price]", mapping.price_id);
    body.set("line_items[0][quantity]", "1");
    body.set("client_reference_id", intent.id);
    body.set("automatic_tax[enabled]", String(mapping.automatic_tax));
    body.set("allow_promotion_codes", "false");
    body.set("payment_method_types[0]", mapping.payment_method);
    body.set("success_url", `${r.origin}/os/start?billing=returned`);
    body.set("cancel_url", `${r.origin}/os/start?billing=cancelled`);
    for (const [k, v] of Object.entries({
      kxra_live_intent_id: intent.id,
      kxra_catalogue_offer: mapping.offer_key,
      kxra_mapping_revision: String(mapping.revision),
    }))
      body.set(`subscription_data[metadata][${k}]`, v);
  } else {
    const portal = z
      .object({
        id: id("bpc"),
        object: z.literal("billing_portal.configuration"),
        active: z.literal(true),
        livemode: z.literal(true),
        features: z.object({
          subscription_update: z.object({ enabled: z.literal(false) }),
          subscription_cancel: z.object({ enabled: z.literal(true) }),
        }),
      })
      .parse(
        await request(
          deps,
          `billing_portal/configurations/${mapping.portal_configuration_id}`,
        ),
      );
    if (portal.id !== mapping.portal_configuration_id)
      fail("PORTAL_MAPPING_MISMATCH");
    body.set("configuration", mapping.portal_configuration_id);
    body.set("return_url", `${r.origin}/os/start?billing=returned`);
  }
  // Retry only the same durable canonical intent within its lifetime. No automatic retries.
  const nonce = crypto
    .createHash("sha256")
    .update(JSON.stringify({ intent, mapping, body: body.toString() }))
    .digest("hex");
  const session = z
    .object({
      id: z.string(),
      object: z.string(),
      livemode: z.literal(true),
      customer: id("cus"),
      url: z.string().url(),
      created: z.number().int(),
      expires_at: z.number().int().optional(),
      mode: z.string().optional(),
      status: z.string().optional(),
      client_reference_id: z.string().optional(),
      configuration: z.string().optional(),
    })
    .parse(
      await request(
        deps,
        checkout ? "checkout/sessions" : "billing_portal/sessions",
        body,
        `kxra-live-${nonce}`,
      ),
    );
  const url = new URL(session.url);
  const expiry = checkout ? session.expires_at : session.created + 1800;
  if (
    session.customer !== intent.customer_id ||
    url.protocol !== "https:" ||
    url.hostname !==
      (checkout ? "checkout.stripe.com" : "billing.stripe.com") ||
    url.username ||
    url.password ||
    url.port ||
    session.created > now + 60 ||
    session.created < intent.created_at - 60 ||
    !expiry ||
    expiry <= now ||
    expiry > now + (checkout ? 86460 : 1860)
  )
    fail("SESSION_INVALID");
  if (
    checkout
      ? !/^cs_live_[A-Za-z0-9_]{6,}$/.test(session.id) ||
        session.object !== "checkout.session" ||
        session.mode !== "subscription" ||
        session.status !== "open" ||
        session.client_reference_id !== intent.id
      : !/^bps_[A-Za-z0-9]{6,}$/.test(session.id) ||
        session.object !== "billing_portal.session" ||
        session.configuration !== mapping.portal_configuration_id
  )
    fail("SESSION_INVALID");
  return {
    id: session.id,
    url: session.url,
    expires_at: expiry,
    offer_key: mapping.offer_key,
    people: approvedPlan(mapping.offer_key).people,
    entitlement_authority: false as const,
  };
}

const subscriptionSchema = z.object({
  id: id("sub"),
  object: z.literal("subscription"),
  livemode: z.literal(true),
  customer: id("cus"),
  status: z.enum([
    "incomplete",
    "incomplete_expired",
    "trialing",
    "active",
    "past_due",
    "canceled",
    "unpaid",
    "paused",
  ]),
  cancel_at_period_end: z.boolean(),
  metadata: z.object({
    kxra_live_intent_id: z.uuid(),
    kxra_catalogue_offer: offer,
    kxra_mapping_revision: z.string().regex(/^[1-9][0-9]*$/),
  }),
  items: z.object({
    data: z
      .array(
        z.object({
          id: id("si"),
          quantity: z.literal(1),
          current_period_start: z.number().int().positive(),
          current_period_end: z.number().int().positive(),
          price: priceSchema,
        }),
      )
      .length(1),
  }),
});
function subscriptionSnapshot(
  input: unknown,
  mapping: LiveCatalogueMapping,
  binding: LiveSubscriptionBinding,
) {
  const s = subscriptionSchema.parse(input);
  const item = s.items.data[0];
  validatePrice(item.price, mapping);
  if (
    s.customer !== binding.customer_id ||
    (binding.subscription_id && s.id !== binding.subscription_id) ||
    s.metadata.kxra_live_intent_id !== binding.checkout_intent_id ||
    s.metadata.kxra_catalogue_offer !== mapping.offer_key ||
    s.metadata.kxra_mapping_revision !== String(mapping.revision) ||
    item.current_period_end <= item.current_period_start
  )
    fail("SUBSCRIPTION_BINDING_MISMATCH");
  return {
    subscription_id: s.id,
    customer_id: s.customer,
    status: s.status,
    cancel_at_period_end: s.cancel_at_period_end,
    period_start: item.current_period_start,
    period_end: item.current_period_end,
    offer_key: mapping.offer_key,
    mapping_revision: mapping.revision,
    people: approvedPlan(mapping.offer_key).people,
    entitlement_authority: false as const,
  };
}
const bindingSchema = z
  .object({
    customer_id: id("cus"),
    subscription_id: id("sub").nullable(),
    checkout_intent_id: z.uuid(),
  })
  .strict();
export type LiveSubscriptionBinding = z.infer<typeof bindingSchema>;

/** Signature/shape verification yields a reconciliation task, NEVER a paid-access decision.
 * The signing secret must be server-bound to this exact account/mode/version endpoint.
 * Parent must atomically insert event-ID+hash receipts and enqueue reconciliation under RLS.
 */
export function verifyLiveCatalogueEvent(
  raw: Buffer,
  signature: string,
  endpoint: {
    enabled: boolean;
    account_id: string;
    mode: string;
    api_version: string;
    signing_secret: string;
  },
  mappingInput: unknown,
  bindingInput: LiveSubscriptionBinding,
  nowSeconds: number,
) {
  if (
    !endpoint.enabled ||
    endpoint.account_id !== account ||
    endpoint.mode !== "live" ||
    endpoint.api_version !== LIVE_STRIPE_API_VERSION
  )
    fail("ENDPOINT_DISABLED_OR_MISMATCH");
  const mapping = parseMapping(mappingInput);
  const binding = bindingSchema.parse(bindingInput);
  const verified = verifyBillingWebhook(
    raw,
    signature,
    endpoint.signing_secret,
    nowSeconds,
  );
  const event = z
    .object({
      id: id("evt"),
      object: z.literal("event"),
      api_version: z.literal(LIVE_STRIPE_API_VERSION),
      type: z.enum([
        "customer.subscription.created",
        "customer.subscription.updated",
        "customer.subscription.deleted",
        "customer.subscription.paused",
        "customer.subscription.resumed",
      ]),
      created: z.number().int().positive(),
      livemode: z.literal(true),
      account: z.literal(account).optional(),
      data: z.object({ object: subscriptionSchema }),
    })
    .parse(verified.payload);
  if (event.created > nowSeconds + 60) fail("EVENT_FUTURE");
  if (
    event.type === "customer.subscription.deleted" &&
    event.data.object.status !== "canceled"
  )
    fail("EVENT_STATUS_MISMATCH");
  return {
    event_id: verified.id,
    raw_sha256: verified.rawSha256,
    event_created: event.created,
    account_id: mapping.account_id,
    requires_reconciliation: true as const,
    snapshot: subscriptionSnapshot(event.data.object, mapping, binding),
  };
}

/** Compare a transactionally loaded receipt, not an in-memory dedupe cache. Event timestamps
 * never order state: Stripe can deliver distinct events in either order or the same second.
 */
export function liveReceiptDecision(
  event: { event_id: string; raw_sha256: string },
  prior?: { event_id: string; raw_sha256: string },
) {
  const schema = z.object({ event_id: id("evt"), raw_sha256: digest }).strict();
  schema.parse(event);
  if (prior) schema.parse(prior);
  if (prior && prior.event_id !== event.event_id)
    fail("RECEIPT_LOOKUP_MISMATCH");
  return prior
    ? prior.raw_sha256 === event.raw_sha256
      ? "DUPLICATE"
      : "CONFLICT"
    : "RECONCILE_REQUIRED";
}

/** Current provider read for a separately authorized reconciliation intent. Caller must recheck
 * the DB row version/tenant binding after the read; this is not a paid invoice/entitlement proof.
 */
export async function reconcileLiveCatalogue(
  deps: LiveBillingDependencies,
  input: unknown,
  principal: LiveBillingPrincipal,
  bindingInput: LiveSubscriptionBinding,
) {
  const { intent, mapping } = await canonical(deps, input, principal);
  const binding = bindingSchema.parse(bindingInput);
  if (
    intent.kind !== "RECONCILE" ||
    !intent.subscription_id ||
    intent.subscription_id !== binding.subscription_id ||
    intent.customer_id !== binding.customer_id
  )
    fail("RECONCILE_BINDING_MISMATCH");
  await providerBinding(deps, mapping, intent);
  return subscriptionSnapshot(
    await request(deps, `subscriptions/${intent.subscription_id}`),
    mapping,
    binding,
  );
}
