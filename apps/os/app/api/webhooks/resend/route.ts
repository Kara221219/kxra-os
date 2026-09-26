import { z } from "zod";
import { verifyResendWebhook } from "../../../../../../packages/integrations/email";
import { recordTransactionalEmailProviderEvent } from "../../../../../../packages/integrations/email-worker";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const eventTypes = {
  "email.delivered": "DELIVERED",
  "email.delivery_delayed": "DELAYED",
  "email.bounced": "BOUNCED",
  "email.complained": "COMPLAINED",
  "email.failed": "FAILED",
  "email.suppressed": "SUPPRESSED",
} as const;

const eventSchema = z
  .object({
    type: z.enum(
      Object.keys(eventTypes) as [
        keyof typeof eventTypes,
        ...(keyof typeof eventTypes)[],
      ],
    ),
    created_at: z.string().datetime(),
    data: z.object({ email_id: z.string().min(3).max(240) }).passthrough(),
  })
  .passthrough();

export async function POST(request: Request) {
  try {
    if (process.env.KXRA_EMAIL_ENABLED !== "true")
      return Response.json({ error: "Unavailable" }, { status: 404 });
    const payload = await request.text();
    if (Buffer.byteLength(payload) > 65_536)
      return Response.json({ error: "Invalid webhook" }, { status: 400 });
    const eventId = request.headers.get("svix-id") || "";
    verifyResendWebhook({
      payload,
      id: eventId,
      timestamp: request.headers.get("svix-timestamp") || "",
      signature: request.headers.get("svix-signature") || "",
    });
    const event = eventSchema.parse(JSON.parse(payload));
    await recordTransactionalEmailProviderEvent({
      eventId,
      messageId: event.data.email_id,
      eventType: eventTypes[event.type],
      occurredAt: event.created_at,
    });
    return Response.json({ received: true });
  } catch {
    return Response.json({ error: "Invalid webhook" }, { status: 400 });
  }
}
