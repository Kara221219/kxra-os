import { test, expect, type Page } from "@playwright/test";

async function fixtureLogin(page: Page, fixture: string) {
  await page.goto("/login");
  await page.getByText("Local fixture identities", { exact: true }).click();
  await page.getByLabel("Synthetic identity").selectOption(fixture);
  await page.getByRole("button", { name: "Use fixture" }).click();
}

async function navigate(page: Page, name: string) {
  const mobileMenu = page.locator(".mobile-menu > summary");
  const desktopLink = page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name, exact: true });
  await expect
    .poll(async () => {
      const [mobile, desktop] = await Promise.all([
        mobileMenu.isVisible(),
        desktopLink.isVisible(),
      ]);
      return mobile === desktop ? "loading" : mobile ? "mobile" : "desktop";
    })
    .not.toBe("loading");
  if (await mobileMenu.isVisible()) {
    await mobileMenu.click();
    await page
      .getByRole("navigation", { name: "Mobile navigation" })
      .getByRole("link", { name, exact: true })
      .click();
    return;
  }
  await desktopLink.click();
}

test("owner sign-in, typed Idea creation and persistence", async ({
  page,
}, testInfo) => {
  await fixtureLogin(page, "owner");
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
  await navigate(page, "Idea Inbox");
  const title = "Browser fixture " + Date.now();
  await page.getByLabel("Title", { exact: true }).fill(title);
  await page.getByLabel("Raw idea").fill("Synthetic browser persistence test.");
  await page.getByRole("button", { name: "Submit idea" }).click();
  await expect(page.getByRole("status")).toHaveText("Idea submitted to KXRA.");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(
    page.getByRole("heading", { name: "Welcome back." }),
  ).toBeVisible();
});
test("partner navigation and crafted project URL protect private work", async ({
  page,
}) => {
  await fixtureLogin(page, "partner");
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

test("AT-11 Ask requires one project and reports insufficient evidence exactly", async ({
  page,
}) => {
  await fixtureLogin(page, "partner");
  await navigate(page, "Ask KXRA");
  const project = page.getByRole("combobox", { name: "Project" });
  await expect(project).toHaveValue("");
  await expect(project.getByRole("option").first()).toHaveText(
    "Select one project",
  );
  await project.selectOption("30000000-0000-4000-8000-000000000002");
  await page
    .getByLabel("Ask about your evidence")
    .fill("term-that-cannot-exist-9f4620c0");
  await page.getByRole("button", { name: "Find evidence" }).click();
  await expect(page.getByText("INSUFFICIENT KXRA EVIDENCE.")).toBeVisible();
});

test("owner can inspect gate controls, history and invitation foundations", async ({
  page,
}) => {
  const project = "30000000-0000-4000-8000-000000000002";
  await fixtureLogin(page, "owner");

  await page.goto(`/os/projects/${project}`);
  await expect(
    page.getByRole("heading", { name: "US Vehicle Seat Covers" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "P002 LISTING", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Thresholds proposed / unset", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("exact SKU", { exact: true })).toBeVisible();

  await page.goto(`/os/projects/${project}/experiments`);
  await expect(
    page.getByRole("heading", { name: "Experiments", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Operating loop status")).toBeVisible();

  await page.goto(`/os/projects/${project}/research`);
  await page.locator(".record-list .record h3 a").first().click();
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
