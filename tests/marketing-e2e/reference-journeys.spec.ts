import { test, expect } from "@playwright/test";
test("six distinct app previews support review, reset and accessible fullscreen", async ({
  page,
}) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/apps");
  await page.getByLabel("SEARCH APPS").fill("travel");
  await expect(page.getByRole("status")).toContainText("1 result");
  await page.getByRole("link", { name: "Open app preview" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Travel Desk",
  );
  for (const slug of [
    "general-crm",
    "creator-management",
    "sampling-desk",
    "remodeling-crm",
    "recruiting-workspace",
    "travel-desk",
  ]) {
    await page.goto("/apps/" + slug);
    const preview = page.locator(".example-preview");
    await expect(preview).toContainText("INTERACTIVE SAMPLE");
    const steps = page.getByRole("group", { name: "Workflow steps" });
    await steps.getByRole("button").nth(3).click();
    await expect(steps.getByRole("button").nth(3)).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    if (slug === "general-crm") {
      await preview
        .getByRole("button", { name: "Qualify & convert" })
        .first()
        .click();
      await preview.getByRole("button", { name: "Opportunities (1)" }).click();
      await expect(preview.getByText("Converted once")).toHaveCount(1);
      await expect(preview.getByRole("row")).toHaveCount(2);
    } else if (slug === "remodeling-crm" || slug === "travel-desk") {
      await preview
        .getByRole("button", { name: "Review this version" })
        .click();
      await expect(preview.locator(".example-version")).toContainText(
        "Reviewed version",
      );
      await preview.getByRole("button", { name: "Revise scope" }).click();
      await expect(preview.locator(".example-version")).toContainText("v2");
      await expect(preview.locator(".example-version")).toContainText(
        "Review required",
      );
    } else {
      await preview.locator("tbody tr").first().getByRole("button").click();
      await expect(preview.getByRole("status")).toContainText(
        "No external action",
      );
    }
    await preview
      .getByRole("button", { name: "Full screen", exact: false })
      .click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await expect(
      page.getByRole("button", { name: "Full screen", exact: false }),
    ).toBeFocused();
    await preview.getByRole("button", { name: "Reset sample" }).click();
    await expect(preview.getByRole("status")).toContainText("Sample reset.");
    for (const width of [360, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        slug + " " + width,
      ).toBe(true);
    }
  }
  expect(errors).toEqual([]);
});
test("help categories, body search, articles and related links are real routes", async ({
  page,
}) => {
  test.setTimeout(60000);
  await page.goto("/help");
  await expect(page.locator(".help-categories details")).toHaveCount(8);
  await page
    .locator(".help-categories")
    .getByText("Connections", { exact: true })
    .click();
  await page
    .getByRole("link", { name: "Review or revoke a connection" })
    .click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Review or revoke a connection",
  );
  await page
    .getByRole("link", { name: "Review the scope", exact: true })
    .click();
  await expect(page.locator("#step-1")).toBeInViewport();
  await page.locator(".help-related").getByRole("link").first().click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Choose an agent’s context",
  );
  await page.goto("/help");
  await page.getByLabel("SEARCH THE HELP CENTER").fill("nonexistent-topic-xyz");
  await expect(
    page.getByRole("heading", { name: "No matching articles." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Clear search" }).click();
  await expect(page.locator(".help-categories details")).toHaveCount(8);
  await page.getByLabel("SEARCH THE HELP CENTER").fill("revoke");
  await expect(page.locator(".help-result-list>a")).not.toHaveCount(0);
  await page.locator(".help-result-list>a").first().click();
  await expect(page.locator(".help-article article section")).toHaveCount(3);
  const response = await page.goto("/help/not-a-real-article");
  expect(response?.status()).toBe(404);
});
test("partner learning and local scope planning lead to a validated application form", async ({
  page,
}) => {
  test.setTimeout(60000);
  let posts = 0;
  page.on("request", (r) => {
    if (r.method() === "POST") posts++;
  });
  await page.goto("/partner");
  await expect(page.locator(".partner-path>a")).toHaveCount(4);
  await page
    .getByRole("link", { name: "Discuss a partnership", exact: false })
    .click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "What could we",
  );
  await page.getByRole("button", { name: "Send to KXRA" }).click();
  expect(
    await page
      .locator("form")
      .evaluate((form) => (form as HTMLFormElement).checkValidity()),
  ).toBe(false);
  expect(posts).toBe(0);
  await page.goto("/partner/toolkit");
  await page
    .getByLabel("Current problem")
    .fill("Fictional sample handoffs need clearer owners.");
  await page.getByLabel("Useful outcome").fill("One reviewed next action.");
  await expect(page.locator(".partner-worksheet pre")).toContainText(
    "One reviewed next action.",
  );
  await page.getByRole("button", { name: "Reset worksheet" }).click();
  await expect(page.getByLabel("Current problem")).toHaveValue("");
  for (const route of [
    "/partner/business",
    "/partner/learn",
    "/partner/materials",
    "/partner/workshop",
    "/partner/fde",
  ]) {
    const r = await page.goto(route);
    expect(r?.status()).toBe(200);
    await expect(page.locator(".partner-guide-sections>article")).toHaveCount(
      3,
    );
  }
  await page.goto("/apps/travel-desk");
  await page.getByRole("link", { name: "Discuss this workflow" }).click();
  await expect(page.getByLabel("How can KXRA help?")).toHaveValue(
    /Travel Desk/,
  );
  expect(posts).toBe(0);
});
test("authored sitemap routes are reachable", async ({ request }, info) => {
  test.skip(
    info.project.name === "mobile",
    "Inventory is identical across viewports.",
  );
  test.setTimeout(120000);
  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.status()).toBe(200);
  const paths = [
    ...(await sitemap.text()).matchAll(/<loc>([^<]+)<\/loc>/g),
  ].map((match) => new URL(match[1]).pathname);
  expect(paths).toContain("/apps/travel-desk");
  expect(paths).toContain("/help/source-withdrawal");
  expect(paths).toContain("/partner/workshop");
  expect(new Set(paths).size).toBe(paths.length);
  for (const path of paths) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(200);
  }
});
test("responsive guide layouts stay within the viewport", async ({ page }) => {
  test.setTimeout(120000);
  for (const route of [
    "/",
    "/partner",
    "/partner/toolkit",
    "/partner/apply",
    "/help",
    "/help/connection-revocation",
  ]) {
    for (const width of [360, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(route);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        route + " " + width,
      ).toBe(true);
    }
  }
});
