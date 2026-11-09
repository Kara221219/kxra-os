import { expect, test, type Page } from "@playwright/test";

async function login(page: Page, fixture = "owner") {
  await page.goto("/login");
  await page.getByText("Local fixture identities", { exact: true }).click();
  await page.getByLabel("Synthetic identity").selectOption(fixture);
  await page.getByRole("button", { name: "Use fixture" }).click();
  await expect(page).toHaveURL(/\/os(?:$|\/|\?)/);
}

test("owner metadata page stays closed by default across refresh and browser history", async ({
  page,
}, info) => {
  await login(page);
  const response = await page.goto("/os/customer-directory");
  expect(response?.status()).toBe(200);
  expect(response?.headers()["cache-control"]).toMatch(
    /(?:^|,)\s*no-store(?:,|$)/,
  );
  await expect(
    page.getByRole("heading", { name: "Directory not enabled" }),
  ).toBeVisible();
  await expect(page.locator("table")).toHaveCount(0);
  await expect(page.getByText(/records on this page/)).toHaveCount(0);
  await page.getByRole("link", { name: "Try the first page again" }).click();
  await expect(
    page.getByRole("heading", { name: "Directory not enabled" }),
  ).toBeVisible();
  await page.goto("/os");
  await page.goBack();
  await expect(
    page.getByRole("heading", { name: "Directory not enabled" }),
  ).toBeVisible();
  await page.goForward();
  await expect(
    page.getByRole("heading", { name: "Your operating overview" }),
  ).toBeVisible();
  await page.goto(
    "/os/customer-directory?cursor=invalid&organisation_state=ACTIVE",
  );
  await expect(
    page.getByRole("heading", { name: "Directory not enabled" }),
  ).toBeVisible();
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath(`directory-disabled-${width}.png`),
      fullPage: true,
    });
  }
});

test("member routes retain factual partner presentation and cannot read owner metadata", async ({
  page,
}) => {
  for (const fixture of ["partner", "viewer"]) {
    await login(page, fixture);
    await expect(
      page.getByText("Partner workspace", { exact: true }),
    ).toHaveCount(1);
    await expect(page.locator(".topbar")).toContainText("Your workspace");
    await expect(
      page.getByRole("link", { name: "Customer directory", exact: true }),
    ).toHaveCount(0);
    const response = await page.goto("/os/customer-directory");
    expect(response?.status()).toBe(404);
    await expect(page.locator("table")).toHaveCount(0);
    await expect(
      page.getByText("Directory not enabled", { exact: true }),
    ).toHaveCount(0);
  }
});

test("signed-out metadata requests require authentication", async ({
  page,
}) => {
  await page.goto("/os/customer-directory");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.locator("table")).toHaveCount(0);
});
