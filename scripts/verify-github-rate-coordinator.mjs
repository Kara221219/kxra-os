// Exact committed source, owned Unix-socket-only PostgreSQL, synthetic identities.
import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { acquireNativeFixtureLease } from "./native-fixture-lease.mjs";
const root = fs.realpathSync(path.resolve(import.meta.dirname, ".."));
if (process.argv.length !== 2) throw Error("NO_ARGUMENTS_ACCEPTED");
const git = (args) =>
  execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
if (git(["status", "--porcelain"]))
  throw Error("CLEAN_COMMITTED_SOURCE_REQUIRED");
const source = git(["rev-parse", "HEAD"]);
const directory = fs.realpathSync(fs.mkdtempSync("/tmp/kxra-ghr-"));
execFileSync("git", ["clone", "--no-hardlinks", root, directory], {
  stdio: "inherit",
});
execFileSync("git", ["checkout", "--detach", source], {
  cwd: directory,
  stdio: "inherit",
});
fs.symlinkSync(
  fs.realpathSync(path.join(root, "node_modules")),
  path.join(directory, "node_modules"),
  "dir",
);
const release = acquireNativeFixtureLease("github-rate-coordinator");
const lease = JSON.parse(
  fs.readFileSync("/tmp/kxra-native-serial.lock", "utf8"),
);
try {
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "scripts/github-rate-coordinator-native.ts"],
    {
      cwd: directory,
      env: {
        PATH: process.env.PATH,
        HOME: directory,
        USER: process.env.USER,
        TMPDIR: process.env.TMPDIR,
        NODE_ENV: "production",
        KXRA_GHR_LEASE_TOKEN: lease.token,
      },
      stdio: "inherit",
      timeout: 600000,
    },
  );
  if (result.status !== 0)
    throw Error("GITHUB_RATE_COORDINATOR_PROOF_FAILED " + directory);
  console.log(
    "GITHUB_RATE_COORDINATOR_EXACT_SOURCE_PASS " + source + " " + directory,
  );
} finally {
  const file = path.join(
    directory,
    ".runtime/github-rate-coordinator/cleanup.json",
  );
  if (!fs.existsSync(file))
    throw Error("OWNED_CLEANUP_UNCERTAIN_LEASE_RETAINED " + directory);
  const cleanup = JSON.parse(fs.readFileSync(file, "utf8"));
  if (
    !cleanup.clean ||
    cleanup.root !== directory ||
    cleanup.lease_token !== lease.token ||
    cleanup.source_commit !== source
  )
    throw Error("OWNED_CLEANUP_UNCERTAIN_LEASE_RETAINED " + directory);
  release();
  console.log("Exact owned rate-coordinator fixture lease released.");
}
