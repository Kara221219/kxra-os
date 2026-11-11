import { expect, test } from "@playwright/test";

test("public links and linked buttons resolve on desktop and mobile widths", async ({
  page,
  request,
}, info) => {
  test.setTimeout(120_000);
  await page.setViewportSize(
    info.project.name === "mobile"
      ? { width: 390, height: 844 }
      : { width: 1280, height: 900 },
  );
  const queue = [
    "/",
    "/how-we-work",
    "/insights",
    "/about-us",
    "/lets-connect",
    "/careers",
  ];
  const seen = new Set<string>();
  const failures: string[] = [];
  while (queue.length && seen.size < 80) {
    const path = queue.shift()!;
    if (seen.has(path)) continue;
    seen.add(path);
    const response = await request.get(path, { maxRedirects: 0 });
    const status = response.status();
    if (status >= 400) failures.push(`${path} returned ${status}`);
    if (status >= 300 && status < 400) continue;
    if (!response.headers()["content-type"]?.includes("text/html")) continue;
    await page.goto(path);
    const collect = async () => {
      const hrefs = await page
        .locator("a[href]")
        .evaluateAll((nodes) =>
          nodes.map((node) => node.getAttribute("href") || ""),
        );
      for (const href of hrefs) {
        if (
          !href ||
          href.startsWith("mailto:") ||
          href.startsWith("tel:") ||
          href.startsWith("http://") ||
          href.startsWith("https://")
        )
          continue;
        const next = href.split(/[?#]/)[0] || path;
        if (next.startsWith("/") && !seen.has(next)) queue.push(next);
      }
    };
    if (path === "/") {
      if (info.project.name === "mobile")
        await page.getByRole("button", { name: "Menu", exact: true }).click();
      await collect();
      for (const name of ["Solutions", "How we work"]) {
        await page.getByRole("button", { name, exact: true }).click();
        await collect();
      }
    } else await collect();
  }
  expect(failures, failures.join("\n")).toEqual([]);
  expect(seen.has("/pricing")).toBe(true);
  expect(seen.has("/contact")).toBe(true);
});
