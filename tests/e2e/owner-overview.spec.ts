import { expect, test, type Page } from "@playwright/test";

async function login(page: Page, fixture = "owner") {
  await page.goto("/login");
  await page.getByText("Local fixture identities", { exact: true }).click();
  await page.getByLabel("Synthetic identity").selectOption(fixture);
  await page.getByRole("button", { name: "Use fixture" }).click();
  await expect(page).toHaveURL(/\/os(?:$|\/|\?)/);
}
async function noOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    width: innerWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scroll, JSON.stringify(dimensions)).toBeLessThanOrEqual(
    dimensions.width,
  );
}

test("owner overview uses recorded data and every preview opens its exact target", async ({
  page,
}) => {
  await login(page);
  await expect(
    page.getByRole("heading", { name: "Your operating overview" }),
  ).toBeVisible();
  await expect(page.locator(".owner-metric")).toHaveCount(4);
  await expect(
    page.getByText("Synthetic local records", { exact: true }),
  ).toBeVisible();
  const hrefs = await page
    .locator(".owner-item-list a")
    .evaluateAll((links) => links.map((link) => link.getAttribute("href")!));
  for (const href of hrefs) {
    await page.goto(href);
    const hash = new URL(href, "http://127.0.0.1").hash;
    if (hash) await expect(page.locator(hash)).toHaveCount(1);
    await expect(
      page.getByRole("heading", { name: "Not available" }),
    ).toHaveCount(0);
  }
  await page.goto("/os/enquiries?enquiry=not-a-uuid");
  await expect(
    page.getByRole("heading", { name: "Not available" }),
  ).toBeVisible();
  await page.goto("/os/work-log?entry=not-a-uuid");
  await expect(
    page.getByRole("heading", { name: "Not available" }),
  ).toBeVisible();
});

test("owner navigation closes on selection, Escape and browser history while preserving secondary routes", async ({
  page,
}) => {
  const hydrationErrors: string[] = [];
  page.on("console", (message) => {
    if (/hydrat/i.test(message.text())) hydrationErrors.push(message.text());
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  const toggle = page.locator(".owner-menu-toggle");
  await expect(toggle).toBeEnabled();
  await toggle.focus();
  await page.keyboard.press("Enter");
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Escape");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(toggle).toBeFocused();
  await toggle.click();
  await page
    .getByRole("navigation", { name: "Owner navigation" })
    .getByRole("link", { name: "Website enquiries", exact: true })
    .click();
  await expect(page).toHaveURL(/\/os\/enquiries$/);
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await page.goBack();
  await expect(
    page.getByRole("heading", { name: "Your operating overview" }),
  ).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await page.goForward();
  await expect(
    page.getByRole("heading", { name: "Website enquiries", exact: true }),
  ).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click();
  await page.getByText("Partner operations", { exact: true }).click();
  await page
    .getByRole("navigation", { name: "Owner navigation" })
    .getByRole("link", { name: "WhatsApp", exact: true })
    .click();
  await expect(page).toHaveURL(/\/os\/whatsapp$/);
  await expect(
    page.getByText("Transport disabled", { exact: true }),
  ).toBeVisible();
  await page.goto("/os/venture-overview");
  await expect(
    page.getByRole("heading", { name: "Venture operating overview" }),
  ).toBeVisible();
  await expect(page.locator(".control-section")).toHaveCount(4);
  expect(hydrationErrors).toEqual([]);
});

test("owner shell reflows around overview, workspace and legacy operational screens", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "desktop", "One responsive matrix");
  test.setTimeout(180000);
  await login(page);
  const routes = [
    "",
    "workspace",
    "approvals",
    "tasks",
    "admin",
    "partners",
    "enquiries",
  ];
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const route of routes) {
      await page.goto("/os" + (route ? "/" + route : ""));
      await noOverflow(page);
      await page.screenshot({
        path: info.outputPath(`owner-${route || "overview"}-${width}.png`),
        fullPage: true,
      });
    }
  }
  await page.setViewportSize({ width: 640, height: 1000 });
  for (const route of [
    "",
    "workspace",
    "approvals",
    "tasks",
    "admin",
    "partners",
  ]) {
    await page.goto("/os" + (route ? "/" + route : ""));
    await page.evaluate(() => {
      document.documentElement.style.zoom = "2";
    });
    await noOverflow(page);
    await page.screenshot({
      path: info.outputPath(`owner-${route || "overview"}-640-200pct.png`),
      fullPage: true,
    });
  }
});

test("partner and viewer retain their original shell and cannot open owner additions", async ({
  page,
}) => {
  for (const fixture of ["partner", "viewer"]) {
    await login(page, fixture);
    await expect(
      page.getByText("Partner workspace", { exact: true }),
    ).toHaveCount(1);
    await expect(page.locator(".owner-overview")).toHaveCount(0);
    await expect(
      page.getByRole("navigation", { name: "Owner navigation" }),
    ).toHaveCount(0);
    for (const route of [
      "enquiries",
      "enquiries?enquiry=20000000-0000-4000-8000-000000000001",
      "venture-overview",
      "work-log?entry=20000000-0000-4000-8000-000000000001",
    ]) {
      await page.goto("/os/" + route);
      await expect(
        page.getByRole("heading", { name: "Not available" }),
      ).toBeVisible();
      await expect(page.locator(".owner-metric")).toHaveCount(0);
    }
  }
});

test("owner shell preserves nested room messages, keyboard tabs and history", async ({
  page,
}, info) => {
  await login(page);
  await page.goto("/os/workspace");
  const name = "Synthetic owner room " + crypto.randomUUID();
  await page.getByLabel("Room name").fill(name);
  await page
    .getByLabel("Project", { exact: true })
    .selectOption("30000000-0000-4000-8000-000000000002");
  await page.getByRole("button", { name: "Create room", exact: true }).click();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  const roomUrl = page.url();
  await page
    .getByLabel("Message", { exact: true })
    .fill("Synthetic owner workbench message. No external service is used.");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.locator(".team-message")).toContainText(
    "Synthetic owner workbench message.",
  );
  const conversation = page.getByRole("tab", {
    name: "Conversation",
    exact: true,
  });
  await expect(conversation).toBeEnabled();
  await conversation.focus();
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("tab", { name: "Tasks", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  // Existing room tabs replace their query state rather than adding history.
  await page.goto("/os/workspace");
  await page.goBack();
  await expect(
    page.getByRole("tab", { name: "Tasks", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page.goForward();
  await expect(
    page.getByRole("heading", { name: "Your team workspace" }),
  ).toBeVisible();
  await page.goto(roomUrl);
  await expect(page.locator(".team-message")).toContainText(
    "Synthetic owner workbench message.",
  );
  for (const [view, heading] of [
    ["knowledge", "Room file evidence"],
    ["memory", "Reviewed room memory"],
  ]) {
    const target = new URL(roomUrl);
    target.searchParams.set("view", view);
    await page.goto(target.toString());
    await expect(
      page.getByRole("heading", { name: heading, exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole("heading", { name: heading, exact: true }),
    ).toBeVisible();
  }
  await page.goto(roomUrl);
  await expect(page.locator(".team-message")).toContainText(
    "Synthetic owner workbench message.",
  );
  await noOverflow(page);
  await page.screenshot({
    path: info.outputPath("owner-nested-room.png"),
    fullPage: true,
  });
});
