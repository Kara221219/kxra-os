import { test, expect, type Page } from "@playwright/test";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import pg from "pg";
import { runtimeFile, testOrigin } from "../support/runtime";
async function login(page: Page, fixture = "owner") {
  await page.goto("/login");
  await page.getByText("Local fixture identities", { exact: true }).click();
  await page.getByLabel("Synthetic identity").selectOption(fixture);
  await page.getByRole("button", { name: "Use fixture", exact: true }).click();
  await expect(page).toHaveURL(/\/os/);
}
async function tenant(page: Page, pending = false) {
  // Authenticate before adding a second membership. A fresh session must correctly
  // require organisation selection when more than one membership exists.
  await login(page);
  const config = JSON.parse(
    fs.readFileSync(runtimeFile("database.json"), "utf8"),
  );
  const db = new pg.Client({ ...config, user: os.userInfo().username });
  await db.connect();
  const org = crypto.randomUUID(),
    project = crypto.randomUUID();
  try {
    await db.query(
      "insert into kxra.organisations(id,name,slug) values($1,'Synthetic activation workspace',$2)",
      [org, "activation-" + crypto.randomUUID()],
    );
    await db.query(
      "insert into kxra.organisation_memberships(org_id,account_id,security_role,relationship_type,state,display_name,grant_source) values($1,'20000000-0000-4000-8000-000000000001','ORG_ADMIN','CUSTOMER','ACTIVE','Synthetic activation owner','AT_PILOT')",
      [org],
    );
    await db.query(
      "insert into kxra.projects(id,org_id,code,name,stage,status,next_action) values($1,$2,'ACT','Activation fixture','TEST','ACTIVE','Review')",
      [project, org],
    );
    if (pending) {
      const customer = "cus_" + crypto.randomBytes(8).toString("hex");
      await db.query(
        "insert into kxra.billing_customers(org_id,provider_customer_id) values($1,$2)",
        [org, customer],
      );
      await db.query(
        "insert into kxra.pilot_stripe_bindings(org_id,customer_id) values($1,$2)",
        [org, customer],
      );
      await db.query(
        "insert into kxra.pilot_stripe_intents(id,org_id,actor_id,kind,include_setup,customer_id,observed_version) values($1,$2,'20000000-0000-4000-8000-000000000001','CHECKOUT',false,$3,0)",
        [crypto.randomUUID(), org, customer],
      );
    }
  } finally {
    await db.end();
  }
  const response = await page.request.post("/api/context", {
    headers: { origin: testOrigin },
    data: { organisation_id: org },
  });
  expect(response.status()).toBe(200);
  return {
    org,
    project,
    async cleanup() {
      const db = new pg.Client({ ...config, user: os.userInfo().username });
      await db.connect();
      try {
        await db.query(
          "update kxra.organisation_memberships set state='REVOKED',revoked_at=now() where org_id=$1",
          [org],
        );
      } finally {
        await db.end();
      }
    },
  };
}
test("billing returns cannot activate a pending tenant; status failures clear and recover", async ({
  page,
}) => {
  const f = await tenant(page, true);
  try {
    await page.goto("/os/start?pilot=returned&paid=true&entitled=true");
    await expect(
      page.getByRole("heading", {
        name: "Awaiting accepted subscription",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByText(/This URL does not prove payment/),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "View existing rooms ↗", exact: true }),
    ).toBeVisible();
    const denied = await page.request.post("/api/team-space", {
      headers: { origin: testOrigin },
      data: {
        project_id: f.project,
        name: "Forged return cannot grant",
        guidelines: "",
        access: "PRIVATE",
      },
    });
    expect(denied.status()).toBe(409);
    await page.goto("/os/start?pilot=cancelled");
    await expect(
      page.getByText(/Checkout was cancelled or left unfinished/),
    ).toBeVisible();
    await page
      .getByText("Reviewed test billing and local lifecycle controls", {
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("button", { name: "Simulate ACTIVATE", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByText(/An earlier checkout request is retained on the server/),
    ).toBeVisible();
    const first = await (
      await page.request.get("/api/team-space/pilot")
    ).json();
    await page.reload();
    const repeated = await (
      await page.request.get("/api/team-space/pilot")
    ).json();
    expect(repeated.test_billing.recovery.request_id).toBe(
      first.test_billing.recovery.request_id,
    );
    expect(repeated.entitled).toBe(false);
    const checkout = await page.request.post(
      "/api/team-space/pilot/billing/checkout",
      {
        headers: { origin: testOrigin },
        data: { request_id: crypto.randomUUID() },
      },
    );
    expect(checkout.status()).toBe(503);
    await page.route("**/api/team-space/start", (r) => r.abort("failed"));
    await page
      .getByRole("button", { name: "Check recorded access", exact: true })
      .click();
    await expect(
      page.getByRole("status").filter({ hasText: /fetch/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", {
        name: "Awaiting accepted subscription",
        exact: true,
      }),
    ).toHaveCount(0);
    await page.unroute("**/api/team-space/start");
    await page
      .getByRole("button", { name: "Check recorded access", exact: true })
      .click();
    await expect(
      page.getByRole("heading", {
        name: "Awaiting accepted subscription",
        exact: true,
      }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole("heading", {
        name: "Awaiting accepted subscription",
        exact: true,
      }),
    ).toBeVisible();
  } finally {
    await f.cleanup();
  }
});
test("explicit fixture lifecycle unlocks actual persistent work; cancellation stops writes and retains history", async ({
  page,
}) => {
  const f = await tenant(page);
  try {
    await page.goto("/os/start");
    await expect(
      page.getByRole("heading", { name: "No pilot assigned", exact: true }),
    ).toBeVisible();
    await page
      .getByText("Reviewed test billing and local lifecycle controls", {
        exact: true,
      })
      .click();
    await page
      .getByRole("button", { name: "Simulate ACTIVATE", exact: true })
      .click();
    await expect(
      page.getByRole("region", { name: "Workspace pilot preview" }),
    ).toContainText("ACTIVE · Revision 1");
    await page
      .getByRole("button", { name: "Check recorded access", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "ACTIVE", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(
        "Synthetic lifecycle record only. This is not a paid subscription.",
        { exact: true },
      ),
    ).toBeVisible();
    await page
      .getByRole("link", { name: "Create or open a room ↗", exact: true })
      .click();
    await page.getByLabel("Room name").fill("First accepted local workspace");
    await page
      .getByRole("button", { name: "Create room", exact: true })
      .click();
    await expect(
      page.getByRole("heading", {
        name: "First accepted local workspace",
        exact: true,
      }),
    ).toBeVisible();
    const room = page.url().split("/").pop()!;
    await page
      .getByLabel("Message", { exact: true })
      .fill("Durable first work after explicit synthetic activation");
    await page
      .getByRole("button", { name: "Send message", exact: true })
      .click();
    await expect(
      page.locator(".team-message p.team-text").filter({
        hasText: "Durable first work after explicit synthetic activation",
      }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.locator(".team-message p.team-text").filter({
        hasText: "Durable first work after explicit synthetic activation",
      }),
    ).toBeVisible();
    await page.goto("/os/start");
    await page
      .getByText("Reviewed test billing and local lifecycle controls", {
        exact: true,
      })
      .click();
    await page
      .getByRole("button", { name: "Simulate CANCEL_NOW", exact: true })
      .click();
    await expect(
      page.getByRole("region", { name: "Workspace pilot preview" }),
    ).toContainText("CANCELLED · Revision 2");
    await page
      .getByRole("button", { name: "Check recorded access", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "CANCELLED", exact: true }),
    ).toBeVisible();
    const write = await page.request.post(`/api/team-space/${room}/messages`, {
      headers: { origin: testOrigin },
      data: { request_id: crypto.randomUUID(), body: "Cancelled write denied" },
    });
    expect(write.status()).toBe(409);
    await page.goto("/os/workspace/" + room);
    await expect(
      page.locator(".team-message p.team-text").filter({
        hasText: "Durable first work after explicit synthetic activation",
      }),
    ).toBeVisible();
  } finally {
    await f.cleanup();
  }
});
test("getting started is session-scoped and shows no owner billing actions to a member", async ({
  page,
  request,
}) => {
  expect((await request.get("/api/team-space/start")).status()).toBe(401);
  await login(page, "partner");
  await page.goto("/os/start");
  await expect(
    page.getByRole("heading", {
      name: "Workspace administrator manages billing",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText("Reviewed test billing and local lifecycle controls", {
      exact: true,
    }),
  ).toHaveCount(0);
  const response = await page.request.get("/api/team-space/start");
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toContain("no-store");
  expect((await response.json()).billing).toBeNull();
  for (const width of [360, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 950 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      String(width),
    ).toBe(true);
  }
});
