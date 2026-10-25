import {
  test,
  expect,
  type Request as PlaywrightRequest,
} from "@playwright/test";
import { testOrigin } from "../support/runtime";
import { knowledgeFixture, knowledgeOk } from "../support/team-knowledge";
import { paginationFixture } from "../support/pagination-fixture";
async function login(page: import("@playwright/test").Page, identity: string) {
  await page.goto("/login");
  await page.getByText("Local fixture identities", { exact: true }).click();
  await page.getByLabel("Synthetic identity").selectOption(identity);
  await page.getByRole("button", { name: "Use fixture", exact: true }).click();
  await expect(page).toHaveURL(/\/os/);
}
test("room lead conversion survives reload with exact review and one local receipt", async ({
  page,
}) => {
  test.setTimeout(90000);
  const f = await knowledgeFixture(false);
  await login(page, "partner");
  await page.goto("/os/workspace/" + f.room);
  await page.getByRole("tab", { name: "Workflow", exact: true }).click();
  const region = page.getByRole("region", { name: "Room CRM workflow" });
  await region
    .getByLabel("Lead name", { exact: true })
    .fill("Browser prospect");
  await region
    .getByLabel("Lead context", { exact: true })
    .fill("Private qualification");
  await region
    .getByLabel("Lead next step", { exact: true })
    .fill("Review scope");
  await region
    .getByRole("button", { name: "Capture lead", exact: true })
    .click();
  await expect(
    region.getByRole("heading", {
      name: "LEAD · Browser prospect",
      exact: true,
    }),
  ).toBeVisible();
  await region
    .getByLabel("Account name", { exact: true })
    .fill("Browser account");
  await region
    .getByLabel("Opportunity name", { exact: true })
    .fill("Browser opportunity");
  await region
    .getByLabel("Conversion next step", { exact: true })
    .fill("Prepare handover");
  await region
    .getByRole("button", { name: "Propose lead conversion", exact: true })
    .click();
  await expect(
    region.getByRole("heading", {
      name: "Browser account → Browser opportunity",
      exact: true,
    }),
  ).toBeVisible();
  const a = (await knowledgeOk(`/${f.room}/workflow-actions`, f.cookie))
    .actions[0];
  const reviewEndpoint = `/api/team-space/${f.room}/conversion-review`;
  const exactApprovalRequest = (request: PlaywrightRequest): boolean => {
    const url = new URL(request.url());
    if (
      request.method() !== "POST" ||
      url.origin !== new URL(testOrigin).origin ||
      url.pathname !== reviewEndpoint ||
      url.search
    )
      return false;
    try {
      const body = request.postDataJSON();
      return (
        body !== null &&
        typeof body === "object" &&
        !Array.isArray(body) &&
        Object.keys(body).sort().join(",") === "action_id,decision,version" &&
        body.action_id === a.id &&
        body.version === a.version &&
        body.decision === "APPROVED"
      );
    } catch {
      return false;
    }
  };
  let releaseReview!: () => void, reviewHeld!: (at: number) => void;
  const reviewGate = new Promise<void>((resolve) => {
    releaseReview = resolve;
  });
  const held = new Promise<number>((resolve) => {
    reviewHeld = resolve;
  });
  await page.route(`**${reviewEndpoint}`, async (route) => {
    if (exactApprovalRequest(route.request())) {
      reviewHeld(Date.now());
      await reviewGate;
    }
    await route.continue();
  });
  const acknowledged = page.waitForResponse((response) =>
    exactApprovalRequest(response.request()),
  );
  // If an earlier assertion fails, cleanup can close the page before this wait.
  // Observe that rejection without changing the original promise awaited below.
  void acknowledged.catch(() => undefined);
  const approvalForm = region.locator("form").filter({
    has: page.getByRole("heading", {
      name: `Approve conversion ${a.id}`,
      exact: true,
    }),
  });
  try {
    await approvalForm
      .getByRole("button", { name: `Approve conversion ${a.id}`, exact: true })
      .click();
    const heldAt = await held;
    await expect(
      approvalForm.getByRole("button", { name: "Working…", exact: true }),
    ).toBeVisible();
    await expect(
      region.getByRole("button", {
        name: `Execute conversion ${a.id}`,
        exact: true,
      }),
    ).toHaveCount(0);
    // One controlled network gate outlasts the original five-second UI assertion.
    // This is pending-state regression coverage, not a sleep to settle rendering.
    await new Promise((resolve) => setTimeout(resolve, 6_000));
    expect(Date.now() - heldAt).toBeGreaterThanOrEqual(6_000);
    await expect(
      approvalForm.getByRole("button", { name: "Working…", exact: true }),
    ).toBeVisible();
    await expect(
      region.getByRole("button", {
        name: `Execute conversion ${a.id}`,
        exact: true,
      }),
    ).toHaveCount(0);
    const pending = (
      await knowledgeOk(`/${f.room}/workflow-actions`, f.cookie)
    ).actions.find((action: { id: string }) => action.id === a.id);
    expect(pending).toMatchObject({
      id: a.id,
      state: "PROPOSED",
      version: a.version,
    });
    const releasedAt = Date.now();
    releaseReview();
    const response = await acknowledged;
    expect(response.status()).toBe(201);
    expect(await response.json()).toEqual({ saved: true });
    const approved = (
      await knowledgeOk(`/${f.room}/workflow-actions`, f.cookie)
    ).actions.find((action: { id: string }) => action.id === a.id);
    expect(approved).toMatchObject({
      id: a.id,
      state: "APPROVED",
      version: a.version + 1,
    });
    console.log(
      `[${test.info().project.name}] CRM approval acknowledged: held ${releasedAt - heldAt}ms; acknowledgement ${Date.now() - releasedAt}ms`,
    );
  } finally {
    releaseReview();
  }
  await expect(
    region.getByRole("button", {
      name: `Execute conversion ${a.id}`,
      exact: true,
    }),
  ).toBeVisible();
  await region
    .getByRole("button", { name: `Execute conversion ${a.id}`, exact: true })
    .click();
  await expect(
    region.getByRole("heading", {
      name: "ACCOUNT · Browser account",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    region.getByRole("heading", {
      name: "OPPORTUNITY · Browser opportunity",
      exact: true,
    }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("tab", { name: "Workflow", exact: true }).click();
  await expect(
    region.getByText(
      `Account ${(await knowledgeOk(`/${f.room}/workflow-actions`, f.cookie)).actions[0].account_id};`,
      { exact: false },
    ),
  ).toBeVisible();
  expect(
    (await knowledgeOk(`/${f.room}/workflow-records`, f.cookie)).records,
  ).toHaveLength(3);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
});
test("catalogs load earlier authorised pages and the pilot offer stays a simulation", async ({
  page,
}) => {
  test.setTimeout(90000);
  const { room } = await paginationFixture();
  await login(page, "partner");
  await page.goto("/os/workspace/" + room);
  await page.getByRole("tab", { name: "Jobs", exact: true }).click();
  const jobs = page.getByRole("region", {
    name: "Durable room drafts",
    exact: true,
  });
  await jobs
    .getByRole("button", { name: "Load earlier jobs", exact: true })
    .click();
  await expect(
    jobs.getByRole("button", { name: "Load earlier jobs", exact: true }),
  ).toHaveCount(0);
  await expect(
    jobs.locator('article[aria-label^="Queued draft "]'),
  ).toHaveCount(102);
  const schedules = page.getByRole("region", {
    name: "Recurring room drafts",
    exact: true,
  });
  await schedules
    .getByRole("button", { name: "Load earlier schedules", exact: true })
    .click();
  await expect(
    schedules.locator('article[aria-label^="Schedule "]'),
  ).toHaveCount(102);
  await expect(
    schedules.getByRole("button", {
      name: "Load earlier schedules",
      exact: true,
    }),
  ).toHaveCount(0);
  const f = await knowledgeFixture(false, "owner");
  await login(page, "owner");
  await page.goto("/os/workspace/" + f.room);
  await page.getByRole("tab", { name: "Settings", exact: true }).click();
  const pilot = page.getByRole("region", { name: "Workspace pilot preview" });
  await expect(pilot).toContainText("£49.00/workspace/month");
  await expect(pilot).toContainText("Starter £29");
  await expect(pilot).toContainText("£199");
  await expect(pilot).toContainText("Unassigned");
  await expect(pilot).toContainText("Unapproved capacity proposals");
  await expect(pilot).toContainText(
    "No payment provider, invoice, charge or checkout is activated",
  );
});
