/** Owned fixture worker; no live credentials, real CLI or external provider. */
import fs from "node:fs";
import path from "node:path";
import { getPool, localMode } from "../packages/db";
import { integrationDevice } from "../apps/os/lib/paired-integration.local";
async function main() {
  if (!localMode() || process.env.VERCEL || process.env.VERCEL_ENV)
    throw Error("Fixture worker unavailable");
  const root = fs.realpathSync(path.resolve(__dirname, ".."));
  const runtime = fs.realpathSync(process.env.KXRA_RUNTIME!);
  if (!runtime.startsWith(path.join(root, ".runtime") + path.sep))
    throw Error("Owned fixture required");
  const plan = JSON.parse(
    fs.readFileSync(path.join(runtime, "paired-dispatch-plan.json"), "utf8"),
  );
  try {
    await integrationDevice(
      "Bearer " + plan.token,
      plan.delegation,
      plan.request,
    );
  } finally {
    await getPool().end();
  }
}
main().catch(() => {
  process.exitCode = 1;
});
