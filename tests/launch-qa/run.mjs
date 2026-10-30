import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

export const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
export const contractFiles = Object.freeze(
  [
    "account-contracts",
    "recovery-intent",
    "recovery-confirm-diagnostics",
    "supabase-mfa",
    "supabase-auth-transport",
    "hosted-self-service-contract",
    "live-stripe-payment-evidence",
    "live-webhook",
    "checkout-worker",
    "live-customer-worker",
    "live-worker-identity",
    "team-provider",
    "telemetry",
    "workspace-terms-delivery",
    "native-bridge-production",
  ].map((name) => `tests/${name}.test.ts`),
);

// No credentials, hosted origins, Node preload hooks or fixture overrides cross this boundary.
export function syntheticEnvironment(input) {
  const output = {};
  for (const key of [
    "PATH",
    "HOME",
    "TMPDIR",
    "SystemRoot",
    "LANG",
    "LC_ALL",
    "KXRA_PG_BIN",
  ])
    if (input[key]) output[key] = input[key];
  if (output.KXRA_PG_BIN)
    output.PATH = [output.KXRA_PG_BIN, output.PATH]
      .filter(Boolean)
      .join(path.delimiter);
  return { ...output, CI: "true", NEXT_TELEMETRY_DISABLED: "1" };
}
export function commandFor(mode) {
  if (mode === "contracts")
    return [
      "--import",
      "tsx",
      "--test",
      "--test-concurrency=1",
      ...contractFiles,
    ];
  if (mode === "services") return ["scripts/ci.mjs", "--services-only"];
  if (mode === "full") return ["scripts/ci.mjs"];
  throw Error("QA_MODE_REJECTED");
}
export function assertNoEnvironmentFiles(directory) {
  for (const relative of [
    ".",
    "apps/os",
    "apps/marketing",
    "apps/email-worker",
  ])
    for (const name of fs.readdirSync(path.join(directory, relative)))
      if (
        (name === ".env" || name.startsWith(".env.")) &&
        name !== ".env.example"
      )
        throw Error("QA_ENVIRONMENT_FILE_PRESENT");
}

function main() {
  const mode = process.argv[2];
  const args = commandFor(mode);
  assertNoEnvironmentFiles(root);
  const git = (args) => {
    const r = spawnSync("git", args, { cwd: root, encoding: "utf8" });
    if (r.status !== 0) throw Error("QA_SOURCE_IDENTITY_UNAVAILABLE");
    return r.stdout.trim();
  };
  const receiptDirectory = path.join(
    root,
    ".runtime",
    "launch-qa",
    crypto.randomUUID(),
  );
  fs.mkdirSync(receiptDirectory, { recursive: true, mode: 0o700 });
  const receipt = {
    schema: "kxra-launch-qa-v1",
    sourceSha: git(["rev-parse", "HEAD"]),
    dirty: git(["status", "--porcelain"]).length > 0,
    mode,
    startedAt: new Date().toISOString(),
    result: "RUNNING",
    hostedAcceptance: "NOT_RUN",
    customerReady: false,
    scope: mode === "contracts" ? contractFiles : ["scripts/ci.mjs", mode],
  };
  const receiptFile = path.join(receiptDirectory, "receipt.json");
  fs.writeFileSync(receiptFile, JSON.stringify(receipt, null, 2), {
    mode: 0o600,
  });
  console.log(
    `Synthetic QA ${mode} started; private evidence: ${receiptDirectory}`,
  );
  const fd = fs.openSync(
    path.join(receiptDirectory, "checks.log"),
    "wx",
    0o600,
  );
  let result;
  try {
    result = spawnSync(process.execPath, args, {
      cwd: root,
      env: syntheticEnvironment(process.env),
      stdio: ["ignore", fd, fd],
      timeout: 90 * 60 * 1000,
    });
  } finally {
    fs.closeSync(fd);
  }
  receipt.finishedAt = new Date().toISOString();
  receipt.exitCode = result.status;
  receipt.result = result.status === 0 ? "PASS" : "FAIL";
  receipt.signal = result.signal;
  fs.writeFileSync(receiptFile, JSON.stringify(receipt, null, 2), {
    mode: 0o600,
  });
  console.log(JSON.stringify(receipt));
  process.exitCode = result.status === 0 ? 0 : 1;
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main();
