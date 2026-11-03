import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import pg from "pg";
import {
  chromium,
  expect,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import { fixtureUsers, signSession } from "../../packages/authz/session";
import { localModeConfiguration } from "../../packages/authz/local-guard";
import { runtimeFile, testOrigin } from "../support/runtime";
assert.ok(localModeConfiguration(process.env) && !process.env.VERCEL_ENV);
const config = JSON.parse(
  fs.readFileSync(runtimeFile("database.json"), "utf8"),
);
assert.ok(config.host.startsWith("/") && !config.password);
const admin = new pg.Pool({ ...config, user: os.userInfo().username });
const secret = fs.readFileSync(runtimeFile("session-key"), "utf8");
const created: string[] = [];
let browser: Browser;
before(async () => {
  browser = await chromium.launch({ headless: true, chromiumSandbox: true });
});
after(async () => {
  try {
    await browser?.close();
    await admin.query(
      "delete from kxra_private.connector_notes where connector_id=any($1::uuid[])",
      [created],
    );
    await admin.query(
      "delete from kxra_private.connector_requests where connector_id=any($1::uuid[])",
      [created],
    );
    await admin.query(
      "delete from kxra_private.customer_connectors where id=any($1::uuid[])",
      [created],
    );
  } finally {
    await admin.end();
  }
});
async function customer(
  user: string | null = fixtureUsers.owner,
  mobile = false,
  clock = false,
) {
  const context = await browser.newContext({
    viewport: mobile
      ? { width: 390, height: 844 }
      : { width: 1280, height: 1000 },
  });
  if (user)
    await context.addCookies([
      {
        name: "kxra_local_session",
        value: signSession(user, secret),
        url: testOrigin,
      },
    ]);
  const foreign: string[] = [];
  await context.route("**/*", (route) => {
    if (new URL(route.request().url()).origin !== testOrigin) {
      foreign.push(route.request().url());
      return route.abort();
    }
    return route.continue();
  });
  const page = await context.newPage();
  if (clock) await page.clock.install({ time: Date.now() });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", async (response) => {
    if (
      response.url() === `${testOrigin}/api/customer-connectors` &&
      response.request().method() === "POST" &&
      response.request().postDataJSON()?.action === "connect" &&
      response.ok()
    ) {
      const data = await response.json();
      if (typeof data.result?.id === "string") created.push(data.result.id);
    }
  });
  await page.goto(`${testOrigin}/os/connections`);
  return { context, page, foreign, errors };
}
async function connect(page: Page, write = false) {
  if (write) await page.getByLabel("Allow approved note writes").check();
  await page
    .getByRole("button", { name: "Connect Mock Notes", exact: true })
    .click();
  await expect(page.getByRole("status").first()).toHaveText(
    "Mock connection created. Read its notes to continue.",
  );
  return await page.getByLabel("Connection", { exact: true }).inputValue();
}
async function prepare(page: Page, note: string) {
  await page.getByRole("button", { name: "Read notes", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Read results", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Note to add", { exact: true }).fill(note);
  await page
    .getByRole("button", { name: "Prepare write", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Awaiting your approval", exact: true }),
  ).toBeVisible();
}
async function clean(session: {
  context: BrowserContext;
  errors: string[];
  foreign: string[];
}) {
  try {
    assert.deepEqual(session.errors, []);
    assert.deepEqual(session.foreign, []);
  } finally {
    await session.context.close();
  }
}

test(
  "desktop customer sees read-only scope, reviews exact escaped content, approves and executes once",
  { timeout: 90000 },
  async () => {
    const session = await customer();
    const { page } = session;
    try {
      await expect(
        page.getByText("Local mock preview", { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByLabel("Allow approved note writes"),
      ).not.toBeChecked();
      await connect(page);
      await expect(
        page.getByText("Read notes only", { exact: true }),
      ).toBeVisible();
      await expect(page.getByLabel("Note to add")).toHaveCount(0);
      await connect(page, true);
      const note =
        '<img src=x onerror="window.mockConnectorInjected=true"> Customer-approved mock note';
      await prepare(page, note);
      await expect(page.getByTestId("proposal-note")).toHaveText(note);
      await expect(
        page.getByRole("button", {
          name: "Approve this exact write",
          exact: true,
        }),
      ).toBeDisabled();
      await expect(page.getByLabel("Note to add")).toBeDisabled();
      await expect(
        page.getByRole("button", {
          name: "Execute approved write",
          exact: true,
        }),
      ).toHaveCount(0);
      await page
        .getByLabel("I reviewed this exact note and approve adding it once.")
        .check();
      await page
        .getByRole("button", { name: "Approve this exact write", exact: true })
        .click();
      await expect(
        page.getByRole("heading", {
          name: "Approved, awaiting execution",
          exact: true,
        }),
      ).toBeVisible();
      if (process.env.KXRA_CONNECTOR_SCREENSHOT)
        await page.screenshot({
          path: process.env.KXRA_CONNECTOR_SCREENSHOT,
          fullPage: true,
        });
      let writes = 0;
      page.on("request", (request) => {
        if (
          request.url() === `${testOrigin}/api/customer-connectors` &&
          request.method() === "POST" &&
          request.postDataJSON()?.action === "execute"
        )
          writes++;
      });
      await page
        .getByRole("button", { name: "Execute approved write", exact: true })
        .evaluate((button) => {
          (button as HTMLButtonElement).click();
          (button as HTMLButtonElement).click();
        });
      await expect(
        page.getByRole("heading", { name: "Write completed", exact: true }),
      ).toBeVisible();
      assert.equal(writes, 1);
      await page
        .getByRole("button", { name: "Read notes", exact: true })
        .click();
      await expect(
        page.getByLabel("Read results").getByText(note, { exact: true }),
      ).toBeVisible();
      assert.equal(await page.locator("main img").count(), 0);
      assert.equal(
        await page.evaluate(() => "mockConnectorInjected" in window),
        false,
      );
      assert.equal(
        await page.evaluate(() => localStorage.length + sessionStorage.length),
        0,
      );
    } finally {
      await clean(session);
    }
  },
);

test(
  "mobile customer rejects writes, switches connections without approval carryover, and revokes",
  { timeout: 90000 },
  async () => {
    const session = await customer(fixtureUsers.owner, true);
    const { page } = session;
    try {
      const first = await connect(page, true);
      await prepare(page, "Rejected mobile note");
      await page
        .getByRole("button", { name: "Reject write", exact: true })
        .click();
      await expect(page.getByRole("status").first()).toHaveText(
        "Write rejected. Read again to prepare a different note.",
      );
      await expect(
        page.getByRole("button", { name: "Prepare write", exact: true }),
      ).toBeDisabled();
      await prepare(page, "Never approve after switching");
      await page
        .getByLabel("I reviewed this exact note and approve adding it once.")
        .check();
      const second = await connect(page, true);
      assert.notEqual(first, second);
      await page.getByLabel("Connection", { exact: true }).selectOption(first);
      await expect(page.getByLabel("Write proposal")).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "Prepare write", exact: true }),
      ).toBeDisabled();
      await prepare(page, "Cancel by revoking");
      await page
        .getByRole("button", { name: "Revoke connection", exact: true })
        .click();
      await expect(page.getByText("Revoked", { exact: true })).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Read notes", exact: true }),
      ).toBeDisabled();
      await expect(page.getByLabel("Write proposal")).toHaveCount(0);
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > window.innerWidth,
        ),
        false,
      );
    } finally {
      await clean(session);
    }
  },
);

