import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import os from "node:os";
import net from "node:net";
import { spawn, spawnSync } from "node:child_process";
const flags = process.argv.slice(2);
if (flags.length && flags.join(" ") !== "--regression")
  throw Error("Use no argument or --regression");
const regression = flags.length === 1;
const root = path.resolve(import.meta.dirname, ".."),
  runtime = fs.mkdtempSync(
    path.join(
      process.platform === "darwin" ? "/tmp" : os.tmpdir(),
      "kxra-room-",
    ),
  );
process.chdir(root);
function port() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once("error", reject);
    s.listen(0, "127.0.0.1", () => {
      const p = s.address().port;
      s.close(() => resolve(p));
    });
  });
}
const appPort = await port(),
  pgPort = await port();
fs.mkdirSync(runtime, { recursive: true, mode: 0o700 });
const env = {
  ...Object.fromEntries(
    [
      "PATH",
      "HOME",
      "TMPDIR",
      "USER",
      "LOGNAME",
      "SHELL",
      "KXRA_PG_BIN",
    ].flatMap((key) => (process.env[key] ? [[key, process.env[key]]] : [])),
  ),
  LC_ALL: "C",
  LANG: "C",
  NODE_ENV: "development",
  KXRA_CI_RUN_ID: crypto.randomUUID(),
  KXRA_AUTH_MODE: "fixture",
  KXRA_ORIGIN: `http://127.0.0.1:${appPort}`,
  KXRA_RUNTIME: runtime,
  KXRA_PG_PORT: String(pgPort),
  KXRA_LOCAL_SECRET: crypto.randomBytes(48).toString("hex"),
  KXRA_NEXT_DIST_DIR: ".next-room-maintenance",
};
for (const key of [
  "VERCEL",
  "VERCEL_ENV",
  "DATABASE_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
])
  delete env[key];
fs.writeFileSync(runtime + "/session-key", env.KXRA_LOCAL_SECRET, {
  mode: 0o600,
});
function run(args) {
  let r = spawnSync(process.execPath, args, { env, stdio: "inherit" });
  if (r.status !== 0) throw Error(args.join(" ") + " failed " + r.status);
}
async function runTests(args) {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      env,
      stdio: "inherit",
      detached: process.platform !== "win32",
    });
    const timer = setTimeout(() => {
      try {
        if (process.platform !== "win32") process.kill(-child.pid, "SIGTERM");
        else child.kill("SIGTERM");
      } catch {}
    }, 180000);
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      code === 0
        ? resolve()
        : reject(Error(`Synthetic test process failed (${code})`));
    });
  });
}
console.log("Synthetic fixture runtime:", runtime);
const generated = ["apps/os/next-env.d.ts", "apps/os/tsconfig.json"].map(
  (f) => [f, fs.readFileSync(f)],
);
run(["scripts/database.mjs", "start"]);
const log = fs.openSync(runtime + "/application.log", "w");
const { applicationNext } = await import(
  root + "/scripts/application-next.mjs"
);
const app = applicationNext("os");
const server = spawn(
  process.execPath,
  [
    app.binary,
    "dev",
    ...app.webpackArguments,
    "--hostname",
    "127.0.0.1",
    "--port",
    String(appPort),
  ],
  { cwd: root + "/apps/os", env, stdio: ["ignore", log, log] },
);
try {
  let ready = false;
  for (let i = 0; i < 180; i++) {
    try {
      if (
        (
          await fetch(env.KXRA_ORIGIN + "/api/health", {
            signal: AbortSignal.timeout(1500),
          })
        ).ok
      ) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  if (!ready) throw Error("readiness failed");
  if (regression) {
    run(["--import", "tsx", "scripts/prepare-room-operations-fixture.ts"]);
  }
  await runTests([
    "--import",
    "tsx",
    "--test",
    "--test-concurrency=1",
    ...(regression
      ? [
          "tests/team-jobs-http.test.ts",
          "tests/team-schedules-http.test.ts",
          "tests/team-provider.test.ts",
        ]
      : [
          "tests/operations/room-maintenance.test.ts",
          "tests/operations/room-maintenance-boundary.test.ts",
        ]),
  ]);
} finally {
  server.kill("SIGTERM");
  run(["scripts/database.mjs", "stop"]);
  for (const [file, content] of generated) fs.writeFileSync(file, content);
}
