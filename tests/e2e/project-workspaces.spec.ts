import { expect, test, type Page } from "@playwright/test";

const projects = {
  p1: "30000000-0000-4000-8000-000000000001",
  p2: "30000000-0000-4000-8000-000000000002",
  p3: "30000000-0000-4000-8000-000000000003",
  p4: "30000000-0000-4000-8000-000000000004",
  p5: "30000000-0000-4000-8000-000000000005",
  p6: "30000000-0000-4000-8000-000000000006",
  p7: "30000000-0000-4000-8000-000000000007",
};

async function fixtureLogin(page: Page, fixture: string) {
  await page.goto("/login");
  await page.getByText("Local fixture identities", { exact: true }).click();
  await page.getByLabel("Synthetic identity").selectOption(fixture);
  await page.getByRole("button", { name: "Use fixture" }).click();
  await expect(page).toHaveURL(/\/os(?:$|\/|\?)/);
}

async function expectNoDocumentOverflow(page: Page) {
  const report = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
    offenders: [...document.querySelectorAll<HTMLElement>("body *")]
      .map((element) => {
        const bounds = element.getBoundingClientRect();
        return {
          tag: element.tagName.toLowerCase(),
          className:
            typeof element.className === "string" ? element.className : "",
          left: Math.round(bounds.left),
          right: Math.round(bounds.right),
        };
      })
      .filter((item) => item.left < -1 || item.right > window.innerWidth + 1)
      .slice(0, 8),
  }));
  expect(report.document, JSON.stringify(report)).toBeLessThanOrEqual(
    report.viewport,
  );
}

