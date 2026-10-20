import { expect, test } from "@playwright/test";
test("top navigation travels within the homepage and history returns to the scene", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".cinema")).toHaveClass(/cinema--enhanced/);
  const documents: string[] = [];
  page.on("request", (request) => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame())
      documents.push(request.url());
  });
  const nav = page.getByRole("navigation", { name: "Primary navigation" });
  for (const [label, anchor] of [
    ["Industries", "industries"],
    ["Platform", "platform"],
    ["Our approach", "approach"],
  ]) {
    await nav.getByRole("link", { name: label, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/#${anchor}$`));
    await expect(page.locator(`#${anchor}`).locator("..")).toHaveAttribute(
      "data-active",
      "true",
    );
  }
  await page.goBack();
  await expect(page).toHaveURL(/\/#platform$/);
  await expect(page.locator("#scene-5")).toHaveAttribute("data-active", "true");
  await nav.getByRole("link", { name: "Start a project" }).click();
  await expect(page).toHaveURL(/\/#contact$/);
  await expect(
    page.getByRole("heading", {
      name: "What would make your business work better?",
    }),
  ).toBeVisible();
  expect(documents).toEqual([]);
});
test("direct platform link opens the demo without retrieving or generating private data", async ({
  page,
}) => {
  const outbound: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST") outbound.push(request.url());
  });
  await page.goto("/#platform");
  await expect(page.locator("#scene-5")).toHaveAttribute("data-active", "true");
  const demo = page.getByRole("complementary", {
    name: "Interactive KXRA OS demonstration",
  });
  await demo.getByRole("button", { name: "Agents", exact: true }).click();
  await demo.getByRole("button", { name: "Show sample answer" }).click();
  await expect(demo).toContainText("Source: sample project brief");
  await demo.getByRole("button", { name: "Decisions", exact: true }).click();
  await expect(demo).toContainText("Your approval.");
  await demo.getByRole("button", { name: "Rooms", exact: true }).click();
  await expect(demo).toContainText("Customer operations room");
  expect(outbound).toEqual([]);
});
test("all top-level marketing tabs are same-page anchors and reflow at 320 pixels", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto("/");
  const links = page
    .getByRole("navigation", { name: "Primary navigation" })
    .getByRole("link");
  expect(
    await links.evaluateAll((elements) =>
      elements.every((element) =>
        element.getAttribute("href")?.startsWith("/#"),
      ),
    ),
  ).toBe(true);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page
    .getByRole("navigation", { name: "Primary navigation" })
    .getByRole("link", { name: "Platform", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Work, connected." }),
  ).toBeVisible();
});

test("homepage workspace enquiry replaces package sales and reaches the private inbox", async ({
  page,
}) => {
  await page.setExtraHTTPHeaders({
    "user-agent": `KXRA-workspace-acceptance-${crypto.randomUUID()}`,
  });
  await page.goto("/#contact");
  await expect(page.getByLabel("Starting package")).toHaveCount(0);
  await page.getByLabel("Name", { exact: true }).fill("Workspace Browser Test");
  await page
    .getByLabel("Work email")
    .fill(`workspace-${Date.now()}@example.invalid`);
  await page
    .getByLabel("Business or organisation")
    .fill("Synthetic workspace team");
  await page
    .getByLabel("How can KXRA help?")
    .fill(
      "We need a private workspace for our team to review customer operations with a chosen model.",
    );
  await page.getByRole("checkbox").check();
  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/enquiries") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Send to KXRA" }).click();
  const response = await responsePromise;
  expect(response.status()).toBe(202);
  expect((await response.json()).receipt).toMatch(/^[0-9a-f-]{36}$/);
  await expect(page.getByRole("status")).toContainText(
    "private KXRA review inbox",
  );
});
