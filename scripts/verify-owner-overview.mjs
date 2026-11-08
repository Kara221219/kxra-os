// Owned synthetic fixture only. This runner never loads an environment file.
import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { acquireNativeFixtureLease } from "./native-fixture-lease.mjs";
import { postgresBin } from "./postgres-bin.mjs";
const root = path.resolve(import.meta.dirname, "..");
if (
  process.env.DATABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.VERCEL ||
  process.env.VERCEL_ENV
)
  throw Error("LOCAL_FIXTURE_ONLY");
const runtime = fs.realpathSync(fs.mkdtempSync("/tmp/kxra-owner-overview-"));
fs.chmodSync(runtime, 0o700);
const environment = {
  PATH: process.env.PATH,
  HOME: process.env.HOME,
  USER: process.env.USER,
  TMPDIR: process.env.TMPDIR,
  LANG: "C",
  LC_ALL: "C",
  NEXT_TELEMETRY_DISABLED: "1",
  NODE_ENV: "development",
  KXRA_AUTH_MODE: "fixture",
  KXRA_RUNTIME: runtime,
  KXRA_ORIGIN: "http://127.0.0.1:3295",
  KXRA_PG_PORT: "55571",
};
const sourceFiles = [
  "apps/os/app/os/[[...segments]]/page.tsx",
  "apps/os/components/Shell.tsx",
  "apps/os/components/Forms.tsx",
  "apps/os/components/TeamWorkspace.tsx",
  "apps/os/components/OwnerNavigation.tsx",
  "apps/os/components/OwnerMenuDisclosure.tsx",
  "apps/os/components/OwnerOverview.tsx",
  "apps/os/components/OwnerOperations.module.css",
  "apps/os/components/OwnerOverview.module.css",
  "apps/os/lib/owner-overview.ts",
  "packages/workspace/owner-navigation.ts",
  "packages/workspace/owner-overview-contract.ts",
  "packages/release/owner-overview-source-transition-v1.json",
  "scripts/owner-overview-source-transition.mjs",
  "scripts/session-attestation-payload.mjs",
  "scripts/verify-owner-overview.mjs",
  "tests/acceptance/owner-overview.native.ts",
  "tests/owner-overview.test.ts",
  "tests/owner-overview-source-transition.test.ts",
  "tests/production-session-composition.test.ts",
  "tests/production-apps-composition.test.ts",
  "tests/e2e/owner-overview.spec.ts",
  "tests/e2e/control-plane.spec.ts",
  "tests/e2e/workspace.spec.ts",
  "tests/e2e/accounts.spec.ts",
  "tests/e2e/team-knowledge.spec.ts",
  "tests/e2e/team-memory.spec.ts",
  "tests/e2e/knowledge-refresh-diagnostic.spec.ts",
];
function sourceHashes() {
  return Object.fromEntries(
    sourceFiles.map((file) => [
      file,
      crypto
        .createHash("sha256")
        .update(fs.readFileSync(path.join(root, file)))
        .digest("hex"),
    ]),
  );
}
const sourceSha256 = sourceHashes();
const log = fs.openSync(path.join(runtime, "application.log"), "a", 0o600);
let server,
  startupError = null,
  failed = null;
