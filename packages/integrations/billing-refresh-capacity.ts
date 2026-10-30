import { z } from "zod";
import { BILLING_HTTP_RECEIPT_MS } from "./billing-http-controller";

const schedule = z
  .object({
    maximum_due_workspaces: z.number().int().min(1).max(1_000_000),
    parallel_invocations: z.number().int().min(1).max(1_000),
    schedule_interval_ms: z.number().int().min(1).max(86_400_000),
    scheduler_jitter_ms: z.number().int().min(0).max(86_400_000),
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
  // The final wave can wait a full polling interval before its55s receipt budget.
  const worstCaseCompletionMs =
    waves * plan.schedule_interval_ms +
    plan.scheduler_jitter_ms +
    BILLING_HTTP_RECEIPT_MS;
  const headroomMs = discoveryWindowMs - worstCaseCompletionMs;
  return Object.freeze({
    state: headroomMs > 0 ? "PROJECTED_HEADROOM" : "INSUFFICIENT_HEADROOM",
    discovery_window_ms: discoveryWindowMs,
    waves,
    worst_case_completion_ms: worstCaseCompletionMs,
    headroom_ms: headroomMs,
    hosted_acceptance: false as const,
    activation_authority: false as const,
  });
}
