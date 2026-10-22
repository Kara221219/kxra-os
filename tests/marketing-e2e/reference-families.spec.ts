import { test, expect } from "@playwright/test";
test("original illustrated hero is responsive, static and locally served", async ({
  page,
}) => {
  await page.goto("/");
  const image = page.getByRole("img", {
    name: /Original illustration of people collaborating/,
  });
  await expect(image).toBeVisible();
  await expect
    .poll(() => image.evaluate((el) => (el as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0);
  expect(await image.getAttribute("src")).toContain(
    "kxra-collaborative-cutaway-v1.png",
  );
  await expect(page.locator("canvas")).toHaveCount(0);
  for (const width of [360, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 950 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      String(width),
    ).toBe(true);
  }
});
test("solutions, use-case panels and connection details lead to differentiated routes", async ({
  page,
}) => {
  test.setTimeout(60000);
  await page.goto("/solutions");
  await page
    .getByRole("group", { name: "Solution audiences" })
    .getByRole("button", { name: "Technical teams" })
    .click();
  await expect(page.getByRole("status")).toContainText("1 workflow");
  await page
    .getByRole("link", { name: /Build the smallest useful internal tool/ })
    .click();
  await expect(page.locator(".partner-guide-sections>article")).toHaveCount(3);
  await page.getByRole("link", { name: "Open the app sample" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Sampling Desk",
  );
  await page.goto("/use-cases");
  await page
    .getByRole("group", { name: "Use case views" })
    .getByRole("button", { name: "Connections" })
    .click();
  await page.getByRole("link", { name: /Gmail/ }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Gmail");
  await expect(page.locator("main")).toContainText("NOT CONNECTED HERE");
  await expect(page.getByRole("button", { name: /^Connect/ })).toHaveCount(0);
  await page.getByRole("link", { name: "See the related workflow" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Turn an email question into reviewed work.",
  );
  await page.goto("/use-cases/hiring");
  await expect(
    page.locator(".ref-workspace").getByRole("button", { name: /hiring/i }),
  ).toHaveAttribute("aria-pressed", "true");
  await page
    .locator(".ref-workspace")
    .getByRole("button", { name: /Sample candidate/ })
    .click();
  await expect(page.locator(".ref-stage-columns>div").nth(1)).toContainText(
    "Sample candidate",
  );
});
test("integration directory filters every group and recovers from an empty result", async ({
  page,
}) => {
  await page.goto("/integrations");
  await page.getByLabel("SEARCH INTEGRATIONS").fill("Gmail");
  await expect(page.getByRole("status")).toContainText("1 result");
  await expect(page.locator(".directory-group")).toHaveCount(1);
  await page.getByLabel("SEARCH INTEGRATIONS").fill("");
  await page.getByRole("button", { name: "Capabilities", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("3 results");
  await page.getByLabel("SEARCH INTEGRATIONS").fill("not-a-provider-xyz");
  await expect(
    page.getByRole("heading", { name: "No matching connections." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Reset filters" }).click();
  await expect(page.getByRole("status")).toContainText("9 results");
});
test("original articles, resource guides and approach controls have real outcomes", async ({
  page,
}) => {
  test.setTimeout(60000);
  await page.goto("/blog");
  await page.getByRole("button", { name: "Guide", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("2 articles");
  await page.locator(".editorial-grid>a").first().click();
  await expect(page.locator(".editorial-article article section")).toHaveCount(
    4,
  );
  await page.locator(".help-related a").first().click();
  await expect(page.locator(".editorial-article article section")).toHaveCount(
    4,
  );
  await page.goto("/blog");
  await page.getByLabel("SEARCH ARTICLES").fill("missing-search-term-xyz");
  await expect(
    page.getByRole("heading", { name: "No articles match." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Reset articles" }).click();
  await expect(page.getByRole("status")).toContainText("4 articles");
  await page.goto("/resources/developers");
  await expect(page.locator("main")).toContainText("no executable CLI");
  await expect(page.getByRole("link", { name: /Download/i })).toHaveCount(0);
  await page.goto("/alternatives");
  await page
    .getByRole("group", { name: "Approaches to compare" })
    .getByRole("button", { name: "Scoped implementation" })
    .click();
  await expect(page.locator(".comparison-review")).toContainText(
    "an exact proposal",
  );
  await page.getByRole("link", { name: "Explore this approach" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Bring KXRA a business need, issue or opportunity.",
  );
});

test("unknown authored detail routes return404", async ({ request }) => {
  for (const route of [
    "/solutions/not-a-solution",
    "/integrations/__proto__",
    "/blog/constructor",
    "/resources/missing-guide",
    "/use-cases/missing-case",
    "/apps/__proto__",
    "/product/constructor",
  ]) {
    const r = await request.get(route);
    expect(r.status(), route).toBe(404);
  }
});
