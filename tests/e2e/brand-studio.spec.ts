import { test, expect } from "@playwright/test";
test("studios are retired and not offered in the authenticated catalogue", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByText("Local fixture identities", { exact: true }).click();
  await page.getByLabel("Synthetic identity").selectOption("owner");
  await page.getByRole("button", { name: "Use fixture" }).click();
  await expect(page).toHaveURL(/\/os/);
  await page.goto("/os/tools");
  await expect(
    page.getByRole("heading", { name: "Project workrooms" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Brand Studio|Video Studio/ }),
  ).toHaveCount(0);
  await page.goto("/os/brand-studio");
  await expect(
    page.getByRole("heading", { name: "This tool has been retired" }),
  ).toBeVisible();
});