const report = {
  runtime,
  origin: environment.KXRA_ORIGIN,
  sourceBaseCommit: "7f1d1112f81a35d304a7e8810d4f68a5e4b2572c",
  sourceSha256,
  checks: [],
  cleanup: null,
};
function run(name, args) {
  const output = fs.openSync(path.join(runtime, name + ".log"), "w", 0o600);
  let result;
  try {
    result = spawnSync(process.execPath, args, {
      cwd: root,
      env: environment,
      stdio: ["ignore", output, output],
      timeout: 1200000,
    });
  } finally {
    fs.closeSync(output);
  }
  report.checks.push({
    name,
    exit: result.status,
    error: result.error?.message || null,
  });
  if (result.status !== 0) throw Error(name + " failed; see " + runtime);
}
// All fallible preparation precedes the shared lease; every started resource is guarded.
const release = acquireNativeFixtureLease("owner-operating-overview-20261108");
try {
  server = spawn(process.execPath, ["scripts/local.mjs"], {
    cwd: root,
    env: environment,
    detached: true,
    stdio: ["ignore", log, log],
  });
  server.once("error", (error) => {
    startupError = error;
  });
  console.log("OWNED_OWNER_FIXTURE " + runtime);
  let ready = false;
  for (let i = 0; i < 180; i++) {
    if (startupError) throw startupError;
    if (server.exitCode !== null) throw Error("Owner server exited");
    try {
      const response = await fetch(environment.KXRA_ORIGIN + "/login", {
        signal: AbortSignal.timeout(2000),
      });
      if (response.status === 200) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  if (!ready) throw Error("Owner server readiness timeout");
  environment.KXRA_LOCAL_SECRET = fs.readFileSync(
    path.join(runtime, "session-key"),
    "utf8",
  );
  run("native", [
    "--conditions=development",
    "--import",
    "tsx",
    "--test",
    "tests/acceptance/owner-overview.native.ts",
  ]);
  run("browser", [
    "node_modules/@playwright/test/cli.js",
    "test",
    "tests/e2e/owner-overview.spec.ts",
    "tests/e2e/control-plane.spec.ts",
    "tests/e2e/team-knowledge.spec.ts",
    "tests/e2e/team-memory.spec.ts",
    "tests/e2e/knowledge-refresh-diagnostic.spec.ts",
    "--grep-invert",
    "AT-22 owner Dashboard",
    "--timeout=90000",
    "--output=" + path.join(runtime, "browser"),
  ]);
} catch (error) {
  failed = error;
  report.failure = error.message;
} finally {
  if (!server?.pid) {
    // Node leaves pid undefined only when no child process was created.
    // Nothing could have started PostgreSQL, so do not require a cluster probe.
    release();
    report.cleanup = {
      resourceStarted: false,
      clean: true,
      leaseReleased: true,
    };
  } else {
    if (server?.pid) {
      try {
        process.kill(-server.pid, "SIGTERM");
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 2500));
      try {
        process.kill(-server.pid, 0);
        process.kill(-server.pid, "SIGKILL");
        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch {}
    }
    const stopped = spawnSync(
      process.execPath,
      ["scripts/database.mjs", "stop"],
      { cwd: root, env: environment, stdio: "ignore", timeout: 30000 },
    );
    const dbStatus = spawnSync(
      path.join(postgresBin(), "pg_ctl"),
      ["-D", path.join(runtime, "postgres"), "status"],
      { stdio: "ignore" },
    ).status;
    let groupAlive = false;
    try {
      process.kill(-server.pid, 0);
      groupAlive = true;
    } catch {}
    let portResponds = false;
    try {
      await fetch(environment.KXRA_ORIGIN + "/login", {
        signal: AbortSignal.timeout(1000),
      });
      portResponds = true;
    } catch {}
    const clean =
      stopped.status === 0 && dbStatus === 3 && !groupAlive && !portResponds;
    report.cleanup = {
      databaseStopExit: stopped.status,
      databaseStatus: dbStatus,
      serverGroupAlive: groupAlive,
      applicationResponds: portResponds,
      clean,
    };
    if (clean) {
      release();
      report.cleanup.leaseReleased = true;
    } else {
      report.cleanup.leaseReleased = false;
      failed = Error("OWNED_CLEANUP_UNCERTAIN_LEASE_RETAINED");
    }
    report.cleanup.resourceStarted = true;
  }
  try {
    report.sourceUnchanged =
      JSON.stringify(sourceHashes()) === JSON.stringify(sourceSha256);
  } catch {
    report.sourceUnchanged = false;
  }
  if (!report.sourceUnchanged)
    failed = Error("SOURCE_CHANGED_DURING_ACCEPTANCE");
  fs.closeSync(log);
  fs.writeFileSync(
    path.join(runtime, "report.json"),
    JSON.stringify(report, null, 2) + "\n",
    { mode: 0o600 },
  );
  console.log(JSON.stringify(report));
}
if (failed) throw failed;
