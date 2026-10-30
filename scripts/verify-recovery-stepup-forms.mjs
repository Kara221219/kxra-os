// Production-rendered UI with synthetic intercepted API responses only.
import { chromium } from "@playwright/test";
import { applicationNext } from "./application-next.mjs";
import {
  recoveryBrowserLaunchOptions,
  recoveryBrowserFailureCategory,
} from "./recovery-ui-browser.mjs";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import crypto from "node:crypto";
import assert from "node:assert/strict";
const root = path.resolve(import.meta.dirname, "..");
const owned = fs.mkdtempSync(path.join(os.tmpdir(), "kxra-recovery-ui-"));
for (const dir of ["home", "tmp", "xdg"])
  fs.mkdirSync(path.join(owned, dir), { mode: 0o700 });
const listener = net.createServer();
await new Promise((r) => listener.listen(0, "127.0.0.1", r));
const port = listener.address().port;
await new Promise((r) => listener.close(r));
const origin = `http://127.0.0.1:${port}`;
const env = {
  PATH: process.env.PATH,
  HOME: path.join(owned, "home"),
  TMPDIR: path.join(owned, "tmp"),
  XDG_CONFIG_HOME: path.join(owned, "xdg"),
  NODE_ENV: "production",
  NEXT_TELEMETRY_DISABLED: "1",
  KXRA_ORIGIN: origin,
  KXRA_CI_RUN_ID: `synthetic-stepup-${crypto.randomUUID()}`,
};
let server,
  browser,
  browserServer,
  browserPid,
  passed = 0,
  serverExit = null,
  cleanup = false;
let startupBytes = 0;
let routeAnnouncerCollisionObserved = false;
let browserFailureCategory = null;
let activeCase = "STARTUP",
  actionPhase = "STARTUP";
