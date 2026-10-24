import crypto from "node:crypto";
import type { z } from "zod";
import { LiveEntryError, type LiveEntryIdentity } from "./live-billing-entry";
import type { liveEntryRequest } from "./live-billing-entry-contract";

type Query = <T>(
  actor: LiveEntryIdentity,
  sql: string,
  values: unknown[],
) => Promise<T[]>;

/** Called only after controller identity, recent MFA and current legal checks.
 * The bounded bucket covers all actions/offers/retries and uses no client subject.
 */
export async function reserveLiveBillingEntry(
  actor: LiveEntryIdentity,
  request: z.infer<typeof liveEntryRequest>,
  query: Query,
) {
  const subject = crypto
    .createHash("sha256")
    .update(`live-billing-entry:${actor.organisation_id}:${actor.id}`)
    .digest("hex");
  const rate = await query<{ allowed: boolean }>(
    actor,
    "select kxra.consume_rate_limit('live-billing-entry',$1,8,900) allowed",
    [subject],
  );
  if (rate[0]?.allowed !== true)
    throw new LiveEntryError(
      429,
      "LIVE_BILLING_RATE_LIMITED",
      "Too many billing requests; try again later",
    );
  return (
    await query<{ value: unknown }>(
      actor,
      request.action === "CUSTOMER"
        ? "select kxra_private.request_live_customer_intent($1,$2) value"
        : "select kxra_private.request_live_billing_intent($1,$2,$3) value",
      request.action === "CUSTOMER"
        ? [request.request_id, request.offer_key]
        : [request.request_id, request.action, request.offer_key],
    )
  )[0]?.value;
}
