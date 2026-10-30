import {
  billingRefreshSchedulerConfiguration,
  pacedBillingReads,
  runBillingRefreshScheduler,
} from "../packages/integrations/billing-refresh-scheduler";
import { runBillingHttpInvocation } from "../packages/integrations/billing-http-runtime";
import { createPaidRefreshWorkerQuery } from "../packages/integrations/paid-refresh-database";
import { createSchedulerReadBudget } from "../packages/integrations/billing-scheduler-budget";

/** Explicit bounded service run, never auto-started on import or by Vercel Cron.
 * Supervisor/restart/host provisioning and its costs need owner approval.
 * Existing worker/key/CA profile only; no new tokens or provider resources.
 */
async function main() {
  if (process.argv.slice(2).join(" ") !== "--run")
    throw Error("BILLING_REFRESH_SCHEDULER_USAGE");
  const plan = billingRefreshSchedulerConfiguration(process.env);
  if (!plan) {
    process.stdout.write(JSON.stringify({ state: "DISABLED" }) + "\n");
    return;
  }
  // Profile validation remains inside every actual invocation. Never enumerate,
  // serialize or duplicate the secret-bearing environment in a receipt.
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
  let exhausted = false;
  const budgetQuery = createPaidRefreshWorkerQuery();
  const provider = pacedBillingReads(plan, {
    fetch: globalThis.fetch,
    exhausted: () => {
      exhausted = true;
    },
    authorizeRead: createSchedulerReadBudget(
      budgetQuery,
      plan.read_allowance_review_sha256,
      plan.reviewed_monthly_read_allocation - plan.other_monthly_read_reserve,
    ),
  });
  try {
    const summary = await runBillingRefreshScheduler(plan, {
      signal: controller.signal,
      readBudgetExhausted: () => exhausted,
      invoke: (onRefreshClaimCount) =>
        runBillingHttpInvocation("refresh", process.env, {
          fetch: provider.fetch,
          onRefreshClaimCount,
        }),
      progress: (summary) =>
        process.stdout.write(
          JSON.stringify({
            ...summary,
            provider_reads: provider.counts().started,
          }) + "\n",
        ),
    });
    // The supervisor must alert/review rather than blindly restart a budget-
    // exhausted process and thereby turn its ceiling into an unbounded spend.
    if (
      summary.state === "READ_LIMIT" ||
      summary.state === "INVOCATION_LIMIT" ||
      summary.unavailable ||
      summary.unverified ||
      summary.overrun_ticks
    )
      process.exitCode = 2;
  } finally {
    process.removeListener("SIGTERM", stop);
    process.removeListener("SIGINT", stop);
  }
}
void main().catch(() => {
  process.stderr.write(
    "Billing refresh scheduler stopped; inspect approved configuration and finite receipts.\n",
  );
  process.exitCode = 1;
});
