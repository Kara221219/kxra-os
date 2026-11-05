// New owned disposable local production119+explicit outbox extension only. No URLs/credentials accepted.
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
const source = git(["rev-parse", "HEAD"]),
  { exclusions } = integrationReleaseSource(root),
  directory = fs.realpathSync(fs.mkdtempSync("/tmp/kxra-gho-"));
execFileSync("git", ["clone", "--no-hardlinks", root, directory], {
  stdio: "inherit",
});
execFileSync("git", ["checkout", "--detach", source], {
  cwd: directory,
  stdio: "inherit",
});
for (const f of exclusions) fs.unlinkSync(path.join(directory, f.path));
fs.symlinkSync(
  fs.realpathSync(path.join(root, "node_modules")),
  path.join(directory, "node_modules"),
  "dir",
);
const release = acquireNativeFixtureLease("github-production-outbox");
try {
  const r = spawnSync(
    process.execPath,
    ["--import", "tsx", "scripts/github-production-outbox-native.ts"],
    {
      cwd: directory,
      env: {
        PATH: process.env.PATH,
        HOME: directory,
        USER: process.env.USER,
        TMPDIR: process.env.TMPDIR,
        NEXT_TELEMETRY_DISABLED: "1",
        KXRA_GITHUB_EXTERNAL_FENCE_PROOF:
          process.env.KXRA_GITHUB_EXTERNAL_FENCE_PROOF,
      },
      stdio: "inherit",
      timeout: 900000,
    },
  );
  if (r.status !== 0) throw Error("GITHUB_OUTBOX_PROOF_FAILED " + directory);
  console.log("GITHUB_OUTBOX_EXACT_SOURCE_PASS " + source + " " + directory);
} finally {
  const file = path.join(directory, ".runtime/github-outbox/cleanup.json");
  if (!fs.existsSync(file) || !JSON.parse(fs.readFileSync(file, "utf8")).clean)
    throw Error("OWNED_CLEANUP_UNCERTAIN_LEASE_RETAINED " + directory);
  release();
  console.log("Exact owned outbox lease released.");
}
