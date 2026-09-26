import { processTransactionalEmails } from "../packages/integrations/email-worker";

const watch = process.argv.includes("--watch");

async function run() {
  const results = await processTransactionalEmails();
  if (results.length)
    process.stdout.write(`Processed ${results.length} email job(s).\n`);
  return results.length;
}

if (!watch) await run();
else
  for (;;) {
    const count = await run();
    await new Promise((resolve) => setTimeout(resolve, count ? 250 : 5_000));
  }
