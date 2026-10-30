import { z } from "zod";

export const SUCCESSFUL_REFRESH_PROVIDER_READS = 20;
const monthMs = 30 * 24 * 60 * 60 * 1000;
const schema = z
  .object({
    workspaces: z.number().int().min(1).max(1_000_000),
    proof_ttl_seconds: z.number().int().min(1).max(300),
    reviewed_monthly_read_allocation: z
      .number()
      .int()
      .min(1)
      .max(1_000_000_000),
    other_monthly_read_reserve: z.number().int().min(0).max(1_000_000_000),
    maximum_provider_reads: z.number().int().min(1).max(1_000_000),
    duration_ms: z.number().int().min(1_000).max(3_600_000),
  })
  .strict();

/** A planning/admission guard, never a claim about the actual Stripe account.
 * Current strict evidence needs20 GETs. Even ideal just-before-expiry refreshes
 * consume this lower bound. The repeated run ceiling also needs to fit the
 * reviewed allocation; restarts cannot make a too-small allowance sufficient.
 * The owner must establish any exception through their provider account.
 */
export function assessBillingReadAllowance(input: unknown) {
  const p = schema.parse(input);
  const minimumMonthlyReads =
    p.workspaces *
    Math.max(0, Math.ceil(monthMs / (p.proof_ttl_seconds * 1000)) - 1) *
    SUCCESSFUL_REFRESH_PROVIDER_READS;
  const monthlyRunCeiling =
    Math.ceil(monthMs / p.duration_ms) * p.maximum_provider_reads;
  const available = Math.max(
    0,
    p.reviewed_monthly_read_allocation - p.other_monthly_read_reserve,
  );
  return Object.freeze({
    state:
      minimumMonthlyReads <= available && monthlyRunCeiling <= available
        ? "WITHIN_REVIEWED_ALLOWANCE"
        : "INSUFFICIENT_REVIEWED_ALLOWANCE",
    minimum_monthly_reads: minimumMonthlyReads,
    repeated_run_monthly_ceiling: monthlyRunCeiling,
    available_monthly_reads: available,
    provider_allocation_verified: false as const,
    activation_authority: false as const,
  });
}
