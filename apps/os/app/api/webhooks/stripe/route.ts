import {
  normalizeStripeSubscriptionEvent,
  stripeSubscriptionEventTypes,
  verifyBillingWebhook,
} from "../../../../../../packages/integrations/billing";
import { recordStripeSubscriptionEvent } from "../../../../../../packages/integrations/billing-worker";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function boundedBody(request: Request, limit: number) {
  const declared = request.headers.get("content-length");
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > limit))
    throw Error("BILLING_BODY_TOO_LARGE");
  if (!request.body) return Buffer.alloc(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    total += part.value.byteLength;
    if (total > limit) {
      await reader.cancel();
      throw Error("BILLING_BODY_TOO_LARGE");
    }
    chunks.push(part.value);
  }
  return Buffer.concat(chunks, total);
}

export async function POST(request: Request) {
  try {
    if (process.env.KXRA_BILLING_ENABLED !== "true")
      return Response.json({ error: "Unavailable" }, { status: 404 });
    const rawBody = await boundedBody(request, 1_000_000);
    const verified = verifyBillingWebhook(
      rawBody,
      request.headers.get("stripe-signature") || "",
      process.env.STRIPE_WEBHOOK_SECRET || "",
    );
    if (!stripeSubscriptionEventTypes.has(verified.type))
      return Response.json({ received: true, ignored: true });
    const state = await recordStripeSubscriptionEvent(
      normalizeStripeSubscriptionEvent(verified),
    );
    return Response.json({ received: true, state });
  } catch {
    return Response.json({ error: "Invalid webhook" }, { status: 400 });
  }
}
