import { expect, test } from "@playwright/test";
test("Seedance film is scroll driven in both directions, silent and locally served", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  const film = page.locator(".cinema-film");
  await expect(page.locator("#scene-1")).toHaveAttribute("data-active", "true");
  await expect(page.locator(".cinema")).toHaveClass(/cinema--enhanced/);
  await expect(film).not.toHaveAttribute("src");
  await page.screenshot({
    path: `.runtime/industry-walkthrough/${testInfo.project.name}-hero.png`,
  });
  await page.getByRole("button", { name: "06 Our approach" }).click();
  await expect(page.locator(".cinema-stage")).toHaveAttribute(
    "data-film-state",
    "ready",
    { timeout: 15000 },
  );
  expect(
    await film.evaluate((element) => {
      const video = element as HTMLVideoElement;
      return (
        video.paused && video.muted && video.playsInline && !video.autoplay
      );
    }),
  ).toBe(true);
  expect(await film.getAttribute("src")).toBe(
    "/media/consultancy/industry-walkthrough-v2.mp4",
  );
  await expect
    .poll(() => film.evaluate((v) => (v as HTMLVideoElement).currentTime))
    .toBeGreaterThan(11.5);
  await page.getByRole("button", { name: "01 Welcome" }).click();
  await expect
    .poll(() => film.evaluate((v) => (v as HTMLVideoElement).currentTime))
    .toBeLessThan(0.1);
  await page.getByRole("button", { name: "Read without motion" }).click();
  await expect(film).not.toHaveAttribute("src");
  await expect(page.locator('.cinema-chapter[aria-hidden="true"]')).toHaveCount(
    0,
  );
  expect(errors).toEqual([]);
});
test("reduced motion never downloads the Seedance video", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const requested: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("industry-walkthrough-v2.mp4"))
      requested.push(request.url());
  });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Read without motion" }),
  ).toBeVisible();
  await expect(page.locator(".cinema-film")).not.toHaveAttribute("src");
  await expect(page.locator(".cinema")).not.toHaveClass(/cinema--enhanced/);
  expect(requested).toEqual([]);
});
test("unavailable video keeps the architectural fallback and usable enquiry route", async ({
  page,
}) => {
  await page.route(
    "**/media/consultancy/industry-walkthrough-v2.mp4",
    (route) => route.fulfill({ status: 404, body: "Unavailable" }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "06 Our approach" }).click();
  await expect(page.locator(".cinema-stage")).toHaveAttribute(
    "data-film-state",
    "unavailable",
  );
  await expect(page.locator(".cinema-world")).toHaveCSS("opacity", "1");
  await expect(
    page.getByRole("link", { name: "Start a conversation" }),
  ).toBeVisible();
  expect(
    await page
      .getByRole("link", { name: "Start a conversation" })
      .getAttribute("href"),
  ).toBe("#contact");
});
