import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
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
      if (response.ok && body.run_id === runId) return;
    } catch {
      // Readiness is bounded by the deadline below.
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw Error("Application readiness timed out");
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
  await waitForServer(origin, application, runId);
  marketingLogHandle = fs.openSync(path.join(runtime, "marketing.log"), "w");
  marketing = spawn(
    process.execPath,
    [
      path.join(root, "node_modules", "next", "dist", "bin", "next"),
      "dev",
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

  run("npm", ["run", "lint"], environment);
  run("npm", ["run", "test:dependencies"], environment);
  run("npm", ["test"], environment);
  run("npm", ["run", "test:migrations"], environment);
  run("npm", ["run", "test:publication"], environment);
  run("npm", ["run", "test:marketing-boundary"], environment);
  run("npm", ["run", "test:e2e"], environment);
  run("npm", ["run", "test:marketing"], environment);
  run("npm", ["run", "test:restart"], environment);
  run("npm", ["run", "test:restore"], environment);

  const productionEnvironment = { ...environment, NODE_ENV: "production" };
  delete productionEnvironment.KXRA_AUTH_MODE;
  delete productionEnvironment.KXRA_LOCAL_SECRET;
  delete productionEnvironment.KXRA_RUNTIME;
  delete productionEnvironment.KXRA_PG_PORT;
  run("npm", ["run", "build"], productionEnvironment);
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
    path.join(runtime, "marketing-production.log"),
    "w",
  );
  productionMarketing = spawn(
    process.execPath,
    [
      path.join(root, "node_modules", "next", "dist", "bin", "next"),
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
  run("npm", ["run", "test:marketing-performance"], productionTestEnvironment);
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
  const stopped = spawnSync(
    process.execPath,
    ["scripts/database.mjs", "stop"],
    { cwd: root, env: environment, stdio: "inherit" },
  );
  if (stopped.status !== 0)
    console.error("Disposable PostgreSQL cleanup did not complete cleanly");
}
