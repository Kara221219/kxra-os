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
test("approved catalogue selection recovers one lost receipt, persists exact seats and never enables checkout", async ({
  page,
}) => {
  test.setTimeout(120000);
  for (const [key, price, seats] of [
    ["KXRA_STARTER_V1", 2900, 1],
    ["KXRA_TEAM_V1", 7900, 5],
    ["KXRA_BUSINESS_V1", 19900, 15],
  ] as const) {
    const f = await tenant(page);
    try {
      await page.goto("/os/start");
      await page
        .getByText("Reviewed test billing and local lifecycle controls", {
          exact: true,
        })
        .click();
      const pilot = page.getByRole("region", {
        name: "Workspace pilot preview",
      });
      await pilot.getByLabel("Approved workspace plan").selectOption(key);
      const ids: string[] = [];
      await page.route("**/api/team-space/pilot/catalogue", async (route) => {
        ids.push(route.request().postDataJSON().request_id);
        const response = await route.fetch();
        if (ids.length === 1) {
          expect(response.status()).toBe(200);
          await route.fulfill({
            status: 503,
            contentType: "application/json",
            body: JSON.stringify({
              error: "Synthetic lost catalogue acknowledgement",
            }),
          });
        } else await route.fulfill({ response });
      });
      await pilot
        .getByRole("button", {
          name: "Select local simulation plan",
          exact: true,
        })
        .click();
      await expect(pilot).toContainText(
        "Synthetic lost catalogue acknowledgement",
      );
      await pilot
        .getByRole("button", {
          name: "Select local simulation plan",
          exact: true,
        })
        .click();
      await expect(pilot).toContainText("PENDING");
      expect(ids).toHaveLength(2);
      expect(ids[0]).toBe(ids[1]);
      await page.unroute("**/api/team-space/pilot/catalogue");
      await page.reload();
      await page
        .getByText("Reviewed test billing and local lifecycle controls", {
          exact: true,
        })
        .click();
      const state = await (
        await page.request.get("/api/team-space/pilot")
      ).json();
      expect(state.offer.offer_key).toBe(key);
      expect(state.offer.monthly_amount_minor).toBe(price);
      expect(state.seat_capacity).toBe(seats);
      expect(state.subscription.version).toBe(1);
      expect(state.entitled).toBe(false);
      expect(state.checkout_enabled).toBe(false);
      await expect(pilot).toContainText("Checkout remains disabled");
      await expect(
        pilot.getByRole("button", {
          name: "Select local simulation plan",
          exact: true,
        }),
      ).toHaveCount(0);
      await pilot
        .getByRole("button", { name: "Simulate ACTIVATE", exact: true })
        .click();
      await expect
        .poll(
          async () =>
            (await (await page.request.get("/api/team-space/pilot")).json())
              .entitled,
        )
        .toBe(true);
      const room = await page.request.post("/api/team-space", {
        headers: { origin: testOrigin },
        data: {
          project_id: f.project,
          name: "Persistent catalogue " + key,
          guidelines: "Synthetic fixture only",
          access: "PRIVATE",
        },
      });
      expect(room.status()).toBe(201);
      const saved = await room.json();
      await page.reload();
      await page
        .getByText("Reviewed test billing and local lifecycle controls", {
          exact: true,
        })
        .click();
      await pilot
        .getByRole("button", { name: "Simulate CANCEL_NOW", exact: true })
        .click();
      await expect
        .poll(
          async () =>
            (await (await page.request.get("/api/team-space/pilot")).json())
              .entitled,
        )
        .toBe(false);
      expect(
        (await page.request.get("/api/team-space/" + saved.id)).status(),
      ).toBe(200);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    } finally {
      await page.unroute("**/api/team-space/pilot/catalogue");
      await f.cleanup();
    }
  }
});
