import { z } from "zod";

type StripeTransport = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export type BillingSessionIntent = {
  intent_id: string;
  intent_state: "REQUESTED" | "READY" | "FAILED";
  provider_customer_id: string;
  provider_price_id: string | null;
  idempotency_key: string;
  redirect_url: string | null;
  expires_at: string | null;
};

export type StripeHostedSession = {
  intentId: string;
  sessionKind: "CHECKOUT" | "PORTAL";
  providerSessionId: string;
  customerId: string;
  redirectUrl: string;
  expiresAt: string;
  livemode: boolean;
};

const stripeId = (prefix: string) =>
  z.string().regex(new RegExp(`^${prefix}_[A-Za-z0-9_]{6,}$`));

const checkoutResponse = z
  .object({
    id: stripeId("cs_test"),
    object: z.literal("checkout.session"),
    customer: stripeId("cus"),
    mode: z.literal("subscription"),
    livemode: z.literal(false),
    status: z.literal("open"),
    url: z.string().url().startsWith("https://checkout.stripe.com/"),
    expires_at: z.number().int().positive(),
  })
  .passthrough();

const portalResponse = z
  .object({
    id: stripeId("bps"),
    object: z.literal("billing_portal.session"),
    customer: stripeId("cus"),
    livemode: z.literal(false),
    created: z.number().int().positive(),
    url: z.string().url().startsWith("https://billing.stripe.com/"),
  })
  .passthrough();

function configuration() {
  if (process.env.KXRA_BILLING_ENABLED !== "true")
    throw Error("STRIPE_BILLING_DISABLED");
  const secret = process.env.STRIPE_SECRET_KEY || "";
  if (!/^sk_test_[A-Za-z0-9_]{20,}$/.test(secret))
    throw Error("STRIPE_TEST_KEY_UNAVAILABLE");
  const origin = process.env.KXRA_ORIGIN || "";
  const parsed = new URL(origin);
  if (
    parsed.origin !== origin ||
    (parsed.protocol !== "https:" && parsed.hostname !== "127.0.0.1")
  )
    throw Error("STRIPE_RETURN_ORIGIN_INVALID");
  const portalConfiguration = process.env.STRIPE_PORTAL_CONFIGURATION_ID || "";
  if (!/^bpc_[A-Za-z0-9_]{6,}$/.test(portalConfiguration))
    throw Error("STRIPE_PORTAL_CONFIGURATION_UNAVAILABLE");
  return { secret, origin, portalConfiguration };
}

async function stripePost(
  path: "/v1/checkout/sessions" | "/v1/billing_portal/sessions",
  values: URLSearchParams,
  idempotencyKey: string,
  transport: StripeTransport,
) {
  const { secret } = configuration();
  const response = await transport(`https://api.stripe.com${path}`, {
    method: "POST",
    redirect: "error",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Idempotency-Key": idempotencyKey,
      "Stripe-Version": "2025-06-30.basil",
    },
    body: values,
    signal: AbortSignal.timeout(15_000),
  });
  const declared = response.headers.get("content-length");
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > 100_000))
    throw Error("STRIPE_RESPONSE_INVALID");
  if (!response.body) throw Error("STRIPE_RESPONSE_INVALID");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    total += part.value.byteLength;
    if (total > 100_000) {
      await reader.cancel();
      throw Error("STRIPE_RESPONSE_INVALID");
    }
    chunks.push(part.value);
  }
  const bytes = Buffer.concat(chunks, total);
  if (!response.ok) throw Error("STRIPE_REQUEST_REJECTED");
  try {
    return JSON.parse(bytes.toString("utf8")) as unknown;
  } catch {
    throw Error("STRIPE_RESPONSE_INVALID");
  }
}

export async function createStripeCheckoutSession(
  intent: BillingSessionIntent,
  transport: StripeTransport = fetch,
): Promise<StripeHostedSession> {
  const { origin } = configuration();
  if (!intent.provider_price_id) throw Error("STRIPE_PRICE_UNAVAILABLE");
  const response = checkoutResponse.parse(
    await stripePost(
      "/v1/checkout/sessions",
      new URLSearchParams({
        customer: intent.provider_customer_id,
        mode: "subscription",
        "line_items[0][price]": intent.provider_price_id,
        "line_items[0][quantity]": "1",
        client_reference_id: intent.intent_id,
        success_url: `${origin}/os/tools?billing=success`,
        cancel_url: `${origin}/os/tools?billing=cancelled`,
      }),
      intent.idempotency_key,
      transport,
    ),
  );
  if (response.customer !== intent.provider_customer_id)
    throw Error("STRIPE_CUSTOMER_MISMATCH");
  return {
    intentId: intent.intent_id,
    sessionKind: "CHECKOUT",
    providerSessionId: response.id,
    customerId: response.customer,
    redirectUrl: response.url,
    expiresAt: new Date(response.expires_at * 1000).toISOString(),
    livemode: response.livemode,
  };
}

export async function createStripePortalSession(
  intent: BillingSessionIntent,
  transport: StripeTransport = fetch,
): Promise<StripeHostedSession> {
  const { origin, portalConfiguration } = configuration();
  const response = portalResponse.parse(
    await stripePost(
      "/v1/billing_portal/sessions",
      new URLSearchParams({
        customer: intent.provider_customer_id,
        configuration: portalConfiguration,
        return_url: `${origin}/os/tools?billing=returned`,
      }),
      intent.idempotency_key,
      transport,
    ),
  );
  if (response.customer !== intent.provider_customer_id)
    throw Error("STRIPE_CUSTOMER_MISMATCH");
  return {
    intentId: intent.intent_id,
    sessionKind: "PORTAL",
    providerSessionId: response.id,
    customerId: response.customer,
    redirectUrl: response.url,
    expiresAt: new Date((response.created + 30 * 60) * 1000).toISOString(),
    livemode: response.livemode,
  };
}
