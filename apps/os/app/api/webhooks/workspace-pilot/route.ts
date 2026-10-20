import {
  stripeSubscriptionEventTypes,
  verifyBillingWebhook,
} from "../../../../../../packages/integrations/billing";
import {
  normalizePilotEvent,
  normalizePilotQuarantine,
  recordPilotEvent,
} from "../../../../../../packages/integrations/pilot-stripe";

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
  let authenticated = false;
  try {
    if (process.env.KXRA_PILOT_STRIPE_ENABLED !== "true")
      return Response.json({ error: "Unavailable" }, { status: 404 });
    const rawBody = await boundedBody(request, 1_000_000);
    const verified = verifyBillingWebhook(
      rawBody,
      request.headers.get("stripe-signature") || "",
      process.env.KXRA_PILOT_STRIPE_WEBHOOK_SECRET || "",
    );
    authenticated = true;
    if (!stripeSubscriptionEventTypes.has(verified.type))
      return Response.json({ received: true, ignored: true });
    let normalized;
    try {
      normalized = normalizePilotEvent(verified);
    } catch {
      normalized = normalizePilotQuarantine(verified);
    }
    const state = await recordPilotEvent(normalized);
    return Response.json({ received: true, state });
  } catch {
    return Response.json(
      { error: "Invalid webhook" },
      { status: authenticated ? 503 : 400 },
    );
  }
}
