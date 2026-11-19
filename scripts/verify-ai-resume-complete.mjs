// Exact committed source, newly created private cluster only. No inherited credentials/env.
import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { acquireNativeFixtureLease } from "./native-fixture-lease.mjs";
const root = path.resolve(import.meta.dirname, "..");
if (
  execFileSync("git", ["status", "--porcelain"], {
    cwd: root,
    encoding: "utf8",
  }).trim()
)
  throw Error("CLEAN_COMMITTED_SOURCE_REQUIRED");
const source = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: root,
  encoding: "utf8",
}).trim();
const directory = fs.realpathSync(fs.mkdtempSync("/tmp/kxra-ar-"));
execFileSync("git", ["clone", "--no-hardlinks", root, directory], {
  stdio: "inherit",
});
execFileSync("git", ["checkout", "--detach", source], {
  cwd: directory,
  stdio: "inherit",
});
for (const file of [
  "node_modules",
  "apps/marketing/node_modules",
  "apps/email-worker/node_modules",
])
  fs.symlinkSync(
    fs.realpathSync(path.join(root, file)),
    path.join(directory, file),
    "dir",
  );
const release = acquireNativeFixtureLease("ai-resume-complete");
try {
  const r = spawnSync(
    process.execPath,
    ["--import", "tsx", "scripts/ai-resume-acceptance.ts"],
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
  if (r.status !== 0) throw Error("AI_RESUME_COMPLETE_FAILED " + directory);
  console.log("AI_RESUME_COMPLETE_PASS " + source + " " + directory);
} finally {
  const file = path.join(directory, ".runtime/ai-resume/cleanup.json");
  if (!fs.existsSync(file) || !JSON.parse(fs.readFileSync(file, "utf8")).clean)
    throw Error("OWNED_CLEANUP_UNCERTAIN_LEASE_RETAINED " + directory);
  release();
  console.log("Exact owned lease released.");
}
