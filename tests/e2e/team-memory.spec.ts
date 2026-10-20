import { test, expect } from "@playwright/test";
import { knowledgeFixture, knowledgeOk } from "../support/team-knowledge";
import crypto from "node:crypto";

test("reviewed room memory is opt-in and removal hides cached historical output", async ({
  page,
}) => {
  test.setTimeout(120000);
  const f = await knowledgeFixture(false),
    title = "Preference " + f.marker;
  await page.goto("/login");
  await page.getByText("Local fixture identities", { exact: true }).click();
  await page.getByLabel("Synthetic identity").selectOption("partner");
  await page.getByRole("button", { name: "Use fixture" }).click();
  await expect(page).toHaveURL(/\/os/);
  await page.goto("/os/workspace/" + f.room);
  await page.getByRole("tab", { name: "Memory", exact: true }).click();
  await page.getByLabel("Memory agent", { exact: true }).selectOption(f.agent);
  await page.getByLabel("Memory title", { exact: true }).fill(title);
  await page
    .getByLabel("Memory text", { exact: true })
    .fill(f.marker + " Prefer evidence-linked drafts.");
  await page
    .getByRole("button", { name: "Propose room memory", exact: true })
    .click();
  const card = page
    .getByRole("region", { name: "Scoped room memory" })
    .locator("article")
    .filter({
      has: page.getByRole("heading", { name: title + " · v1", exact: true }),
    });
  await expect(
    card.getByText("PREFERENCE · DRAFT", { exact: true }),
  ).toBeVisible();
  expect(
    await knowledgeOk(`/${f.room}/memory-recall?agent_id=${f.agent}`, f.cookie),
  ).toEqual([]);
  await card
    .getByRole("button", { name: `Review memory ${title} v1`, exact: true })
    .click();
  await expect(
    card.getByText("PREFERENCE · APPROVED", { exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Conversation", exact: true }).click();
  await page
    .getByLabel("Use approved memory for this agent (thread mode only)", {
      exact: true,
    })
    .check();
  await page.getByRole("button", { name: "Ask agent", exact: true }).click();
  await expect(page.locator(".team-agent-output")).toContainText(f.marker);
  for (let n = 0; n < 101; n++)
    await knowledgeOk(`/${f.room}/messages`, f.cookie, {
      request_id: crypto.randomUUID(),
      body: "Later memory message " + n,
    });
  await page.reload();
  await expect(page.locator(".team-agent-output")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Load earlier messages", exact: true })
    .click();
  await expect(page.locator(".team-agent-output")).toContainText(f.marker);
  await page.getByRole("tab", { name: "Memory", exact: true }).click();
  await card
    .getByRole("button", { name: `Remove memory ${title} v1`, exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Removed memory · v1", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Memory text removed.", { exact: true }),
  ).toBeVisible();
  const removed = (await knowledgeOk(`/${f.room}/memories`, f.cookie)).entries;
  expect(removed).toHaveLength(1);
  expect(removed[0]).toMatchObject({
    title: "Removed memory",
    body: "",
    content_sha256: null,
    state: "DELETED",
  });
  await page.getByRole("tab", { name: "Conversation", exact: true }).click();
  await expect(page.locator(".team-agent-output")).toHaveCount(0);
  expect(
    await knowledgeOk(`/${f.room}/memory-recall?agent_id=${f.agent}`, f.cookie),
  ).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
});
