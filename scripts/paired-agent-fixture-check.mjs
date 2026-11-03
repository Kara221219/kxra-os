// One small, serial, disposable cohort. Never uses an existing runtime/store.
import { applicationNext } from "./application-next.mjs";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import net from "node:net";
import { spawn, spawnSync } from "node:child_process";
const root = path.resolve(import.meta.dirname, "..");
if (!process.argv.includes("--isolated-synthetic"))
  throw Error("Explicit --isolated-synthetic required");
const uiOnly = process.argv.includes("--ui-only");
const runtime = fs.mkdtempSync("/tmp/kxra-paired-");
const available = () =>
  new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once("error", reject);
    s.listen(0, "127.0.0.1", () => {
      const port = s.address().port;
      s.close((e) => (e ? reject(e) : resolve(port)));
    });
  });
const [pgPort, appPort] = await Promise.all([available(), available()]),
  origin = `http://127.0.0.1:${appPort}`,
  runId = crypto.randomUUID();
const env = { ...process.env };
for (const k of Object.keys(env))
  if (
    /^(VERCEL|SUPABASE_|NEXT_PUBLIC_SUPABASE_|STRIPE_|KXRA_MODEL_|KXRA_BILLING_|KXRA_PILOT_STRIPE_|KXRA_HOSTED_|KXRA_WORKER_|KXRA_ROOM_)/.test(
      k,
    ) ||
    k === "DATABASE_URL"
  )
    delete env[k];
Object.assign(env, {
  NODE_ENV: "development",
  KXRA_AUTH_MODE: "fixture",
  KXRA_ORIGIN: origin,
  KXRA_RUNTIME: runtime,
  KXRA_PG_PORT: String(pgPort),
  KXRA_LOCAL_SECRET: crypto.randomBytes(48).toString("hex"),
  KXRA_CI_RUN_ID: runId,
  KXRA_NEXT_DIST_DIR: ".next-paired-" + runId,
  KXRA_BILLING_ENABLED: "false",
  KXRA_PILOT_STRIPE_ENABLED: "false",
});
fs.writeFileSync(path.join(runtime, "session-key"), env.KXRA_LOCAL_SECRET, {
  mode: 0o600,
});
const run = (args) => {
  const r = spawnSync(process.execPath, args, {
    cwd: root,
    env,
    stdio: "inherit",
  });
  if (r.status !== 0) throw Error("Paired fixture command failed: " + args[0]);
};
const generated = ["next-env.d.ts", "tsconfig.json"].map((f) => ({
  p: path.join(root, "apps/os", f),
  bytes: fs.readFileSync(path.join(root, "apps/os", f)),
}));
// Cooperate with serial native cohorts in every checkout. Never clear someone
// else's lock, infer staleness, or terminate its processes.
const lock = "/tmp/kxra-native-serial.lock";
const lockReceipt = lock;
const lockDeadline = Date.now() + 180000;
while (true) {
  try {
    fs.writeFileSync(
      lockReceipt,
      JSON.stringify({ pid: process.pid, runId, root }),
      { mode: 0o600, flag: "wx" },
    );
    break;
  } catch (e) {
    if (e.code !== "EEXIST" || Date.now() >= lockDeadline) throw e;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}
let app,
  started = false;
try {
  started = true;
  run(["scripts/database.mjs", "start"]);
  if (!uiOnly)
    run(["--import", "tsx", "scripts/paired-install-boundary-check.ts"]);
  const log = fs.openSync(path.join(runtime, "application.log"), "a", 0o600);
  app = spawn(
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
  fs.closeSync(log);
  const deadline = Date.now() + 90000;
  let ready = false;
  while (Date.now() < deadline) {
    if (app.exitCode !== null) throw Error("Isolated app exited");
    try {
      const r = await fetch(origin + "/api/health");
      if ((await r.json()).run_id === runId) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 300));
  }
  if (!ready) throw Error("Isolated app readiness timed out");
  if (!uiOnly)
    run([
      "--import",
      "tsx",
      "--test",
      "--test-concurrency=1",
      "tests/paired-runtime.test.ts",
      "tests/paired-transport.test.ts",
      "tests/paired-agent-http.test.ts",
    ]);
  run(["scripts/verify-migrations.mjs"]);
  if (uiOnly) run(["--import", "tsx", "scripts/paired-agent-ui-check.ts"]);
  console.log(
    JSON.stringify({
      status: "PAIRED_SYNTHETIC_CHECK_PASS",
      phase: uiOnly ? "UI_FRESH_STORE" : "NATIVE_PROTOCOL_HTTP",
      runtime,
      origin,
      pgPort,
      runId,
      base: "43e3906859b58e69370a1069a44e6dc1cefc6d03",
      providerCalls: false,
      sharedDatabase: false,
    }),
  );
} finally {
  if (app && app.exitCode === null) {
    app.kill("SIGTERM");
    await new Promise((resolve) => {
      app.once("exit", resolve);
      setTimeout(() => {
        if (app.exitCode === null) app.kill("SIGKILL");
        resolve();
      }, 5000);
    });
  }
  if (started) {
    const stop = spawnSync(process.execPath, ["scripts/database.mjs", "stop"], {
      cwd: root,
      env,
      stdio: "inherit",
    });
    if (stop.status !== 0) process.exitCode = 1;
  }
  for (const f of generated) fs.writeFileSync(f.p, f.bytes);
  if (JSON.parse(fs.readFileSync(lockReceipt, "utf8")).runId === runId) {
    fs.unlinkSync(lockReceipt);
  }
}

// Browser setup needs its own owner quota, not deletion of accepted task data
// or a raised product limit. Both cohorts remain serial and separately locked.
if (process.argv.includes("--ui") && !uiOnly) {
  run([
    "scripts/paired-agent-fixture-check.mjs",
    "--isolated-synthetic",
    "--ui-only",
  ]);
}
