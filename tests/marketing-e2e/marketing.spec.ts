import { expect, test } from "@playwright/test";

const routes = [
  "/",
  "/platform",
  "/brand-studio",
  "/pricing",
  "/custom-projects",
  "/industries",
  "/about",
  "/contact",
  "/partner",
  "/submit-opportunity",
  "/legal/privacy",
  "/legal/terms",
  "/legal/cookies",
  "/legal",
  "/legal/data-processing",
  "/legal/custom-projects",
  "/approach",
  "/explorations",
  "/privacy",
  "/terms",
];

test("AT-17 required public routes render from the reviewed snapshot", async ({
  page,
}) => {
  test.slow();
  for (const route of routes) {
    const response = await page.goto(route);
    expect(response?.status(), route).toBe(200);
    await expect(page.locator("h1").first()).toBeVisible();
  }
  const homeResponse = await page.goto("/");
  const policy = homeResponse?.headers()["content-security-policy"] || "";
  expect(policy).toContain("script-src");
  if (process.env.KXRA_EXPECT_PRODUCTION_CSP === "true") {
    expect(policy.match(/script-src[^;]*/)?.[0]).not.toContain(
      "'unsafe-inline'",
    );
    expect(policy).toContain("'sha256-");
    expect(policy).toContain("script-src-attr 'none'");
  }
  await expect(
    page.getByText("Private build preview · publication is disabled"),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("customer-document pack is complete and records exact owner approval", async ({
  page,
}) => {
  for (const route of [
    "/pricing",
    "/legal/privacy",
    "/legal/terms",
    "/legal/cookies",
    "/legal/data-processing",
    "/legal/custom-projects",
  ]) {
    await page.goto(route);
    await expect(page.locator("main")).toContainText(
      /owner[- ]approved|owner approved/i,
    );
    await expect(page.locator("main")).not.toContainText(
      /require(?:s|d)? solicitor|solicitor approval before activation/i,
    );
    if (route.startsWith("/legal/")) {
      await expect(page.locator("script")).toHaveCount(0);
      await expect(
        page.locator('link[href="/legal-documents.css"]'),
      ).toHaveCount(1);
    }
    if (route === "/pricing") {
      await expect(page.locator("main")).toContainText("£29");
      await expect(page.locator("main")).toContainText("£290");
      await expect(page.locator("main")).toContainText(
        "120 generated creative variants",
      );
      await expect(page.locator("main")).toContainText("120 reviewed exports");
      await expect(page.locator("main")).toContainText(
        "Stripe test billing and the production release gate must pass",
      );
    }
  }
  await page.goto("/legal/terms");
  await expect(page.locator("main")).toContainText("£29");
  await expect(page.locator("main")).toContainText(
    "seven-calendar-day grace period",
  );
  await expect(page.locator("main")).toContainText("Business customers only");
  await page.goto("/legal/privacy");
  await expect(page.locator("main")).toContainText("17435511");
  await expect(page.locator("main")).toContainText("90 days");
  await page.goto("/legal/cookies");
  await expect(page.locator("main")).toContainText(
    "does not currently set analytics or advertising cookies",
  );
});

test("AT-26 accessible public contact submission reaches private inbox", async ({
  page,
}) => {
  await page.goto("/contact");
  await expect(page.locator("form")).toHaveAttribute("method", "post");
  await expect(page.locator("form")).toHaveAttribute(
    "action",
    "/api/enquiries",
  );
  await expect(page.locator('input[name="kind"]')).toHaveValue("CONTACT");
  await expect(page.locator('input[name="sourcePath"]')).toHaveValue(
    "/contact",
  );
  await page.getByLabel("Name").fill("Browser Test");
  await page
    .getByLabel("Work email")
    .fill(`browser-${Date.now()}@example.invalid`);
  await page.getByLabel("Business or organisation").fill("Example");
  await page
    .getByLabel("How can KXRA help?")
    .fill("A synthetic contact request with enough detail for validation.");
  await page.getByRole("checkbox").check();
  await expect(page.getByRole("checkbox")).toBeChecked();
  expect(
    await page
      .locator("form")
      .evaluate((form: HTMLFormElement) => form.checkValidity()),
  ).toBe(true);
  await page.getByRole("button", { name: "Send to KXRA" }).click();
  await expect(page.getByRole("status")).toContainText(
    "private KXRA review inbox",
  );
});

test("AT-18 public contact exposes loading, safe failure and retry states", async ({
  page,
}) => {
  let releaseFailure: (() => void) | undefined;
  const failureGate = new Promise<void>((resolve) => {
    releaseFailure = resolve;
  });
  await page.route("**/api/enquiries", async (route) => {
    await failureGate;
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ message: "Request unavailable" }),
    });
  });
  await page.goto("/contact");
  await page.getByLabel("Name").fill("Failure State Test");
  await page
    .getByLabel("Work email")
    .fill(`failure-${Date.now()}@example.invalid`);
  await page.getByLabel("Business or organisation").fill("Example");
  await page
    .getByLabel("How can KXRA help?")
    .fill("A synthetic request that proves the safe retry experience.");
  await page.getByRole("checkbox").check();

  const submit = page.getByRole("button", { name: "Send to KXRA" });
  await submit.click();
  await expect(page.getByRole("button", { name: "Sending…" })).toBeDisabled();
  await expect(page.getByRole("status")).toHaveText("Sending securely…");
  releaseFailure?.();
  await expect(page.getByRole("status")).toContainText(
    "We could not store your request",
  );
  await expect(submit).toBeEnabled();
  await expect(page.getByLabel("Name")).toHaveValue("Failure State Test");

  await page.unroute("**/api/enquiries");
  await submit.click();
  await expect(page.getByRole("status")).toContainText(
    "private KXRA review inbox",
  );
  await expect(page.getByLabel("Name")).toHaveValue("");
});

