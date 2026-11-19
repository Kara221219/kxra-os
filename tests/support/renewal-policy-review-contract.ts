import { z } from "zod";

const seconds = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const evidence = z
  .object({
    policy: z.literal("PRESERVE_ADR0047_WORKSPACE_PROPOSAL"),
    reviewed_workspace_terms_sha256: z.string().regex(/^[a-f0-9]{64}$/),
    principal_org_id: z.uuid(),
    evidence_org_id: z.uuid(),
    current_generation: z.boolean(),
    active_verified_member: z.boolean(),
    current_legal_acceptance: z.boolean(),
    prior_collected_payment_verified: z.boolean(),
    same_subscription_and_customer: z.boolean(),
    refunded_or_disputed: z.boolean(),
    subscription_state: z.enum([
      "active",
      "past_due",
      "unpaid",
      "canceled",
      "incomplete",
      "paused",
    ]),
    prior_paid_period_end: seconds,
    renewal_period_start: seconds,
    renewal_period_end: seconds,
    renewal_first_failure_at: seconds,
    renewal_latest_failure_at: seconds,
    first_failure_anchor_current: z.boolean(),
    observed_at: seconds,
    observation_valid_until: seconds,
  })
  .strict();

/** Policy reconciliation proposal only: no environment, database/provider or
 * entitlement writes. Existing zero-grace SQL/policy MUST NOT consume this as
 * authorization. It makes ADR0047's deadlines reviewable without silently
 * changing the shipping authority. Inputs must later come from verified worker
 * evidence, never from request/JWT metadata or a webhook timestamp alone.
 */
export function reviewRenewalRecoveryTransition(
  input: unknown,
  nowSeconds: number,
) {
  const e = evidence.parse(input);
  seconds.parse(nowSeconds);
  const graceUntil = e.renewal_first_failure_at + 7 * 86_400;
  const recoveryUntil = e.renewal_first_failure_at + 30 * 86_400;
  if (!Number.isSafeInteger(recoveryUntil))
    throw Error("RENEWAL_POLICY_TIME_INVALID");
  let state:
    | "GRACE_WORK_PROPOSAL"
    | "READ_ONLY_PROPOSAL"
    | "SUSPENDED_PROPOSAL"
    | "DENY" = "DENY";
  if (
    e.principal_org_id === e.evidence_org_id &&
    e.current_generation &&
    e.active_verified_member &&
    e.current_legal_acceptance &&
    e.prior_collected_payment_verified &&
    e.same_subscription_and_customer &&
    !e.refunded_or_disputed &&
    ["past_due", "unpaid"].includes(e.subscription_state) &&
    e.renewal_period_start === e.prior_paid_period_end &&
    e.renewal_period_end > e.renewal_period_start &&
    e.first_failure_anchor_current &&
    e.renewal_first_failure_at >= e.renewal_period_start &&
    e.renewal_first_failure_at <= e.renewal_latest_failure_at &&
    e.renewal_latest_failure_at <= nowSeconds &&
    e.observed_at <= nowSeconds &&
    e.observed_at >= nowSeconds - 300 &&
    e.observation_valid_until > nowSeconds &&
    e.observation_valid_until <= e.observed_at + 300
  ) {
    state =
      nowSeconds < graceUntil
        ? "GRACE_WORK_PROPOSAL"
        : nowSeconds < recoveryUntil
          ? "READ_ONLY_PROPOSAL"
          : "SUSPENDED_PROPOSAL";
  }
  return Object.freeze({
    state,
    grace_until: graceUntil,
    recovery_until: recoveryUntil,
    proposed_generation_and_export: state === "GRACE_WORK_PROPOSAL",
    proposed_read_only_recovery: state === "READ_ONLY_PROPOSAL",
    entitlement_authority: false as const,
    requires_policy_and_sql_integration: true as const,
  });
}
