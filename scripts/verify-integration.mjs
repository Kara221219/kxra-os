// Synthetic integration cohort. One shared exclusive native lease, owned runtime.
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import crypto from "node:crypto";
import { acquireNativeFixtureLease } from "./native-fixture-lease.mjs";
import { applicationNext } from "./application-next.mjs";
const root = path.resolve(import.meta.dirname, "..");
if (
  process.env.DATABASE_URL ||
  process.env.VERCEL ||
  process.env.VERCEL_ENV ||
  process.env.NEXT_PUBLIC_SUPABASE_URL
)
  throw Error("Synthetic local environment required");
const runtime = fs.mkdtempSync(path.join(root, ".runtime/i-"));
const fakeRuntime = fs.mkdtempSync("/tmp/kxra-integration-provider-");
async function port() {
  const s = net.createServer();
  await new Promise((r, j) => {
    s.once("error", j);
    s.listen(0, "127.0.0.1", r);
  });
  const p = s.address().port;
  await new Promise((r) => s.close(r));
  return p;
}
const appPort = await port();
const env = {
  ...process.env,
  NODE_ENV: "development",
  NODE_OPTIONS: "--conditions=development",
  KXRA_AUTH_MODE: "fixture",
  KXRA_RUNTIME: runtime,
  KXRA_ORIGIN: `http://127.0.0.1:${appPort}`,
  KXRA_PG_PORT: String(await port()),
  KXRA_LOCAL_SECRET: crypto.randomBytes(48).toString("hex"),
  KXRA_CI_RUN_ID: crypto.randomUUID(),
  KXRA_NEXT_DIST_DIR: ".next-integration-fixture",
  KXRA_GITHUB_FAKE_RUNTIME: fakeRuntime,
};
const generated = ["tsconfig.json", "next-env.d.ts"].map((name) => {
  const file = path.join(root, "apps/os", name);
  return { file, bytes: fs.readFileSync(file) };
});
function run(args) {
  const r = spawnSync(process.execPath, args, {
    cwd: root,
    env,
    stdio: "inherit",
  });
  if (r.status !== 0)
    throw Error("Integration phase failed: " + args.join(" "));
}
let server, fake, log, originalDatabaseConfiguration;
async function stop(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null)
    return true;
  const exited = new Promise((resolve) =>
    child.once("exit", () => resolve(true)),
  );
  async function observed(ms) {
    let timer;
    try {
      return await Promise.race([
        exited,
        new Promise((resolve) => {
          timer = setTimeout(() => resolve(false), ms);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }
  child.kill("SIGTERM");
  if (await observed(5000)) return true;
  child.kill("SIGKILL");
  if (await observed(1000)) return true;
  fs.writeFileSync(
    path.join(runtime, "integration-process-cleanup-uncertain.json"),
    JSON.stringify({ pid: child.pid }),
    { mode: 0o600 },
  );
  return false;
}
const applicationStarts = [];
async function startApplication(phase) {
  env.KXRA_CI_RUN_ID = crypto.randomUUID();
  server = spawn(
    process.execPath,
    [
      applicationNext("os").binary,
      "dev",
      ...applicationNext("os").webpackArguments,
      "--hostname",
      "127.0.0.1",
      "--port",
      String(appPort),
    ],
    { cwd: path.join(root, "apps/os"), env, stdio: ["ignore", log, log] },
  );
  let ready = false;
  for (let i = 0; i < 180; i++) {
    if (server.exitCode !== null) throw Error("Application exited");
    try {
      const r = await fetch(env.KXRA_ORIGIN + "/api/health");
      if (r.ok && (await r.json()).run_id === env.KXRA_CI_RUN_ID) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 400));
  }
  if (!ready) throw Error("Readiness failed");
  const dbConfig = JSON.parse(
    fs.readFileSync(path.join(runtime, "database.json"), "utf8"),
  );
  applicationStarts.push({
    phase,
    runId: env.KXRA_CI_RUN_ID,
    database: dbConfig.database,
    pid: server.pid,
  });
  fs.writeFileSync(
    path.join(runtime, "application-recovery-identities.json"),
    JSON.stringify(applicationStarts, null, 2) + "\n",
    { mode: 0o600 },
  );
}
const release = acquireNativeFixtureLease("feature-integration");
try {
  run(["scripts/database.mjs", "start"]);
  run(["scripts/integration-install.mjs"]);
  fake = spawn(process.execPath, ["scripts/github-fake-server.mjs"], {
    cwd: root,
    env: { ...env, KXRA_RUNTIME: fakeRuntime },
    stdio: ["ignore", "ignore", "inherit"],
  });
  for (
    let i = 0;
    i < 100 && !fs.existsSync(path.join(fakeRuntime, "github-fake-origin"));
    i++
  )
    await new Promise((r) => setTimeout(r, 100));
  env.KXRA_GITHUB_FAKE_ORIGIN = fs.readFileSync(
    path.join(fakeRuntime, "github-fake-origin"),
    "utf8",
  );
  log = fs.openSync(path.join(runtime, "application.log"), "w", 0o600);
  await startApplication("initial");
  run([
    "--import",
    "tsx",
    "--test",
    "--test-concurrency=1",
    "tests/integration-contracts.test.ts",
    "tests/integration/journey.test.ts",
    "tests/integration/vault.test.ts",
  ]);
  run(["scripts/verify-migrations.mjs"]);
  if (!(await stop(server))) throw Error("OWNED_APP_CLEANUP_UNCONFIRMED");
  run(["scripts/database.mjs", "stop"]);
  run(["scripts/database.mjs", "start"]);
  if (!(await stop(fake))) throw Error("OWNED_PROVIDER_CLEANUP_UNCONFIRMED");
  const providerSnapshot = fs.readFileSync(
    path.join(fakeRuntime, "github-provider-store.json"),
  );
  fs.unlinkSync(path.join(fakeRuntime, "github-fake-origin"));
  fake = spawn(process.execPath, ["scripts/github-fake-server.mjs"], {
    cwd: root,
    env: { ...env, KXRA_RUNTIME: fakeRuntime },
    stdio: ["ignore", "ignore", "inherit"],
  });
  for (
    let i = 0;
    i < 100 && !fs.existsSync(path.join(fakeRuntime, "github-fake-origin"));
    i++
  )
    await new Promise((r) => setTimeout(r, 100));
  env.KXRA_GITHUB_FAKE_ORIGIN = fs.readFileSync(
    path.join(fakeRuntime, "github-fake-origin"),
    "utf8",
  );
  if (
    !fs
      .readFileSync(path.join(fakeRuntime, "github-provider-store.json"))
      .equals(providerSnapshot)
  )
    throw Error("Provider restart changed persistent effects");
  await startApplication("source-restarted");
  run(["--import", "tsx", "--test", "tests/integration/browser.test.ts"]);
  run(["--import", "tsx", "scripts/integration-recovery.ts"]);
  const proof = JSON.parse(
    fs.readFileSync(
      path.join(runtime, "extension-recovery-proof.json"),
      "utf8",
    ),
  );
  if (!(await stop(server))) throw Error("OWNED_APP_CLEANUP_UNCONFIRMED");
  originalDatabaseConfiguration = fs.readFileSync(
    path.join(runtime, "database.json"),
  );
  const restoredConfig = {
    ...JSON.parse(originalDatabaseConfiguration),
    database: proof.target,
  };
  fs.writeFileSync(
    path.join(runtime, "database.json"),
    JSON.stringify(restoredConfig),
    { mode: 0o600 },
  );
  env.KXRA_INTEGRATION_BROWSER_PHASE = "restored";
  await startApplication("restored");
  run(["--import", "tsx", "--test", "tests/integration/browser.test.ts"]);
  console.log("INTEGRATION_FOCUSED_PASS " + runtime);
} finally {
  await stop(server);
  await stop(fake);
  if (originalDatabaseConfiguration)
    fs.writeFileSync(
      path.join(runtime, "database.json"),
      originalDatabaseConfiguration,
    );
  if (log !== undefined) fs.closeSync(log);
  fs.rmSync(path.join(root, "apps/os", env.KXRA_NEXT_DIST_DIR), {
    recursive: true,
    force: true,
  });
  for (const { file, bytes } of generated) fs.writeFileSync(file, bytes);
  const r = spawnSync(process.execPath, ["scripts/database.mjs", "stop"], {
    cwd: root,
    env,
    stdio: "inherit",
  });
  if (
    !fs.existsSync(
      path.join(runtime, "integration-process-cleanup-uncertain.json"),
    ) &&
    !fs.existsSync(
      path.join(runtime, "integration-worker-cleanup-uncertain.json"),
    ) &&
    r.status === 0 &&
    (!server || server.exitCode !== null || server.signalCode !== null) &&
    (!fake || fake.exitCode !== null || fake.signalCode !== null)
  )
    release();
  else {
    console.error("CLEANUP_UNCONFIRMED_LEASE_RETAINED");
    process.exitCode = 1;
  }
}
