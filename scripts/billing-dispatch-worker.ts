import {
  parseBillingBatchArguments,
  runBillingDispatchBatchOnce,
} from "../packages/integrations/billing-dispatch-batch";
async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--help")
    process.stdout.write(
      "Usage: node --import tsx scripts/billing-dispatch-worker.ts --once [--limit 1..20]\n",
    );
  else
    process.stdout.write(
      JSON.stringify(
        await runBillingDispatchBatchOnce(parseBillingBatchArguments(args)),
      ) + "\n",
    );
}
void main().catch(() => {
  process.stderr.write(
    "Billing batch not confirmed. Verify its private runtime and inspect original requests; do not replace uncertain operations.\n",
  );
  process.exitCode = 1;
});
