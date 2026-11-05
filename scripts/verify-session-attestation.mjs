// Fresh owned synthetic fixture only. No target, credentials, provider calls, activation or deployment.
import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { sessionAttestationPayload } from "./session-attestation-payload.mjs";
import { acquireNativeFixtureLease } from "./native-fixture-lease.mjs";
import { integrationReleaseSource } from "./production-release-strategy.mjs";
const root = fs.realpathSync(path.resolve(import.meta.dirname, ".."));
if (
  process.argv.length !== 2 ||
  process.env.DATABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.VERCEL ||
  process.env.VERCEL_ENV
)
  throw Error("FRESH_SYNTHETIC_LOCAL_ONLY");
if (
  execFileSync("git", ["status", "--porcelain"], {
    cwd: root,
    encoding: "utf8",
  }).trim()
)
  throw Error("CLEAN_COMMITTED_SOURCE_REQUIRED");
sessionAttestationPayload(root);
const { exclusions } = integrationReleaseSource(root),
  destination = fs.realpathSync(fs.mkdtempSync("/tmp/kxra-session-"));
execFileSync("git", ["clone", "--no-hardlinks", root, destination], {
  stdio: "ignore",
});
for (const file of execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { cwd: root, encoding: "utf8" },
)
  .split("\0")
  .filter(Boolean)) {
  if (exclusions.some((e) => e.path === file)) continue;
  const from = path.join(root, file),
    to = path.join(destination, file);
  if (!fs.lstatSync(from).isFile()) throw Error("REGULAR_SOURCE_ONLY");
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}
for (const f of exclusions) fs.unlinkSync(path.join(destination, f.path));
fs.symlinkSync(
  path.join(root, "node_modules"),
  path.join(destination, "node_modules"),
  "dir",
);
const release = acquireNativeFixtureLease("original-session-attestation");
try {
  console.log("SESSION_ATTESTATION_FIXTURE " + destination);
  const r = spawnSync(
    process.execPath,
    ["--import", "tsx", "scripts/session-attestation-native.ts"],
    {
      cwd: destination,
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        USER: process.env.USER,
        TMPDIR: process.env.TMPDIR,
        NEXT_TELEMETRY_DISABLED: "1",
      },
      stdio: "inherit",
      timeout: 600000,
    },
  );
  if (r.status !== 0) throw Error("SESSION_ATTESTATION_FAILED " + destination);
  console.log("SESSION_ATTESTATION_PASS " + destination);
} finally {
  const cleanup = path.join(destination, ".runtime/proof/cleanup.json");
  if (
    !fs.existsSync(cleanup) ||
    !JSON.parse(fs.readFileSync(cleanup, "utf8")).clean
  )
    throw Error("CLEANUP_UNCERTAIN_LEASE_RETAINED " + destination);
  release();
  console.log("Exact owned attestation lease released");
}
