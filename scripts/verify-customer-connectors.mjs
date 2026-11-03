// Disposable local synthetic proof; never loads .env or calls provider APIs.
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import crypto from "node:crypto";
import os from "node:os";
import pg from "pg";
import { applicationNext } from "./application-next.mjs";
const root = path.resolve(import.meta.dirname, "..");
const runtime = fs.mkdtempSync("/tmp/kxra-connectors-");
fs.chmodSync(runtime, 0o700);
async function port() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const p = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return p;
}
const appPort = await port(),
  pgPort = await port();
const retainedKeyFile = process.env.KXRA_CONNECTOR_TEST_KEY_FILE;
const signingKey = retainedKeyFile
  ? fs.readFileSync(retainedKeyFile, "utf8")
  : crypto.randomBytes(48).toString("hex");
if (!/^[a-f0-9]{96}$/.test(signingKey))
  throw Error("Fixture signing key invalid");
const env = {
  ...process.env,
  NODE_ENV: "development",
  KXRA_CI_RUN_ID: crypto.randomUUID(),
  KXRA_AUTH_MODE: "fixture",
  KXRA_RUNTIME: runtime,
  KXRA_ORIGIN: `http://127.0.0.1:${appPort}`,
  KXRA_PG_PORT: String(pgPort),
  KXRA_LOCAL_SECRET: signingKey,
  KXRA_CONNECTOR_SCREENSHOT: path.join(
    runtime,
    "customer-connections-desktop.png",
  ),
  KXRA_NEXT_DIST_DIR: `.next-connector-proof-${crypto.randomUUID()}`,
};
for (const key of [
  "DATABASE_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "VERCEL",
  "VERCEL_ENV",
])
  delete env[key];
fs.writeFileSync(path.join(runtime, "session-key"), env.KXRA_LOCAL_SECRET, {
  mode: 0o600,
});
const generated = ["os", "marketing"].flatMap((app) =>
  ["tsconfig.json", "next-env.d.ts", "AGENTS.md"].map((file) => {
    const p = path.join(root, "apps", app, file);
    return [p, fs.existsSync(p) ? fs.readFileSync(p) : null];
  }),
);
let child;
function run(args) {
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    env,
    stdio: "inherit",
  });
  if (result.status !== 0)
    throw Error(
      `Connector verification failed: ${args.join(" ")} (${result.status})`,
    );
}
try {
  run(["scripts/database.mjs", "start"]);
  const config = JSON.parse(
    fs.readFileSync(path.join(runtime, "database.json"), "utf8"),
  );
  const candidateDb = new pg.Client({
    ...config,
    user: os.userInfo().username,
  });
  await candidateDb.connect();
  try {
    await candidateDb.query(
      fs.readFileSync(
        path.join(root, "database/proposals/customer-connectors.sql"),
        "utf8",
      ),
    );
  } finally {
    await candidateDb.end();
  }
  const log = fs.openSync(path.join(runtime, "application.log"), "w", 0o600);
  child = spawn(
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
  let ready = false;
  for (let i = 0; i < 90; i++) {
    if (child.exitCode !== null) throw Error("Local application exited");
    try {
      const r = await fetch(`${env.KXRA_ORIGIN}/api/health`, {
        signal: AbortSignal.timeout(2000),
      });
      if (r.ok && (await r.json()).run_id === env.KXRA_CI_RUN_ID) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!ready) throw Error("Local application not ready");
  run([
    "node_modules/tsx/dist/cli.mjs",
    "--test",
    "--test-concurrency=1",
    "tests/connectors/customer-connectors.test.ts",
    "tests/connectors/production-boundary.test.ts",
    "tests/connectors/adapter.test.ts",
    "tests/connectors/customer-connections-browser.test.ts",
  ]);
  run(["scripts/verify-migrations.mjs"]);
  console.log("Customer connector disposable proof PASS");
  console.log(`Synthetic browser evidence: ${runtime}`);
} catch (error) {
  console.error(error.message);
  console.error(`Local diagnostics: ${runtime}`);
  process.exitCode = 1;
} finally {
  if (child && child.exitCode === null) {
    child.kill("SIGTERM");
    await new Promise((resolve) => {
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        resolve();
      }, 5000);
      child.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }
  const stopped = spawnSync(
    process.execPath,
    ["scripts/database.mjs", "stop"],
    { cwd: root, env, stdio: "inherit" },
  );
  if (stopped.status !== 0) process.exitCode = 1;
  for (const [p, content] of generated) {
    if (content === null) fs.rmSync(p, { force: true });
    else fs.writeFileSync(p, content);
  }
  fs.rmSync(path.join(root, "apps/os", env.KXRA_NEXT_DIST_DIR), {
    recursive: true,
    force: true,
  });
}
