import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import crypto from "node:crypto";
import { applicationNext } from "./application-next.mjs";
const root = path.resolve(import.meta.dirname, ".."),
  runtime = path.join(
    root,
    ".runtime",
    "apps-" + crypto.randomBytes(3).toString("hex"),
  );
if (fs.existsSync(runtime))
  throw Error("Use a fresh checkout/runtime; refusing to reuse test database");
if (
  process.env.DATABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.VERCEL ||
  process.env.VERCEL_ENV
)
  throw Error("Synthetic local runtime only");
async function port() {
  const s = net.createServer();
  await new Promise((resolve, reject) => {
    s.once("error", reject);
    s.listen(0, "127.0.0.1", resolve);
  });
  const p = s.address().port;
  await new Promise((resolve) => s.close(resolve));
  return p;
}
const httpPort = await port(),
  pgPort = await port();
fs.mkdirSync(runtime, { recursive: true, mode: 0o700 });
const env = {
  ...process.env,
  NODE_ENV: "development",
  NODE_OPTIONS: "--conditions=development",
  KXRA_AUTH_MODE: "fixture",
  KXRA_RUNTIME: runtime,
  KXRA_ORIGIN: `http://127.0.0.1:${httpPort}`,
  KXRA_PG_PORT: String(pgPort),
  KXRA_LOCAL_SECRET: crypto.randomBytes(48).toString("hex"),
  KXRA_CI_RUN_ID: crypto.randomUUID(),
  KXRA_NEXT_DIST_DIR: ".next-ci-custom-apps",
};
function run(args) {
  const r = spawnSync(process.execPath, args, {
    cwd: root,
    env,
    stdio: "inherit",
  });
  if (r.status !== 0) throw Error(`Verification failed: ${args.join(" ")}`);
}
const generated = ["tsconfig.json", "next-env.d.ts"].map((name) => {
  const file = path.join(root, "apps/os", name);
  return { file, bytes: fs.readFileSync(file) };
});
let server, log;
try {
  run(["scripts/database.mjs", "start"]);
  run(["--import", "tsx", "scripts/custom-apps-install.ts"]);
  log = fs.openSync(path.join(runtime, "application.log"), "w", 0o600);
  server = spawn(
    process.execPath,
    [
      applicationNext("os").binary,
      "dev",
      ...applicationNext("os").webpackArguments,
      "--hostname",
      "127.0.0.1",
      "--port",
      String(httpPort),
    ],
    { cwd: path.join(root, "apps/os"), env, stdio: ["ignore", log, log] },
  );
  let ready = false;
  for (let n = 0; n < 150; n++) {
    if (server.exitCode !== null)
      throw Error("Local app exited before readiness");
    try {
      const r = await fetch(env.KXRA_ORIGIN + "/api/health");
      const body = await r.json();
      if (r.ok && body.run_id === env.KXRA_CI_RUN_ID) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  if (!ready) throw Error("Local app readiness timed out");
  run([
    "--import",
    "tsx",
    "--test",
    "--test-concurrency=1",
    "tests/custom-apps.test.ts",
    "tests/custom-apps/lifecycle.test.ts",
  ]);
  run(["scripts/verify-migrations.mjs"]);
  console.log("CUSTOM_APPS_SYNTHETIC_VERIFICATION_PASS");
} finally {
  if (server && server.exitCode === null) {
    server.kill("SIGTERM");
    await new Promise((resolve) => {
      server.once("exit", resolve);
      setTimeout(() => {
        if (server.exitCode === null) server.kill("SIGKILL");
        resolve();
      }, 5000).unref();
    });
  }
  if (log !== undefined) fs.closeSync(log);
  for (const { file, bytes } of generated) fs.writeFileSync(file, bytes);
  const stopped = spawnSync(
    process.execPath,
    ["scripts/database.mjs", "stop"],
    { cwd: root, env, stdio: "inherit" },
  );
  if (stopped.status !== 0) process.exitCode = 1;
}
