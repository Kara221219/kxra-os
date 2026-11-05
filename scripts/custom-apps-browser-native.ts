// Actual shipped React components and API core, synthetic resolved identity only.
// This adapter is never imported by a product route or production build.
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import type http from "node:http";
import { build } from "esbuild";
import {
  chromium,
  expect,
  type Browser,
  type BrowserContext,
  type BrowserServer,
} from "@playwright/test";
import { exampleCustomApp } from "../packages/custom-apps/contract";

const executablePath = chromium.executablePath();
export async function customAppsBrowserFixture(p: {
  root: string;
  runtime: string;
  room: string;
  origin: string;
  refreshProof: () => Promise<void>;
  write: (name: string, data: unknown) => void;
}) {
  assert.ok(fs.existsSync(executablePath), "PREINSTALLED_CHROMIUM_REQUIRED");
  const result = await build({
    stdin: {
      contents: `import React from 'react';import{createRoot}from'react-dom/client';
import{CustomApps}from'./apps/os/components/CustomApps';
import{CustomAppRecords}from'./apps/os/components/CustomAppRecords';
import{customAppRecordCopy as copy}from'./apps/os/lib/custom-app-record-copy';
const parts=location.pathname.split('/').filter(Boolean),room=parts[2],app=parts[3];
const r=await fetch('/api/custom-apps/'+room+(app?'/'+app+'/records':''),{cache:'no-store'}),data=await r.json();
if(!r.ok)throw Error(JSON.stringify(data));
createRoot(document.getElementById('root')).render(app?<CustomAppRecords room={room} app={app} initial={data} copy={copy}/>:<CustomApps room={room} initialApps={data.apps} canManage={data.can_manage} production={data.production} canReview={data.can_review}/>);`,
      resolveDir: p.root,
      loader: "tsx",
    },
    bundle: true,
    write: false,
    jsx: "automatic",
    format: "esm",
    target: "es2022",
    define: { "process.env.NODE_ENV": '"production"' },
  });
  const javascript = result.outputFiles[0].contents;
  const serve = (req: http.IncomingMessage, res: http.ServerResponse) => {
    if (req.method !== "GET") return false;
    const url = new URL(req.url!, p.origin);
    if (url.pathname === "/synthetic/custom-apps.js") {
      res.writeHead(200, {
        "content-type": "text/javascript",
        "cache-control": "no-store",
      });
      res.end(javascript);
      return true;
    }
    if (
      url.pathname === `/os/custom-apps/${p.room}` ||
      new RegExp(`^/os/apps/${p.room}/[0-9a-f-]{36}$`).test(url.pathname)
    ) {
      res.writeHead(200, {
        "content-type": "text/html",
        "cache-control": "no-store",
      });
      res.end(
        `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Synthetic identity integration</title><style>body{font:16px system-ui;margin:20px;max-width:1000px}button,input,select,textarea{font:inherit;max-width:100%;box-sizing:border-box}button{margin:4px}code{overflow-wrap:anywhere}iframe{max-width:100%}article{border:1px solid;padding:12px}</style><p>SYNTHETIC IDENTITY ADAPTER — LOCAL ONLY</p><main id="root"></main><script type="module" src="/synthetic/custom-apps.js"></script></html>`,
      );
      return true;
    }
    return false;
  };
  let browserClean = true;
  async function run() {
    let browser: Browser | undefined,
      context: BrowserContext | undefined,
      server: BrowserServer | undefined;
    browserClean = false;
    const errors: string[] = [],
      external: string[] = [],
      passes: string[] = [];
    try {
      server = await chromium.launchServer({
        executablePath,
        headless: true,
        args: [
          "--disable-background-networking",
          "--disable-component-update",
          "--disable-sync",
        ],
      });
      browser = await chromium.connect(server.wsEndpoint());
      context = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
        extraHTTPHeaders: { "x-synthetic-actor": "author" },
      });
      await context.route("**/*", async (route) => {
        if (new URL(route.request().url()).origin !== p.origin) {
          external.push(route.request().url());
          await route.abort();
        } else await route.continue();
      });
      const page = await context.newPage();
      page.on("pageerror", (error) => errors.push(error.message));
      const builder = `${p.origin}/os/custom-apps/${p.room}`;
      const title = "Browser reviewed form";
      const schema = { ...exampleCustomApp, title };
      const click = async (name: string) => {
        await page.getByRole("button", { name, exact: true }).click();
        await expect(
          page.getByRole("button", { name: "New app", exact: true }),
        ).toBeEnabled();
      };
      const load = async (who: string) => {
        await p.refreshProof();
        await context!.setExtraHTTPHeaders({ "x-synthetic-actor": who });
        await page.goto(builder);
        await expect(
          page.getByRole("heading", { name: "Custom apps", exact: true }),
        ).toBeVisible();
        await click(title);
      };
      await p.refreshProof();
      await page.goto(builder);
      await page
        .getByLabel("Declarative schema (kxra.form.v1)")
        .fill(JSON.stringify(schema));
      await click("Preview schema");
      const preview = page.locator(
        'iframe[title="Isolated custom app preview"]',
      );
      await expect(preview).toHaveAttribute("sandbox", "");
      assert.equal(await preview.getAttribute("referrerpolicy"), "no-referrer");
      await click("Register app");
      await click("APPROVED v1");
      await expect(page.getByRole("alert")).toBeVisible();
      await click("Publish v1");
      await expect(page.getByRole("alert")).toBeVisible();
      passes.push(
        "actual browser self-review and unreviewed publication denied; preview sandbox isolated",
      );
      await load("reviewer");
      await click("APPROVED v1");
      await expect(
        page.getByText("Review: APPROVED.", { exact: false }),
      ).toBeVisible();
      await load("author");
      await click("Publish v1");
      await expect(
        page.getByText("Active release: 1.", { exact: false }),
      ).toBeVisible();
      const href = await page
        .getByRole("button", { name: title, exact: true })
        .locator("..")
        .getByRole("link", { name: "Use app", exact: true })
        .getAttribute("href");
      assert.ok(href);
      await page.goto(p.origin + href);
      for (const field of schema.fields) {
        // Component uses a stable label/id pair, without fixture-only selectors.
        const input = page.getByLabel(field.label, { exact: false }).first();
        if (field.type === "checkbox") await input.check();
        else if (field.type === "select")
          await input.selectOption(field.options[0]);
        else await input.fill("Browser synthetic record");
      }
      await page
        .getByRole("button", { name: "Save record", exact: true })
        .click();
      await expect(page.getByRole("article")).toHaveCount(1);
      await page.reload();
      await expect(page.getByRole("article")).toHaveCount(1);
      await page.getByRole("button", { name: /^Edit record / }).click();
      const textField = schema.fields.find(
        (f) => f.type === "text" || f.type === "textarea",
      )!;
      await page
        .getByLabel(textField.label, { exact: false })
        .first()
        .fill("Browser revised record");
      await page
        .getByRole("button", { name: "Save record", exact: true })
        .click();
      await expect(page.getByRole("article")).toContainText(
        "record revision 2",
      );
      await page.setViewportSize({ width: 390, height: 844 });
      await page.reload();
      await expect(page.getByRole("article")).toHaveCount(1);
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      await page.screenshot({
        path: path.join(p.runtime, "browser-mobile-record.png"),
        fullPage: true,
      });
      passes.push(
        "browser publication, typed save, reload, revision and mobile recovery without duplicate records",
      );
      await load("reviewer");
      await click("WITHDRAWN v1");
      await context!.setExtraHTTPHeaders({ "x-synthetic-actor": "author" });
      await page.goto(p.origin + href);
      await expect(
        page.getByRole("button", { name: "Save record", exact: true }),
      ).toBeDisabled();
      await expect(page.getByRole("article")).toHaveCount(1);
      await load("reviewer");
      await click("APPROVED v1");
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.screenshot({
        path: path.join(p.runtime, "browser-desktop-review.png"),
        fullPage: true,
      });
      passes.push(
        "independent reviewer withdrawal immediately disables browser writes while preserving readable history",
      );
      assert.deepEqual(errors, []);
      assert.deepEqual(external, []);
      p.write("browser.json", {
        classification:
          "ACTUAL_COMPONENT_AND_API_SQL_SYNTHETIC_IDENTITY_NOT_NEXT_SSR_OR_SUPABASE_AUTH",
        passes,
        errors,
        external,
        actualProductComponents: ["CustomApps", "CustomAppRecords"],
        productionAuthProvisioned: false,
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
      const closes = await Promise.allSettled([
        context ? bounded(context.close()) : Promise.resolve(),
        browser ? bounded(browser.close()) : Promise.resolve(),
      ]);
      if (server) {
        try {
          await bounded(server.close());
        } catch {}
        const child = server.process();
        if (child.exitCode === null && child.signalCode === null) {
          try {
            await bounded(server.kill());
          } catch {}
        }
        browserClean =
          (child.exitCode !== null || child.signalCode !== null) &&
          !browser?.isConnected();
      }
      p.write("browser-cleanup.json", {
        clean: browserClean,
        browserPid: server?.process().pid,
        exitCode: server?.process().exitCode,
        signalCode: server?.process().signalCode,
        clientCloses: closes.map((r) => r.status),
        disconnected: !browser?.isConnected(),
      });
      assert.ok(browserClean, "OWNED_BROWSER_CLEANUP_UNCERTAIN");
    }
  }
  return { serve, run, cleanupConfirmed: () => browserClean };
}
