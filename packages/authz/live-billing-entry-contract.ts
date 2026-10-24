import { z } from "zod";

export const liveEntryOffer = z.enum([
  "KXRA_STARTER_V1",
  "KXRA_TEAM_V1",
  "KXRA_BUSINESS_V1",
]);
export const liveEntryRequest = z
  .object({
    action: z.enum(["CUSTOMER", "CHECKOUT", "PORTAL", "RECONCILE"]),
    request_id: z.uuid(),
    offer_key: liveEntryOffer,
  })
  .strict();

export const liveEntryStatus = z
  .object({
    state: z.enum([
      "DISABLED",
      "FRESH",
      "CUSTOMER_PENDING",
      "BOUND",
      "REQUEST_PENDING",
      "REVIEW_REQUIRED",
    ]),
    offer_key: liveEntryOffer.nullable(),
    request_id: z.uuid().nullable(),
    kind: z.enum(["CUSTOMER", "CHECKOUT", "PORTAL", "RECONCILE"]).nullable(),
    request_state: z
      .enum([
        "REQUESTED",
        "INFLIGHT",
        "BOUND",
        "CONSUMED",
        "UNCERTAIN",
        "QUARANTINED",
      ])
      .nullable(),
    dispatch_ready: z.literal(false),
    entitlement_authority: z.literal(false),
    available_actions: z.array(
      z.enum(["CUSTOMER", "CHECKOUT", "PORTAL", "RECONCILE"]),
    ),
  })
  .strict();
export type LiveEntryStatus = z.infer<typeof liveEntryStatus>;
