// Full current-source legacy service/restart/restore phase under shared lease.
// The dedicated connector phase is run separately and retains its own receipt.
import fs from "node:fs";
import path from "node:path";
import { spawnSync, execFileSync } from "node:child_process";
import { acquireNativeFixtureLock } from "./native-fixture-lock.mjs";
const root = path.resolve(import.meta.dirname, "..");
const destination = fs.mkdtempSync("/tmp/kxra-connector-aggregate-");
fs.chmodSync(destination, 0o700);
const files = execFileSync(
  "git",
  ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
  { cwd: root },
)
  .toString()
  .split("\0")
  .filter(Boolean);
for (const file of files) {
  if (
    file.endsWith("/AGENTS.md") ||
    file.includes("/node_modules/") ||
    file.includes("/.next")
  )
    continue;
  const source = path.join(root, file);
  if (!fs.statSync(source).isFile()) continue;
  const target = path.join(destination, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}
for (const file of [
  "node_modules",
  "apps/marketing/node_modules",
  "apps/email-worker/node_modules",
])
  fs.symlinkSync(
    fs.realpathSync(path.join(root, file)),
    path.join(destination, file),
    "dir",
  );
fs.writeFileSync(
  path.join(destination, ".git"),
  "gitdir: " +
    execFileSync("git", ["rev-parse", "--absolute-git-dir"], {
      cwd: root,
      encoding: "utf8",
    }).trim() +
    "\n",
);
const release = acquireNativeFixtureLock();
let cleanup = false;
try {
  const env = { ...process.env, KXRA_CI_BOUNDED_OUTPUT: "true" };
  for (const key of Object.keys(env))
    if (
      /TOKEN|SECRET|PASSWORD|API_KEY|DATABASE_URL|SUPABASE/.test(key) ||
      [
        "VERCEL",
        "VERCEL_ENV",
        "KXRA_RUNTIME",
        "KXRA_CONNECTOR_TEST_KEY_FILE",
      ].includes(key)
    )
      delete env[key];
  const result = spawnSync(
    process.execPath,
    ["scripts/ci.mjs", "--services-only"],
    { cwd: destination, env, stdio: "inherit" },
  );
  const receipt = path.join(
    destination,
    ".runtime/ci-services/bounded-cleanup.json",
  );
  if (fs.existsSync(receipt)) {
    const c = JSON.parse(fs.readFileSync(receipt, "utf8"));
    cleanup =
      c.postgresAbsent &&
      c.applicationExited &&
      c.marketingExited &&
      c.productionMarketingExited;
  } else
    cleanup = !fs.existsSync(
      path.join(destination, ".runtime/ci-services/postgres/PG_VERSION"),
    );
  if (result.status !== 0 || !cleanup)
    throw Error(
      `CURRENT_SOURCE_AGGREGATE_FAILED: exit=${result.status}, cleanup=${cleanup}`,
    );
  console.log(
    `Current-source connector aggregate service phase PASS: ${destination}`,
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  release(cleanup);
}
