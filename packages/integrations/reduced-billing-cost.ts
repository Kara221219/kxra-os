import { z } from "zod";
import { REDUCED_SHADOW_MAX_GETS } from "./reduced-billing-shadow";
/** Planning only: current production expiry is unchanged. No per-GET price is
 * inferred from Stripe's allocation rules, and no provider latency is invented. */
export function reducedBillingCostAndRisk(workspaces: unknown) {
  const n = z.number().int().min(1).max(1_000_000).parse(workspaces);
  return [900, 3600, 21600, 86400].map((age) => {
    const attempts = n * (2_592_000 / age);
    const maximumJobHours = (attempts * 45) / 3600;
    return Object.freeze({
      workspaces: n,
      proposed_financial_age_seconds: age,
      provider_gets_per_complete_attempt: REDUCED_SHADOW_MAX_GETS,
      scheduled_attempts_30_days: attempts,
      scheduled_gets_30_days: attempts * REDUCED_SHADOW_MAX_GETS,
      // Arithmetic envelope if each job occupies the full45s, 1GB and1 CPU.
      illustrative_london_compute_usd:
        Math.round(maximumJobHours * (0.0146 + 0.177) * 100) / 100,
      worst_case_missed_event_new_authorization_exposure_seconds: age,
      implemented_financial_age_change: false,
      entitlement_authority: false,
    });
  });
}
