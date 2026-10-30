import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const serviceCases = [
  "live-webhook",
  "live-stripe-payment-evidence",
  "live-paid-access",
  "live-paid-refresh",
  "live-catalogue-stripe",
  "checkout-worker",
  "billing-dispatch-batch",
  "checkout-result",
  "live-billing-entry",
  "billing-http",
  "hosted-self-service",
  "hosted-self-service-contract",
  "self-service",
  "synchronous-portal",
  "live-stripe-customer",
  "modern-billing-scope",
  "live-billing-ledger-contract",
  "modern-billing-entry-scope",
  "billing-refresh-capacity",
  "billing-refresh-scheduler",
  "billing-read-allowance",
  "billing-scheduler-budget",
  "renewal-recovery-contract",
  "team-provider",
  "telemetry",
].map((name) => `tests/${name}.test.ts`);
const databaseCases = [
  "live-stripe-customer",
  "live-billing-concurrency",
  "live-paid-access",
  "live-webhook",
  "checkout-result",
  "live-paid-refresh",
  "billing-dispatch-discovery",
  "portal-reservation-concurrency",
  "billing-scheduler-budget",
].map((name) => `tests/${name}.db.test.ts`);

/** Only generated local fixture mode exists. No hosted URL, key, Stripe CLI,
 * external HTTP send, dashboard action or real charge is accepted by this tool.
 * Real sandbox/card/3DS acceptance remains an explicit release-owner operation.
 */
async function main() {
  if (process.argv.slice(2).join(" ") !== "--synthetic")
    throw Error("BILLING_ACCEPTANCE_SYNTHETIC_ONLY");
  process.umask(0o077);
  const directory = fs.realpathSync(
    fs.mkdtempSync("/tmp/kxra-billing-acceptance-"),
  );
  fs.chmodSync(directory, 0o700);
  const receipt = {
    version: 1,
    kind: "SYNTHETIC_ONLY",
    source_commit: execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: root,
      encoding: "utf8",
    }).trim(),
    source_dirty: Boolean(
      execFileSync("git", ["status", "--porcelain"], {
        cwd: root,
        encoding: "utf8",
      }).trim(),
    ),
    started_at: new Date().toISOString(),
    state: "FAILED",
    checks: 0,
    phases: [],
    fixture_servers_stopped: true,
    provider_acceptance: false,
    activation_authority: false,
  };
  const base = {};
  // Never inherit NODE_OPTIONS, real provider/database secrets or hosted selectors.
  for (const key of [
    "PATH",
    "HOME",
    "TMPDIR",
    "LANG",
    "LC_ALL",
    "USER",
    "LOGNAME",
  ])
    if (process.env[key]) base[key] = process.env[key];
  const postgresBin =
    [
      "/opt/homebrew/opt/postgresql@17/bin",
      "/opt/homebrew/opt/postgresql@16/bin",
      "/opt/homebrew/opt/postgresql@14/bin",
    ].find((p) => fs.existsSync(path.join(p, "pg_ctl"))) ??
    execFileSync("pg_config", ["--bindir"], {
      env: base,
      encoding: "utf8",
    }).trim();
  function execute(phase, args, env, tests = false) {
    const output = spawnSync(process.execPath, args, {
      cwd: root,
      env,
      encoding: "utf8",
      timeout: 600_000,
      maxBuffer: 5_000_000,
    });
    const log = `${output.stdout ?? ""}${output.stderr ?? ""}`;
    fs.writeFileSync(path.join(directory, `${phase}.log`), log, {
      mode: 0o600,
    });
    const count = tests ? Number(log.match(/^# tests (\d+)$/m)?.[1]) : 0;
    const passed =
      output.status === 0 &&
      (!tests ||
        (count > 0 &&
          /^# fail 0$/m.test(log) &&
          /^# cancelled 0$/m.test(log) &&
          /^# skipped 0$/m.test(log)));
    receipt.phases.push({
      phase,
      state: passed ? "PASS" : "FAILED",
      checks: count || 0,
    });
    if (passed) receipt.checks += count;
    process.stdout.write(
      JSON.stringify({
        phase,
        state: passed ? "PASS" : "FAILED",
        checks: count || 0,
      }) + "\n",
    );
    if (!passed) throw Error("BILLING_ACCEPTANCE_PHASE_FAILED");
  }
  try {
    for (const mode of ["LIVE", "STAGING_SANDBOX"]) {
      const runtime = fs.realpathSync(
        fs.mkdtempSync(path.join(directory, mode + "-")),
      );
      const env = {
        ...base,
        NODE_ENV: "development",
        KXRA_AUTH_MODE: "fixture",
        KXRA_ORIGIN: "http://127.0.0.1:3210",
        KXRA_RUNTIME: runtime,
        KXRA_PG_PORT: "55479",
        KXRA_PG_BIN: postgresBin,
        KXRA_LOCAL_SECRET: crypto.randomBytes(48).toString("hex"),
        KXRA_MODERN_BILLING_TEST_MODE: mode,
      };
      // TCP is disabled by database.mjs; identical port numbers in distinct
      // private Unix-socket directories cannot collide with another task.
      let startAttempted = false;
      try {
        startAttempted = true;
        execute(`${mode}-start`, ["scripts/database.mjs", "start"], env);
        const sourceFiles = [...new Set([...serviceCases, ...databaseCases])];
        if (mode === "LIVE") {
          const digest = crypto.createHash("sha256");
          for (const file of sourceFiles)
            digest.update(file).update(fs.readFileSync(path.join(root, file)));
          receipt.test_source_sha256 = digest.digest("hex");
          execute(
            "services",
            [
              "--conditions=development",
              "--import",
              "tsx",
              "--test",
              "--test-concurrency=1",
              ...serviceCases,
            ],
            env,
            true,
          );
        }
        execute(
          `${mode}-native`,
          [
            "--conditions=development",
            "--import",
            "tsx",
            "--test",
            "--test-concurrency=1",
            ...databaseCases,
          ],
          env,
          true,
        );
        execute(`${mode}-migrations`, ["scripts/verify-migrations.mjs"], env);
      } finally {
        if (startAttempted) {
          try {
            execute(`${mode}-stop`, ["scripts/database.mjs", "stop"], env);
          } catch {
            receipt.fixture_servers_stopped = false;
            throw Error("BILLING_ACCEPTANCE_CLEANUP_FAILED");
          }
        }
      }
    }
    receipt.state = "PASS";
  } finally {
    receipt.finished_at = new Date().toISOString();
    fs.writeFileSync(
      path.join(directory, "receipt.json"),
      JSON.stringify(receipt, null, 2) + "\n",
      { mode: 0o600 },
    );
    process.stdout.write(
      JSON.stringify({
        state: receipt.state,
        checks: receipt.checks,
        receipt: path.join(directory, "receipt.json"),
      }) + "\n",
    );
  }
  if (receipt.state !== "PASS") process.exitCode = 1;
}
void main().catch(() => {
  process.stderr.write(
    "Billing acceptance incomplete; inspect its private synthetic phase receipt. No hosted/provider acceptance is established.\n",
  );
  process.exitCode = 1;
});
