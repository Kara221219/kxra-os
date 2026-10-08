import { expect, test } from "@playwright/test";
const photo = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
  "base64",
);
async function addPhotos(page: import("@playwright/test").Page) {
  // Browser-created PNG avoids network fixtures and exercises real decoding.
  const bytes = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 600;
    canvas.height = 400;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#786a45";
    context.fillRect(0, 0, 600, 400);
    return canvas.toDataURL().split(",")[1];
  });
  await page.locator('input[type="file"]').setInputFiles(
    [1, 2].map((index) => ({
      name: `room-${index}.png`,
      mimeType: "image/png",
      buffer: Buffer.from(bytes, "base64"),
    })),
  );
  await expect(
    page.getByLabel("Photo 2 caption", { exact: true }),
  ).toBeVisible();
}
test("video studio rejects invalid files and requires photo rights", async ({
  page,
}) => {
  await page.goto("/video-studio");
  await expect(
    page.getByRole("button", { name: "Create my video" }),
  ).toBeDisabled();
  await page.locator('input[type="file"]').setInputFiles({
    name: "bad.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from('<svg onload="alert(1)"/>'),
  });
  await expect(page.getByRole("status")).toContainText("Could not read");
  await page.locator('input[type="file"]').setInputFiles(
    Array.from({ length: 9 }, (_, i) => ({
      name: `${i}.png`,
      mimeType: "image/png",
      buffer: photo,
    })),
  );
  await expect(page.getByRole("status")).toContainText("at most eight");
  await addPhotos(page);
  await expect(
    page.getByRole("button", { name: "Create my video" }),
  ).toBeDisabled();
  await page.getByRole("checkbox").check();
  await expect(
    page.getByRole("button", { name: "Create my video" }),
  ).toBeEnabled();
  await page.getByLabel("Photo 2 caption", { exact: true }).fill("Second room");
  await page.getByRole("button", { name: "Move photo 2 up" }).click();
  await expect(page.getByLabel("Photo 1 caption", { exact: true })).toHaveValue(
    "Second room",
  );
  await page
    .getByRole("button", { name: "Remove photo 1", exact: true })
    .click();
  await expect(page.getByLabel("Photo 2 caption", { exact: true })).toHaveCount(
    0,
  );
  await page
    .getByRole("button", { name: "Remove photo 1", exact: true })
    .click();
  const alpha = await page
    .locator("canvas")
    .evaluate(
      (element) =>
        (element as HTMLCanvasElement)
          .getContext("2d")!
          .getImageData(0, 0, 1, 1).data[3],
    );
  expect(alpha).toBe(0);
});
test("video studio exports playable video without sending client photos", async ({
  page,
}) => {
  await page.goto("/video-studio");
  const posts: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST") posts.push(request.url());
  });
  await addPhotos(page);
  await page.getByLabel("Seconds per photo").selectOption("3");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Create my video" }).click();
  await expect(
    page.getByRole("link", { name: /Download .* video/ }),
  ).toBeVisible({ timeout: 20000 });
  const video = page.getByLabel("Finished video", { exact: true });
  await expect
    .poll(() =>
      video.evaluate((element) => (element as HTMLVideoElement).readyState),
    )
    .toBeGreaterThanOrEqual(2);
  expect(
    await video.evaluate((element) => (element as HTMLVideoElement).videoWidth),
  ).toBe(720);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: /Download .* video/ }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(
    /kxra-property-video\.(webm|mp4)$/,
  );
  expect(await download.failure()).toBeNull();
  expect(posts).toEqual([]);
  await page.getByLabel("Title", { exact: true }).fill("Updated title");
  await expect(
    page.getByRole("link", { name: /Download .* video/ }),
  ).toHaveCount(0);
});
test("video studio cancellation retains local photos and produces no download", async ({
  page,
}) => {
  await page.goto("/video-studio");
  await addPhotos(page);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Create my video" }).click();
  await page.getByRole("button", { name: "Cancel export" }).click();
  await expect(page.getByRole("status")).toContainText("cancelled");
  await expect(
    page.getByLabel("Photo 2 caption", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Download .* video/ }),
  ).toHaveCount(0);
});
