import { processBrandSourceAcquisitions } from "../packages/integrations/public-web-worker";

const watch = process.argv.includes("--watch");

async function run() {
  const results = await processBrandSourceAcquisitions();
  if (results.length)
    process.stdout.write(`Processed ${results.length} job(s).\n`);
  return results.length;
}

if (!watch) await run();
else
  for (;;) {
    const count = await run();
    await new Promise((resolve) => setTimeout(resolve, count ? 250 : 5_000));
  }
