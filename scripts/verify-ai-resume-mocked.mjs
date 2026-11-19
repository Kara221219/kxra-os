import http from "node:http";
import { build } from "esbuild";
import { chromium } from "@playwright/test";
import { acquireNativeFixtureLease } from "./native-fixture-lease.mjs";
const release = acquireNativeFixtureLease("ai-resume-mocked-no-database");
let server, browser;
try {
  const result = await build({
    stdin: {
      contents: `import React from 'react';import{createRoot}from'react-dom/client';import{AiConnectionSetup}from'./apps/os/components/AiConnectionSetup';import{customerAiPolicy}from'./packages/workspace/customer-ai-policy';createRoot(document.getElementById('root')).render(<AiConnectionSetup aiPolicy={customerAiPolicy} onSaved={()=>{}}/>);`,
      resolveDir: process.cwd(),
      loader: "tsx",
    },
    bundle: true,
    write: false,
    platform: "browser",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
  });
  const js = result.outputFiles[0].text;
  server = http.createServer((req, res) => {
    res.setHeader(
      "content-type",
      req.url === "/app.js" ? "text/javascript" : "text/html",
    );
    res.end(
      req.url === "/app.js"
        ? js
        : '<!doctype html><meta name="viewport" content="width=device-width"><style>*{box-sizing:border-box}body{margin:16px}input,select{max-width:100%;display:block}section{max-width:700px}button{white-space:normal}</style><div id="root"></div><script src="/app.js"></script>',
    );
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const base = {
    admission_id: "11111111-1111-4111-8111-111111111111",
    provider: "OPENAI",
    model: "synthetic-model",
    endpoint_id: "",
    state: "REVIEW_REQUIRED",
    reason: "AWAITING_PROVIDER_REVIEW",
    next_action: "WAIT_FOR_REVIEW",
    expires_at: "2026-11-05T00:00:00Z",
  };
  let status = base,
    denied = false,
    stalled = false,
    heldReview,
    posts = [];
  await page.route("**/api/ai-connection-admission**", (r) => {
    if (stalled) {
      heldReview = r;
      return;
    }
    return r.fulfill({
      status: denied ? 403 : 200,
      contentType: "application/json",
      body: JSON.stringify({ admission: status }),
    });
  });
  await page.route("**/api/team-space/connections", (r) => {
    posts.push(r.request().postDataJSON());
    return r.fulfill({
      status: 409,
      contentType: "application/json",
      body: JSON.stringify({
        code: "AI_CONNECTION_REVIEW_REQUIRED",
        admission: base,
      }),
    });
  });
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  const assert = (v, m) => {
    if (!v) throw Error(m);
  };
  await page
    .getByText("This request is awaiting a provider/account review.", {
      exact: false,
    })
    .waitFor();
  assert(
    (await page.locator("input[name=key]").count()) === 0,
    "pending key form",
  );
  status = {
    ...base,
    state: "ELIGIBLE",
    reason: "CLEARED",
    next_action: "RESUBMIT_SAME_DETAILS",
  };
  await page
    .getByRole("button", { name: "Check review status", exact: true })
    .click();
  await page.locator("input[name=key]").waitFor();
  await page.locator("input[name=name]").fill("Synthetic");
  await page.locator("input[name=key]").fill("SYNTHETIC_NOT_A_CREDENTIAL");
  await page.locator("input[type=checkbox]").check();
  await page
    .getByRole("button", { name: "Resubmit reviewed connection", exact: true })
    .click();
  await page
    .getByText("This request is awaiting a provider/account review.", {
      exact: false,
    })
    .waitFor();
  assert(
    posts.length === 1 && posts[0].admission_id === base.admission_id,
    "exact resume ref",
  );
  assert((await page.locator("input[name=key]").count()) === 0, "key cleared");
  await page.reload();
  await page.getByRole("heading", { name: "Ready to resubmit" }).waitFor();
  assert(
    (await page.locator("input[name=key]").inputValue()) === "",
    "reload key retention",
  );
  assert(
    (await page.evaluate(() => localStorage.length + sessionStorage.length)) ===
      0,
    "browser storage",
  );
  for (const [reason, next_action, state] of [
    [
      "BUSINESS_REVIEW_REQUIRED",
      "COMPLETE_BUSINESS_REVIEW",
      "NEW_INTENT_REQUIRED",
    ],
    [
      "BUSINESS_PROVIDER_MISMATCH",
      "COMPLETE_BUSINESS_REVIEW",
      "NEW_INTENT_REQUIRED",
    ],
    ["BUSINESS_REVIEW_UNBOUND", "CREATE_NEW_INTENT", "NEW_INTENT_REQUIRED"],
    ["REVIEW_WITHDRAWN", "CONTACT_SUPPORT", "REVIEW_REQUIRED"],
    ["INTENT_EXPIRED", "CREATE_NEW_INTENT", "NEW_INTENT_REQUIRED"],
    ["SESSION_CHANGED", "CREATE_NEW_INTENT", "NEW_INTENT_REQUIRED"],
    ["PROVIDER_REVIEW_BLOCKED", "CONTACT_SUPPORT", "BLOCKED"],
  ]) {
    status = { ...base, reason, next_action, state };
    await page
      .getByRole("button", { name: "Check review status", exact: true })
      .click();
    const expected = {
      BUSINESS_REVIEW_REQUIRED: "Complete the business review before starting",
      BUSINESS_PROVIDER_MISMATCH:
        "The business declaration covers a different provider.",
      BUSINESS_REVIEW_UNBOUND: "Business review is now available.",
      REVIEW_WITHDRAWN: "Review was withdrawn.",
      INTENT_EXPIRED: "This activation request expired.",
      SESSION_CHANGED: "The account security session changed.",
      PROVIDER_REVIEW_BLOCKED: "This request is blocked.",
    };
    await page.getByText(expected[reason], { exact: false }).waitFor();
    if (next_action === "COMPLETE_BUSINESS_REVIEW")
      await page
        .getByRole("link", { name: "Complete business review", exact: true })
        .waitFor();
    if (next_action === "CONTACT_SUPPORT")
      await page
        .getByRole("link", { name: "Contact KXRA for review", exact: true })
        .waitFor();
    if (next_action === "CREATE_NEW_INTENT")
      await page
        .getByRole("button", {
          name: "Start a new connection request",
          exact: true,
        })
        .waitFor();
    await page.waitForFunction(
      () => !document.querySelector("input[name=key]"),
    );
    assert((await page.locator("input[name=key]").count()) === 0, reason);
  }
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      "overflow " + width,
    );
  }
  status = { ...base, key: "MUST_NOT_RENDER" };
  await page
    .getByRole("button", { name: "Check review status", exact: true })
    .click();
  await page
    .getByText("Review status unavailable.", { exact: false })
    .waitFor();
  assert(
    !(await page.content()).includes("MUST_NOT_RENDER"),
    "secret rendered",
  );
  denied = true;
  await page
    .getByRole("button", { name: "Check review status", exact: true })
    .click();
  await page
    .getByText("Review status unavailable.", { exact: false })
    .waitFor();
  assert((await page.locator("input[name=key]").count()) === 0, "denied form");
  // Keep the real production deadline; virtual time makes the stalled read deterministic.
  await page.clock.install();
  denied = false;
  stalled = true;
  await page
    .getByRole("button", { name: "Check review status", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Checking review…", exact: true })
    .waitFor();
  await page.clock.fastForward(15_001);
  await page
    .getByText("Review status unavailable.", { exact: false })
    .waitFor();
  assert(
    await page
      .getByRole("button", { name: "Check review status", exact: true })
      .isEnabled(),
    "timeout restores retry",
  );
  assert(
    (await page.locator("input[name=key]").count()) === 0,
    "timeout keeps key form hidden",
  );
  stalled = false;
  status = null;
  await page
    .getByRole("button", { name: "Find my latest request", exact: true })
    .click();
  await page.locator("input[name=key]").waitFor();
  assert(
    (await page.locator("input[name=key]").inputValue()) === "",
    "retry starts with empty key",
  );
  if (heldReview)
    await heldReview
      .fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ admission: base }),
      })
      .catch(() => {});
  assert(
    (await page.locator("input[name=key]").count()) === 1,
    "retry remains usable after the aborted request",
  );
  assert(posts.length === 1, "read recovery must not submit a connection");
  assert(errors.length === 0, JSON.stringify(errors));
  console.log(
    JSON.stringify({
      status: "PASS",
      cases: [
        "pending",
        "exact-reviewed-resubmit",
        "reload-no-key-storage",
        "seven-authority-states",
        "desktop-mobile",
        "unknown-secret-projection-denied",
        "access-denied",
        "stalled-review-timeout-and-retry",
        "retry-stable-after-aborted-review",
      ],
      database: "NOT_USED",
      provider: "NOT_USED",
    }),
  );
} finally {
  let cleanupError;
  try {
    if (browser) {
      await browser.close();
      if (browser.isConnected()) throw Error("Browser remains connected");
    }
  } catch (e) {
    cleanupError = e;
  }
  try {
    if (server) {
      server.closeAllConnections();
      await new Promise((resolve, reject) =>
        server.close((e) =>
          e && e.code !== "ERR_SERVER_NOT_RUNNING" ? reject(e) : resolve(),
        ),
      );
      if (server.listening) throw Error("Server remains listening");
    }
  } catch (e) {
    cleanupError ||= e;
  }
  if (cleanupError)
    throw Error("Cleanup uncertain; owned lease retained", {
      cause: cleanupError,
    });
  release();
  console.log("Owned browser/server stopped; exact lease released.");
}
