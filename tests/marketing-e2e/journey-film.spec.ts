import { expect, test } from "@playwright/test";

test("static homepage never mounts or requests the retired cinematic journey", async ({
  page,
}) => {
  const errors: string[] = [],
    retired: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (/industry-walkthrough|\.mp4(?:\?|$)/.test(request.url()))
      retired.push(request.url());
  });
  await page.goto("/");
  await expect(
    page.getByRole("img", {
      name: /Original illustration of people collaborating/,
    }),
  ).toBeVisible();
  await expect(page.locator("video, canvas, .cinema")).toHaveCount(0);
  await page.locator("#request-access").scrollIntoViewIfNeeded();
  await page.locator(".ref-artwork").scrollIntoViewIfNeeded();
  expect(retired).toEqual([]);
  expect(errors).toEqual([]);
});

test("reduced motion preserves the static illustration, sample and enquiry", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Your team.",
  );
  await expect(page.locator("video, canvas, .cinema")).toHaveCount(0);
  await expect(page.locator(".ref-workspace")).toBeVisible();
  await page.locator("#request-access").scrollIntoViewIfNeeded();
  await expect(page.getByLabel("How can KXRA help?")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("unavailable illustration retains meaningful text and a usable enquiry route", async ({
  page,
}) => {
  await page.route(/kxra-collaborative-cutaway-v1/, (route) =>
    route.fulfill({ status: 404, body: "Unavailable" }),
  );
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Your team.",
  );
  expect(
    await page
      .getByRole("img", {
        name: /Original illustration of people collaborating/,
      })
      .evaluate((element) => (element as HTMLImageElement).naturalWidth),
  ).toBe(0);
  const access = page.getByRole("link", { name: "Request workspace access" });
  await expect(access).toHaveAttribute("href", "#request-access");
  await access.click();
  await expect(page).toHaveURL(/#request-access$/);
  await expect(page.getByLabel("How can KXRA help?")).toBeVisible();
});
