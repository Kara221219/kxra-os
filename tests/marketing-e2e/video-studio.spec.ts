import { expect, test } from "@playwright/test";

test("retired studio addresses leave the product and do not offer generation", async ({
  page,
}) => {
  for (const path of ["/video-studio", "/brand-studio"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/pricing$/);
    await expect(page.locator("input[type=file]")).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: /Brand Studio|Video Studio/ }),
    ).toHaveCount(0);
  }
  const sitemap = await page.request.get("/sitemap.xml");
  expect(await sitemap.text()).not.toMatch(/brand-studio|video-studio/);
  await expect(
    page.getByRole("heading", { name: "Workspace plans", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("120", { exact: true })).toHaveCount(0);
});
