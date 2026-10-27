import { applicationNext } from "./application-next.mjs";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import net from "node:net";

// Creates a new disposable store every time. Never opens an existing preview,
// .env file, hosted connection or caller-provided database/runtime path.
const root = path.resolve(import.meta.dirname, "..");
const runtime = fs.mkdtempSync(path.join(os.tmpdir(), "kxra-wb-"));
fs.chmodSync(runtime, 0o700);
async function freePort(preferred = 0) {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once("error", reject);
    s.listen(preferred, "127.0.0.1", () => {
      const p = s.address().port;
      s.close((e) => (e ? reject(e) : resolve(p)));
    });
  });
}
const activation = process.argv.includes("--activation");
const portArgument = process.argv.find((a) => a.startsWith("--port="));
const preferredPort = portArgument
  ? Number(portArgument.slice(7))
  : activation
    ? 3280
    : 3279;
if (
  !Number.isInteger(preferredPort) ||
  preferredPort < 1024 ||
  preferredPort > 65535
)
  throw Error("Fixture port must be an integer from 1024 to 65535");
const port = await freePort(preferredPort),
  pgPort = await freePort();
const runId = crypto.randomUUID(),
  origin = `http://127.0.0.1:${port}`;
const environment = {
  PATH: process.env.PATH,
  HOME: os.homedir(),
  USER: os.userInfo().username,
  TMPDIR: os.tmpdir(),
  LC_ALL: "C",
  LANG: "C",
  NODE_ENV: "development",
  NEXT_TELEMETRY_DISABLED: "1",
  KXRA_AUTH_MODE: "fixture",
  KXRA_ORIGIN: origin,
  KXRA_RUNTIME: runtime,
  KXRA_PG_PORT: String(pgPort),
  KXRA_PG_BIN: "/opt/homebrew/opt/postgresql@17/bin",
  KXRA_LOCAL_SECRET: crypto.randomBytes(48).toString("hex"),
  KXRA_CI_RUN_ID: runId,
  KXRA_NEXT_DIST_DIR: activation
    ? ".next-reference-activation-dev"
    : ".next-reference-workbench-dev",
};
const metadata = {
  mode: "synthetic local fixture; no provider calls",
  origin,
  runtime,
  run_id: runId,
  controller_pid: process.pid,
  verification: "not run",
};
const receipt = path.join(runtime, "reference-workbench.json");
const save = () =>
  fs.writeFileSync(receipt, JSON.stringify(metadata, null, 2), { mode: 0o600 });
save();
const run = (args, env = environment) =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: root,
      env,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code) =>
      code === 0 ? resolve() : reject(Error(`${args[0]} exited ${code}`)),
    );
  });
await run(["scripts/database.mjs", "start"]);
// Keep raw application diagnostics out of the private workbench store.
const fd = fs.openSync(os.devNull, "w");
const app = spawn(
  process.execPath,
  [
    applicationNext("os").binary,
    "dev",
    ...(process.argv.includes("--turbo")
      ? ["--turbopack"]
      : applicationNext("os").webpackArguments),
    "--hostname",
    "127.0.0.1",
    "--port",
    String(port),
  ],
  {
    cwd: path.join(root, "apps/os"),
    env: environment,
    stdio: ["ignore", fd, fd],
  },
);
metadata.app_pid = app.pid;
save();
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  app.kill("SIGTERM");
  await new Promise((r) => (app.exitCode !== null ? r() : app.once("exit", r)));
  spawnSync(process.execPath, ["scripts/database.mjs", "stop"], {
    cwd: root,
    env: environment,
    stdio: "inherit",
  });
  fs.closeSync(fd);
  metadata.stopped = true;
  save();
  process.exit(0);
}
app.once("exit", () => {
  if (!stopping) void stop();
});
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
const deadline = Date.now() + 90000;
let ready = false;
while (Date.now() < deadline) {
  if (app.exitCode !== null) break;
  try {
    const r = await fetch(origin + "/api/health", {
      signal: AbortSignal.timeout(1500),
    });
    const v = await r.json();
    if (r.ok && v.run_id === runId) {
      ready = true;
      break;
    }
  } catch {}
  await new Promise((r) => setTimeout(r, 400));
}
if (!ready) {
  console.error("Fixture application not ready; see local application.log");
  await stop();
}
console.log(
  `Private fixture ready: ${origin}/os/workspace\nReceipt: ${receipt}`,
);
if (process.argv.includes("--verify")) {
  try {
    // Fail fast on provider/entitlement contracts before the longer compatibility set.
    await run([
      "--import",
      "tsx",
      "--test",
      "--test-concurrency=1",
      "tests/pilot-stripe.test.ts",
    ]);
    await run([
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
      "tests/team-workspace-http.test.ts",
      "tests/team-provider.test.ts",
    ]);
    await run(["scripts/verify-migrations.mjs"]);
    await run([
      "node_modules/@playwright/test/cli.js",
      "test",
      "tests/e2e/team-workspace.spec.ts",
      "tests/e2e/team-knowledge.spec.ts",
      "tests/e2e/team-memory.spec.ts",
      "tests/e2e/team-jobs.spec.ts",
      "tests/e2e/team-launch.spec.ts",
      "tests/e2e/reference-workbench.spec.ts",
      ...(activation
        ? ["tests/e2e/accounts.spec.ts", "tests/e2e/workspace-start.spec.ts"]
        : []),
      "--reporter=line",
    ]);
    metadata.verification = "HTTP and browser PASS";
    save();
    console.log("REFERENCE WORKBENCH ACCEPTANCE PASS; local preview retained.");
  } catch (e) {
    metadata.verification = "FAILED: " + e.message;
    save();
    console.error(metadata.verification);
    console.error("Preview retained for diagnosis; no hosted action.");
  }
}
