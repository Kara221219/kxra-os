import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import net from "node:net";
import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import type pg from "pg";
import {
  chromium,
  expect,
  type Browser,
  type BrowserServer,
} from "@playwright/test";
import { applicationNext } from "./application-next.mjs";
import {
  pairedSetupFixtureCookie,
  signPairedSetupFixture,
} from "../packages/workspace/paired-setup-fixture";
export async function runPairedSetupUiProof(p: {
  root: string;
  runtime: string;
  env: NodeJS.ProcessEnv;
  admin: pg.Client;
  actor: {
    id: string;
    organisation_id: string;
    session_version: number;
    aal: "aal2";
    auth_time: number;
    source: "supabase";
  };
  room: string;
  intent: string;
  refresh(): Promise<unknown>;
  check(name: string, fn: () => Promise<void>): Promise<void>;
  write(name: string, v: unknown): void;
}) {
  const { admin, check, write } = p,
    origin = p.env.KXRA_ORIGIN!,
    runId = crypto.randomUUID(),
    env: NodeJS.ProcessEnv = {
      ...p.env,
      NEXT_TELEMETRY_DISABLED: "1",
      KXRA_PAIRED_SETUP_UI_PROOF: "1",
      KXRA_CI_RUN_ID: runId,
      KXRA_NEXT_DIST_DIR: ".next-setup-ui-" + runId,
    };
  fs.chmodSync(path.join(p.runtime, "database.json"), 0o600);
  if (process.env.KXRA_PAIRED_COMPOSITION_PROOF !== "1") {
    await admin.query(
      fs.readFileSync(
        "database/production/paired-setup-options-v1.sql",
        "utf8",
      ),
    );
  }
  const cookie = signPairedSetupFixture(p.actor, env);
  let app: ChildProcess | undefined,
    browser: Browser | undefined,
    server: BrowserServer | undefined;
  let browserClean = true,
    appClean = true,
    browserLaunchAttempted = false,
    browserRejectedBeforeStart = false,
    browserClientCloseAcknowledged = true;
  write("setup-ui-started.json", {
    source: execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim(),
    origin,
  });
  const groupAlive = (pid: number) =>
    execFileSync("/bin/ps", ["-axo", "pgid=,stat="], {
      encoding: "utf8",
      timeout: 2000,
    })
      .split("\n")
      .some((row) => {
        const [g, state] = row.trim().split(/\s+/);
        return Number(g) === pid && !state?.startsWith("Z");
      });
  async function stopApp() {
    if (!app?.pid) return true;
    const pid = app.pid;
    for (const [signal, ms] of [
      ["SIGTERM", 3000],
      ["SIGKILL", 2000],
    ] as const) {
      if (!groupAlive(pid)) return true;
      try {
        process.kill(-pid, signal);
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ESRCH") return false;
      }
      const end = Date.now() + ms;
      while (Date.now() < end) {
        if (!groupAlive(pid)) return true;
        await new Promise((r) => setTimeout(r, 50));
      }
    }
    return !groupAlive(pid);
  }
  try {
    const log = fs.openSync(
        path.join(p.runtime, "setup-ui-next.log"),
        "a",
        0o600,
      ),
      next = applicationNext("os", p.root);
    app = spawn(
      process.execPath,
      [
        next.binary,
        "dev",
        ...next.webpackArguments,
        "--hostname",
        "127.0.0.1",
        "--port",
        new URL(origin).port,
      ],
      {
        cwd: path.join(p.root, "apps/os"),
        env,
        detached: true,
        stdio: ["ignore", log, log],
      },
    );
    fs.closeSync(log);
    write("setup-ui-started.json", {
      source: execFileSync("git", ["rev-parse", "HEAD"], {
        encoding: "utf8",
      }).trim(),
      origin,
      next_pid: app.pid,
      next_pgid: app.pid,
    });
    let ready = false;
    const end = Date.now() + 90000;
    while (Date.now() < end) {
      if (app.exitCode !== null) throw Error("OWNED_NEXT_EXITED");
      try {
        const response = await fetch(origin + "/api/health", {
          signal: AbortSignal.timeout(1000),
        });
        if ((await response.json()).run_id === runId) {
          ready = true;
          break;
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 250));
    }
    assert.ok(ready, "OWNED_NEXT_READINESS_TIMEOUT");
    browserLaunchAttempted = true;
    try {
      server = await chromium.launchServer({
        headless: true,
        args: [
          "--disable-background-networking",
          "--disable-component-update",
          "--disable-sync",
        ],
      });
    } catch (error) {
      browserRejectedBeforeStart = /Executable doesn't exist/.test(
        String(error),
      );
      throw error;
    }
    browser = await chromium.connect(server.wsEndpoint());
    await check(
      "actual route rejects unauthenticated, foreign-origin and purpose-confused cookies",
      async () => {
        const call = async (
          body: unknown,
          headers: Record<string, string> = {},
        ) =>
          fetch(origin + "/api/paired-setup", {
            method: "POST",
            headers: { origin, "content-type": "application/json", ...headers },
            body: JSON.stringify(body),
          });
        assert.equal((await call({ action: "OPTIONS" })).status, 401);
        assert.equal(
          (
            await call(
              { action: "OPTIONS" },
              { authorization: "Bearer SYNTHETIC_DEVICE_PURPOSE" },
            )
          ).status,
          401,
        );
        assert.equal(
          (
            await call(
              { action: "OPTIONS" },
              {
                cookie: pairedSetupFixtureCookie + "=" + cookie,
                origin: "https://foreign.invalid",
              },
            )
          ).status,
          403,
        );
        assert.equal(
          (
            await call(
              { action: "OPTIONS", account_id: p.actor.id },
              { cookie: pairedSetupFixtureCookie + "=" + cookie },
            )
          ).status,
          400,
        );
        const response = await call(
          { action: "OPTIONS" },
          { cookie: pairedSetupFixtureCookie + "=" + cookie },
        );
        assert.equal(response.status, 200);
        const options = await response.json();
        assert.ok(options.rooms.some((r: { id: string }) => r.id === p.room));
        assert.ok(
          options.ai_intents.some((a: { id: string }) => a.id === p.intent),
        );
      },
    );
    for (const viewport of [
      { width: 1440, height: 1000 },
      { width: 390, height: 844 },
    ]) {
      const context = await browser.newContext({
        baseURL: origin,
        viewport,
        serviceWorkers: "block",
      });
      const errors: string[] = [];
      await context.route("**/*", (route) =>
        new URL(route.request().url()).origin === origin
          ? route.continue()
          : route.abort(),
      );
      await context.addCookies([
        {
          name: pairedSetupFixtureCookie,
          value: cookie,
          url: origin,
          httpOnly: true,
          sameSite: "Strict",
        },
      ]);
      const page = await context.newPage();
      page.on("pageerror", (e) => errors.push(e.message));
      try {
        await check(
          "browser " +
            viewport.width +
            " saves, reloads and cancels exactly one disabled request",
          async () => {
            await page.goto("/os/paired-setup");
            await expect(
              page.getByRole("heading", {
                name: "Prepare a private agent",
                exact: true,
              }),
            ).toBeVisible();
            await expect(
              page.getByRole("button", { name: "Save setup request" }),
            ).toBeVisible();
            await page
              .getByLabel("Private agent name", { exact: true })
              .focus();
            await page.keyboard.press("Tab");
            await expect(
              page.getByLabel("Room", { exact: true }),
            ).toBeFocused();
            await p.refresh();
            const label = "Browser setup " + viewport.width;
            await page
              .getByLabel("Private agent name", { exact: true })
              .fill(label);
            await page.getByLabel("Room", { exact: true }).selectOption(p.room);
            await page
              .getByLabel("AI model request", { exact: true })
              .selectOption(p.intent);
            await page
              .getByRole("button", { name: "Save setup request", exact: true })
              .click();
            const card = page.getByRole("article", {
              name: "Setup request " + label,
              exact: true,
            });
            await expect(card).toBeVisible();
            await expect(
              card.getByText("Reviews are current. Setup remains paused.", {
                exact: true,
              }),
            ).toBeVisible();
            const rows = (
              await admin.query(
                "select s.id,a.enabled from kxra_paired_admission.setup_requests s join kxra_paired_admission.agents a on a.id=s.agent_id where s.org_id=$1 and s.label=$2",
                [p.actor.organisation_id, label],
              )
            ).rows;
            assert.equal(rows.length, 1);
            assert.equal(rows[0].enabled, false);
            await page.reload();
            await expect(card).toBeVisible();
            await card.getByRole("button", { name: "Refresh status" }).click();
            await expect(
              card.getByText("Reviews are current. Setup remains paused.", {
                exact: true,
              }),
            ).toBeVisible();
            assert.equal(
              await page.evaluate(
                () => document.documentElement.scrollWidth > window.innerWidth,
              ),
              false,
            );
            assert.ok(!(await page.content()).includes(env.KXRA_LOCAL_SECRET!));
            await page.screenshot({
              path: path.join(p.runtime, "setup-ui-" + viewport.width + ".png"),
              fullPage: true,
            });
            await card.getByRole("button", { name: "Cancel request" }).click();
            await expect(
              card.getByText("This request is cancelled.", { exact: true }),
            ).toBeVisible();
            await expect(
              card.getByRole("button", { name: "Cancel request" }),
            ).toBeDisabled();
            assert.equal(
              (
                await admin.query(
                  "select count(*)::int n from kxra_paired_admission.devices d join kxra_paired_admission.setup_requests s on s.agent_id=d.agent_id where s.id=$1",
                  [rows[0].id],
                )
              ).rows[0].n,
              0,
            );
          },
        );
        if (viewport.width === 1440)
          await check(
            "browser lost acknowledgement stays held and recovers saved controls without replay",
            async () => {
              await p.refresh();
              const label = "Browser uncertain request",
                other = page.getByRole("article", {
                  name: "Setup request Browser companion request",
                  exact: true,
                });
              await page
                .getByLabel("Private agent name", { exact: true })
                .fill("Browser companion request");
              await page
                .getByRole("button", { name: "Save setup request" })
                .click();
              await expect(
                other.getByRole("button", { name: "Cancel request" }),
              ).toBeEnabled();
              let posts = 0;
              const intercept = async (
                route: import("@playwright/test").Route,
              ) => {
                const body = route.request().postDataJSON();
                if (body.action === "REQUEST" && body.label === label) {
                  posts++;
                  const response = await route.fetch();
                  assert.equal(response.status(), 200);
                  await route.abort("failed");
                } else await route.continue();
              };
              await page.route("**/api/paired-setup", intercept);
              await page
                .getByLabel("Private agent name", { exact: true })
                .fill(label);
              await page
                .getByRole("button", { name: "Save setup request" })
                .click();
              await expect(page.getByRole("status")).toContainText(
                "outcome is unknown",
              );
              await expect(
                page.getByRole("button", { name: "Save setup request" }),
              ).toBeDisabled();
              await expect(
                other.getByRole("button", { name: "Cancel request" }),
              ).toBeDisabled();
              await page
                .getByRole("button", { name: "Check request status" })
                .click();
              const recovered = page.getByRole("article", {
                name: "Setup request " + label,
                exact: true,
              });
              await expect(recovered).toBeVisible();
              await expect(
                recovered.getByRole("button", { name: "Cancel request" }),
              ).toBeEnabled();
              assert.equal(posts, 1);
              assert.equal(
                (
                  await admin.query(
                    "select count(*)::int n from kxra_paired_admission.setup_requests where org_id=$1 and label=$2",
                    [p.actor.organisation_id, label],
                  )
                ).rows[0].n,
                1,
              );
              await page.unroute("**/api/paired-setup", intercept);
              await recovered
                .getByRole("button", { name: "Cancel request" })
                .click();
              await expect(
                recovered.getByText("This request is cancelled.", {
                  exact: true,
                }),
              ).toBeVisible();
            },
          );
        assert.deepEqual(errors, [], "browser runtime/hydration errors");
      } finally {
        await context.close();
      }
    }
    await check(
      "actual route catalog denies stale MFA, revoked session, foreign tenant and missing membership",
      async () => {
        const options = async (token: string) =>
          fetch(origin + "/api/paired-setup", {
            method: "POST",
            headers: {
              origin,
              "content-type": "application/json",
              cookie: pairedSetupFixtureCookie + "=" + token,
            },
            body: JSON.stringify({ action: "OPTIONS" }),
          });
        for (const actor of [
          { ...p.actor, auth_time: p.actor.auth_time - 3600 },
          { ...p.actor, organisation_id: crypto.randomUUID() },
        ])
          assert.equal(
            (await options(signPairedSetupFixture(actor, env))).status,
            403,
          );
        await admin.query(
          "update kxra.account_identities set session_version=2 where account_id=$1",
          [p.actor.id],
        );
        assert.equal((await options(cookie)).status, 403);
        await admin.query(
          "update kxra.account_identities set session_version=1 where account_id=$1",
          [p.actor.id],
        );
        await admin.query(
          "update kxra.team_room_members set active=false where room_id=$1 and account_id=$2",
          [p.room, p.actor.id],
        );
        assert.equal((await options(cookie)).status, 403);
        await admin.query(
          "update kxra.team_room_members set active=true where room_id=$1 and account_id=$2",
          [p.room, p.actor.id],
        );
      },
    );
    write("setup-ui.json", {
      source: execFileSync("git", ["rev-parse", "HEAD"], {
        encoding: "utf8",
      }).trim(),
      widths: [1440, 390],
      pageErrors: [],
      noActivation: true,
      noCredentials: true,
      fixtureSource: "fixture",
      liveAuthentication: false,
    });
  } finally {
    const bounded = async (work: Promise<unknown>) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          work,
          new Promise((_, reject) => {
            timer = setTimeout(
              () => reject(Error("OWNED_BROWSER_CLOSE_TIMEOUT")),
              5000,
            );
          }),
        ]);
      } finally {
        if (timer) clearTimeout(timer);
      }
    };
    try {
      if (browser) await bounded(browser.close());
    } catch {
      browserClientCloseAcknowledged = false;
    }
    // Always stop the server independently, even if client disconnect failed.
    try {
      if (server) await bounded(server.close());
    } catch {}
    if (server) {
      const child = server.process();
      if (child.exitCode === null && child.signalCode === null) {
        try {
          await bounded(server.kill());
        } catch {}
      }
      browserClean =
        (child.exitCode !== null || child.signalCode !== null) &&
        !browser?.isConnected();
    } else if (browserLaunchAttempted && !browserRejectedBeforeStart)
      browserClean = false;
    try {
      appClean = await stopApp();
    } catch {
      appClean = false;
    }
    const portClosed = await new Promise<boolean>((resolve) => {
      const socket = net.createConnection({
        host: "127.0.0.1",
        port: Number(new URL(origin).port),
      });
      socket.once("connect", () => {
        socket.destroy();
        resolve(false);
      });
      socket.once("error", (e) =>
        resolve((e as NodeJS.ErrnoException).code === "ECONNREFUSED"),
      );
      socket.setTimeout(1000, () => {
        socket.destroy();
        resolve(false);
      });
    });
    const clean = browserClean && appClean && portClosed;
    write("setup-ui-cleanup.json", {
      clean,
      browserClosed: browserClean,
      browserClientCloseAcknowledged,
      nextGroupStopped: appClean,
      portClosed,
    });
    assert.ok(clean, "OWNED_UI_CLEANUP_UNCERTAIN");
  }
}
