import crypto from "node:crypto";
import { z } from "zod";
import {
  normalizeStripeSubscriptionEvent,
  type VerifiedBillingWebhook,
} from "./billing";
import { billingTransaction } from "./billing-worker";
import type pg from "pg";
import {
  approvedCatalogue,
  approvedPlan,
} from "../workspace/approved-catalogue";

const id = (prefix: string) =>
  z.string().regex(new RegExp(`^${prefix}_[A-Za-z0-9]{6,}$`));
const legacyPilotConfigSchema = z.object({
  version: z.literal(1),
  enabled: z.literal(true),
  account_id: id("acct"),
  monthly_price: id("price"),
  monthly_product: id("prod"),
  setup_price: id("price"),
  setup_product: id("prod"),
  portal_config: id("bpc"),
  tax_behavior: z.enum(["inclusive", "exclusive"]),
  terms_review: z.string().min(10).max(200),
});
export const catalogueOfferKey = z.enum([
  "KXRA_STARTER_V1",
  "KXRA_TEAM_V1",
  "KXRA_BUSINESS_V1",
]);
export const sandboxPilotConfigSchema = z
  .object({
    version: z.literal(2),
    mode: z.literal("sandbox"),
    enabled: z.literal(true),
    offer_key: catalogueOfferKey,
    mapping_revision: z.number().int().positive(),
    account_id: id("acct"),
    monthly_price: id("price"),
    monthly_product: id("prod"),
    portal_config: id("bpc"),
    tax_behavior: z.enum(["inclusive", "exclusive"]),
    terms_review: z.string().min(10).max(200),
  })
  .strict();