const groupExists = () => {
  if (!server?.pid) return false;
  try {
    process.kill(-server.pid, 0);
    return true;
  } catch (e) {
    if (e.code === "ESRCH") return false;
    throw e;
  }
};
async function bounded(promise, ms) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(Error("CLEANUP_BOUND")), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
function exists(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error.code === "ESRCH") return false;
    throw error;
  }
}
async function absent(pid, ms) {
  const end = Date.now() + ms;
  while ((exists(pid) || exists(-pid)) && Date.now() < end)
    await new Promise((r) => setTimeout(r, 100));
  return !exists(pid) && !exists(-pid);
}
async function stop() {
  let uncertain = false;
  // Independently attempt BOTH owned cleanups even if one fails or times out.
  try {
    if (browser) await bounded(browser.close(), 5000).catch(() => undefined);
    if (browserPid && (exists(browserPid) || exists(-browserPid))) {
      if (browserServer)
        await bounded(browserServer.kill(), 5000).catch(() => undefined);
      if (exists(-browserPid)) process.kill(-browserPid, "SIGKILL");
      else if (exists(browserPid)) process.kill(browserPid, "SIGKILL");
      if (!(await absent(browserPid, 3000))) uncertain = true;
    }
  } catch {
    uncertain = true;
  }
  try {
    if (server?.pid && (exists(server.pid) || groupExists())) {
      if (groupExists()) process.kill(-server.pid, "SIGTERM");
      else process.kill(server.pid, "SIGTERM");
      if (!(await absent(server.pid, 10000))) {
        if (groupExists()) process.kill(-server.pid, "SIGKILL");
        else if (exists(server.pid)) process.kill(server.pid, "SIGKILL");
      }
      if (!(await absent(server.pid, 3000))) uncertain = true;
    }
  } catch {
    uncertain = true;
  }
  if (uncertain) throw Error("OWNED_CLEANUP_UNCERTAIN");
  if (browserPid)
    assert.equal(
      await absent(browserPid, 1000),
      true,
      "OWNED_BROWSER_CLEANUP_UNCERTAIN",
    );
  if (server?.pid)
    assert.equal(
      await absent(server.pid, 1000),
      true,
      "OWNED_SERVER_CLEANUP_UNCERTAIN",
    );
  cleanup = true;
  fs.rmSync(owned, { recursive: true });
}
async function scenario(viewport, name, responses, action) {
  activeCase = name;
  actionPhase = "NEW_CONTEXT";
  const context = await bounded(
    browser.newContext({
      viewport,
      serviceWorkers: "block",
    }),
    10000,
  );
  let requestViolation = false;
  await context.routeWebSocket("**/*", (ws) => ws.close());
  let page;
  const requests = [];
  await context.route("**/*", async (route) => {
    const req = route.request();
    const u = new URL(req.url());
    if (u.origin !== origin) return route.abort();
    if (req.method() === "POST") {
      if (u.pathname !== "/api/password-reset") {
        requestViolation = true;
        await route.abort();
        return;
      }
      requests.push(req.postDataJSON());
      const reply = responses.shift();
      if (!reply) {
        requestViolation = true;
        await route.abort();
        return;
      }
      return route.fulfill({
        status: reply.status,
        contentType: "application/json",
        body: JSON.stringify(reply.body),
      });
    }
    if (!["GET", "HEAD"].includes(req.method())) {
      requestViolation = true;
      return route.abort();
    }
    if (
      ![
        "/",
        "/reset-password",
        "/login",
        "/api/health",
        "/favicon.ico",
      ].includes(u.pathname) &&
      !u.pathname.startsWith("/_next/static/")
    )
      return route.abort();
    return route.continue();
  });
  page = await context.newPage();
  page.setDefaultTimeout(30000);
  context.on("page", (extra) => {
    if (extra !== page) {
      requestViolation = true;
      void extra.close();
    }
  });
  try {
    actionPhase = "NAVIGATION";
    await page.goto(
      `${origin}/reset-password?intent=synthetic-intent#type=recovery&access_token=synthetic-access&refresh_token=synthetic-refresh`,
    );
    await page.getByLabel("New password", { exact: true }).waitFor();
    assert.equal(new URL(page.url()).search, "");
    assert.equal(new URL(page.url()).hash, "");
    actionPhase = "CASE_ACTION";
    await action(page, requests);
    actionPhase = "RESPONSE_COUNT";
    assert.equal(responses.length, 0);
    assert.equal(requestViolation, false, "UNEXPECTED_REQUEST_ABORTED");
    passed++;
  } finally {
    await context.close();
  }
}
try {
  server = spawn(
    process.execPath,
    [
      applicationNext("os").binary,
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(port),
    ],
    {
      cwd: path.join(root, "apps/os"),
      env,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  server.on("exit", (code) => (serverExit = code));
  for (const pipe of [server.stdout, server.stderr])
    pipe.on("data", (data) => {
      startupBytes += data.length;
      if (startupBytes > 1024 * 1024 && groupExists())
        process.kill(-server.pid, "SIGTERM");
    });
  const startEnd = Date.now() + 30000;
  let ready = false;
  while (Date.now() < startEnd) {
    if (serverExit !== null) throw Error("LOCAL_SERVER_EXIT");
    try {
      const r = await fetch(origin + "/api/health", {
        signal: AbortSignal.timeout(1000),
      });
      const body = await r.json();
      if (body.run_id === env.KXRA_CI_RUN_ID) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 150));
  }
  assert.ok(ready, "LOCAL_SERVER_STARTUP_BOUND");
  actionPhase = "BROWSER_LAUNCH";
  try {
    browserServer = await chromium.launchServer(
      recoveryBrowserLaunchOptions(
        process.platform,
        process.env.GITHUB_ACTIONS,
        env,
      ),
    );
  } catch (error) {
    browserFailureCategory = recoveryBrowserFailureCategory(error);
    throw Error("BROWSER_STARTUP_FAILED");
  }
  browserPid = browserServer.process().pid;
  actionPhase = "BROWSER_CONNECT";
  try {
    browser = await bounded(
      chromium.connect(browserServer.wsEndpoint()),
      10000,
    );
  } catch (error) {
    browserFailureCategory = recoveryBrowserFailureCategory(error);
    throw Error("BROWSER_STARTUP_FAILED");
  }
  const run = async () => {
    for (const viewport of [
      { width: 1280, height: 800 },
      { width: 390, height: 844 },
    ]) {
      const fill = async (page) => {
        await page
          .getByLabel("New password", { exact: true })
          .fill("SyntheticPassword12345");
        await page
          .getByLabel("Confirm new password", { exact: true })
          .fill("SyntheticPassword12345");
      };
      await scenario(
        viewport,
        "mfa",
        [
          {
            status: 409,
            body: {
              error: "Verify your existing authenticator to continue",
              recoveryStep: "TOTP",
            },
          },
          { status: 200, body: { next: "/login?reset=1" } },
        ],
        async (page, requests) => {
          await fill(page);
          await page.getByRole("button", { name: "Set new password" }).click();
          await page.getByLabel("Existing authenticator code").fill("123456");
          assert.equal(requests.length, 1);
          await page.getByRole("button", { name: "Set new password" }).click();
          await page.waitForURL(origin + "/login?reset=1");
          assert.equal(requests.length, 2);
          assert.equal(requests[1].mfaCode, "123456");
          assert.equal(requests[1].accessToken, "synthetic-access");
        },
      );
      await scenario(
        viewport,
        "nonce",
        [
          {
            status: 409,
            body: {
              error: "Additional email verification is required",
              recoveryStep: "NONCE",
            },
          },
          { status: 202, body: { accepted: true } },
          { status: 200, body: { next: "/login?reset=1" } },
        ],
        async (page, requests) => {
          await fill(page);
          await page.getByRole("button", { name: "Set new password" }).click();
          await page
            .getByRole("button", { name: "Send verification code" })
            .waitFor();
          assert.equal(requests.length, 1);
          assert.equal(
            await page
              .getByRole("button", { name: "Set new password" })
              .isDisabled(),
            true,
          );
          await page
            .getByRole("button", { name: "Send verification code" })
            .click();
          await page.getByLabel("Email verification code").fill("654321");
          assert.equal(requests[1].action, "reauthenticate");
          assert.equal(requests[1].password, undefined);
          assert.equal(requests[1].mfaCode, undefined);
          await page.getByRole("button", { name: "Set new password" }).click();
          await page.waitForURL(origin + "/login?reset=1");
          assert.equal(requests[2].nonce, "654321");
        },
      );
      await scenario(
        viewport,
        "mfa-reject",
        [
          {
            status: 409,
            body: {
              error: "Verify your existing authenticator to continue",
              recoveryStep: "TOTP",
            },
          },
          {
            status: 409,
            body: {
              error: "Verify your existing authenticator to continue",
              recoveryStep: "TOTP",
            },
          },
        ],
        async (page, requests) => {
          actionPhase = "REJECT_FIRST_SUBMIT";
          await fill(page);
          await page.getByRole("button", { name: "Set new password" }).click();
          actionPhase = "REJECT_CODE_FILL";
          await page.getByLabel("Existing authenticator code").fill("000000");
          await page.getByRole("button", { name: "Set new password" }).click();
          actionPhase = "REJECT_ALERT";
          routeAnnouncerCollisionObserved ||=
            (await page.getByRole("alert").count()) > 1;
          await page.locator('form [role="alert"]').waitFor();
          assert.equal(
            await page.locator('form [role="alert"]').textContent(),
            "Verify your existing authenticator to continue",
          );
          actionPhase = "REJECT_CODE_CLEAR";
          await page.waitForFunction(
            () => document.querySelector('[name="mfaCode"]').value === "",
          );
          actionPhase = "REJECT_COUNT";
          assert.equal(requests.length, 2);
          assert.equal(new URL(page.url()).pathname, "/reset-password");
        },
      );
    }
  };
  let timer;
  try {
    await Promise.race([
      run(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(Error("BROWSER_PROOF_BOUND")), 180000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
  await stop();
  console.log(
    JSON.stringify({
      status: "SYNTHETIC_PRODUCTION_UI_PASS",
      cases: passed,
      providerProtocol: "SYNTHETIC_INTERCEPTED_ONLY",
      realEmailsRequested: 0,
      serverEgressMeasured: false,
      routeAnnouncerCollisionObserved,
      nativeChromiumSandbox: true,
      ownedServerAbsent: true,
      ownedBrowserGroupAbsent: true,
      ownedDirectoriesRemoved: cleanup,
      artifactsRetained: false,
    }),
  );
} catch (error) {
  try {
    await stop();
  } catch {
    console.log(
      JSON.stringify({ status: "FAILED_CLEANUP_UNCERTAIN", cases: passed }),
    );
    process.exitCode = 1;
  }
  if (!process.exitCode) {
    console.log(
      JSON.stringify({
        status: "SYNTHETIC_PRODUCTION_UI_FAILED",
        cases: passed,
        category: [
          "LOCAL_SERVER_STARTUP_BOUND",
          "LOCAL_SERVER_EXIT",
          "BROWSER_PROOF_BOUND",
          "OWNED_SERVER_CLEANUP_UNCERTAIN",
        ].includes(error.message)
          ? error.message
          : "LOCAL_UI_ASSERTION_OR_LAUNCH_FAILED",
        activeCase,
        actionPhase,
        errorCategory:
          error.name === "TimeoutError"
            ? "TIMEOUT"
            : error.code === "ERR_ASSERTION"
              ? "ASSERTION"
              : "OTHER",
        rawErrorDiscarded: true,
        browserFailureCategory,
        cleanupVerified: cleanup,
      }),
    );
    process.exitCode = 1;
  }
}
