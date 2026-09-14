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

test("owner can inspect gate controls, history and invitation foundations", async ({
  page,
}) => {
  const project = "30000000-0000-4000-8000-000000000002";
  await page.goto("/login");
  await page.getByLabel("Local test identity").selectOption("owner");
  await page.getByRole("button", { name: "Sign in →" }).click();

  await page.goto(`/os/projects/${project}`);
  await expect(
    page.getByRole("heading", { name: "US Vehicle Seat Covers" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Project gate" }),
  ).toBeVisible();
  await expect(
    page.getByText("Thresholds proposed / unset", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Operating loop" }),
  ).toBeVisible();
  await expect(page.getByText("exact SKU", { exact: true })).toBeVisible();

  await page
    .getByRole("link", { name: "Project next action", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "Version history" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Version 1", exact: true }).click();
  await expect(
    page.getByText("This is an immutable historical snapshot.", {
      exact: false,
    }),
  ).toBeVisible();

  await page.goto(`/os/files?project=${project}`);
  await expect(
    page.getByRole("combobox", { name: "Project", exact: true }),
  ).toHaveValue(project);
  await expect(
    page.getByRole("combobox", {
      name: "Who can see this file?",
      exact: true,
    }),
  ).toHaveValue("owner_only");

  await page.goto("/os/partners");
  await expect(page.getByRole("heading", { name: "Partners" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Create an invitation" }),
  ).toBeVisible();
});
