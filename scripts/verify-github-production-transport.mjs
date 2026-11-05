// Exact committed source; native TLS test routes only through its owned loopback seam.
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
  directory = fs.realpathSync(fs.mkdtempSync("/tmp/kxra-ghe-"));
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
const release = acquireNativeFixtureLease("github-production-https-offline");
try {
  const env = {
    PATH: process.env.PATH,
    HOME: directory,
    TMPDIR: process.env.TMPDIR,
    NODE_ENV: "production",
  };
  for (const args of [
    ["--import", "tsx", "--test", "tests/github-production-transport.test.ts"],
    ["--import", "tsx", "scripts/github-production-transport-offline.ts"],
  ]) {
    const r = spawnSync(process.execPath, args, {
      cwd: directory,
      env,
      stdio: "inherit",
      timeout: 120000,
    });
    if (r.status !== 0) throw Error("GITHUB_HTTPS_OFFLINE_FAILED " + directory);
  }
  console.log("GITHUB_HTTPS_EXACT_SOURCE_PASS " + source + " " + directory);
} finally {
  const file = path.join(
    directory,
    ".runtime/github-production-http/cleanup.json",
  );
  // No TLS resources exist if the first pure test command failed before native startup.
  if (fs.existsSync(file)) {
    if (!JSON.parse(fs.readFileSync(file, "utf8")).clean)
      throw Error("OWNED_CLEANUP_UNCERTAIN_LEASE_RETAINED " + directory);
  } else if (
    fs.existsSync(path.join(directory, ".runtime/github-production-http"))
  )
    throw Error("OWNED_CLEANUP_UNCERTAIN_LEASE_RETAINED " + directory);
  release();
  console.log("Exact owned offline HTTPS lease released.");
}
