import crypto from "node:crypto";
import { z } from "zod";

export type VerifiedBillingWebhook = {
  id: string;
  type: string;
  created: number;
  payload: Record<string, unknown>;
  rawSha256: string;
};

const subscriptionEventTypes = [
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.paused",
  "customer.subscription.resumed",
] as const;

export const stripeSubscriptionEventTypes = new Set<string>(
  subscriptionEventTypes,
);

const stripeId = (prefix: string) =>
  z.string().regex(new RegExp(`^${prefix}_[A-Za-z0-9]{6,}$`));

const subscriptionObjectSchema = z
  .object({
    id: stripeId("sub"),
    object: z.literal("subscription"),
    customer: stripeId("cus"),
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
    current_period_start: z.number().int().positive().nullable().optional(),
    current_period_end: z.number().int().positive().nullable().optional(),
    cancel_at_period_end: z.boolean(),
    items: z.object({
      data: z
        .array(
          z
            .object({
              id: stripeId("si"),
              quantity: z.number().int().positive().max(1_000_000),
              current_period_start: z
                .number()
                .int()
                .positive()
                .nullable()
                .optional(),
              current_period_end: z
                .number()
                .int()
                .positive()
                .nullable()
                .optional(),
              price: z.object({ id: stripeId("price") }).passthrough(),
            })
            .passthrough(),
        )
        .length(1),
    }),
  })
  .passthrough();

const subscriptionEventSchema = z
  .object({
    id: stripeId("evt"),
    type: z.enum(subscriptionEventTypes),
    created: z.number().int().positive(),
    livemode: z.boolean(),
    data: z.object({ object: subscriptionObjectSchema }).passthrough(),
  })
  .passthrough();

export type NormalizedStripeSubscriptionEvent = {
  eventId: string;
  eventType: (typeof subscriptionEventTypes)[number];
  createdAt: string;
  livemode: boolean;
  customerId: string;
  subscriptionId: string;
  status:
    | "incomplete"
    | "incomplete_expired"
    | "trialing"
    | "active"
    | "past_due"
    | "canceled"
    | "unpaid"
    | "paused";
  periodStart: string | null;
  periodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  priceId: string;
  itemId: string;
  quantity: number;
  rawSha256: string;
};

function timestamp(value: number | null | undefined) {
  return value ? new Date(value * 1000).toISOString() : null;
}

export function normalizeStripeSubscriptionEvent(
  verified: VerifiedBillingWebhook,
): NormalizedStripeSubscriptionEvent {
  const event = subscriptionEventSchema.parse(verified.payload);
  if (event.id !== verified.id || event.type !== verified.type)
    throw new Error("BILLING_EVENT_IDENTITY_MISMATCH");
  if (event.created !== verified.created)
    throw new Error("BILLING_EVENT_CREATED_MISMATCH");
  if (event.livemode) throw new Error("BILLING_LIVE_EVENT_PROHIBITED");
  const subscription = event.data.object;
  const item = subscription.items.data[0];
  // Stripe Basil 2025-03-31 moved billing periods from the subscription to
  // each subscription item. Keep the top-level fallback for older snapshots
  // while treating the item as authoritative for the pinned webhook version.
  const periodStart = timestamp(
    item.current_period_start ?? subscription.current_period_start,
  );
  const periodEnd = timestamp(
    item.current_period_end ?? subscription.current_period_end,
  );
  if (
    ["active", "trialing"].includes(subscription.status) &&
    (!periodStart || !periodEnd || periodEnd <= periodStart)
  )
    throw new Error("BILLING_PERIOD_INVALID");
  return {
    eventId: event.id,
    eventType: event.type,
    createdAt: new Date(event.created * 1000).toISOString(),
    livemode: event.livemode,
    customerId: subscription.customer,
    subscriptionId: subscription.id,
    status: subscription.status,
    periodStart,
    periodEnd,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    priceId: item.price.id,
    itemId: item.id,
    quantity: item.quantity,
    rawSha256: verified.rawSha256,
  };
}

function signatures(header: string) {
  const entries = header.split(",").map((entry) => entry.trim().split("=", 2));
  const timestamp = entries.find(([name]) => name === "t")?.[1];
  const values = entries
    .filter(
      ([name, value]) => name === "v1" && /^[a-f0-9]{64}$/.test(value || ""),
    )
    .map(([, value]) => value);
  if (!timestamp || !/^\d{10}$/.test(timestamp) || !values.length)
    throw new Error("BILLING_SIGNATURE_INVALID");
  return { timestamp: Number(timestamp), values };
}

function constantTimeHex(left: string, right: string) {
  const a = Buffer.from(left, "hex");
  const b = Buffer.from(right, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function verifyBillingWebhook(
  rawBody: Buffer,
  signatureHeader: string,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
  toleranceSeconds = 300,
): VerifiedBillingWebhook {
  if (secret.length < 32 || rawBody.length < 2 || rawBody.length > 1_000_000)
    throw new Error("BILLING_SIGNATURE_INVALID");
  const parsedSignature = signatures(signatureHeader);
  if (Math.abs(nowSeconds - parsedSignature.timestamp) > toleranceSeconds)
    throw new Error("BILLING_SIGNATURE_EXPIRED");
  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${parsedSignature.timestamp}.`)
    .update(rawBody)
    .digest("hex");
  if (!parsedSignature.values.some((value) => constantTimeHex(value, expected)))
    throw new Error("BILLING_SIGNATURE_INVALID");
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody.toString("utf8"));
  } catch {
    throw new Error("BILLING_PAYLOAD_INVALID");
  }
  if (
    !payload ||
    typeof payload !== "object" ||
    Array.isArray(payload) ||
    typeof (payload as Record<string, unknown>).id !== "string" ||
    typeof (payload as Record<string, unknown>).type !== "string" ||
    !Number.isInteger((payload as Record<string, unknown>).created)
  )
    throw new Error("BILLING_PAYLOAD_INVALID");
  const event = payload as Record<string, unknown>;
  return {
    id: event.id as string,
    type: event.type as string,
    created: event.created as number,
    payload: event,
    rawSha256: crypto.createHash("sha256").update(rawBody).digest("hex"),
  };
}

export function signFakeBillingWebhook(
  rawBody: Buffer,
  secret: string,
  timestamp = Math.floor(Date.now() / 1000),
) {
  if (secret.length < 32) throw new Error("BILLING_SIGNATURE_INVALID");
  const signature = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.`)
    .update(rawBody)
    .digest("hex");
  return `t=${timestamp},v1=${signature}`;
}
