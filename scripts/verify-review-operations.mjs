// Local app wiring acceptance only. Exact committed clone and new owned117 cluster; no credentials/URLs accepted.
import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { integrationReleaseSource } from "./production-release-strategy.mjs";
import { acquireNativeFixtureLease } from "./native-fixture-lease.mjs";
const root = fs.realpathSync(path.resolve(import.meta.dirname, ".."));
if (process.argv.length !== 2) throw Error("NO_ARGUMENTS_ACCEPTED");
const git = (a) =>
  execFileSync("git", a, { cwd: root, encoding: "utf8" }).trim();
if (git(["status", "--porcelain"]))
  throw Error("CLEAN_COMMITTED_SOURCE_REQUIRED");
const sha = git(["rev-parse", "HEAD"]),
  { exclusions } = integrationReleaseSource(root),
  directory = fs.realpathSync(fs.mkdtempSync("/tmp/kxra-ro-"));
execFileSync("git", ["clone", "--no-hardlinks", root, directory], {
  stdio: "inherit",
});
execFileSync("git", ["checkout", "--detach", sha], {
  cwd: directory,
  stdio: "inherit",
});
for (const e of exclusions) fs.unlinkSync(path.join(directory, e.path));
for (const p of [
  "node_modules",
  "apps/marketing/node_modules",
  "apps/email-worker/node_modules",
])
  fs.symlinkSync(
    fs.realpathSync(path.join(root, p)),
    path.join(directory, p),
    "dir",
  );
const release = acquireNativeFixtureLease("independent-review-operations");
try {
  const r = spawnSync(
    process.execPath,
    ["--import", "tsx", "scripts/review-operations-acceptance.ts"],
    {
      cwd: directory,
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        USER: process.env.USER,
        TMPDIR: process.env.TMPDIR,
        NEXT_TELEMETRY_DISABLED: "1",
      },
      stdio: "inherit",
      timeout: 1_200_000,
    },
  );
  if (r.status !== 0)
    throw Error("REVIEW_OPERATIONS_ACCEPTANCE_FAILED " + directory);
  console.log("REVIEW_OPERATIONS_ACCEPTANCE_PASS " + sha + " " + directory);
} finally {
  const file = path.join(directory, ".runtime/review-operations/cleanup.json");
  if (!fs.existsSync(file) || !JSON.parse(fs.readFileSync(file, "utf8")).clean)
    throw Error("OWNED_CLEANUP_UNCERTAIN_LEASE_RETAINED " + directory);
  release();
  console.log("Exact owned review-operations lease released.");
}
