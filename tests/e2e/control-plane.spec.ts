import { expect, test, type Page } from "@playwright/test";

const projectTwo = "30000000-0000-4000-8000-000000000002";

async function fixtureLogin(page: Page, fixture: string) {
  await page.goto("/login");
  await page.getByText("Local fixture identities", { exact: true }).click();
  await page.getByLabel("Synthetic identity").selectOption(fixture);
  await page.getByRole("button", { name: "Use fixture" }).click();
  await expect(page).toHaveURL(/\/os(?:$|\/|\?)/);
}

async function navigate(page: Page, name: string) {
  const mobileMenu = page.locator(".mobile-menu > summary");
  const desktopLink = page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name, exact: true });
  await expect
    .poll(async () => {
      const [mobile, desktop] = await Promise.all([
        mobileMenu.isVisible(),
        desktopLink.isVisible(),
      ]);
      return mobile === desktop ? "loading" : mobile ? "mobile" : "desktop";
    })
    .not.toBe("loading");
  if (await mobileMenu.isVisible()) {
    await mobileMenu.click();
    await page
      .getByRole("navigation", { name: "Mobile navigation" })
      .getByRole("link", { name, exact: true })
      .click();
    return;
  }
  await desktopLink.click();
}

async function expectNoDocumentOverflow(page: Page) {
  const report = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
    rootClient: document.documentElement.clientWidth,
    bodyClient: document.body.clientWidth,
    bodyScroll: document.body.scrollWidth,
    offenders: [...document.querySelectorAll<HTMLElement>("body *")]
      .map((element) => {
        const bounds = element.getBoundingClientRect();
        return {
          selector: `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ""}${
            element.className && typeof element.className === "string"
              ? `.${element.className.trim().replaceAll(/\s+/g, ".")}`
              : ""
          }`,
          left: Math.round(bounds.left),
          right: Math.round(bounds.right),
          width: Math.round(bounds.width),
        };
      })
      .filter((item) => item.right > window.innerWidth + 1 || item.left < -1)
      .slice(0, 8),
    internalOverflow: [...document.querySelectorAll<HTMLElement>("body *")]
      .filter((element) => element.scrollWidth > element.clientWidth + 1)
      .map((element) => ({
        selector: `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ""}${
          element.className && typeof element.className === "string"
            ? `.${element.className.trim().replaceAll(/\s+/g, ".")}`
            : ""
        }`,
        client: element.clientWidth,
        scroll: element.scrollWidth,
        overflow: getComputedStyle(element).overflowX,
      }))
      .slice(0, 12),
  }));
  expect(report.document, JSON.stringify(report)).toBeLessThanOrEqual(
    report.viewport,
  );
}

test("AT-22 owner Dashboard, Portfolio and Idea Inbox are operational", async ({
  page,
  request,
}) => {
  const marketingOrigin =
    process.env.KXRA_MARKETING_ORIGIN || "http://127.0.0.1:3220";
  const publicMarker = `Public browser enquiry ${crypto.randomUUID()}`;
  const submitted = await request.post(`${marketingOrigin}/api/enquiries`, {
    headers: {
      origin: marketingOrigin,
      "idempotency-key": crypto.randomUUID(),
      "x-forwarded-for": `browser-${crypto.randomUUID()}`,
    },
    data: {
      kind: "CONTACT",
      name: "Public browser lead",
      email: `lead-${crypto.randomUUID()}@example.invalid`,
      company: "Synthetic business",
      message: publicMarker,
      sourcePath: "/contact",
      consent: true,
      website: "",
    },
  });
  expect(submitted.status()).toBe(202);
  await fixtureLogin(page, "owner");
  await expect(
    page.getByRole("heading", { name: "Your operating overview" }),
  ).toBeVisible();
  await expect(page.locator(".control-section")).toHaveCount(4);
  for (const section of [
    "Today",
    "Needs your decision",
    "At risk",
    "Recent activity",
  ]) {
    await expect(
      page.getByText(section, { exact: true }).first(),
    ).toBeVisible();
  }

  await navigate(page, "Portfolio");
  await expect(page.getByRole("heading", { name: "Portfolio" })).toBeVisible();
  await expect(page.locator(".portfolio-table tbody tr")).toHaveCount(7);
  await expect(
    page.getByText("NOT ASSESSED", { exact: true }).first(),
  ).toBeVisible();
  const portfolioFilter = page.locator("form.filter-bar");
  await portfolioFilter
    .locator('select[name="stage"]')
    .selectOption("VALIDATION");
  await portfolioFilter.getByRole("button", { name: "Apply" }).click();
  await expect(page.locator(".portfolio-table tbody tr")).toHaveCount(4);

  await navigate(page, "Idea Inbox");
  await expect(page.getByRole("heading", { name: "Idea Inbox" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Submit an idea" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Unverified enquiries" }),
  ).toBeVisible();
  await expect(page.getByText(publicMarker, { exact: true })).toBeVisible();
  await expect(
    page.getByText("UNVERIFIED", { exact: true }).first(),
  ).toBeVisible();
  await expect(page.locator(".idea-card").first()).toBeVisible();
  await expect(
    page.getByText("NOT ASSESSED", { exact: true }).first(),
  ).toBeVisible();
});

