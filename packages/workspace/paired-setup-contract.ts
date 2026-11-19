import { z } from "zod";
const id = z.uuid();
export const pairedSetupCommand = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("REQUEST"),
      request_id: id,
      room_id: id,
      ai_intent_id: id,
      auth_route: z.enum(["CUSTOMER_API_KEY", "CHATGPT_SUBSCRIPTION"]),
      label: z.string().trim().min(1).max(100),
    })
    .strict(),
  z.object({ action: z.literal("STATUS"), request_id: id }).strict(),
  z.object({ action: z.literal("CANCEL"), request_id: id }).strict(),
]);
export const pairedSetupReceipt = z
  .object({
    request_id: id,
    agent_id: id,
    room_id: id,
    reason: z.enum([
      "POLICY_READY_SETUP_HELD",
      "SUBSCRIPTION_PROVIDER_CONFIRMATION_REQUIRED",
      "TRANSPORT_REVIEW_REQUIRED",
      "TERMS_REQUIRED",
      "PAID_PROOF_REQUIRED",
      "BUSINESS_REVIEW_REQUIRED",
      "AI_REVIEW_REQUIRED",
      "NEW_REQUEST_REQUIRED",
      "EXPIRED",
      "CANCELLED",
    ]),
    expires_at: z.iso.datetime({ offset: true }),
    activation_allowed: z.literal(false),
    credential_issued: z.literal(false),
  })
  .strict();

export const pairedSetupOptions = z
  .object({
    rooms: z
      .array(z.object({ id: z.uuid(), name: z.string().max(120) }).strict())
      .max(50),
    ai_intents: z
      .array(z.object({ id: z.uuid(), model: z.string().max(160) }).strict())
      .max(20),
    requests: z
      .array(
        z
          .object({
            id: z.uuid(),
            agent_id: z.uuid(),
            room_id: z.uuid(),
            label: z.string().max(100),
          })
          .strict(),
      )
      .max(20),
  })
  .strict();
export const pairedSetupHttpCommand = z.union([
  pairedSetupCommand,
  z.object({ action: z.literal("OPTIONS") }).strict(),
]);
