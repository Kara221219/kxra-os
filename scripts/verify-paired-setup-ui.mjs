import { chromium } from "@playwright/test";
// Exact-source, disposable fixture only; no URLs/credentials/activation accepted.
import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { integrationReleaseSource } from "./production-release-strategy.mjs";
import { acquireNativeFixtureLease } from "./native-fixture-lease.mjs";
const root = fs.realpathSync(path.resolve(import.meta.dirname, ".."));
if (process.argv.length !== 2) throw Error("NO_ARGUMENTS_ACCEPTED");
const git = (args) =>
  execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
if (git(["status", "--porcelain"]))
  throw Error("CLEAN_COMMITTED_SOURCE_REQUIRED");
// Resolve the already installed SDK cache before sanitizing HOME. Never install browsers.
const installedPath = chromium.executablePath(),
  cacheMatch = installedPath.match(/^(.*)[\/]chromium-(\d+)[\/]/);
if (!cacheMatch || !fs.existsSync(cacheMatch[1]))
  throw Error("INSTALLED_BROWSER_CACHE_REQUIRED");
const browserCache = fs.realpathSync(cacheMatch[1]);
const source = git(["rev-parse", "HEAD"]),
  { exclusions } = integrationReleaseSource(root);
// Acquire before copying or starting anything; never remove a foreign lease.
const release = acquireNativeFixtureLease("paired-setup-ui");
let directory,
  started = false;
try {
  directory = fs.realpathSync(fs.mkdtempSync("/tmp/kxra-pas-"));
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
  started = true;
  const r = spawnSync(
    process.execPath,
    ["--import", "tsx", "scripts/paired-admission-store-native.ts"],
    {
      cwd: directory,
      env: {
        PATH: process.env.PATH,
        HOME: directory,
        USER: process.env.USER,
        TMPDIR: process.env.TMPDIR,
        NEXT_TELEMETRY_DISABLED: "1",
        PLAYWRIGHT_BROWSERS_PATH: browserCache,
        KXRA_PAIRED_SETUP_PROOF: "1",
        KXRA_PAIRED_SETUP_UI_PROOF: "1",
        KXRA_PAIRED_COMPOSITION_PROOF: "1",
      },
      stdio: "inherit",
      timeout: 300000,
    },
  );
  if (r.status !== 0) throw Error("PAIRED_STORE_PROOF_FAILED " + directory);
  console.log("PAIRED_STORE_EXACT_SOURCE_PASS " + source + " " + directory);
} finally {
  if (started) {
    const receipt = path.join(directory, ".runtime/pas/cleanup.json");
    if (
      !fs.existsSync(receipt) ||
      !JSON.parse(fs.readFileSync(receipt, "utf8")).clean
    )
      throw Error("OWNED_CLEANUP_UNCERTAIN_LEASE_RETAINED " + directory);
  }
  release();
}