test("AT-24 owner Work Log and redacted Admin are real, linked and bounded", async ({
  page,
}) => {
  await fixtureLogin(page, "owner");
  await navigate(page, "Work Log");
  await expect(page.getByRole("heading", { name: "Work Log" })).toBeVisible();
  await expect(page.locator(".work-log-row").first()).toBeVisible();
  await expect(page.locator(".work-log-row").first()).toHaveAttribute(
    "href",
    /\/os\//,
  );
  const workFilter = page.locator("form.filter-bar");
  await workFilter.locator('select[name="project"]').selectOption(projectTwo);
  await workFilter.locator('select[name="type"]').selectOption("AUDIT_EVENT");
  await workFilter.getByRole("button", { name: "Apply" }).click();
  await expect(page.locator(".work-log-row").first()).toContainText(
    "AUDIT EVENT",
  );

  await navigate(page, "Admin");
  await expect(
    page.getByRole("heading", { name: "Administration" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Security and database health" }),
  ).toBeVisible();
  await expect(
    page.getByText("NOT CONNECTED", { exact: true }).first(),
  ).toBeVisible();
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
  await expect(page.getByText(/Generic secret editing/)).toBeVisible();
});

test("AT-14 owner routine registry exposes typed disabled contracts", async ({
  page,
}) => {
  await fixtureLogin(page, "owner");
  await navigate(page, "Routines");
  await expect(
    page.getByRole("heading", { name: "Routine Registry" }),
  ).toBeVisible();
  await expect(page.locator("article.panel")).toHaveCount(9);
  await expect(page.getByText("DRAFT", { exact: true })).toHaveCount(9);
  await expect(
    page.locator("article.panel > p .badge").filter({ hasText: /^DISABLED$/ }),
  ).toHaveCount(9);
  await expect(
    page.getByText(/Trigger.dev and notification delivery/),
  ).toBeVisible();
  await expect(
    page.getByText("Approve exact local contract", { exact: true }),
  ).toHaveCount(9);
});

test("AT-15/16 WhatsApp gateway exposes governed disabled foundations", async ({
  page,
}) => {
  await fixtureLogin(page, "partner");
  await navigate(page, "WhatsApp Connection");
  await expect(
    page.getByRole("heading", { name: "WhatsApp Connection" }),
  ).toBeVisible();
  await expect(
    page.getByText("Transport disabled", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Governed gateway contract" }),
  ).toBeVisible();
  await expect(
    page.getByText(/Phone numbers are stored only as digests/),
  ).toBeVisible();
  await expect(page.getByText(/No inbound webhook/)).toBeVisible();
});

test("AT-22 partner Idea access and owner control routes fail closed", async ({
  page,
}) => {
  await fixtureLogin(page, "partner");
  await expect(
    page.getByRole("heading", { name: "Your project workspace" }),
  ).toBeVisible();
  for (const ownerLink of [
    "Dashboard",
    "Portfolio",
    "Routines",
    "Work Log",
    "Admin",
  ])
    await expect(
      page.getByRole("link", { name: ownerLink, exact: true }),
    ).toHaveCount(0);

  await navigate(page, "Ideas");
  const title = `Partner control-plane ${Date.now()}`;
  await page.getByLabel("Title", { exact: true }).fill(title);
  await page.locator('select[name="project_id"]').selectOption(projectTwo);
  await page
    .getByLabel("Raw idea")
    .fill("Partner-owned typed Idea acceptance fixture.");
  await page.getByRole("button", { name: "Submit idea" }).click();
  await expect(page.getByRole("status")).toHaveText("Idea submitted to KXRA.");
  await expect(
    page.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();

  const forbidden = await page.evaluate(async () => {
    const responses = await Promise.all(
      ["dashboard", "portfolio", "work-log", "admin"].map((route) =>
        fetch(`/api/${route}`),
      ),
    );
    return responses.map((response) => response.status);
  });
  expect(forbidden).toEqual([403, 403, 403, 403]);
  await page.goto("/os/admin");
  await expect(
    page.getByRole("heading", { name: "Not available" }),
  ).toBeVisible();
});

test("Milestone 2 control surfaces reflow at frozen widths and 200%", async ({
  page,
}) => {
  test.slow();
  await fixtureLogin(page, "owner");
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/os");
    await expectNoDocumentOverflow(page);
    await page.goto("/os/portfolio");
    await expectNoDocumentOverflow(page);
    await page.goto("/os/ideas");
    await expectNoDocumentOverflow(page);
    await page.goto("/os/routines");
    await expectNoDocumentOverflow(page);
  }
  await page.setViewportSize({ width: 640, height: 900 });
  await page.goto("/os/admin");
  await page.evaluate(() => {
    document.documentElement.style.zoom = "2";
  });
  await expectNoDocumentOverflow(page);
});
