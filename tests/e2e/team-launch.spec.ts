import { test, expect } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import pg from "pg";
import { runtimeFile } from "../support/runtime";
import {
  knowledgeFixture,
  knowledgeLogin,
  knowledgeOk,
} from "../support/team-knowledge";
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
  await region
    .getByRole("button", { name: `Approve conversion ${a.id}`, exact: true })
    .click();
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
  await knowledgeLogin();
  const cfg = JSON.parse(fs.readFileSync(runtimeFile("database.json"), "utf8")),
    db = new pg.Client({ ...cfg, user: os.userInfo().username });
  await db.connect();
  let room: string;
  try {
    room = (
      await db.query(
        "select room_id from kxra.team_schedules group by room_id having count(*)>100 order by room_id limit 1",
      )
    ).rows[0].room_id;
  } finally {
    await db.end();
  }
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
