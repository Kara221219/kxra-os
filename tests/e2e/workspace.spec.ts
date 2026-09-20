import { test, expect, type Page } from "@playwright/test";
import { processFileJobs } from "../../packages/storage/worker";

async function fixtureLogin(page: Page, fixture: string) {
  await page.goto("/login");
  await page.getByText("Local fixture identities", { exact: true }).click();
  await page.getByLabel("Synthetic identity").selectOption(fixture);
  await page.getByRole("button", { name: "Use fixture" }).click();
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

test("owner sign-in, typed Idea creation and persistence", async ({
  page,
}, testInfo) => {
  await fixtureLogin(page, "owner");
  await expect(
    page.getByRole("heading", { name: "Your operating overview" }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("owner-workspace.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await navigate(page, "Idea Inbox");
  const title = "Browser fixture " + Date.now();
  await page.getByLabel("Title", { exact: true }).fill(title);
  await page.getByLabel("Raw idea").fill("Synthetic browser persistence test.");
  await page.getByRole("button", { name: "Submit idea" }).click();
  await expect(page.getByRole("status")).toHaveText("Idea submitted to KXRA.");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(
    page.getByRole("heading", { name: "Welcome back." }),
  ).toBeVisible();
});
test("partner navigation and crafted project URL protect private work", async ({
  page,
}) => {
  await fixtureLogin(page, "partner");
  await expect(
    page.getByRole("heading", { name: "Your project workspace" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "US Vehicle Seat Covers", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("PROJECT-003", { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Finance", exact: true }),
  ).toHaveCount(0);
  await page.goto("/os/projects/30000000-0000-4000-8000-000000000003");
  await expect(
    page.getByRole("heading", { name: "Not available" }),
  ).toBeVisible();
});

test("AT-11 Ask requires one project and reports insufficient evidence exactly", async ({
  page,
}) => {
  await fixtureLogin(page, "partner");
  await page.goto("/os/ask");
  const project = page.getByRole("combobox", { name: "Project" });
  await expect(project).toHaveValue("");
  await expect(project.getByRole("option").first()).toHaveText(
    "Select one project",
  );
  await project.selectOption("30000000-0000-4000-8000-000000000002");
  await page
    .getByLabel("Ask about your evidence")
    .fill("term-that-cannot-exist-9f4620c0");
  await page.getByRole("button", { name: "Find evidence" }).click();
  await expect(page.getByText("INSUFFICIENT KXRA EVIDENCE.")).toBeVisible();
});

test("typed AI registries expose a permission-safe local Ask run", async ({
  page,
}, testInfo) => {
  const project = "30000000-0000-4000-8000-000000000002";
  const marker = `aimodel${Date.now()}${testInfo.project.name}`.replace(
    /[^a-z0-9]/gi,
    "",
  );
  await fixtureLogin(page, "owner");
  const created = await page.evaluate(
    async ({ projectId, evidenceMarker }) => {
      const response = await fetch("/api/records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "knowledge",
          title: "AI browser evidence",
          body: `${evidenceMarker} is bounded local evidence.`,
          project_id: projectId,
          classification: "EXTERNAL RESEARCH",
          visibility: "project_shared",
          data: {},
        }),
      });
      return { status: response.status, body: await response.json() };
    },
    { projectId: project, evidenceMarker: marker },
  );
  expect(created.status).toBe(201);
  await page.goto("/os/ask");
  await page.getByRole("combobox", { name: "Project" }).selectOption(project);
  await page
    .getByRole("combobox", { name: "Response mode" })
    .selectOption("model");
  await page.getByLabel("Ask about your evidence").fill(marker);
  await page.getByRole("button", { name: "Find evidence" }).click();
  await expect(page.getByText(/fake · gpt-5\.6-sol · run/)).toBeVisible();
  const runText = await page.getByText(/fake · gpt-5\.6-sol · run/).innerText();
  const runId = runText.split("run ")[1];
  expect(runId).toMatch(/^[0-9a-f-]{36}$/);

  await navigate(page, "AI Team");
  await expect(page.getByText("AGT-ASK", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Ask KXRA Evidence Assistant", { exact: true }),
  ).toBeVisible();
  await navigate(page, "Skills");
  await expect(page.getByText("SKL-ASK-001", { exact: true })).toBeVisible();
  await navigate(page, "Run History");
  const runRow = page.getByRole("row").filter({ hasText: runId });
  await expect(runRow.getByText(runId, { exact: true })).toBeVisible();
  await expect(runRow.getByText("DELIVERED", { exact: true })).toBeVisible();
});

test("AT-10 owner upload is processed, cited and downloaded through the private proxy", async ({
  page,
}, testInfo) => {
  const project = "30000000-0000-4000-8000-000000000002";
  const marker = `browserchunk${Date.now()}${testInfo.project.name}`.replace(
    /[^a-z0-9]/gi,
    "",
  );
  const filename = `${marker}.txt`;
  await fixtureLogin(page, "owner");
  await page.goto(`/os/files?project=${project}`);
  await page
    .getByRole("combobox", { name: "Who can see this file?" })
    .selectOption("project_shared");
  await page.locator('input[type="file"][name="file"]').setInputFiles({
    name: filename,
    mimeType: "text/plain",
    buffer: Buffer.from(`${marker} browser lifecycle evidence`),
  });
  await page.getByRole("button", { name: "Upload file" }).click();
  await expect(page.getByRole("status")).toHaveText(
    "Uploaded securely. Trusted processing is now queued.",
  );
  await processFileJobs({
    workerReference: `browser-file-${testInfo.project.name}`,
  });
  await page.reload();
  await expect(page.getByRole("link", { name: filename })).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: filename }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(filename);

  await page.goto("/os/ask");
  await page.getByRole("combobox", { name: "Project" }).selectOption(project);
  await page.getByLabel("Ask about your evidence").fill(marker);
  await page.getByRole("button", { name: "Find evidence" }).click();
  await expect(page.getByText("Indexed file evidence").first()).toBeVisible();
  await expect(page.getByText(marker, { exact: false }).first()).toBeVisible();
});

test("owner can inspect gate controls, history and invitation foundations", async ({
  page,
}) => {
  const project = "30000000-0000-4000-8000-000000000002";
  await fixtureLogin(page, "owner");

  await page.goto(`/os/projects/${project}`);
  await expect(
    page.getByRole("heading", { name: "US Vehicle Seat Covers" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "P002 LISTING", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Thresholds proposed / unset", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("exact SKU", { exact: true })).toBeVisible();

  await page.goto(`/os/projects/${project}/experiments`);
  await expect(
    page.getByRole("heading", { name: "Experiments", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Operating loop status")).toBeVisible();

  await page.goto(`/os/projects/${project}/research`);
  await page.locator(".record-list .record h3 a").first().click();
  await expect(
    page.getByRole("heading", { name: "Version history" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Version 1", exact: true }).click();
  await expect(
    page.getByText("This is an immutable historical snapshot.", {
      exact: false,
    }),
  ).toBeVisible();

  await page.goto(`/os/files?project=${project}`);
  await expect(
    page.getByRole("combobox", { name: "Project", exact: true }),
  ).toHaveValue(project);
  await expect(
    page.getByRole("combobox", {
      name: "Who can see this file?",
      exact: true,
    }),
  ).toHaveValue("owner_only");

  await page.goto("/os/partners");
  await expect(page.getByRole("heading", { name: "Partners" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Create an invitation" }),
  ).toBeVisible();
});
