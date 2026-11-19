import { z } from "zod";
import { BILLING_HTTP_RECEIPT_MS } from "./billing-http-controller";

const schedule = z
  .object({
    maximum_due_workspaces: z.number().int().min(1).max(1_000_000),
    parallel_invocations: z.number().int().min(1).max(1_000),
    schedule_interval_ms: z.number().int().min(1).max(86_400_000),
    scheduler_jitter_ms: z.number().int().min(0).max(86_400_000),
    // Unknown claim latency must consume the full receipt budget, not zero.
    first_claim_delay_ms: z
      .number()
      .int()
      .min(0)
      .max(BILLING_HTTP_RECEIPT_MS)
      .default(BILLING_HTTP_RECEIPT_MS),
    proof_ttl_seconds: z.number().int().min(1).max(300),
  })
  .strict();

/** Non-secret planning only: never reads settings, connects, schedules or enables
 * billing. One HTTP refresh processes one workspace. Migration0110 discovers
 * proofs within60s of expiry and imposes30s after a completed refresh. Scheduled
 * overlapping invocations must actually provide the stated concurrency; leases
 * remain the admission authority. A positive projection is NOT hosted acceptance.
 */
export function assessBillingRefreshCapacity(input: unknown) {
  const plan = schedule.parse(input);
  const discoveryWindowMs = Math.max(
    0,
    Math.min(60_000, plan.proof_ttl_seconds * 1000 - 30_000),
  );
  const waves = Math.ceil(
    plan.maximum_due_workspaces / plan.parallel_invocations,
  );
  // Slots remain occupied until a receipt completes. Each queued wave may need
  // the entire polling interval AND receipt budget; never assume free slots.
  const fanoutDelay =
    plan.maximum_due_workspaces > 1 && plan.parallel_invocations > 1
      ? plan.first_claim_delay_ms
      : 0;
  const worstCaseCompletionMs =
    waves *
      (plan.schedule_interval_ms + fanoutDelay + BILLING_HTTP_RECEIPT_MS) +
    plan.scheduler_jitter_ms;
  const headroomMs = discoveryWindowMs - worstCaseCompletionMs;
  return Object.freeze({
    state: headroomMs > 0 ? "PROJECTED_HEADROOM" : "INSUFFICIENT_HEADROOM",
    discovery_window_ms: discoveryWindowMs,
    waves,
    first_claim_fanout_delay_ms: fanoutDelay,
    worst_case_completion_ms: worstCaseCompletionMs,
    headroom_ms: headroomMs,
    hosted_acceptance: false as const,
    activation_authority: false as const,
  });
}