test(
  "server expiry and failed requests clear review state instead of enabling execution or retrying",
  { timeout: 90000 },
  async () => {
    const session = await customer();
    const { page } = session;
    try {
      const connector = await connect(page, true);
      await prepare(page, "Expired mock proposal");
      await admin.query(
        "update kxra_private.connector_requests set expires_at=now()-interval '1 second' where connector_id=$1 and state='PENDING'",
        [connector],
      );
      await page
        .getByLabel("I reviewed this exact note and approve adding it once.")
        .check();
      await page
        .getByRole("button", { name: "Approve this exact write", exact: true })
        .click();
      await expect(page.locator("main").getByRole("alert")).toContainText(
        "expired, changed or was already used",
      );
      await expect(
        page.getByRole("button", {
          name: "Execute approved write",
          exact: true,
        }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "Prepare write", exact: true }),
      ).toBeDisabled();
      await page.route("**/api/customer-connectors", (route) =>
        route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "Mock failure" }),
        }),
      );
      await page
        .getByRole("button", { name: "Refresh connections", exact: true })
        .click();
      await expect(page.locator("main").getByRole("alert")).toContainText(
        "will not be retried automatically",
      );
      assert.equal(
        Number(
          (
            await admin.query(
              "select count(*) from kxra_private.connector_notes where connector_id=$1",
              [connector],
            )
          ).rows[0].count,
        ),
        0,
      );
    } finally {
      await clean(session);
    }
  },
);

