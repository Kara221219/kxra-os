import { test, expect } from "@playwright/test";
test("owner sign-in, draft creation and persistence", async ({
  page,
}, testInfo) => {
  await page.goto("/login");
  await page.getByLabel("Local test identity").selectOption("owner");
  await page.getByRole("button", { name: "Sign in →" }).click();
  await expect(
    page.getByRole("heading", { name: "Your operating overview" }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("owner-workspace.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("link", { name: "Idea Inbox", exact: true }).click();
  const title = "Browser fixture " + Date.now();
  await page.getByLabel("Title", { exact: true }).fill(title);
  await page
    .getByLabel("Description / evidence")
    .fill("Synthetic browser persistence test.");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved to KXRA.");
  await page.reload();
  await expect(
    page.getByRole("link", { name: title, exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(
    page.getByRole("heading", { name: "Welcome back." }),
  ).toBeVisible();
});
test("partner navigation and crafted project URL protect private work", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByLabel("Local test identity").selectOption("partner");
  await page.getByRole("button", { name: "Sign in →" }).click();
  await expect(
    page.getByRole("heading", { name: "Your project workspace" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "US Vehicle Seat Covers", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("PROJECT-003", { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Finance", exact: true }),
  ).toHaveCount(0);
  await page.goto("/os/projects/30000000-0000-4000-8000-000000000003");
  await expect(
    page.getByRole("heading", { name: "Not available" }),
  ).toBeVisible();
});
