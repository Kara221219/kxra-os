import type { LiveEntryStatus } from "../authz/live-billing-entry-contract";

export const billingEntryRequestTimeoutMs = 35_000;
export type BillingPendingRequest = {
  action: NonNullable<LiveEntryStatus["kind"]>;
  request_id: string;
  offer_key: string;
};

/** UI acknowledgement only, never payment or entitlement authority. An exact
 * current status may replace a lost CUSTOMER/CHECKOUT reservation response.
 * Portal bearer URLs cannot be recovered from status or recreated here.
 */
export function billingStatusConfirmsRequest(
  pending: BillingPendingRequest,
  status: LiveEntryStatus,
) {
  if (
    status.request_id !== pending.request_id ||
    status.kind !== pending.action ||
    status.offer_key !== pending.offer_key
  )
    return false;
  if (pending.action === "CUSTOMER")
    return (
      ["CUSTOMER_PENDING", "BOUND"].includes(status.state) &&
      ["REQUESTED", "INFLIGHT", "BOUND"].includes(status.request_state || "")
    );
  if (pending.action === "CHECKOUT")
    return (
      ["REQUEST_PENDING", "BOUND"].includes(status.state) &&
      ["REQUESTED", "INFLIGHT", "CONSUMED"].includes(status.request_state || "")
    );
  return false;
}
