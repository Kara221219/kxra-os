// Exact committed source, fresh owned fixture only. No target or credentials.
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
const git = (args) =>
  execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
if (git(["status", "--porcelain"]))
  throw Error("CLEAN_COMMITTED_SOURCE_REQUIRED");
const source = git(["rev-parse", "HEAD"]);
customAppsProductionPayload(root);
const { exclusions } = integrationReleaseSource(root),
  release = acquireNativeFixtureLease("production-custom-apps-combined");
let destination,
  started = false;
try {
  destination = fs.realpathSync(fs.mkdtempSync("/tmp/kxra-capps-"));
  execFileSync(
    "git",
    ["clone", "--no-hardlinks", "--no-checkout", root, destination],
    { stdio: "inherit" },
  );
  execFileSync("git", ["checkout", "--detach", source], {
    cwd: destination,
    stdio: "inherit",
  });
  for (const f of exclusions) fs.unlinkSync(path.join(destination, f.path));
  for (const rel of [
    "node_modules",
    "apps/marketing/node_modules",
    "apps/email-worker/node_modules",
  ])
    fs.symlinkSync(
      fs.realpathSync(path.join(root, rel)),
      path.join(destination, rel),
      "dir",
    );
  started = true;
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
        LANG: "C",
        LC_ALL: "C",
        NEXT_TELEMETRY_DISABLED: "1",
      },
      stdio: "inherit",
      timeout: 600000,
    },
  );
  if (result.status !== 0)
    throw Error("CUSTOM_APPS_PRODUCTION_FAILED " + destination);
  console.log(
    "CUSTOM_APPS_PRODUCTION_EXACT_SOURCE_PASS " + source + " " + destination,
  );
} finally {
  if (started) {
    const file = path.join(
      destination,
      ".runtime/production-apps/cleanup.json",
    );
    if (
      !fs.existsSync(file) ||
      !JSON.parse(fs.readFileSync(file, "utf8")).clean
    )
      throw Error("OWNED_CLEANUP_UNCERTAIN_LEASE_RETAINED " + destination);
  }
  release();
  console.log("Exact owned custom-app fixture lease released.");
}
