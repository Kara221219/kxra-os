// Snapshot current local source into a fresh owned fixture. No target/credential arguments.
import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { acquireNativeFixtureLease } from "./native-fixture-lease.mjs";
import { customAppsProductionPayload } from "./custom-apps-production-payload.mjs";
import { integrationReleaseSource } from "./production-release-strategy.mjs";
const root = fs.realpathSync(path.resolve(import.meta.dirname, ".."));
if (
  process.argv.length !== 2 ||
  process.env.DATABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.VERCEL ||
  process.env.VERCEL_ENV
)
  throw Error("FRESH_LOCAL_SYNTHETIC_ONLY");
customAppsProductionPayload(root);
const { exclusions } = integrationReleaseSource(root);
const destination = fs.realpathSync(fs.mkdtempSync("/tmp/kxra-capps-"));
const files = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { cwd: root, encoding: "utf8" },
)
  .split("\0")
  .filter(Boolean);
for (const file of files) {
  if (exclusions.some((e) => e.path === file)) continue;
  const from = path.join(root, file),
    to = path.join(destination, file);
  if (!fs.lstatSync(from).isFile()) throw Error("REGULAR_SOURCE_ONLY");
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}
fs.symlinkSync(
  path.join(root, "node_modules"),
  path.join(destination, "node_modules"),
  "dir",
);
const release = acquireNativeFixtureLease("production-custom-apps");
try {
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "scripts/custom-apps-production-native.ts"],
    {
      cwd: destination,
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        USER: process.env.USER,
        TMPDIR: process.env.TMPDIR,
        NEXT_TELEMETRY_DISABLED: "1",
      },
      stdio: "inherit",
      timeout: 600000,
    },
  );
  if (result.status !== 0)
    throw Error("CUSTOM_APPS_PRODUCTION_FAILED " + destination);
  console.log("CUSTOM_APPS_PRODUCTION_PASS " + destination);
} finally {
  const cleanup = path.join(
    destination,
    ".runtime/production-apps/cleanup.json",
  );
  if (
    !fs.existsSync(cleanup) ||
    !JSON.parse(fs.readFileSync(cleanup, "utf8")).clean
  )
    throw Error("OWNED_CLEANUP_UNCERTAIN_LEASE_RETAINED " + destination);
  release();
  console.log("Exact owned fixture lease released.");
}
