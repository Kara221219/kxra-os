import { expect, test } from "@playwright/test";
test("retired studios have no upload or generation controls, navigation or sitemap entries", async ({
  page,
}) => {
  for (const path of ["/video-studio", "/brand-studio"]) {
    await page.goto(path);
    await expect(
      page.getByRole("heading", { name: "This tool has been retired." }),
    ).toBeVisible();
    await expect(page.locator("input[type=file]")).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: /Brand Studio|Video Studio/ }),
    ).toHaveCount(0);
  }
  const sitemap = await page.request.get("/sitemap.xml");
  expect(await sitemap.text()).not.toMatch(/brand-studio|video-studio/);
  await page.goto("/pricing");
  await expect(
    page.getByRole("heading", { name: "Platform subscription under review" }),
  ).toBeVisible();
  await expect(page.getByText("120", { exact: true })).toHaveCount(0);
});
