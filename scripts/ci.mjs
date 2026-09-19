import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const runtime = path.join(root, ".runtime", "ci");

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

function run(command, args, environment) {
  const result = spawnSync(command, args, {
    cwd: root,
    env: environment,
    stdio: "inherit",
  });
  if (result.status !== 0)
    throw Error(`${command} ${args.join(" ")} failed with ${result.status}`);
}

async function waitForServer(origin, child) {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null)
      throw Error(`Application exited before readiness (${child.exitCode})`);
    try {
      const response = await fetch(`${origin}/login`, {
        signal: AbortSignal.timeout(1500),
      });
      const body = await response.text();
      if (response.ok && body.includes("KXRA")) return;
    } catch {
      // Readiness is bounded by the deadline below.
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw Error("Application readiness timed out");
}

fs.rmSync(runtime, { recursive: true, force: true });
fs.mkdirSync(runtime, { recursive: true, mode: 0o700 });

const [postgresPort, applicationPort] = await Promise.all([
  availablePort(),
  availablePort(),
]);
const origin = `http://127.0.0.1:${applicationPort}`;
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
  KXRA_RUNTIME: runtime,
  KXRA_PG_PORT: String(postgresPort),
  KXRA_LOCAL_SECRET: crypto.randomBytes(48).toString("hex"),
});
fs.writeFileSync(
  path.join(runtime, "session-key"),
  environment.KXRA_LOCAL_SECRET,
  { mode: 0o600 },
);

let application;
let logHandle;
try {
  run(process.execPath, ["scripts/database.mjs", "start"], environment);
  logHandle = fs.openSync(path.join(runtime, "application.log"), "w");
  application = spawn(
    process.execPath,
    [
      path.join(root, "node_modules", "next", "dist", "bin", "next"),
      "dev",
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
  await waitForServer(origin, application);

  run("npm", ["run", "lint"], environment);
  run("npm", ["test"], environment);
  run("npm", ["run", "test:migrations"], environment);
  run("npm", ["run", "test:e2e"], environment);
  run("npm", ["run", "test:restart"], environment);

  const productionEnvironment = { ...environment, NODE_ENV: "production" };
  delete productionEnvironment.KXRA_AUTH_MODE;
  delete productionEnvironment.KXRA_LOCAL_SECRET;
  delete productionEnvironment.KXRA_RUNTIME;
  delete productionEnvironment.KXRA_PG_PORT;
  run("npm", ["run", "build"], productionEnvironment);
  run("npm", ["run", "test:artifact"], productionEnvironment);
  run("npm", ["run", "test:secrets"], productionEnvironment);
  console.log(
    `Hermetic CI PASS using disposable PostgreSQL ${postgresPort} and application ${applicationPort}.`,
  );
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
  if (logHandle !== undefined) fs.closeSync(logHandle);
  const stopped = spawnSync(
    process.execPath,
    ["scripts/database.mjs", "stop"],
    { cwd: root, env: environment, stdio: "inherit" },
  );
  if (stopped.status !== 0)
    console.error("Disposable PostgreSQL cleanup did not complete cleanly");
}
