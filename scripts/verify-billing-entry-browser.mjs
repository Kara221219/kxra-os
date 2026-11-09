import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import http from "node:http";
import { execFileSync } from "node:child_process";
import { build } from "esbuild";
import { chromium, expect } from "@playwright/test";

// Component-only synthetic acceptance. No application identity, database,
// provider, credentials, hosted flags or real checkout are used.
if (process.argv.slice(2).join(" ") !== "--synthetic")
  throw Error("BILLING_BROWSER_SYNTHETIC_ONLY");
const root = path.resolve(import.meta.dirname, ".."),
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "kxra-billing-ui-"));
fs.chmodSync(directory, 0o700);
const sourceFiles = [
  "apps/os/components/LiveBillingEntry.tsx",
  "packages/workspace/billing-entry-recovery.ts",
  "scripts/verify-billing-entry-browser.mjs",
  "package-lock.json",
];
const receipt = {
  kind: "SYNTHETIC_BILLING_COMPONENT_ONLY",
  source_commit: execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim(),
  source_dirty: Boolean(
    execFileSync("git", ["status", "--porcelain"], {
      cwd: root,
      encoding: "utf8",
    }).trim(),
  ),
  source_sha256: Object.fromEntries(
    sourceFiles.map((file) => [
      file,
      crypto
        .createHash("sha256")
        .update(fs.readFileSync(path.join(root, file)))
        .digest("hex"),
    ]),
  ),
  passed: [],
  state: "FAILED",
  browser_closed: false,
  server_closed: false,
  hosted_acceptance: false,
  framework_link: "native anchor fixture; no Next routing or server acceptance",
  external_network_permitted: false,
  external_requests_blocked: 0,
};
const result = await build({
  stdin: {
    contents: `import React from "react"; import { createRoot } from "react-dom/client"; import Billing from "./apps/os/components/LiveBillingEntry"; let root; window.mountBilling = props => { root?.unmount(); root = createRoot(document.getElementById("root")); root.render(React.createElement(Billing, props)); }; window.unmountBilling = () => { root?.unmount(); root = null; };`,
    resolveDir: root,
    loader: "tsx",
  },
  plugins: [
    {
      name: "component-link-fixture",
      setup(plugin) {
        plugin.onResolve({ filter: /^next\/link$/ }, () => ({
          path: "next-link",
          namespace: "billing-ui-fixture",
        }));
        plugin.onLoad(
          { filter: /.*/, namespace: "billing-ui-fixture" },
          () => ({
            contents:
              'import React from "react"; export default function Link({children, ...props}) { return React.createElement("a", props, children); }',
            loader: "jsx",
            resolveDir: root,
          }),
        );
      },
    },
  ],
  metafile: true,
  bundle: true,
  write: false,
  platform: "browser",
  format: "iife",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
});
const javascript = result.outputFiles[0].contents;
receipt.bundle_sha256 = crypto
  .createHash("sha256")
  .update(javascript)
  .digest("hex");
