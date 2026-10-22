import { test, expect, type Page } from "@playwright/test";
import crypto from "node:crypto";
import { knowledgeFixture, knowledgeOk } from "../support/team-knowledge";
import { testOrigin } from "../support/runtime";
async function login(page: Page, identity = "partner") {
  await page.goto("/login");
  await page.getByText("Local fixture identities", { exact: true }).click();
  await page.getByLabel("Synthetic identity").selectOption(identity);
  await page.getByRole("button", { name: "Use fixture", exact: true }).click();
  await expect(page).toHaveURL(/\/os/);
}
test("operations board persists reviewed work, retries a failed decision and rejects stale or non-creator decisions", async ({
  page,
  browser,
}) => {
  test.setTimeout(90000);
  const f = await knowledgeFixture(false);
  await login(page);
  await page.goto(`/os/workspace/${f.room}?view=tasks`);
  const title = "Maya: review handoff " + crypto.randomUUID();
  await page.getByLabel("Outcome and responsible person").fill(title);
  await page.getByRole("button", { name: "Propose task", exact: true }).click();
  const board = page.getByRole("region", { name: "Room operations board" });
  const proposed = board.getByRole("region", {
    name: "Proposed tasks",
    exact: true,
  });
  await expect(
    proposed.getByRole("article", { name: title, exact: true }),
  ).toBeVisible();
  const detail = await knowledgeOk("/" + f.room, f.cookie),
    item = detail.items.find((i: { title: string }) => i.title === title);
  expect(item.state).toBe("PROPOSED");
  await page.route(`**/api/team-space/${f.room}/decide`, (r) =>
    r.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        error: "Synthetic decision transport unavailable",
      }),
    }),
  );
  await proposed
    .getByRole("button", { name: "Record decision", exact: true })
    .click();
  await expect(proposed.getByRole("status")).toContainText(
    "Synthetic decision transport unavailable",
  );
  await expect(
    proposed.getByRole("article", { name: title, exact: true }),
  ).toBeVisible();
  await page.unroute(`**/api/team-space/${f.room}/decide`);
  await proposed
    .getByRole("button", { name: "Record decision", exact: true })
    .click();
  const approved = board.getByRole("region", {
    name: "Approved tasks",
    exact: true,
  });
  await expect(
    approved.getByRole("article", { name: title, exact: true }),
  ).toBeVisible();
  const stale = await page.request.post(`/api/team-space/${f.room}/decide`, {
    headers: { origin: testOrigin },
    data: { item_id: item.id, version: 1, state: "DONE" },
  });
  expect(stale.status()).toBe(409);
  await knowledgeOk(`/${f.room}/members`, f.cookie, {
    account_id: "20000000-0000-4000-8000-000000000001",
    active: true,
  });
  const other = await browser.newContext({ baseURL: testOrigin });
  const member = await other.newPage();
  try {
    await login(member, "owner");
    await member.goto(`/os/workspace/${f.room}?view=tasks`);
    await expect(
      member
        .getByRole("region", { name: "Room operations board" })
        .getByRole("button", { name: "Record decision", exact: true }),
    ).toHaveCount(0);
    const denied = await member.request.post(
      `/api/team-space/${f.room}/decide`,
      {
        headers: { origin: testOrigin },
        data: { item_id: item.id, version: 2, state: "DONE" },
      },
    );
    // The existing decision transaction deliberately shares its conflict response
    // for stale versions and unavailable authority; assert the persisted state too.
    expect(denied.status()).toBe(409);
    expect(await denied.json()).toEqual({
      error: "Action conflicts with current state or permissions",
    });
    const afterDenial = (await knowledgeOk("/" + f.room, f.cookie)).items.find(
      (i: { id: string }) => i.id === item.id,
    );
    expect(afterDenial.state).toBe("APPROVED");
    expect(afterDenial.version).toBe(2);
  } finally {
    await other.close();
  }
  await approved
    .getByRole("button", { name: "Record decision", exact: true })
    .click();
  const completed = board.getByRole("region", {
    name: "Completed tasks",
    exact: true,
  });
  await expect(
    completed.getByRole("article", { name: title, exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    completed.getByRole("article", { name: title, exact: true }),
  ).toBeVisible();
  await board.getByLabel("Find a task").fill("not-a-task");
  await expect(
    board.getByText(
      "No matching tasks. Clear the search to return to the board.",
      { exact: true },
    ),
  ).toBeVisible();
  await board
    .getByRole("button", { name: "Clear task search", exact: true })
    .click();
  await expect(
    completed.getByRole("article", { name: title, exact: true }),
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
  expect(
    (await knowledgeOk("/" + f.room, f.cookie)).items.find(
      (i: { id: string }) => i.id === item.id,
    ).state,
  ).toBe("DONE");
});
