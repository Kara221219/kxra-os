import { expect, test } from "@playwright/test";

test("public links and linked buttons resolve on desktop and mobile widths", async ({
  page,
  request,
}, info) => {
  test.setTimeout(180_000);
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
  const enqueue = (href: string, path: string) => {
    if (
      !href ||
      href.startsWith("mailto:") ||
      href.startsWith("tel:") ||
      href.startsWith("http://") ||
      href.startsWith("https://")
    )
      return;
    const next = href.split(/[?#]/)[0] || path;
    if (next.startsWith("/") && !seen.has(next)) queue.push(next);
  };

  while (queue.length && seen.size < 80) {
    const path = queue.shift()!;
    if (seen.has(path)) continue;
    seen.add(path);
    const response = await request.get(path, {
      maxRedirects: 0,
      timeout: 20_000,
    });
    const status = response.status();
    // Production marketing refuses an http private-app redirect. That 503 is
    // the gate, not a missing public page.
    if (
      status >= 400 &&
      !(status === 503 && (path === "/login" || path === "/signup"))
    )
      failures.push(`${path} returned ${status}`);
    if (status >= 300 && status < 400) continue;
    const type = response.headers()["content-type"] || "";
    if (!type.includes("text/html")) continue;
    const html = await response.text();
    for (const match of html.matchAll(/href="([^"]*)"/g))
      enqueue(match[1] || "", path);
    if (path !== "/") continue;
    await page.goto(path);
    if (info.project.name === "mobile")
      await page.getByRole("button", { name: "Menu", exact: true }).click();
    const collect = async () => {
      const hrefs = await page
        .locator("a[href]")
        .evaluateAll((nodes) =>
          nodes.map((node) => node.getAttribute("href") || ""),
        );
      for (const href of hrefs) enqueue(href, path);
    };
    await collect();
    for (const name of ["Solutions", "How we work"]) {
      await page.getByRole("button", { name, exact: true }).click();
      await collect();
    }
  }
  expect(failures, failures.join("\n")).toEqual([]);
  expect(seen.has("/pricing")).toBe(true);
  expect(seen.has("/contact")).toBe(true);
});
