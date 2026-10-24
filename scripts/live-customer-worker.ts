import {
  parseLiveCustomerDispatchArguments,
  liveCustomerDispatchFailureCode,
} from "../packages/integrations/live-customer-dispatch-config";
import { runLiveCustomerWorkerOnce } from "../packages/integrations/live-customer-worker";

// Explicit operator-only --once command. No watch/discovery/provider setup.
async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--help")
    process.stdout.write(
      "Usage: node --import tsx scripts/live-customer-worker.ts --once --intent <canonical-UUID>\n",
    );
  else {
    const intent = parseLiveCustomerDispatchArguments(args);
    const result = await runLiveCustomerWorkerOnce(intent);
    process.stdout.write(JSON.stringify(result) + "\n");
  }
}
void main().catch((error: unknown) => {
  // Never log configuration, URLs/passwords, provider bodies or raw PG errors.
  process.stderr.write(
    `${liveCustomerDispatchFailureCode(error)}. Inspect the original canonical request before any further action.\n`,
  );
  process.exitCode = 1;
});
