// Local production-artifact proof. No database, provider credentials or new keys.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import { applicationNext } from "./application-next.mjs";
const root = path.resolve(import.meta.dirname, "..");
const runtime = fs.mkdtempSync("/tmp/kxra-connector-production-");
fs.chmodSync(runtime, 0o700);
const listener = net.createServer();
await new Promise((resolve, reject) => {
  listener.once("error", reject);
  listener.listen(0, "127.0.0.1", resolve);
});
const port = listener.address().port;
await new Promise((resolve) => listener.close(resolve));
const origin = `http://127.0.0.1:${port}`;
const env = {
  ...process.env,
  NODE_ENV: "production",
  KXRA_ORIGIN: origin,
  KXRA_RUNTIME: runtime,
};
for (const key of Object.keys(env))
  if (
    /SECRET|TOKEN|PASSWORD|API_KEY/.test(key) ||
    [
      "DATABASE_URL",
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      "KXRA_AUTH_MODE",
      "KXRA_NEXT_DIST_DIR",
      "VERCEL",
      "VERCEL_ENV",
    ].includes(key)
  )
    delete env[key];
const log = fs.openSync(path.join(runtime, "application.log"), "w", 0o600);
const child = spawn(
  process.execPath,
  [
    applicationNext("os").binary,
    "start",
    "--hostname",
    "127.0.0.1",
    "--port",
    String(port),
  ],
  { cwd: path.join(root, "apps/os"), env, stdio: ["ignore", log, log] },
);
fs.closeSync(log);
try {
  let response;
  for (let i = 0; i < 90; i++) {
    if (child.exitCode !== null) throw Error("Production server exited");
    try {
      response = await fetch(`${origin}/os/connections`, {
        signal: AbortSignal.timeout(2000),
      });
      break;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  assert.ok(response, "Production server readiness failed");
  assert.equal(response.status, 404);
  const html = await response.text();
  for (const text of [
    "Connect Mock Notes",
    "Allow approved note writes",
    "Local mock preview",
  ])
    assert.equal(html.includes(text), false);
  const agent = await fetch(`${origin}/api/customer-connectors/agent`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
    signal: AbortSignal.timeout(5000),
  });
  assert.equal(agent.status, 503);
  const customer = await fetch(`${origin}/api/customer-connectors`, {
    signal: AbortSignal.timeout(5000),
  });
  assert.equal(customer.status, 401);
  console.log(
    "Production connector boundary PASS (page 404, no mock UI, agent API 503, unauthenticated customer API 401; no database or provider configured).",
  );
} catch (error) {
  console.error(error.message);
  console.error(`Local diagnostics: ${runtime}`);
  process.exitCode = 1;
} finally {
  if (child.exitCode === null) {
    child.kill("SIGTERM");
    await new Promise((resolve) => {
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        process.exitCode = 1;
        resolve();
      }, 5000);
      child.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }
}
