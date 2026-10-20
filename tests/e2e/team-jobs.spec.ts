import fs from "node:fs";
import { test, expect } from "@playwright/test";
import { knowledgeFixture, knowledgeOk } from "../support/team-knowledge";

test("local queued drafts persist, execute once and support one-off cancellation", async ({
  page,
}) => {
  test.setTimeout(120000);
  const f = await knowledgeFixture(false, "owner");
  await page.goto("/login");
  await page.getByText("Local fixture identities", { exact: true }).click();
  await page.getByLabel("Synthetic identity").selectOption("owner");
  await page.getByRole("button", { name: "Use fixture", exact: true }).click();
  await expect(page).toHaveURL(/\/os/);
  await page.goto("/os/workspace/" + f.room);
  await page.getByRole("tab", { name: "Jobs", exact: true }).click();
  const region = page.getByRole("region", { name: "Durable room drafts" });
  await expect(region).toContainText(
    "Hosted scheduled execution is not activated",
  );
  await page
    .getByLabel("Schedule name", { exact: true })
    .fill("Daily acceptance");
  await page
    .getByLabel("Scheduled draft agent", { exact: true })
    .selectOption(f.agent);
  await page
    .getByLabel("Scheduled draft message", { exact: true })
    .selectOption(f.message);
  await page.getByLabel("Daily wall time", { exact: true }).fill("00:00");
  await page
    .getByLabel("First local date", { exact: true })
    .fill(new Date().toISOString().slice(0, 10));
  const expiry = await page.evaluate(() => {
    const d = new Date(Date.now() + 86400000),
      pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });
  await page
    .getByLabel("Schedule expiry (browser local time)", { exact: true })
    .fill(expiry);
  await page
    .getByLabel("Maximum admitted occurrences", { exact: true })
    .fill("1");
  await page
    .getByRole("button", { name: "Propose daily draft", exact: true })
    .click();
  const schedule = page.getByRole("article", {
    name: "Schedule Daily acceptance",
    exact: true,
  });
  await expect(schedule).toContainText("DRAFT");
  await expect(schedule).toContainText("Review digest");
  await page
    .getByRole("button", {
      name: "Review and activate Daily acceptance",
      exact: true,
    })
    .click();
  await expect(schedule).toContainText("ACTIVE");
  await page
    .getByRole("button", { name: "Run next due draft", exact: true })
    .click();
  await expect(
    region.getByRole("heading", {
      name: f.agentName + " · SUCCEEDED",
      exact: true,
    }),
  ).toBeVisible();
  let data = await knowledgeOk(`/${f.room}/jobs`, f.cookie);
  expect(data.jobs).toHaveLength(1);
  expect(data.jobs[0]).toMatchObject({ state: "SUCCEEDED", attempt_count: 1 });
  expect(data.jobs[0].run_id).toBeTruthy();
  await page.getByRole("tab", { name: "Conversation", exact: true }).click();
  await expect(page.locator(".team-agent-output")).toContainText(
    "LOCAL DEMONSTRATION",
  );
  await page.getByRole("tab", { name: "Jobs", exact: true }).click();
  await page
    .getByRole("button", { name: "Refresh recurring drafts", exact: true })
    .click();
  await expect(schedule).toContainText("EXHAUSTED");
  const futureLocal = await page.evaluate(() => {
    const d = new Date(Date.now() + 3600000),
      pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });
  await page
    .getByLabel("Due after (local time, optional)", { exact: true })
    .fill(futureLocal);
  await page.getByRole("button", { name: "Queue draft", exact: true }).click();
  await expect(
    region.getByRole("heading", {
      name: f.agentName + " · QUEUED",
      exact: true,
    }),
  ).toBeVisible();
  data = await knowledgeOk(`/${f.room}/jobs`, f.cookie);
  const pending = data.jobs.find(
    (j: { state: string }) => j.state === "QUEUED",
  );
  expect(pending).toBeTruthy();
  expect(Date.parse(pending.due_at) - Date.now()).toBeGreaterThan(
    50 * 60 * 1000,
  );
  await page
    .getByRole("button", { name: "Run next due draft", exact: true })
    .click();
  await expect(
    region.getByRole("heading", {
      name: f.agentName + " · QUEUED",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: "Cancel queued draft " + pending.id,
      exact: true,
    })
    .click();
  await expect(
    region.getByRole("heading", {
      name: f.agentName + " · CANCELLED",
      exact: true,
    }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("tab", { name: "Jobs", exact: true }).click();
  await expect(
    region.getByRole("heading", {
      name: f.agentName + " · SUCCEEDED",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    region.getByRole("heading", {
      name: f.agentName + " · CANCELLED",
      exact: true,
    }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  const audit = page.getByRole("region", {
    name: "Room audit export",
    exact: true,
  });
  const downloadPromise = page.waitForEvent("download");
  await audit
    .getByRole("button", { name: "Download latest audit page", exact: true })
    .click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(`room-${f.room}-audit.csv`);
  const file = await download.path();
  expect(file).toBeTruthy();
  const csv = fs.readFileSync(file!, "utf8");
  expect(csv).toContain(
    "event_id,created_at,event,state,status,active,enabled",
  );
  expect(csv).not.toContain("lease_token");
  expect(csv).not.toContain("Prepare a draft");
});
