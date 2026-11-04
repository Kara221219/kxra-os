// Exact source, fresh owned local cluster only; no hosted target/credential arguments.
import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { acquireNativeFixtureLease } from "./native-fixture-lease.mjs";
import { integrationReleaseSource } from "./production-release-strategy.mjs";
import { productionAiPayload } from "./production-ai-review.mjs";
const root = fs.realpathSync(path.resolve(import.meta.dirname, ".."));
if (process.argv.length !== 2) throw Error("NO_TARGET_ARGUMENTS_ACCEPTED");
const git = (a) =>
  execFileSync("git", a, { cwd: root, encoding: "utf8" }).trim();
if (git(["status", "--porcelain"]))
  throw Error("CLEAN_COMMITTED_SOURCE_REQUIRED");
const source = git(["rev-parse", "HEAD"]),
  { exclusions } = integrationReleaseSource(root);
productionAiPayload(root);
const directory = fs.realpathSync(fs.mkdtempSync("/tmp/kxra-pc-"));
execFileSync("git", ["clone", "--no-hardlinks", root, directory], {
  stdio: "inherit",
});
execFileSync("git", ["checkout", "--detach", source], {
  cwd: directory,
  stdio: "inherit",
});
for (const f of exclusions) fs.unlinkSync(path.join(directory, f.path));
for (const f of [
  "node_modules",
  "apps/marketing/node_modules",
  "apps/email-worker/node_modules",
])
  fs.symlinkSync(
    fs.realpathSync(path.join(root, f)),
    path.join(directory, f),
    "dir",
  );
const release = acquireNativeFixtureLease("production-ai117-native");
try {
  const r = spawnSync(
    process.execPath,
    ["--import", "tsx", "scripts/production-ai-native.ts"],
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
      timeout: 900_000,
    },
  );
  if (r.status !== 0) throw Error("PRODUCTION_AI_NATIVE_FAILED " + directory);
  console.log("PRODUCTION_AI117_118_NATIVE_PASS " + source + " " + directory);
} finally {
  const p = path.join(directory, ".runtime/production-ai/cleanup.json");
  if (!fs.existsSync(p) || !JSON.parse(fs.readFileSync(p, "utf8")).clean)
    throw Error("OWNED_CLEANUP_UNCERTAIN_LEASE_RETAINED " + directory);
  release();
  console.log("Exact owned production-AI lease released.");
}