for (const file of Object.keys(result.metafile.inputs)) {
  const full = path.resolve(root, file);
  if (
    !full.startsWith(root + path.sep) ||
    file.includes("node_modules/") ||
    !fs.existsSync(full)
  )
    continue;
  receipt.source_sha256[path.relative(root, full)] = crypto
    .createHash("sha256")
    .update(fs.readFileSync(full))
    .digest("hex");
}
const server = http.createServer((req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.url === "/component.js") {
    res.setHeader("Content-Type", "text/javascript");
    res.end(javascript);
  } else if (req.url === "/") {
    res.setHeader("Content-Type", "text/html");
    res.end(
      '<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><div id="root"></div><script src="/component.js"></script>',
    );
  } else {
    res.statusCode = 404;
    res.end();
  }
});
await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
const initial = {
  state: "BOUND",
  offer_key: "KXRA_STARTER_V1",
  request_id: null,
  kind: null,
  request_state: null,
  dispatch_ready: false,
  entitlement_authority: false,
  available_actions: ["CHECKOUT"],
};
async function scenario(viewport, name, run) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  await context.route("**/*", async (route) => {
    if (new URL(route.request().url()).origin !== origin) {
      receipt.external_requests_blocked++;
      return route.abort("blockedbyclient");
    }
    return route.continue();
  });
  try {
    await page.goto(origin);
    await page.evaluate(
      (initial) =>
        window.mountBilling({
          initial,
          checkoutResultAvailable: true,
          portalAvailable: true,
        }),
      initial,
    );
    await expect(
      page.getByRole("button", { name: "Prepare payment", exact: true }),
    ).toBeEnabled();
    await run(page);
    receipt.passed.push(`${viewport.width}: ${name}`);
  } finally {
    await context.close();
  }
}
try {
  browser = await chromium.launch({
    headless: true,
    chromiumSandbox: true,
    timeout: 30000,
  });
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    await scenario(
      viewport,
      "lost checkout acknowledgement recovers from matching status without repeating reservation",
      async (page) => {
        let request,
          posts = 0;
        await page.route("**/api/live-billing", async (route) => {
          if (route.request().method() === "POST") {
            posts++;
            request = route.request().postDataJSON();
            return route.abort("failed");
          }
          return route.fulfill({
            json: {
              ...initial,
              state: "BOUND",
              request_id: request.request_id,
              kind: "CHECKOUT",
              request_state: "CONSUMED",
              available_actions: [],
            },
          });
        });
        await page
          .getByRole("button", { name: "Prepare payment", exact: true })
          .click();
        await expect(
          page.getByRole("button", { name: "Retry original request" }),
        ).toBeEnabled();
        await page.getByRole("button", { name: "Refresh status" }).click();
        await expect(
          page.getByRole("button", { name: "Continue to secure payment" }),
        ).toBeEnabled();
        await expect(
          page.getByRole("button", { name: "Retry original request" }),
        ).toHaveCount(0);
        assert.equal(posts, 1);
      },
    );

    await scenario(
      viewport,
      "mismatched, uncertain and malformed status preserve the original request",
      async (page) => {
        let request,
          next,
          posts = [];
        await page.route("**/api/live-billing", async (route) => {
          if (route.request().method() === "POST") {
            request = route.request().postDataJSON();
            posts.push(request);
            return route.abort("failed");
          }
          return route.fulfill({ json: next });
        });
        await page
          .getByRole("button", { name: "Prepare payment", exact: true })
          .click();
        await expect(
          page.getByRole("button", { name: "Retry original request" }),
        ).toBeEnabled();
        for (const patch of [
          { request_id: "30000000-0000-4000-8000-000000000002" },
          { offer_key: "KXRA_TEAM_V1" },
          { state: "REVIEW_REQUIRED", request_state: "UNCERTAIN" },
          { entitlement_authority: true },
        ]) {
          next = {
            ...initial,
            request_id: request.request_id,
            kind: "CHECKOUT",
            request_state: "CONSUMED",
            available_actions: [],
            ...patch,
          };
          await page.getByRole("button", { name: "Refresh status" }).click();
          await expect(
            page.getByRole("button", { name: "Retry original request" }),
          ).toBeEnabled();
        }
        await page
          .getByRole("button", { name: "Retry original request" })
          .click();
        await expect(
          page.getByRole("button", { name: "Retry original request" }),
        ).toBeEnabled();
        assert.equal(posts.length, 2);
        assert.deepEqual(posts[1], posts[0]);
      },
    );
    await scenario(
      viewport,
      "customer reservation acknowledgement recovers without repeating setup",
      async (page) => {
        let request,
          posts = 0;
        await page.evaluate(
          (state) =>
            window.mountBilling({
              initial: state,
              checkoutResultAvailable: true,
              portalAvailable: true,
            }),
          {
            ...initial,
            state: "FRESH",
            offer_key: null,
            available_actions: ["CUSTOMER"],
          },
        );
        await page.route("**/api/live-billing", async (route) => {
          if (route.request().method() === "POST") {
            posts++;
            request = route.request().postDataJSON();
            return route.abort("failed");
          }
          return route.fulfill({
            json: {
              ...initial,
              request_id: request.request_id,
              kind: "CUSTOMER",
              request_state: "BOUND",
            },
          });
        });
        await page
          .getByRole("button", { name: "Set up billing", exact: true })
          .click();
        await expect(
          page.getByRole("button", { name: "Retry original request" }),
        ).toBeEnabled();
        await page.getByRole("button", { name: "Refresh status" }).click();
        await expect(
          page.getByRole("button", { name: "Prepare payment", exact: true }),
        ).toBeEnabled();
        await expect(
          page.getByRole("button", { name: "Retry original request" }),
        ).toHaveCount(0);
        assert.equal(posts, 1);
      },
    );
    await scenario(
      viewport,
      "same-tick refresh clicks issue one status request",
      async (page) => {
        let held,
          gets = 0;
        await page.route("**/api/live-billing", (route) => {
          gets++;
          held = route;
        });
        await page
          .getByRole("button", { name: "Refresh status" })
          .evaluate((button) => {
            button.click();
            button.click();
          });
        await expect.poll(() => gets).toBe(1);
        await held.fulfill({ json: initial });
        await expect(
          page.getByRole("button", { name: "Refresh status" }),
        ).toBeEnabled();
        assert.equal(gets, 1);
      },
    );
    await scenario(
      viewport,
      "stalled status aborts and unlocks controls at the existing deadline",
      async (page) => {
        let gets = 0;
        await page.clock.install();
        await page.route("**/api/live-billing", () => {
          gets++;
        });
        await page.getByRole("button", { name: "Refresh status" }).click();
        await expect.poll(() => gets).toBe(1);
        await page.clock.runFor(35001);
        await expect(
          page.getByRole("button", { name: "Refresh status" }),
        ).toBeEnabled();
        await expect(page.getByRole("status")).toContainText(
          "Status unavailable",
        );
        assert.equal(gets, 1);
      },
    );
    await scenario(
      viewport,
      "stalled reservation retains one original reference for explicit retry",
      async (page) => {
        let requests = [];
        await page.clock.install();
        await page.route("**/api/live-billing", (route) => {
          requests.push(route.request().postDataJSON());
        });
        await page
          .getByRole("button", { name: "Prepare payment", exact: true })
          .click();
        await expect.poll(() => requests.length).toBe(1);
        await page.clock.runFor(35001);
        await expect(
          page.getByRole("button", { name: "Retry original request" }),
        ).toBeEnabled();
        await page
          .getByRole("button", { name: "Retry original request" })
          .click();
        await expect.poll(() => requests.length).toBe(2);
        assert.deepEqual(requests[0], requests[1]);
      },
    );
    await scenario(
      viewport,
      "unmount aborts delayed checkout delivery without navigating",
      async (page) => {
        const requestId = "30000000-0000-4000-8000-000000000001";
        let held,
          requests = 0,
          navigations = 0;
        await page.evaluate(
          (state) =>
            window.mountBilling({
              initial: state,
              checkoutResultAvailable: true,
              portalAvailable: true,
            }),
          {
            ...initial,
            request_id: requestId,
            kind: "CHECKOUT",
            request_state: "CONSUMED",
            available_actions: [],
          },
        );
        await page.route("https://checkout.stripe.com/**", (route) => {
          navigations++;
          return route.abort("blockedbyclient");
        });
        await page.route("**/api/live-billing/result", (route) => {
          requests++;
          held = route;
          assert.equal(route.request().postDataJSON().request_id, requestId);
        });
        await page
          .getByRole("button", { name: "Continue to secure payment" })
          .click();
        await expect.poll(() => requests).toBe(1);
        await page.evaluate(() => window.unmountBilling());
        await held
          .fulfill({
            json: {
              state: "READY",
              request_id: requestId,
              url: "https://checkout.stripe.com/c/pay/cs_test_SYNTHETIC000",
              expires_at: Math.floor(Date.now() / 1000) + 120,
              delivery_ready: true,
              dispatch_ready: false,
              entitlement_authority: false,
            },
          })
          .catch(() => {});
        await page.waitForTimeout(50);
        assert.equal(navigations, 0);
        assert.equal(page.url(), origin + "/");
      },
    );
    await scenario(
      viewport,
      "reload-ready checkout uses only its canonical result reference",
      async (page) => {
        const requestId = "30000000-0000-4000-8000-000000000001";
        let results = 0,
          reservations = 0;
        await page.evaluate(
          (state) =>
            window.mountBilling({
              initial: state,
              checkoutResultAvailable: true,
              portalAvailable: true,
            }),
          {
            ...initial,
            request_id: requestId,
            kind: "CHECKOUT",
            request_state: "CONSUMED",
            available_actions: [],
          },
        );
        await page.route("**/api/live-billing", (route) => {
          reservations++;
          return route.abort();
        });
        await page.route("**/api/live-billing/result", (route) => {
          results++;
          assert.equal(route.request().postDataJSON().request_id, requestId);
          return route.fulfill({
            status: 409,
            json: { error: "SYNTHETIC_REVIEW_REQUIRED" },
          });
        });
        await page
          .getByRole("button", { name: "Continue to secure payment" })
          .click();
        await expect(
          page.getByRole("button", { name: "Continue to secure payment" }),
        ).toBeEnabled();
        await expect(page.getByRole("status")).toContainText(
          "Payment is not ready",
        );
        assert.equal(results, 1);
        assert.equal(reservations, 0);
      },
    );

    await scenario(
      viewport,
      "successful delayed reservation and stalled refresh share one total deadline",
      async (page) => {
        let held,
          request,
          posts = 0,
          gets = 0;
        await page.clock.install();
        await page.route("**/api/live-billing", (route) => {
          if (route.request().method() === "POST") {
            posts++;
            request = route.request().postDataJSON();
            held = route;
          } else gets++;
        });
        await page
          .getByRole("button", { name: "Prepare payment", exact: true })
          .click();
        await expect.poll(() => posts).toBe(1);
        await page.clock.runFor(20000);
        await held.fulfill({
          json: {
            state: "QUEUED",
            action: request.action,
            request_id: request.request_id,
            dispatch_ready: false,
            entitlement_authority: false,
          },
        });
        await expect.poll(() => gets).toBe(1);
        await page.clock.runFor(15001);
        await expect(
          page.getByRole("button", { name: "Retry original request" }),
        ).toBeEnabled();
        await expect(page.getByRole("status")).toContainText(
          "We couldn’t confirm",
        );
        assert.equal(posts, 1);
        assert.equal(gets, 1);
      },
    );
    await scenario(
      viewport,
      "portal timeout retains the exact original reference without automatic replacement",
      async (page) => {
        let requests = [];
        await page.clock.install();
        await page.evaluate(
          (state) =>
            window.mountBilling({
              initial: state,
              checkoutResultAvailable: true,
              portalAvailable: true,
            }),
          { ...initial, available_actions: ["PORTAL"] },
        );
        await page.route("**/api/live-billing/portal", (route) => {
          requests.push(route.request().postDataJSON());
        });
        await page.getByRole("button", { name: "Manage subscription" }).click();
        await expect.poll(() => requests.length).toBe(1);
        await page.clock.runFor(35001);
        await expect(
          page.getByRole("button", { name: "Retry original request" }),
        ).toBeEnabled();
        await page
          .getByRole("button", { name: "Retry original request" })
          .click();
        await expect.poll(() => requests.length).toBe(2);
        assert.deepEqual(requests[0], requests[1]);
      },
    );
    await scenario(
      viewport,
      "unmount aborts delayed portal delivery without navigation",
      async (page) => {
        let held,
          request,
          navigations = 0;
        await page.evaluate(
          (state) =>
            window.mountBilling({
              initial: state,
              checkoutResultAvailable: true,
              portalAvailable: true,
            }),
          { ...initial, available_actions: ["PORTAL"] },
        );
        await page.route("https://billing.stripe.com/**", (route) => {
          navigations++;
          receipt.external_requests_blocked++;
          return route.abort("blockedbyclient");
        });
        await page.route("**/api/live-billing/portal", (route) => {
          request = route.request().postDataJSON();
          held = route;
        });
        await page.getByRole("button", { name: "Manage subscription" }).click();
        await expect.poll(() => Boolean(held)).toBe(true);
        await page.evaluate(() => window.unmountBilling());
        await held
          .fulfill({
            json: {
              state: "READY",
              request_id: request.request_id,
              url: "https://billing.stripe.com/p/session/SYNTHETICtoken",
              expires_at: Math.floor(Date.now() / 1000) + 120,
              delivery_ready: true,
              dispatch_ready: false,
              entitlement_authority: false,
            },
          })
          .catch(() => {});
        await page.waitForTimeout(50);
        assert.equal(navigations, 0);
        assert.equal(page.url(), origin + "/");
      },
    );
  }
  receipt.state = "PASS";
} finally {
  try {
    if (browser) {
      await browser.close();
      receipt.browser_closed = true;
    }
  } finally {
    try {
      server.closeAllConnections();
      await new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
      receipt.server_closed = true;
    } finally {
      if (!receipt.browser_closed || !receipt.server_closed)
        receipt.state = "FAILED_CLEANUP";
      fs.writeFileSync(
        path.join(directory, "receipt.json"),
        JSON.stringify(receipt, null, 2) + "\n",
      );
      console.log(
        JSON.stringify({
          receipt: path.join(directory, "receipt.json"),
          ...receipt,
        }),
      );
    }
  }
}
