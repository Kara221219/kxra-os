import { postgresBin } from "./postgres-bin.mjs";
import { applicationNext } from "./application-next.mjs";
import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import os from "node:os";
import { ciLogDestination } from "./ci-output-policy.mjs";
import {
  ciPhaseConfiguration,
  serviceVerificationCommands,
  runPrerequisitePhases,
  disposablePostgresCleanupPassed,
} from "./ci-phases.mjs";
import {
  mintDiagnosticsAttestation,
  writeHarnessDiagnostics,
} from "./safe-ci-diagnostics-core.mjs";

const root = path.resolve(import.meta.dirname, "..");
const phase = ciPhaseConfiguration(process.argv.slice(2));
const { focusedTeam, servicesOnly } = phase;
const runtime = path.join(root, ".runtime", phase.runtimeDirectory);
const nextGeneratedConfigurationFiles = ["os", "marketing"].flatMap(
  (application) =>
    ["next-env.d.ts", "tsconfig.json"].map((name) => {
      const file = path.join(root, "apps", application, name);
      return { file, contents: fs.readFileSync(file) };
    }),
);

function availablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(Error("Unable to allocate a loopback port"));
        return;
      }
      server.close((error) => (error ? reject(error) : resolve(address.port)));
    });
  });
}

const diagnosticsEnabled =
  process.env.GITHUB_ACTIONS === "true" && phase.diagnosticsAllowed;
const diagnosticsMetadata = {
  sourceSha: process.env.GITHUB_SHA || "",
  githubRunId: process.env.GITHUB_RUN_ID || "",
  githubRunAttempt: process.env.GITHUB_RUN_ATTEMPT || "",
};
const diagnosticStarted = performance.now();
const harnessEvents = [];
let diagnosticsReady = false,
  harnessOutcome = "FAILED";
const elapsed = () => Math.round(performance.now() - diagnosticStarted);
function stageFor(args) {
  if (args[0] === "scripts/verify-browser-restart.mjs") return "RESTART";
  if (args[0] === "test") return "SERVICES";
  if (args[0] !== "run") return null;
  return (
    {
      "test:dependencies": "DEPENDENCIES",
      "test:migrations": "MIGRATIONS",
      "test:publication": "PUBLICATION",
      "test:marketing-boundary": "MARKETING_BOUNDARY",
      "test:e2e": "PRIVATE_BROWSER",
      "test:marketing": "PUBLIC_BROWSER",
      "test:restart": "RESTART",
      "test:restore": "RESTORE",
      build: "BUILD",
      "test:marketing-csp": "CSP",
      "test:build-budgets": "BUDGET",
      "test:artifact": "ARTIFACT",
      "test:secrets": "SECRET_SCAN",
      "test:marketing-performance": "PERFORMANCE",
    }[args[1]] || null
  );
}
function stageEvent(stage, state, exitCode) {
  if (diagnosticsReady && stage && harnessEvents.length < 63)
    harnessEvents.push({
      phase: "HARNESS_STAGE",
      elapsedMs: elapsed(),
      stage,
      state,
      exitCode,
    });
}
function run(command, args, environment) {
  const stage = stageFor(args);
  stageEvent(stage, "BEGIN", 0);
  const result = spawnSync(command, args, {
    cwd: root,
    env: environment,
    stdio: "inherit",
  });
  stageEvent(stage, result.status === 0 ? "PASS" : "FAIL", result.status ?? -1);
  if (result.status !== 0)
    throw Error(`${command} ${args.join(" ")} failed with ${result.status}`);
}

