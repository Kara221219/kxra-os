// Reproduce the complete canonical CI in a short, fresh task-owned checkout.
// Short path keeps native Unix socket names within platform limits.
import fs from "node:fs";
import path from "node:path";
import { spawnSync, execFileSync } from "node:child_process";
import { acquireNativeFixtureLease } from "./native-fixture-lease.mjs";
const root = path.resolve(import.meta.dirname, "..");
if (
  execFileSync("git", ["status", "--porcelain"], {
    cwd: root,
    encoding: "utf8",
  }).trim()
)
  throw Error("Clean committed integration source required");
const sha = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: root,
  encoding: "utf8",
}).trim();
const directory = fs.mkdtempSync("/tmp/kxra-ic-");
execFileSync(
  "git",
  ["clone", "--no-hardlinks", "--no-checkout", root, directory],
  { stdio: "inherit" },
);
execFileSync("git", ["checkout", "--detach", sha], {
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
const release = acquireNativeFixtureLease("feature-integration-full-ci");
try {
  const result = spawnSync(process.execPath, ["scripts/ci.mjs"], {
    cwd: directory,
    env: { ...process.env, KXRA_CI_BOUNDED_OUTPUT: "true" },
    stdio: "inherit",
  });
  if (result.status !== 0)
    throw Error("Full canonical CI failed: " + directory);
  console.log("INTEGRATION_FULL_CANONICAL_CI_PASS " + sha + " " + directory);
} finally {
  // ci.mjs owns and checks the child app/PG cleanup. Refuse lease release if
  // any started cohort still has its PostgreSQL PID file.
  const runtime = path.join(directory, ".runtime");
  const live =
    fs.existsSync(runtime) &&
    fs
      .readdirSync(runtime)
      .some((name) =>
        fs.existsSync(path.join(runtime, name, "postgres/postmaster.pid")),
      );
  if (live) throw Error("Owned CI cleanup unconfirmed; lease retained");
  release();
}
