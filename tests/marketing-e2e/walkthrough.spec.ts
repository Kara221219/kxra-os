import { expect, test } from "@playwright/test";

test("product navigation opens a real route and browser history returns to the homepage", async ({
  page,
}, info) => {
  await page.goto("/");
  if (info.project.name === "mobile")
    await page.getByRole("button", { name: "Menu", exact: true }).click();
  const nav = page.getByRole("navigation", { name: "Primary navigation" });
  await nav.getByRole("button", { name: "Product", exact: true }).click();
  await nav.getByRole("link", { name: "Workspace", exact: true }).click();
  await expect(page).toHaveURL(/\/product\/workspace$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Your team.",
  );
  await page.getByRole("link", { name: "Request workspace access" }).click();
  await expect(page).toHaveURL(/#request-access$/);
  await expect(page.getByLabel("How can KXRA help?")).toBeVisible();
});

test("direct sample link stays illustrative and does not submit external work", async ({
  page,
}) => {
  const posts: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST") posts.push(request.url());
  });
  await page.goto("/#workspace-preview");
  const sample = page.locator(".ref-workspace");
  await sample.getByRole("button", { name: /hiring/i }).click();
  await sample.getByRole("button", { name: /Sample candidate/ }).click();
  await expect(sample.locator(".ref-stage-columns>div").nth(1)).toContainText(
    "Sample candidate",
  );
  await page.getByText("Is this a live agent demonstration?").click();
  await expect(page.locator("#faq details[open]")).toContainText(
    "does not call an agent",
  );
  expect(posts).toEqual([]);
});

test("mobile nested navigation reflows and leads to the actual product catalogue", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto("/");
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  const nav = page.getByRole("navigation", { name: "Primary navigation" });
  await nav.getByRole("button", { name: "Product", exact: true }).click();
  await nav.getByRole("link", { name: "Overview", exact: true }).click();
  await expect(page).toHaveURL(/\/product$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("homepage workspace enquiry replaces package sales and reaches the private inbox", async ({
  page,
}) => {
  await page.setExtraHTTPHeaders({
    "user-agent": `KXRA-workspace-acceptance-${crypto.randomUUID()}`,
  });
  await page.goto("/#request-access");
  await expect(page.getByLabel("Starting package")).toHaveCount(0);
  await page.getByLabel("Name", { exact: true }).fill("Workspace Browser Test");
  await page
    .getByLabel("Work email")
    .fill(`workspace-${Date.now()}@example.invalid`);
  await page
    .getByLabel("Business or organisation")
    .fill("Synthetic workspace team");
  await page
    .getByLabel("How can KXRA help?")
    .fill(
      "We need a private workspace for our team to review customer operations with a chosen model.",
    );
  await page.getByRole("checkbox").check();
  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/enquiries") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Send to KXRA" }).click();
  const response = await responsePromise;
  expect(response.status()).toBe(202);
  expect((await response.json()).receipt).toMatch(/^[0-9a-f-]{36}$/);
  await expect(page.getByRole("status")).toContainText(
    "private KXRA review inbox",
  );
});
