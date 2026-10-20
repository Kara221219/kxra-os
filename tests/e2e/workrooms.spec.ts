import { test, expect, type Page } from "@playwright/test";
async function login(page: Page, fixture: string) {
  await page.goto("/login");
  await page.getByText("Local fixture identities", { exact: true }).click();
  await page.getByLabel("Synthetic identity").selectOption(fixture);
  await page.getByRole("button", { name: "Use fixture" }).click();
  await expect(page).toHaveURL(/\/os/);
}
test("partner discussion persists and owner-only tools are absent", async ({
  page,
}) => {
  await login(page, "partner");
  await page.goto("/os/workrooms/30000000-0000-4000-8000-000000000002");
  const title = `Browser discussion ${Date.now()}`;
  await page.getByLabel("Discussion title").fill(title);
  await page
    .getByLabel("Goal and context")
    .fill("Synthetic project discussion for acceptance.");
  await page
    .getByRole("button", { name: "Create discussion", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  await page.getByLabel("Your reply").fill("A durable browser reply");
  await page.getByRole("button", { name: "Save reply", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Discussion replies" }),
  ).toContainText("A durable browser reply");
  await page.reload();
  await expect(
    page.getByRole("region", { name: "Discussion replies" }),
  ).toContainText("A durable browser reply");
  const download = await page.request.get(
    (await page
      .getByRole("link", { name: "Download discussion for an agent" })
      .getAttribute("href"))!,
  );
  expect(download.status()).toBe(200);
  expect(await download.text()).toContain("A durable browser reply");
  await expect(
    page.getByRole("link", { name: "Advisory Board", exact: true }),
  ).toHaveCount(0);
  expect((await page.request.get("/api/advisory-board")).status()).toBe(403);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
});
test("owner can prepare, assess, reload and export a private advisory review", async ({
  page,
}) => {
  await login(page, "owner");
  await page.goto("/os/advisory-board");
  const title = `Browser decision ${Date.now()}`;
  await page.getByLabel("Decision title", { exact: true }).fill(title);
  await page
    .getByLabel("Decision question", { exact: true })
    .fill("Which demand test should we run first?");
  await page
    .getByLabel("Options — one per line, two to five")
    .fill("Interview buyers\nBuild more tools");
  await page.getByRole("button", { name: "Prepare review pack" }).click();
  await expect(
    page.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  const selects = page.locator('select[name^="0-"]');
  for (let i = 0; i < (await selects.count()); i++)
    await selects.nth(i).selectOption("4");
  const others = page.locator('select[name^="1-"]');
  for (let i = 0; i < (await others.count()); i++)
    await others.nth(i).selectOption("2");
  await page
    .getByLabel("Evidence, rationale and disagreements")
    .fill("Synthetic owner assessment; validate before spending.");
  await page
    .getByLabel("Uncertainty and next validation test")
    .fill("Interview five buyers before selecting an offer.");
  await page
    .getByRole("button", { name: "Save assessment", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Reviewed ranking" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("Highest scored option: Interview buyers", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Source: owner assessment", { exact: true }),
  ).toBeVisible();
  const exported = await page.request.get(
    (await page
      .getByRole("link", { name: "Download review pack", exact: true })
      .getAttribute("href"))!,
  );
  expect(exported.status()).toBe(200);
  expect((await exported.json()).review.ranking.ranked[0].score).toBe(80);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
});
