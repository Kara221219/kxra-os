import { test, expect } from "@playwright/test";
import crypto from "node:crypto";
import { knowledgeFixture, knowledgeOk } from "../support/team-knowledge";
async function login(
  page: import("@playwright/test").Page,
  identity = "partner",
) {
  await page.goto("/login");
  await page.getByText("Local fixture identities", { exact: true }).click();
  await page.getByLabel("Synthetic identity").selectOption(identity);
  await page.getByRole("button", { name: "Use fixture", exact: true }).click();
  await expect(page).toHaveURL(/\/os/);
}
test("private workbench keeps the selected view, scoped context and actual message across a new session", async ({
  page,
}) => {
  test.setTimeout(90000);
  const f = await knowledgeFixture(false);
  await login(page);
  await page.goto(`/os/workspace/${f.room}`);
  await expect(
    page.getByRole("complementary", { name: "Room context" }),
  ).toContainText("Explicit private membership");
  await page
    .getByLabel("Find a room")
    .fill("not-a-room-" + crypto.randomUUID());
  await expect(page.getByText("No matching rooms.")).toBeVisible();
  await page.getByRole("button", { name: "Clear room search" }).click();
  await expect(
    page.locator('.team-room-list a[aria-current="page"]'),
  ).toContainText("Knowledge room");
  await page.getByRole("tab", { name: "Conversation", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("tab", { name: "Tasks", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page
    .getByRole("button", { name: "Open CRM workflow", exact: true })
    .click();
  await expect(page).toHaveURL(/view=workflow/);
  await page.reload();
  await expect(
    page.getByRole("tab", { name: "Workflow", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: "Conversation", exact: true }).click();
  const message = "Persistent reference workbench " + crypto.randomUUID();
  await page.getByLabel("Message", { exact: true }).fill(message);
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(
    page.locator(".team-message p.team-text").filter({ hasText: message }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await login(page);
  await page.goto(`/os/workspace/${f.room}?view=conversation`);
  await expect(
    page.locator(".team-message p.team-text").filter({ hasText: message }),
  ).toBeVisible();
  await expect(
    page.getByText(/Local demonstration: synthetic models only/),
  ).toBeVisible();
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
test("CRM retries uncertain delivery once, persists approved conversion and denies an unrelated session", async ({
  page,
  browser,
}) => {
  test.setTimeout(90000);
  const f = await knowledgeFixture(false);
  await login(page);
  await page.goto(`/os/workspace/${f.room}?view=workflow`);
  const crm = page.getByRole("region", { name: "Room CRM workflow" });
  const title = "Durable prospect " + crypto.randomUUID();
  await crm.getByLabel("Lead name", { exact: true }).fill(title);
  await crm
    .getByLabel("Lead context", { exact: true })
    .fill("Synthetic qualified prospect");
  await crm
    .getByLabel("Lead next step", { exact: true })
    .fill("Review precise scope");
  let sent = 0;
  await page.route(`**/api/team-space/${f.room}/lead`, async (route) => {
    sent++;
    const response = await route.fetch();
    expect(response.status()).toBe(201);
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        error: "Delivery acknowledgement unavailable; retry unchanged.",
      }),
    });
  });
  await crm.getByRole("button", { name: "Capture lead", exact: true }).click();
  await expect(
    crm
      .getByRole("status")
      .filter({ hasText: "Delivery acknowledgement unavailable" }),
  ).toBeVisible();
  await page.unroute(`**/api/team-space/${f.room}/lead`);
  await crm.getByRole("button", { name: "Capture lead", exact: true }).click();
  expect(sent).toBe(1);
  await expect(
    crm.getByRole("heading", { name: "LEAD · " + title, exact: true }),
  ).toBeVisible();
  expect(
    (await knowledgeOk(`/${f.room}/workflow-records`, f.cookie)).records,
  ).toHaveLength(1);
  await crm.getByLabel("Account name", { exact: true }).fill("Scoped account");
  await crm
    .getByLabel("Opportunity name", { exact: true })
    .fill("Reviewed opportunity");
  await crm
    .getByLabel("Conversion next step", { exact: true })
    .fill("Prepare agreed handover");
  await crm
    .getByRole("button", { name: "Propose lead conversion", exact: true })
    .click();
  await expect(
    crm.getByRole("heading", {
      name: "Scoped account → Reviewed opportunity",
      exact: true,
    }),
  ).toBeVisible();
  const action = (await knowledgeOk(`/${f.room}/workflow-actions`, f.cookie))
    .actions[0];
  await crm
    .getByRole("button", {
      name: `Approve conversion ${action.id}`,
      exact: true,
    })
    .click();
  await crm
    .getByRole("button", {
      name: `Execute conversion ${action.id}`,
      exact: true,
    })
    .click();
  await expect(
    crm.getByRole("heading", { name: "ACCOUNT · Scoped account", exact: true }),
  ).toBeVisible();
  await crm
    .getByLabel("Record type", { exact: true })
    .selectOption("OPPORTUNITY");
  await expect(
    crm.getByRole("heading", {
      name: "OPPORTUNITY · Reviewed opportunity",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    crm.getByRole("heading", { name: "ACCOUNT · Scoped account", exact: true }),
  ).toHaveCount(0);
  await crm.getByLabel("Search CRM records").fill("no-match");
  await expect(crm.getByText("No matching loaded records.")).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await login(page);
  await page.goto(`/os/workspace/${f.room}?view=workflow`);
  await expect(
    crm.getByRole("heading", {
      name: "OPPORTUNITY · Reviewed opportunity",
      exact: true,
    }),
  ).toBeVisible();
  expect(
    (await knowledgeOk(`/${f.room}/workflow-records`, f.cookie)).records,
  ).toHaveLength(3);
  const recordPath = `**/api/team-space/${f.room}/workflow-records`;
  await page.route(recordPath, (route) => route.abort("failed"));
  await crm
    .getByRole("button", { name: "Refresh workflow", exact: true })
    .click();
  await expect(
    crm.getByRole("status").filter({ hasText: /fetch/i }),
  ).toBeVisible();
  await page.unroute(recordPath);
  await crm
    .getByRole("button", { name: "Refresh workflow", exact: true })
    .click();
  await expect(
    crm.getByRole("status").filter({ hasText: /fetch/i }),
  ).toHaveCount(0);
  await expect(
    crm.getByRole("heading", { name: "ACCOUNT · Scoped account", exact: true }),
  ).toBeVisible();
  const other = await browser.newContext({
    baseURL: new URL(page.url()).origin,
  });
  const outsider = await other.newPage();
  expect(
    (
      await other.request.get(`/api/team-space/${f.room}/workflow-records`)
    ).status(),
  ).toBe(401);
  await login(outsider, "owner");
  expect(
    (
      await other.request.get(`/api/team-space/${f.room}/workflow-records`)
    ).status(),
  ).toBe(404);
  await outsider.goto(`/os/workspace/${f.room}?view=workflow`);
  await expect(
    outsider.getByText("Scoped account", { exact: true }),
  ).toHaveCount(0);
  await expect(
    outsider.getByRole("region", { name: "Room CRM workflow" }),
  ).toHaveCount(0);
  await other.close();
});