async function waitForServer(origin, child, runId, timeout = 90_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (child.exitCode !== null)
      throw Error(`Application exited before readiness (${child.exitCode})`);
    try {
      const response = await fetch(`${origin}/api/health`, {
        signal: AbortSignal.timeout(1500),
      });
      const body = await response.json();
      if (response.ok && body.run_id === runId) return body;
    } catch {
      // Readiness is bounded by the deadline below.
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw Error("Application readiness timed out");
}

if (phase.needsServicePhase) {
  runPrerequisitePhases(
    (flag) =>
      spawnSync(process.execPath, ["scripts/ci.mjs", flag], {
        cwd: root,
        env: process.env,
        stdio: "inherit",
      }).status,
  );
}

fs.rmSync(runtime, { recursive: true, force: true });
fs.mkdirSync(runtime, { recursive: true, mode: 0o700 });

const [postgresPort, applicationPort, marketingPort, productionMarketingPort] =
  await Promise.all([
    availablePort(),
    availablePort(),
    availablePort(),
    availablePort(),
  ]);
const origin = `http://127.0.0.1:${applicationPort}`;
const marketingOrigin = `http://127.0.0.1:${marketingPort}`;
const productionMarketingOrigin = `http://127.0.0.1:${productionMarketingPort}`;
const runId = crypto.randomUUID();
const ciDistDir = `.next-ci-${runId}`;
const environment = { ...process.env };
for (const key of [
  "DATABASE_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "VERCEL",
])
  delete environment[key];
Object.assign(environment, {
  NODE_ENV: "development",
  KXRA_AUTH_MODE: "fixture",
  KXRA_ORIGIN: origin,
  KXRA_MARKETING_ORIGIN: marketingOrigin,
  KXRA_PRIVATE_APP_URL: `${origin}/login`,
  KXRA_PUBLIC_INGRESS_SECRET: crypto.randomBytes(48).toString("hex"),
  KXRA_RUNTIME: runtime,
  KXRA_PG_PORT: String(postgresPort),
  KXRA_LOCAL_SECRET: crypto.randomBytes(48).toString("hex"),
  KXRA_CI_RUN_ID: runId,
  KXRA_CI_PHASE: phase.runtimeDirectory,
  KXRA_NEXT_DIST_DIR: ciDistDir,
  KXRA_SAFE_DIAGNOSTICS_ENABLED: diagnosticsEnabled ? "true" : "false",
});
fs.writeFileSync(
  path.join(runtime, "session-key"),
  environment.KXRA_LOCAL_SECRET,
  { mode: 0o600 },
);

let application;
let marketing;
let productionMarketing;
let logHandle;
let marketingLogHandle;
let productionMarketingLogHandle;
try {
  const stalePort = await availablePort();
  const stale = http.createServer((_request, response) => {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ service: "kxra-os", run_id: "stale-run" }));
  });
  await new Promise((resolve, reject) => {
    stale.once("error", reject);
    stale.listen(stalePort, "127.0.0.1", resolve);
  });
  let staleRejected = false;
  try {
    await waitForServer(
      `http://127.0.0.1:${stalePort}`,
      { exitCode: null },
      runId,
      900,
    );
  } catch {
    staleRejected = true;
  } finally {
    await new Promise((resolve) => stale.close(resolve));
  }
  if (!staleRejected) throw Error("Stale service passed CI readiness");

  run(process.execPath, ["scripts/database.mjs", "start"], environment);
  logHandle = fs.openSync(ciLogDestination(runtime, "application.log"), "w");
  application = spawn(
    process.execPath,
    [
      applicationNext("os").binary,
      "dev",
      ...applicationNext("os").webpackArguments,
      "--hostname",
      "127.0.0.1",
      "--port",
      String(applicationPort),
    ],
    {
      cwd: path.join(root, "apps", "os"),
      env: environment,
      stdio: ["ignore", logHandle, logHandle],
    },
  );
  const applicationHealth = await waitForServer(origin, application, runId);
  if (diagnosticsEnabled) {
    mintDiagnosticsAttestation({
      root,
      environment,
      health: applicationHealth,
      freshFixture: true,
      metadata: diagnosticsMetadata,
    });
    diagnosticsReady = true;
    harnessEvents.push({
      phase: "FIXTURE_READY",
      elapsedMs: elapsed(),
      healthy: true,
      fresh: true,
    });
    if (phase.needsServicePhase) stageEvent("SERVICES", "PASS", 0);
  }
  marketingLogHandle = fs.openSync(
    ciLogDestination(runtime, "marketing.log"),
    "w",
  );
  marketing = spawn(
    process.execPath,
    [
      applicationNext("marketing").binary,
      "dev",
      ...applicationNext("marketing").webpackArguments,
      "--hostname",
      "127.0.0.1",
      "--port",
      String(marketingPort),
    ],
    {
      cwd: path.join(root, "apps", "marketing"),
      env: environment,
      stdio: ["ignore", marketingLogHandle, marketingLogHandle],
    },
  );
  await waitForServer(marketingOrigin, marketing, runId);

  const productionEnvironment = { ...environment, NODE_ENV: "production" };
  delete productionEnvironment.KXRA_AUTH_MODE;
  delete productionEnvironment.KXRA_LOCAL_SECRET;
  delete productionEnvironment.KXRA_RUNTIME;
  delete productionEnvironment.KXRA_PG_PORT;
  delete productionEnvironment.KXRA_NEXT_DIST_DIR;
  run("npm", ["run", "lint"], environment);
  if (phase.operations) {
    run(
      process.execPath,
      [
        "--conditions=development",
        "--import",
        "tsx",
        "--test",
        "--test-concurrency=1",
        ...phase.operations.files,
      ],
      environment,
    );
    run("npm", ["run", "test:migrations"], environment);
    run(
      process.execPath,
      ["scripts/verify-operations-recovery.mjs", "--snapshot"],
      environment,
    );
    run(process.execPath, ["scripts/database.mjs", "stop"], environment);
    run(process.execPath, ["scripts/database.mjs", "start"], environment);
    run(
      process.execPath,
      ["scripts/verify-operations-recovery.mjs", "--verify"],
      environment,
    );
    run(
      "npm",
      ["run", "test:restore", "--", "--operations-proof"],
      environment,
    );
    console.log(
      `Isolated ${phase.operations.directory} verification PASS; separate generated dataset, original quotas unchanged.`,
    );
  } else if (focusedTeam) {
    run(
      process.execPath,
      [
        "--import",
        "tsx",
        "--test",
        "--test-concurrency=1",
        "tests/team-knowledge-http.test.ts",
        "tests/team-memory-http.test.ts",
        "tests/team-jobs-http.test.ts",
        "tests/team-schedules-http.test.ts",
        "tests/team-audit-http.test.ts",
        "tests/team-launch-http.test.ts",
        "tests/pilot-stripe.test.ts",
        "tests/team-workspace-http.test.ts",
        "tests/team-provider.test.ts",
      ],
      environment,
    );
    run("npm", ["run", "test:migrations"], environment);
    run(
      "npm",
      [
        "run",
        "test:e2e",
        "--",
        "tests/e2e/team-knowledge.spec.ts",
        "tests/e2e/team-memory.spec.ts",
        "tests/e2e/team-jobs.spec.ts",
        "tests/e2e/team-launch.spec.ts",
        "tests/e2e/team-workspace.spec.ts",
      ],
      environment,
    );
    run("npm", ["run", "build:os"], productionEnvironment);
    console.log("Focused team workspace CI PASS (not the full platform CI).");
  } else if (servicesOnly) {
    for (const [command] of serviceVerificationCommands)
      run("npm", command === "test" ? ["test"] : ["run", command], environment);
    console.log(
      "Isolated service, restart and restore verification PASS; service runtime retained.",
    );
  } else {
    run("npm", ["run", "test:dependencies"], environment);
    run("npm", ["run", "test:migrations"], environment);
    run("npm", ["run", "test:publication"], environment);
    run("npm", ["run", "test:marketing-boundary"], environment);
    run("npm", ["run", "test:e2e"], environment);
    run("npm", ["run", "test:marketing"], environment);
    // Keep both service AT-08/10 proof and browser-created values/objects covered.
    run(process.execPath, ["scripts/verify-browser-restart.mjs"], environment);
    run("npm", ["run", "test:restore", "--", "--browser-proof"], environment);

    run("npm", ["run", "build"], productionEnvironment);
    // Actual production-rendered recovery UI, with synthetic intercepted API
    // responses, native Chromium sandbox and bounded owned-process cleanup.
    run(
      process.execPath,
      ["scripts/verify-recovery-stepup-forms.mjs"],
      productionEnvironment,
    );
    run("npm", ["run", "test:marketing-csp"], productionEnvironment);
    run("npm", ["run", "test:build-budgets"], productionEnvironment);
    run("npm", ["run", "test:artifact"], productionEnvironment);
    run("npm", ["run", "test:secrets"], productionEnvironment);

    const productionTestEnvironment = {
      ...productionEnvironment,
      KXRA_RUNTIME: runtime,
      KXRA_MARKETING_ORIGIN: productionMarketingOrigin,
      KXRA_CI_RUN_ID: runId,
      KXRA_EXPECT_PRODUCTION_CSP: "true",
    };
    productionMarketingLogHandle = fs.openSync(
      ciLogDestination(runtime, "marketing-production.log"),
      "w",
    );
    productionMarketing = spawn(
      process.execPath,
      [
        applicationNext("marketing").binary,
        "start",
        "--hostname",
        "127.0.0.1",
        "--port",
        String(productionMarketingPort),
      ],
      {
        cwd: path.join(root, "apps", "marketing"),
        env: productionTestEnvironment,
        stdio: [
          "ignore",
          productionMarketingLogHandle,
          productionMarketingLogHandle,
        ],
      },
    );
    await waitForServer(productionMarketingOrigin, productionMarketing, runId);
    run("npm", ["run", "test:marketing"], productionTestEnvironment);
    run(
      "npm",
      ["run", "test:marketing-performance"],
      productionTestEnvironment,
    );
    console.log(
      `Hermetic CI PASS using disposable PostgreSQL ${postgresPort} and application ${applicationPort}.`,
    );
  }
  harnessOutcome = "PASSED";
} finally {
  if (application && application.exitCode === null) {
    application.kill("SIGTERM");
    await new Promise((resolve) => {
      const timer = setTimeout(() => {
        if (application.exitCode === null) application.kill("SIGKILL");
        resolve();
      }, 5000);
      application.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }
  if (marketing && marketing.exitCode === null) {
    marketing.kill("SIGTERM");
    await new Promise((resolve) => {
      const timer = setTimeout(() => {
        if (marketing.exitCode === null) marketing.kill("SIGKILL");
        resolve();
      }, 5000);
      marketing.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }
  if (productionMarketing && productionMarketing.exitCode === null) {
    productionMarketing.kill("SIGTERM");
    await new Promise((resolve) => {
      const timer = setTimeout(() => {
        if (productionMarketing.exitCode === null)
          productionMarketing.kill("SIGKILL");
        resolve();
      }, 5000);
      productionMarketing.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }
  if (logHandle !== undefined) fs.closeSync(logHandle);
  if (marketingLogHandle !== undefined) fs.closeSync(marketingLogHandle);
  if (productionMarketingLogHandle !== undefined)
    fs.closeSync(productionMarketingLogHandle);
  for (const applicationDirectory of ["os", "marketing"])
    fs.rmSync(path.join(root, "apps", applicationDirectory, ciDistDir), {
      recursive: true,
      force: true,
    });
  for (const { file, contents } of nextGeneratedConfigurationFiles)
    fs.writeFileSync(file, contents);
  const stopped = spawnSync(
    process.execPath,
    ["scripts/database.mjs", "stop"],
    { cwd: root, env: environment, stdio: "inherit" },
  );
  const postgresAbsent = spawnSync(
    path.join(postgresBin(environment), "pg_ctl"),
    ["-D", path.join(runtime, "postgres"), "status"],
    { cwd: root, env: environment, stdio: "ignore", timeout: 5000 },
  );
  const cleanupPassed = disposablePostgresCleanupPassed(
    stopped.status,
    postgresAbsent.status,
  );
  if (process.env.KXRA_CI_BOUNDED_OUTPUT === "true")
    fs.writeFileSync(
      path.join(runtime, "bounded-cleanup.json"),
      JSON.stringify({
        postgresStopExitCode: stopped.status,
        postgresStatusExitCode: postgresAbsent.status,
        postgresAbsent: cleanupPassed,
        applicationExited:
          !application ||
          application.exitCode !== null ||
          application.signalCode !== null,
        marketingExited:
          !marketing ||
          marketing.exitCode !== null ||
          marketing.signalCode !== null,
        productionMarketingExited:
          !productionMarketing ||
          productionMarketing.exitCode !== null ||
          productionMarketing.signalCode !== null,
      }) + "\n",
      { mode: 0o600 },
    );
  if (!cleanupPassed) {
    console.error("CI_DISPOSABLE_POSTGRES_CLEANUP_UNCONFIRMED");
    process.exitCode = 1;
    harnessOutcome = "FAILED";
  }
  if (diagnosticsReady) {
    try {
      const memory = process.memoryUsage(),
        cpu = process.resourceUsage();
      harnessEvents.push({
        phase: "RESOURCE_SNAPSHOT",
        elapsedMs: elapsed(),
        rssMiB: memory.rss / 1048576,
        heapMiB: memory.heapUsed / 1048576,
        load1: os.loadavg()[0],
        cpuUserMs: cpu.userCPUTime / 1000,
        cpuSystemMs: cpu.systemCPUTime / 1000,
        freeMiB: os.freemem() / 1048576,
        totalMiB: os.totalmem() / 1048576,
        cpuCount: os.cpus().length,
      });
      writeHarnessDiagnostics({
        root,
        runtime,
        environment,
        metadata: diagnosticsMetadata,
        events: harnessEvents,
        outcome: harnessOutcome,
      });
    } catch {
      console.error("SAFE_DIAGNOSTICS_CAPTURE_REJECTED");
    }
  }
}
