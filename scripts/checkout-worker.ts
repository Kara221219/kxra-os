import { parseCheckoutDispatchArguments } from "../packages/integrations/checkout-dispatch-config";
import { runCheckoutWorkerOnce } from "../packages/integrations/checkout-worker";
async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--help")
    process.stdout.write(
      "Usage: node --import tsx scripts/checkout-worker.ts --once --request <canonical-CHECKOUT-UUID>\n",
    );
  else
    process.stdout.write(
      JSON.stringify(
        await runCheckoutWorkerOnce(parseCheckoutDispatchArguments(args)),
      ) + "\n",
    );
}
void main().catch(() => {
  process.stderr.write(
    "Checkout dispatch not confirmed. Reconcile the original request; no automatic replacement or redirect is available.\n",
  );
  process.exitCode = 1;
});