test("AT-23 owner receives the exact common and specialist workspace contracts", async ({
  page,
}) => {
  await fixtureLogin(page, "owner");
  const expected = [
    {
      id: projects.p1,
      name: "CLPR / Blockchain Interoperability",
      specialistCount: 8,
      gate: "P001 REVISIT",
      module: "revisit-criteria",
      moduleName: "Revisit Criteria",
    },
    {
      id: projects.p2,
      name: "US Vehicle Seat Covers",
      specialistCount: 12,
      gate: "P002 LISTING",
      module: "fitment-matrix",
      moduleName: "Fitment Matrix",
    },
    {
      id: projects.p3,
      name: "AI Property Fly-Through",
      specialistCount: 12,
      gate: "P003 FAITHFUL DELIVERY",
      module: "photos",
      moduleName: "Photos",
    },
    {
      id: projects.p4,
      name: "AI Trading Research & Monitoring Laboratory",
      specialistCount: 13,
      gate: "P004 PAPER READINESS",
      module: "midday-reports",
      moduleName: "Midday Reports",
    },
    {
      id: projects.p5,
      name: "KXRA Digital Products & Content Engine",
      specialistCount: 16,
      gate: "P005 LOCAL PROTOTYPE",
      module: "opportunity-backlog",
      moduleName: "Opportunity Backlog",
    },
    {
      id: projects.p6,
      name: "Finance Unfolded YouTube Content Engine",
      specialistCount: 18,
      gate: "P006 PUBLICATION PACKAGE",
      module: "source-packs",
      moduleName: "Source Packs",
    },
    {
      id: projects.p7,
      name: "GitHub Repository Intelligence & Secure Reuse",
      specialistCount: 18,
      gate: "P007 ADOPTION",
      module: "candidate-intake",
      moduleName: "Candidate Intake",
    },
  ];

  for (const project of expected) {
    await page.goto(`/os/projects/${project.id}`);
    await expect(
      page.getByRole("heading", { name: project.name, exact: true }),
    ).toBeVisible();
    const navigation = page.getByRole("navigation", {
      name: "Project workspace modules",
    });
    await expect(
      navigation.locator("section").first().getByRole("link"),
    ).toHaveCount(18);
    await expect(
      navigation.locator("section").nth(1).getByRole("link"),
    ).toHaveCount(project.specialistCount);
    await expect(
      page.getByRole("heading", { name: project.gate, exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Not Assessed", { exact: true })).toHaveCount(
      2,
    );

    await page.goto(`/os/projects/${project.id}/${project.module}`);
    await expect(
      page.getByRole("heading", { name: project.moduleName, exact: true }),
    ).toBeVisible();
    await expect(
      navigation.getByRole("link", { name: project.moduleName, exact: true }),
    ).toHaveAttribute("aria-current", "page");
  }
});

test("AT-23 specialist UIs expose evidence states and preserve hard stops", async ({
  page,
}) => {
  await fixtureLogin(page, "owner");

  await page.goto(`/os/projects/${projects.p2}/fitment-matrix`);
  await expect(page.locator(".workspace-module tbody tr")).toHaveCount(3);
  for (const vehicle of ["Ford F-150", "Ram / Dodge Ram", "Toyota Tacoma"])
    await expect(page.getByText(vehicle, { exact: true })).toBeVisible();
  await expect(
    page.getByText(/UNKNOWN|VERIFIED/, { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByText("Unknown", { exact: true }).first(),
  ).toBeVisible();

  await page.goto(`/os/projects/${projects.p3}/photos`);
  await page.getByText("Add property asset", { exact: true }).click();
  await expect(page.getByLabel("Material origin")).toHaveValue("REAL_INPUT");
  await expect(
    page.getByLabel("Material origin").locator("option"),
  ).toHaveCount(3);
  await expect(
    page.getByLabel("Material origin").locator("option").nth(1),
  ).toHaveText("AI-generated material");
  await expect(
    page.getByLabel("Material origin").locator("option").nth(2),
  ).toHaveText("AI-inferred material");
  await page.route(
    `**/api/project-workspaces/${projects.p3}/property-assets`,
    (route) => route.abort(),
  );
  await page.getByLabel("Asset title").fill("Synthetic failed asset");
  await page.getByRole("button", { name: "Save property asset" }).click();
  await expect(page.locator('[role="status"].error')).toBeVisible();
  await page.unroute(
    `**/api/project-workspaces/${projects.p3}/property-assets`,
  );

  await page.goto(`/os/projects/${projects.p4}`);
  await expect(
    page.getByText("Research / paper only.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Live execution", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Disabled", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /trade|broker|live/i }),
  ).toHaveCount(0);
  await page.goto(`/os/projects/${projects.p4}/midday-reports`);
  await expect(
    page.getByText("Research / paper only.", { exact: true }),
  ).toBeVisible();

  await page.goto(`/os/projects/${projects.p5}`);
  await expect(page.getByText("Demand first.", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Product creation", { exact: true }),
  ).toBeVisible();
  await page.goto(`/os/projects/${projects.p5}/opportunity-backlog`);
  await expect(
    page.getByText("Add demand opportunity", { exact: true }),
  ).toBeVisible();
  await page.goto(`/os/projects/${projects.p5}/production-pipeline`);
  await expect(page.getByText("Gated", { exact: true })).toBeVisible();
  await expect(
    page.getByText(/mutation workflow is unavailable/i),
  ).toBeVisible();
  await expect(page.locator(".specialist-controls")).toHaveCount(0);
  await expect(page.locator(".workspace-module form")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /publish|create product/i }),
  ).toHaveCount(0);

  await page.goto(`/os/projects/${projects.p6}/source-packs`);
  await expect(
    page.getByText("Pre-publication only.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(/No upload, schedule or publication executor exists/),
  ).toBeVisible();
  await expect(
    page.getByText("Create exact local content package", { exact: true }),
  ).toBeVisible();

  await page.goto(`/os/projects/${projects.p7}/candidate-intake`);
  await expect(
    page.getByText("Untrusted repositories remain data.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("worldflowai/everything-claude-code", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("msitarzewski/agency-agents", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Add metadata-only repository candidate", { exact: true }),
  ).toBeVisible();
});

test("AT-23 partner project navigation remains exact and server-scoped", async ({
  page,
}) => {
  await fixtureLogin(page, "partner");
  await page.goto(`/os/projects/${projects.p2}`);
  await expect(
    page.getByRole("heading", { name: "US Vehicle Seat Covers", exact: true }),
  ).toBeVisible();
  const navigation = page.getByRole("navigation", {
    name: "Project workspace modules",
  });
  await expect(navigation.getByRole("link")).toHaveCount(30);

  await page.goto(`/os/projects/${projects.p2}/approvals`);
  await expect(
    page.getByRole("heading", { name: "Restricted module", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Approval details are owner-only.", { exact: true }),
  ).toBeVisible();

  await page.goto(`/os/projects/${projects.p3}/photos`);
  await expect(
    page.getByRole("heading", { name: "Not available", exact: true }),
  ).toBeVisible();
});

test("AT-23 project workspaces reflow at frozen widths and 200 percent", async ({
  page,
}) => {
  await fixtureLogin(page, "owner");
  const routes = [
    `/os/projects/${projects.p1}/revisit-criteria`,
    `/os/projects/${projects.p2}/fitment-matrix`,
    `/os/projects/${projects.p3}/photos`,
    `/os/projects/${projects.p4}/midday-reports`,
    `/os/projects/${projects.p5}/production-pipeline`,
  ];
  for (const [index, width] of [1440, 768, 390, 320].entries()) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(routes[index]);
    await expectNoDocumentOverflow(page);
  }

  await page.setViewportSize({ width: 640, height: 900 });
  await page.goto(routes[4]);
  await page.evaluate(() => {
    document.documentElement.style.zoom = "2";
  });
  await expectNoDocumentOverflow(page);
});
