import { expect, test } from "@playwright/test";

const routes = [
  "/",
  "/platform",
  "/brand-studio",
  "/custom-projects",
  "/industries",
  "/about",
  "/contact",
  "/partner",
  "/submit-opportunity",
  "/legal/privacy",
  "/legal/terms",
  "/legal/cookies",
  "/approach",
  "/explorations",
  "/privacy",
  "/terms",
];

test("AT-17 required public routes render from the reviewed snapshot", async ({
  page,
}) => {
  for (const route of routes) {
    const response = await page.goto(route);
    expect(response?.status(), route).toBe(200);
    await expect(page.locator("h1").first()).toBeVisible();
  }
  await page.goto("/");
  await expect(
    page.getByText("Private build preview · publication is disabled"),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("AT-26 accessible public contact submission reaches private inbox", async ({
  page,
}) => {
  await page.goto("/contact");
  await page.getByLabel("Name").fill("Browser Test");
  await page
    .getByLabel("Work email")
    .fill(`browser-${Date.now()}@example.invalid`);
  await page.getByLabel("Business or organisation").fill("Example");
  await page
    .getByLabel("How can KXRA help?")
    .fill("A synthetic contact request with enough detail for validation.");
  await page.getByRole("checkbox").check();
  await expect(page.getByRole("checkbox")).toBeChecked();
  expect(
    await page
      .locator("form")
      .evaluate((form: HTMLFormElement) => form.checkValidity()),
  ).toBe(true);
  await page.getByRole("button", { name: "Send to KXRA" }).click();
  await expect(page.getByRole("status")).toContainText(
    "private KXRA review inbox",
  );
});

test("AT-44 reduced motion preserves every layered section and removes sticky movement", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator(".layer")).toHaveCount(4);
  const positions = await page
    .locator(".layer")
    .evaluateAll((elements) =>
      elements.map((element) => getComputedStyle(element).position),
    );
  expect(positions.every((position) => position === "relative")).toBe(true);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("AT-44 320px reflow and 200 percent text preserve access", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto("/");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
  await page.setViewportSize({ width: 720, height: 900 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.keyboard.press("Home");
  await page.keyboard.press("Tab");
  await expect(page.locator(":focus")).toHaveText("Skip to content");
});

test("AT-44 content and contact fallback work without JavaScript", async ({
  browser,
}) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.locator(".layer")).toHaveCount(4);
  await page.goto("/contact");
  await expect(page.locator(".form-shell .notice")).toContainText(
    "JavaScript is unavailable.",
  );
  await expect(
    page.getByRole("link", { name: "info@kxra-group.com" }).first(),
  ).toHaveAttribute("href", "mailto:info@kxra-group.com");
  await context.close();
});