test("AT-44 reduced motion preserves every layered section and removes sticky movement", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator(".layer")).toHaveCount(4);
  const positions = await page
    .locator(".layer")
    .evaluateAll((elements) =>
      elements.map((element) => getComputedStyle(element).position),
    );
  expect(positions.every((position) => position === "relative")).toBe(true);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("depth journey advances chapters through the viewport", async ({
  page,
}) => {
  await page.goto("/");
  const journey = page.locator(".journey");
  await expect(journey).toHaveClass(/journey--enhanced/);

  await journey.evaluate((element) => {
    const viewport = window.innerHeight;
    const destination =
      (element as HTMLElement).offsetTop +
      (element.scrollHeight - viewport) * 0.72;
    window.scrollTo(0, destination);
  });

  await expect
    .poll(() =>
      page
        .locator(".journey-stage")
        .evaluate((stage) =>
          Number(
            getComputedStyle(stage)
              .getPropertyValue("--journey-progress")
              .trim(),
          ),
        ),
    )
    .toBeGreaterThan(0.65);
  await expect(
    page.locator('.journey-chapter[data-active="true"]'),
  ).toHaveCount(1);
  await expect(
    page.locator(".journey-chapter").filter({ hasText: "Build reusable" }),
  ).toHaveAttribute("data-active", "true");
});

test("AT-44 320px reflow and 200 percent text preserve access", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto("/");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
  await page.setViewportSize({ width: 720, height: 900 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.keyboard.press("Home");
  await page.keyboard.press("Tab");
  await expect(page.locator(":focus")).toHaveText("Skip to content");
});

test("AT-44 content and contact fallback work without JavaScript", async ({
  browser,
}) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.locator(".layer")).toHaveCount(4);
  await page.goto("/contact");
  await expect(page.locator(".form-shell .notice")).toContainText(
    "JavaScript is unavailable.",
  );
  await expect(
    page.getByRole("link", { name: "info@kxra-group.com" }).first(),
  ).toHaveAttribute("href", "mailto:info@kxra-group.com");
  await context.close();
});

test("AT-44 representative accessibility tree exposes landmarks and labelled controls", async ({
  page,
  context,
}) => {
  await page.goto("/contact");
  const session = await context.newCDPSession(page);
  const tree = await session.send("Accessibility.getFullAXTree");
  const nodes = tree.nodes.filter((node) => !node.ignored);
  const values = (role: string) =>
    nodes
      .filter((node) => node.role?.value === role)
      .map((node) => String(node.name?.value || ""));

  expect(values("banner").length).toBe(1);
  expect(values("navigation")).toContain("Primary navigation");
  expect(values("main").length).toBe(1);
  expect(values("contentinfo").length).toBe(1);
  expect(values("heading")).toContain("Start a conversation with KXRA.");
  expect(values("textbox")).toEqual(
    expect.arrayContaining([
      "Name",
      "Work email",
      "Business or organisation",
      "How can KXRA help?",
    ]),
  );
  expect(values("checkbox")).toContain(
    "I agree that KXRA may use this information to review and respond to my request.",
  );
  expect(values("button")).toContain("Send to KXRA");

  const duplicateIds = await page.locator("[id]").evaluateAll((elements) => {
    const counts = new Map<string, number>();
    for (const element of elements)
      counts.set(element.id, (counts.get(element.id) || 0) + 1);
    return [...counts.entries()].filter(([, count]) => count > 1);
  });
  expect(duplicateIds).toEqual([]);
  await session.detach();
});
