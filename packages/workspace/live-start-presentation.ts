/** Presentation only: membership, payment proof and authorization remain server-owned. */
import type { LiveWorkspaceAccess } from "./live-start";
export type {
  LiveWorkspaceAccess,
  OwnerLiveWorkspaceBilling,
} from "./live-start";

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
      ? "Your workspace is ready"
      : access.quarantined
        ? "Access requires review"
        : access.lane === "PENDING"
          ? "Payment setup is pending"
          : "Paid access is pending",
    detail: allowed
      ? "You can start work while your workspace membership and subscription remain active."
      : "New work is disabled until payment setup is complete. You can still view the history you have access to.",
  };
}