export const pilotConfigSchema = z.discriminatedUnion("version", [
  legacyPilotConfigSchema,
  sandboxPilotConfigSchema,
]);
export type PilotConfig = z.infer<typeof pilotConfigSchema>;
export const pilotIntentSchema = z.object({
  id: z.string().uuid(),
  org_id: z.string().uuid(),
  actor_id: z.string().uuid(),
  kind: z.enum(["CHECKOUT", "PORTAL", "RECONCILE"]),
  include_setup: z.boolean(),
  customer_id: id("cus"),
  subscription_id: id("sub").nullable(),
  observed_version: z.number().int().nonnegative(),
  state: z.enum(["REQUESTED", "READY"]),
  session_id: z.string().nullable(),
  redirect_url: z.string().nullable(),
  expires_at: z.string().nullable(),
  created_at: z.string(),
  catalogue_offer_key: catalogueOfferKey.nullable().optional(),
  catalogue_revision: z.number().int().positive().nullable().optional(),
});
export type PilotIntent = z.infer<typeof pilotIntentSchema>;
export type StripeTransport = (
  url: string,
  init?: RequestInit,
) => Promise<Response>;
export function pilotStripeRuntime() {
  if (process.env.KXRA_PILOT_STRIPE_ENABLED !== "true")
    throw Error("PILOT_STRIPE_DISABLED");
  const key = process.env.STRIPE_SECRET_KEY || "",
    origin = process.env.KXRA_ORIGIN || "";
  if (!/^(sk|rk)_test_[A-Za-z0-9_]{20,}$/.test(key))
    throw Error("PILOT_TEST_KEY_REQUIRED");
  const parsed = new URL(origin);
  if (parsed.origin !== origin || parsed.protocol !== "https:")
    throw Error("PILOT_HOSTED_ORIGIN_REQUIRED");
  return { key, origin };
}
async function request(
  path: string,
  transport: StripeTransport,
  values?: URLSearchParams,
  nonce?: string,
) {
  const { key } = pilotStripeRuntime();
  const response = await transport(`https://api.stripe.com/v1/${path}`, {
    method: values ? "POST" : "GET",
    redirect: "error",
    signal: AbortSignal.timeout(15000),
    headers: {
      Authorization: `Bearer ${key}`,
      "Stripe-Version": "2025-07-30.basil",
      ...(values
        ? {
            "Content-Type": "application/x-www-form-urlencoded",
            "Idempotency-Key": nonce!,
          }
        : {}),
    },
    ...(values ? { body: values } : {}),
  });
  if (!response.ok || !response.body) throw Error("PILOT_PROVIDER_UNAVAILABLE");
  const reader = response.body.getReader(),
    chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    length += part.value.byteLength;
    if (length > 100000) {
      await reader.cancel();
      throw Error("PILOT_RESPONSE_LIMIT");
    }
    chunks.push(part.value);
  }
  return JSON.parse(Buffer.concat(chunks, length).toString("utf8")) as unknown;
}
const priceSchema = z.object({
  id: id("price"),
  object: z.literal("price"),
  livemode: z.literal(false),
  active: z.literal(true),
  currency: z.literal("gbp"),
  unit_amount: z.number().int(),
  type: z.enum(["recurring", "one_time"]),
  billing_scheme: z.literal("per_unit"),
  tax_behavior: z.enum(["inclusive", "exclusive"]),
  product: z.object({
    id: id("prod"),
    object: z.literal("product"),
    livemode: z.literal(false),
    active: z.literal(true),
  }),
  transform_quantity: z.null().optional(),
  custom_unit_amount: z.null().optional(),
  recurring: z
    .object({
      interval: z.literal("month"),
      interval_count: z.literal(1),
      usage_type: z.literal("licensed"),
    })
    .nullable(),
});
export async function validatePilotProvider(
  config: PilotConfig,
  intent: PilotIntent,
  transport: StripeTransport = fetch,
) {
  pilotConfigSchema.parse(config);
  pilotIntentSchema.parse(intent);
  if (
    config.version === 2 &&
    (intent.catalogue_offer_key !== config.offer_key ||
      intent.catalogue_revision !== config.mapping_revision ||
      intent.include_setup)
  )
    throw Error("PILOT_CATALOGUE_BINDING_MISMATCH");
  if (config.version === 1 && intent.catalogue_offer_key)
    throw Error("PILOT_LEGACY_CONVERSION_PROHIBITED");
  const account = z
    .object({ id: id("acct"), object: z.literal("account") })
    .parse(await request("account", transport));
  if (account.id !== config.account_id) throw Error("PILOT_ACCOUNT_MISMATCH");
  for (const setup of [false, ...(intent.include_setup ? [true] : [])]) {
    const priceId =
      setup && config.version === 1 ? config.setup_price : config.monthly_price;
    const price = priceSchema.parse(
      await request(`prices/${priceId}?expand[]=product`, transport),
    );
    if (
      price.id !== priceId ||
      price.product.id !==
        (setup && config.version === 1
          ? config.setup_product
          : config.monthly_product) ||
      price.unit_amount !==
        (config.version === 2
          ? approvedPlan(config.offer_key).monthly_amount_minor
          : setup
            ? 19900
            : 4900) ||
      price.tax_behavior !== config.tax_behavior ||
      price.type !== (setup ? "one_time" : "recurring") ||
      (!setup && !price.recurring) ||
      (setup && price.recurring)
    )
      throw Error("PILOT_PRICE_MISMATCH");
  }
  const customer = z
    .object({
      id: id("cus"),
      object: z.literal("customer"),
      livemode: z.literal(false),
      deleted: z.literal(false).optional(),
    })
    .parse(await request(`customers/${intent.customer_id}`, transport));
  if (customer.id !== intent.customer_id)
    throw Error("PILOT_CUSTOMER_MISMATCH");
  if (intent.kind === "PORTAL") {
    const portal = z
      .object({
        id: id("bpc"),
        object: z.literal("billing_portal.configuration"),
        livemode: z.literal(false),
        active: z.literal(true),
        features: z.object({
          subscription_update: z.object({ enabled: z.literal(false) }),
          subscription_cancel: z.object({ enabled: z.literal(true) }),
        }),
      })
      .parse(
        await request(
          `billing_portal/configurations/${config.portal_config}`,
          transport,
        ),
      );
    if (portal.id !== config.portal_config)
      throw Error("PILOT_PORTAL_MISMATCH");
  }
}
export async function createPilotSession(
  config: PilotConfig,
  intent: PilotIntent,
  transport: StripeTransport = fetch,
) {
  await validatePilotProvider(config, intent, transport);
  const { origin } = pilotStripeRuntime();
  const values = new URLSearchParams({ customer: intent.customer_id });
  if (intent.kind === "CHECKOUT") {
    values.set("mode", "subscription");
    values.set("line_items[0][price]", config.monthly_price);
    values.set("line_items[0][quantity]", "1");
    if (intent.include_setup && config.version === 1) {
      values.set("line_items[1][price]", config.setup_price);
      values.set("line_items[1][quantity]", "1");
    }
    values.set("client_reference_id", intent.id);
    values.set("subscription_data[metadata][kxra_pilot_intent_id]", intent.id);
    if (config.version === 2) {
      values.set(
        "subscription_data[metadata][kxra_catalogue_offer]",
        config.offer_key,
      );
      values.set(
        "subscription_data[metadata][kxra_catalogue_revision]",
        String(config.mapping_revision),
      );
    }
    values.set("success_url", `${origin}/os/start?pilot=returned`);
    values.set("cancel_url", `${origin}/os/start?pilot=cancelled`);
  } else if (intent.kind === "PORTAL") {
    values.set("configuration", config.portal_config);
    values.set("return_url", `${origin}/os/start?pilot=returned`);
  } else throw Error("PILOT_SESSION_KIND");
  const data = await request(
    intent.kind === "CHECKOUT"
      ? "checkout/sessions"
      : "billing_portal/sessions",
    transport,
    values,
    `kxra-pilot-${intent.id}`,
  );
  const response = z
    .object({
      id: z.string(),
      object: z.string(),
      customer: id("cus"),
      livemode: z.literal(false),
      url: z.string().url(),
      created: z.number().int().optional(),
      expires_at: z.number().int().optional(),
      mode: z.string().optional(),
      client_reference_id: z.string().optional(),
      status: z.string().optional(),
    })
    .parse(data);
  const u = new URL(response.url),
    checkout = intent.kind === "CHECKOUT";
  if (
    response.customer !== intent.customer_id ||
    u.protocol !== "https:" ||
    u.hostname !== (checkout ? "checkout.stripe.com" : "billing.stripe.com") ||
    u.username ||
    u.password ||
    u.port ||
    (checkout
      ? !/^cs_test_[A-Za-z0-9_]{6,}$/.test(response.id) ||
        response.object !== "checkout.session" ||
        response.mode !== "subscription" ||
        response.status !== "open" ||
        response.client_reference_id !== intent.id
      : !/^bps_[A-Za-z0-9_]{6,}$/.test(response.id) ||
        response.object !== "billing_portal.session")
  )
    throw Error("PILOT_SESSION_MISMATCH");
  const expiry = checkout
    ? response.expires_at
    : response.created
      ? response.created + 1800
      : undefined;
  if (
    !expiry ||
    expiry * 1000 <= Date.now() ||
    expiry * 1000 > Date.now() + (checkout ? 86460000 : 1860000)
  )
    throw Error("PILOT_SESSION_EXPIRED");
  return {
    id: response.id,
    url: response.url,
    expires_at: new Date(expiry * 1000).toISOString(),
    customer: intent.customer_id,
  };
}
export function normalizePilotEvent(verified: VerifiedBillingWebhook) {
  const base = normalizeStripeSubscriptionEvent(verified);
  const payload = z
    .object({
      data: z.object({
        object: z.object({
          livemode: z.literal(false),
          metadata: z.object({
            kxra_pilot_intent_id: z.string().uuid(),
            kxra_catalogue_offer: catalogueOfferKey.optional(),
            kxra_catalogue_revision: z
              .string()
              .regex(/^[1-9][0-9]{0,8}$/)
              .optional(),
          }),
          items: z.object({
            data: z
              .array(
                z.object({
                  price: z.object({
                    id: id("price"),
                    object: z.literal("price"),
                    livemode: z.literal(false),
                    currency: z.literal("gbp"),
                    // The database binds exact price/product/amount to the recorded plan.
                    // 4900 is retained only for pre-existing legacy bindings.
                    unit_amount: z
                      .number()
                      .int()
                      .refine(
                        (amount) =>
                          amount === 4900 ||
                          approvedCatalogue.some(
                            (plan) => plan.monthly_amount_minor === amount,
                          ),
                      ),
                    billing_scheme: z.literal("per_unit"),
                    type: z.literal("recurring"),
                    tax_behavior: z.enum(["inclusive", "exclusive"]),
                    product: id("prod"),
                    transform_quantity: z.null().optional(),
                    custom_unit_amount: z.null().optional(),
                    recurring: z.object({
                      interval: z.literal("month"),
                      interval_count: z.literal(1),
                      usage_type: z.literal("licensed"),
                    }),
                  }),
                }),
              )
              .length(1),
          }),
        }),
      }),
    })
    .parse(verified.payload);
  const p = payload.data.object.items.data[0].price;
  const metadata = payload.data.object.metadata;
  if (!!metadata.kxra_catalogue_offer !== !!metadata.kxra_catalogue_revision)
    throw Error("PILOT_CATALOGUE_METADATA_INVALID");
  if (base.quantity !== 1 || !base.periodStart || !base.periodEnd)
    throw Error("PILOT_SUBSCRIPTION_INVALID");
  if (
    base.eventType === "customer.subscription.deleted" &&
    base.status !== "canceled"
  )
    throw Error("PILOT_DELETE_INVALID");
  return {
    event_id: base.eventId,
    created_at: base.createdAt,
    livemode: false,
    customer: base.customerId,
    subscription: base.subscriptionId,
    status: base.status,
    period_start: base.periodStart,
    period_end: base.periodEnd,
    cancel_at_end: base.cancelAtPeriodEnd,
    price: p.id,
    product: p.product,
    quantity: base.quantity,
    currency: p.currency,
    amount: p.unit_amount,
    interval: p.recurring.interval,
    interval_count: p.recurring.interval_count,
    tax_behavior: p.tax_behavior,
    intent_id: payload.data.object.metadata.kxra_pilot_intent_id,
    hash: base.rawSha256,
    reconcile: false,
    ...(payload.data.object.metadata.kxra_catalogue_offer
      ? {
          catalogue_offer_key:
            payload.data.object.metadata.kxra_catalogue_offer,
          catalogue_revision: Number(
            payload.data.object.metadata.kxra_catalogue_revision,
          ),
        }
      : {}),
    ...(verified.payload.account !== undefined
      ? {
          account: id("acct").parse(verified.payload.account),
        }
      : {}),
  };
}
export async function reconcilePilot(
  config: PilotConfig,
  intent: PilotIntent,
  transport: StripeTransport = fetch,
) {
  if (intent.kind !== "RECONCILE" || !intent.subscription_id)
    throw Error("PILOT_RECONCILE_INVALID");
  await validatePilotProvider(config, intent, transport);
  const object = await request(
    `subscriptions/${intent.subscription_id}`,
    transport,
  );
  const now = Math.floor(Date.now() / 1000),
    eventId = `evt_reconcile${intent.id.replaceAll("-", "")}`,
    payload = {
      id: eventId,
      type: "customer.subscription.updated",
      created: now,
      livemode: false,
      data: { object },
    };
  const event = normalizePilotEvent({
    id: eventId,
    type: payload.type,
    created: now,
    payload,
    rawSha256: crypto
      .createHash("sha256")
      .update(JSON.stringify(payload))
      .digest("hex"),
  });
  if (
    event.customer !== intent.customer_id ||
    event.subscription !== intent.subscription_id
  )
    throw Error("PILOT_RECONCILE_BINDING");
  return { ...event, intent_id: intent.id, reconcile: true };
}
export async function recordPilotEvent(
  event:
    | ReturnType<typeof normalizePilotEvent>
    | ReturnType<typeof normalizePilotQuarantine>,
  configuration?: pg.ClientConfig,
) {
  if (process.env.KXRA_PILOT_STRIPE_ENABLED !== "true")
    throw Error("PILOT_STRIPE_DISABLED");
  return billingTransaction(
    async (db) =>
      (
        await db.query<{ state: string }>(
          "select kxra_private.record_pilot_stripe_event($1::jsonb) state",
          [JSON.stringify(event)],
        )
      ).rows[0].state,
    configuration,
  );
}
export async function recordPilotSession(
  intent: PilotIntent,
  session: Awaited<ReturnType<typeof createPilotSession>>,
  configuration?: pg.ClientConfig,
) {
  if (process.env.KXRA_PILOT_STRIPE_ENABLED !== "true")
    throw Error("PILOT_STRIPE_DISABLED");
  return billingTransaction(
    async (db) =>
      (
        await db.query<{ state: string }>(
          "select kxra_private.record_pilot_stripe_session($1,$2,$3,$4,$5) state",
          [
            intent.id,
            session.customer,
            session.id,
            session.url,
            session.expires_at,
          ],
        )
      ).rows[0].state,
    configuration,
  );
}

/** A verified signed but invalid bound subscription may deny, never grant access. */
export function normalizePilotQuarantine(verified: VerifiedBillingWebhook) {
  const event = z
    .object({
      id: id("evt"),
      created: z.number().int().positive(),
      type: z.enum([
        "customer.subscription.created",
        "customer.subscription.updated",
        "customer.subscription.deleted",
        "customer.subscription.paused",
        "customer.subscription.resumed",
      ]),
      livemode: z.literal(false),
      data: z.object({
        object: z.object({
          id: id("sub"),
          object: z.literal("subscription"),
          customer: id("cus"),
          livemode: z.literal(false),
          status: z.string(),
        }),
      }),
    })
    .parse(verified.payload);
  if (
    event.id !== verified.id ||
    event.type !== verified.type ||
    event.created !== verified.created
  )
    throw Error("PILOT_EVENT_MISMATCH");
  return {
    quarantine: true,
    livemode: false,
    event_id: event.id,
    created_at: new Date(event.created * 1000).toISOString(),
    hash: verified.rawSha256,
    customer: event.data.object.customer,
    subscription: event.data.object.id,
    status: event.data.object.status,
  };
}
