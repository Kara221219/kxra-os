// Exact built artifact, loopback only, no identity/database/provider configuration.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import crypto from "node:crypto";
import { spawn, execFileSync } from "node:child_process";
import { stopOwnedFixtureChild } from "./owned-fixture-child.mjs";
import { applicationNext } from "./application-next.mjs";
const root = fs.realpathSync(path.resolve(import.meta.dirname, ".."));
const runtime = fs.realpathSync(fs.mkdtempSync("/tmp/kxra-paired-production-"));
fs.chmodSync(runtime, 0o700);
const source = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: root,
  encoding: "utf8",
}).trim();
function scan(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    assert.ok(!entry.isSymbolicLink());
    if (entry.isDirectory()) scan(file);
    else if (entry.name.endsWith(".js")) {
      const text = fs.readFileSync(file, "utf8");
      for (const marker of [
        "PAIRED_SETUP_UI_FIXTURE_V1",
        "kxra_paired_setup_fixture",
      ])
        assert.equal(
          text.includes(marker),
          false,
          "FIXTURE_COOKIE_IN_PRODUCTION_CLIENT",
        );
    }
  }
}
scan(path.join(root, "apps/os/.next/static"));
const listener = net.createServer();
await new Promise((resolve, reject) => {
  listener.once("error", reject);
  listener.listen(0, "127.0.0.1", resolve);
});
const port = listener.address().port;
await new Promise((resolve) => listener.close(resolve));
const origin = `http://127.0.0.1:${port}`;
const runId = crypto.randomUUID();
const env = {
  PATH: process.env.PATH,
  HOME: runtime,
  USER: process.env.USER,
  TMPDIR: process.env.TMPDIR,
  NODE_ENV: "production",
  KXRA_CI_RUN_ID: runId,
  NEXT_TELEMETRY_DISABLED: "1",
  KXRA_AUTH_MODE: "fixture",
  KXRA_PAIRED_SETUP_UI_PROOF: "1",
  KXRA_ORIGIN: origin,
  KXRA_RUNTIME: runtime,
  KXRA_LOCAL_SECRET: crypto.randomBytes(48).toString("hex"),
};
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
let passed = false;
try {
  let ready = false;
  for (let i = 0; i < 90; i++) {
    assert.equal(child.exitCode, null, "OWNED_PRODUCTION_SERVER_EXITED");
    try {
      const response = await fetch(origin + "/api/health", {
        signal: AbortSignal.timeout(1000),
      });
      if ((await response.json()).run_id === runId) {
        ready = true;
        break;
      }
    } catch (error) {
      if (error.code === "ERR_ASSERTION") throw error;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  assert.ok(ready, "PRODUCTION_GUARD_NOT_READY");
  const denied = await fetch(origin + "/api/paired-setup", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ action: "OPTIONS" }),
    signal: AbortSignal.timeout(5000),
  });
  assert.equal(denied.status, 503);
  const page = await fetch(origin + "/os/paired-setup", {
      signal: AbortSignal.timeout(5000),
    }),
    html = await page.text();
  assert.equal(page.status, 200);
  assert.ok(html.includes("Private agent setup is paused"));
  assert.equal(html.includes("Save setup request"), false);
  passed = true;
} finally {
  const absent = await stopOwnedFixtureChild(child, {
    termMs: 3000,
    killMs: 1000,
  });
  const portFree = await new Promise((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port });
    socket.setTimeout(1000);
    socket.once("connect", () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("error", (error) => {
      socket.destroy();
      resolve(error.code === "ECONNREFUSED");
    });
  });
  fs.writeFileSync(
    path.join(runtime, "receipt.json"),
    JSON.stringify(
      {
        source,
        passed,
        apiStatus: passed ? 503 : null,
        pageStatus: passed ? 200 : null,
        formRendered: passed ? false : null,
        fixtureCookieInClient: false,
        ownedServerAbsent: absent,
        portFree,
        clean: absent && portFree,
        runId,
        realProviderCalls: 0,
        hostedChanges: false,
      },
      null,
      2,
    ) + "\n",
  );
  assert.ok(absent && portFree, "OWNED_PRODUCTION_CLEANUP_UNCONFIRMED");
}
assert.ok(passed);
console.log("PAIRED_SETUP_PRODUCTION_DENIAL_PASS " + source + " " + runtime);
