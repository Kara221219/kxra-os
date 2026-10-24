/** Validate ONLY the result of `select session_user,current_user` on the worker
 * connection after SET ROLE. Never pass request/JWT/queue-body identity claims.
 * Existing operator profile: LOGIN runner -> NOLOGIN worker capability.
 * Role attributes/memberships are checked by the separate existing operator.
 */
export function requireLiveBillingWorkerIdentity(input: unknown): void {
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    Object.keys(input).length !== 2 ||
    !Object.hasOwn(input, "session_user") ||
    !Object.hasOwn(input, "current_user") ||
    (input as Record<string, unknown>).session_user !== "kxra_billing_runner" ||
    (input as Record<string, unknown>).current_user !== "kxra_billing_worker"
  )
    throw Error("LIVE_BILLING_WORKER_IDENTITY_INVALID");
}
