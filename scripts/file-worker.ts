import {
  processFileJobs,
  reconcilePrivateObjects,
} from "../packages/storage/worker";

const mode = process.argv[2] || "--once";
let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    stopping = true;
  });

async function runOnce() {
  const results = await processFileJobs();
  if (results.length)
    console.log(`Processed ${results.length} private file job(s).`);
  return results.length;
}

async function main() {
  if (mode === "--reconcile") {
    const run = await reconcilePrivateObjects();
    console.log(`Private object reconciliation completed: ${run}`);
  } else if (mode === "--once") {
    await runOnce();
  } else if (mode === "--watch") {
    while (!stopping) {
      try {
        const processed = await runOnce();
        if (!processed)
          await new Promise((resolve) => setTimeout(resolve, 750));
      } catch (error) {
        console.error(
          error instanceof Error ? error.message : "Private file worker failed",
        );
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
  } else throw Error("Use --once, --watch or --reconcile");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "File worker failed");
  process.exitCode = 1;
});
