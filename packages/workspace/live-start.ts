import { z } from "zod";
import { approvedPlan } from "./approved-catalogue";

/** Member-safe projection; no billing identity, request/action or offer details. */
export const liveWorkspaceAccess = z
  .object({
    lane: z.enum(["LIVE", "PENDING"]),
    entitled: z.boolean(),
    reconciliation_required: z.boolean(),
    quarantined: z.boolean(),
    proof_valid_until: z.string().datetime({ offset: true }).nullable(),
  })
  .strict()
  .refine((v) => v.lane !== "PENDING" || !v.entitled);
export type LiveWorkspaceAccess = z.infer<typeof liveWorkspaceAccess>;

const ownerShape = z.object({
  lane: z.literal("LIVE"),
  offer: z
    .object({
      offer_key: z.enum([
        "KXRA_STARTER_V1",
        "KXRA_TEAM_V1",
        "KXRA_BUSINESS_V1",
      ]),
      name: z.string(),
      currency: z.literal("GBP"),
      monthly_amount_minor: z.number().int(),
      people: z.number().int(),
    })
    .nullable(),
  customer_bound: z.boolean(),
  subscription_bound: z.boolean(),
  policy_ready: z.boolean(),
  consent_required: z.literal(true),
});
/** Extract only the actual0104 owner DTO fields this entry screen needs. */
export function ownerLiveWorkspaceBilling(input: unknown) {
  const value = ownerShape.parse(input);
  if (value.offer) {
    const plan = approvedPlan(value.offer.offer_key);
    if (
      value.offer.name !== plan.name ||
      value.offer.monthly_amount_minor !== plan.monthly_amount_minor ||
      value.offer.people !== plan.people
    )
      throw Error("LIVE_WORKSPACE_OFFER_DRIFT");
  }
  return value;
}
export type OwnerLiveWorkspaceBilling = ReturnType<
  typeof ownerLiveWorkspaceBilling
>;

export function liveWorkspacePresentation(
  access: LiveWorkspaceAccess,
  now = Date.now(),
) {
  const allowed =
    access.entitled &&
    !access.quarantined &&
    !access.reconciliation_required &&
    access.lane === "LIVE" &&
    access.proof_valid_until !== null &&
    Date.parse(access.proof_valid_until) > now;
  return {
    blocked: !allowed,
    heading: allowed
      ? "Recorded paid access permits work"
      : access.quarantined
        ? "Access requires review"
        : access.lane === "PENDING"
          ? "Payment setup is pending"
          : "Paid access is pending",
    detail: allowed
      ? "The authoritative current server record permits work. Each action still rechecks current membership and entitlement."
      : "New work is disabled until authoritative current paid access is recorded. Existing history remains readable under its access rules.",
  };
}