test(
  "connection page requires authentication and another user's notes never enter its DOM",
  { timeout: 90000 },
  async () => {
    const anonymous = await customer(null);
    try {
      await expect(
        anonymous.page.getByRole("heading", {
          name: "Sign in to view connections",
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        anonymous.page.getByRole("button", {
          name: "Connect Mock Notes",
          exact: true,
        }),
      ).toHaveCount(0);
    } finally {
      await clean(anonymous);
    }
    const other = await customer(fixtureUsers.partner);
    try {
      await expect(
        other.page.getByRole("heading", { name: "Connections", exact: true }),
      ).toBeVisible();
      await expect(
        other.page.getByText("No connections yet.", { exact: false }),
      ).toBeVisible();
      await expect(
        other.page.getByText("Customer-approved mock note", { exact: false }),
      ).toHaveCount(0);
    } finally {
      await clean(other);
    }
  },
);

test(
  "lost response after committed execution is not retried; a fresh read reconciles the single note",
  { timeout: 90000 },
  async () => {
    const session = await customer();
    const { page } = session;
    try {
      const connector = await connect(page, true);
      await prepare(page, "Committed once, response lost");
      await page
        .getByLabel("I reviewed this exact note and approve adding it once.")
        .check();
      await page
        .getByRole("button", { name: "Approve this exact write", exact: true })
        .click();
      await expect(
        page.getByRole("heading", {
          name: "Approved, awaiting execution",
          exact: true,
        }),
      ).toBeVisible();
      let attempts = 0;
      await page.route("**/api/customer-connectors", async (route) => {
        if (
          route.request().method() === "POST" &&
          route.request().postDataJSON()?.action === "execute"
        ) {
          attempts++;
          const response = await route.fetch();
          assert.equal(response.status(), 200);
          await route.abort("failed");
        } else await route.continue();
      });
      await page
        .getByRole("button", { name: "Execute approved write", exact: true })
        .click();
      await expect(page.locator("main").getByRole("alert")).toContainText(
        "will not be retried automatically",
      );
      await expect(
        page.getByRole("button", {
          name: "Execute approved write",
          exact: true,
        }),
      ).toHaveCount(0);
      assert.equal(attempts, 1);
      assert.equal(
        Number(
          (
            await admin.query(
              "select count(*) from kxra_private.connector_notes where connector_id=$1",
              [connector],
            )
          ).rows[0].count,
        ),
        1,
      );
      await page.unroute("**/api/customer-connectors");
      await page
        .getByRole("button", { name: "Read notes", exact: true })
        .click();
      await expect(
        page
          .getByLabel("Read results")
          .getByText("Committed once, response lost", { exact: true }),
      ).toBeVisible();
      assert.equal(attempts, 1);
    } finally {
      await clean(session);
    }
  },
);
test(
  "client expiry timer disables review without attempting approval",
  { timeout: 90000 },
  async () => {
    const session = await customer(fixtureUsers.owner, false, true);
    const { page } = session;
    try {
      await connect(page, true);
      await prepare(page, "Client expiry preview");
      await page.clock.fastForward(301000);
      await expect(
        page.getByText(
          "Proposal expired. Refresh connections, then read again to prepare a new write.",
          { exact: true },
        ),
      ).toBeVisible();
      await expect(
        page.getByRole("button", {
          name: "Approve this exact write",
          exact: true,
        }),
      ).toBeDisabled();
      await expect(
        page.getByLabel(
          "I reviewed this exact note and approve adding it once.",
        ),
      ).toBeDisabled();
    } finally {
      await clean(session);
    }
  },
);

test(
  "malformed successful connect and list results never enter React state",
  { timeout: 90000 },
  async () => {
    const session = await customer();
    const { page } = session;
    try {
      await page.route("**/api/customer-connectors", (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            result: route.request().method() === "POST" ? null : {},
          }),
        }),
      );
      await page
        .getByRole("button", { name: "Connect Mock Notes", exact: true })
        .click();
      await expect(page.locator("main").getByRole("alert")).toContainText(
        "will not be retried automatically",
      );
      await expect(
        page.getByRole("heading", { name: "Connections", exact: true }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "Refresh connections", exact: true })
        .click();
      await expect(page.locator("main").getByRole("alert")).toContainText(
        "will not be retried automatically",
      );
      await expect(
        page.getByRole("button", { name: "Connect Mock Notes", exact: true }),
      ).toBeEnabled();
    } finally {
      await clean(session);
    }
  },
);
