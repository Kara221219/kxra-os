// Exact committed source; actual Node HTTPS only to an owned loopback fixture.
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
const source = git(["rev-parse", "HEAD"]),
  directory = fs.realpathSync(fs.mkdtempSync("/tmp/kxra-ghio-"));
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
const release = acquireNativeFixtureLease(
  "github-installation-observer-offline",
);
try {
  const env = {
    PATH: process.env.PATH,
    HOME: directory,
    TMPDIR: process.env.TMPDIR,
    NODE_ENV: "production",
  };
  for (const args of [
    ["--import", "tsx", "--test", "tests/github-installation-observer.test.ts"],
    ["--import", "tsx", "scripts/github-installation-observer-offline.ts"],
  ]) {
    const result = spawnSync(process.execPath, args, {
      cwd: directory,
      env,
      stdio: "inherit",
      timeout: 120000,
    });
    if (result.status !== 0)
      throw Error("GITHUB_IDENTITY_OFFLINE_FAILED " + directory);
  }
  console.log("GITHUB_IDENTITY_EXACT_SOURCE_PASS " + source + " " + directory);
} finally {
  const runtime = path.join(directory, ".runtime/github-installation-observer"),
    file = path.join(runtime, "cleanup.json");
  if (fs.existsSync(file)) {
    if (!JSON.parse(fs.readFileSync(file, "utf8")).clean)
      throw Error("OWNED_CLEANUP_UNCERTAIN_LEASE_RETAINED " + directory);
  } else if (fs.existsSync(runtime))
    throw Error("OWNED_CLEANUP_UNCERTAIN_LEASE_RETAINED " + directory);
  release();
  console.log("Exact owned offline observer lease released.");
}
