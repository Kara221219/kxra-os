import fs from "node:fs";
import { refreshScheduleSchema } from "../packages/integrations/billing-refresh-scheduler";
import { assessBillingRefreshCapacity } from "../packages/integrations/billing-refresh-capacity";
import { assessBillingReadAllowance } from "../packages/integrations/billing-read-allowance";

/** Review only. Strict non-secret JSON input; no environment/credential/provider
 * access, no scheduler start, settings write or approval representation. */
function main() {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== "--file") throw Error();
  const descriptor = fs.openSync(
    args[1],
    fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW,
  );
  let raw: string;
  try {
    const metadata = fs.fstatSync(descriptor);
    if (!metadata.isFile() || metadata.size > 16_384) throw Error();
    raw = fs.readFileSync(descriptor, "utf8");
  } finally {
    fs.closeSync(descriptor);
  }
  const plan = refreshScheduleSchema.parse(JSON.parse(raw));
  const capacity = assessBillingRefreshCapacity({
    maximum_due_workspaces: plan.maximum_due_workspaces,
    parallel_invocations: plan.concurrency,
    schedule_interval_ms: plan.poll_interval_ms,
    scheduler_jitter_ms: plan.scheduler_jitter_ms,
    first_claim_delay_ms: plan.maximum_claim_delay_ms,
    proof_ttl_seconds: plan.proof_ttl_seconds,
  });
  const allowance = assessBillingReadAllowance({
    workspaces: plan.maximum_due_workspaces,
    proof_ttl_seconds: plan.proof_ttl_seconds,
    reviewed_monthly_read_allocation: plan.reviewed_monthly_read_allocation,
    other_monthly_read_reserve: plan.other_monthly_read_reserve,
    maximum_provider_reads: plan.maximum_provider_reads,
    duration_ms: plan.duration_ms,
  });
  process.stdout.write(
    JSON.stringify(
      { capacity, allowance, activation_authority: false },
      null,
      2,
    ) + "\n",
  );
  if (
    capacity.state !== "PROJECTED_HEADROOM" ||
    allowance.state !== "WITHIN_REVIEWED_ALLOWANCE"
  )
    process.exitCode = 2;
}
try {
  main();
} catch {
  process.stderr.write(
    "Billing refresh plan invalid; supply the strict non-secret schedule JSON only.\n",
  );
  process.exitCode = 1;
}
