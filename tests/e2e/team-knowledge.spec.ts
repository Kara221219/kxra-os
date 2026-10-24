import { test, expect } from "@playwright/test";
import { knowledgeFixture, knowledgeOk } from "../support/team-knowledge";
import crypto from "node:crypto";
import { workspaceRefreshAfter } from "../support/workspace-refresh";
import { testOrigin } from "../support/runtime";
test("room knowledge and reviewed skill versions produce scoped drafts and revoke derived output", async ({
  page,
}) => {
  test.setTimeout(120000);
  const f = await knowledgeFixture(false),
    skillName = "Evidence checklist " + f.marker;
  await page.goto("/login");
  await page.getByText("Local fixture identities", { exact: true }).click();
  await page.getByLabel("Synthetic identity").selectOption("partner");
  await page.getByRole("button", { name: "Use fixture" }).click();
  await expect(page).toHaveURL(/\/os/);
  await page.goto("/os/workspace/" + f.room);
  await page.getByRole("tab", { name: "Knowledge", exact: true }).click();
  await page
    .getByLabel("Indexed shared file", { exact: true })
    .selectOption(f.version);
  await page
    .getByRole("button", { name: "Attach shared file", exact: true })
    .click();
  const fileRegion = page.getByRole("region", { name: "Room file evidence" });
  await expect(
    fileRegion.getByRole("link", { name: f.filename + " · v1", exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Search room files", { exact: true })
    .fill("zzzzmissingfilequery");
  await page
    .getByRole("button", { name: "Search room files", exact: true })
    .click();
  await expect(
    fileRegion.getByRole("status").filter({ hasText: "0 matching excerpts" }),
  ).toBeVisible();
  await page.getByLabel("Search room files", { exact: true }).fill(f.marker);
  await page.getByLabel("Search room files", { exact: true }).press("Enter");
  await expect(fileRegion.getByRole("checkbox")).toHaveCount(1);
  await fileRegion.getByRole("checkbox").check();
  await page.getByLabel("Skill name", { exact: true }).fill(skillName);
  await page
    .getByLabel("Skill instructions", { exact: true })
    .fill("State evidence gaps and propose one reviewed next step.");
  await page
    .getByRole("button", { name: "Propose skill version", exact: true })
    .click();
  const skill = page
    .getByRole("region", { name: "Room instruction skills" })
    .locator("article")
    .filter({
      has: page.getByRole("heading", {
        name: skillName + " · v1",
        exact: true,
      }),
    });
  await expect(skill.getByText("DRAFT", { exact: true })).toBeVisible();
  await skill
    .getByRole("button", { name: `Review ${skillName} v1`, exact: true })
    .click();
  await expect(skill.getByText("APPROVED", { exact: true })).toBeVisible();
  await skill
    .getByLabel(`Agent for ${skillName} v1`, { exact: true })
    .selectOption(f.agent);
  await skill
    .getByRole("button", {
      name: `Set agent use of ${skillName} v1`,
      exact: true,
    })
    .click();
  await expect(
    skill.getByText("Attached to: " + f.agentName, { exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Conversation", exact: true }).click();
  await expect(page.getByText(/Selected file excerpts: 1/)).toBeVisible();
  await page.getByRole("button", { name: "Ask agent", exact: true }).click();
  await expect(page.locator(".team-agent-output")).toContainText(f.marker);
  await expect(page.locator(".team-agent-output")).toContainText(
    skillName + " v1",
  );
  const download = await page.request.get(
    `/api/team-space/${f.room}/files/${f.version}`,
  );
  expect(download.status()).toBe(200);
  expect(await download.text()).toContain(f.marker);
  for (let n = 0; n < 101; n++)
    await knowledgeOk(`/${f.room}/messages`, f.cookie, {
      request_id: crypto.randomUUID(),
      body: "Newer message " + n,
    });
  await page.reload();
  await expect(page.locator(".team-agent-output")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Load earlier messages", exact: true })
    .click();
  await expect(page.locator(".team-agent-output")).toContainText(f.marker);
  await expect(
    page.getByRole("link", {
      name: `Evidence: ${f.filename} · v1`,
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Knowledge", exact: true }).click();
  await skill
    .getByRole("button", { name: `Review ${skillName} v1`, exact: true })
    .click();
  await expect(skill.getByText("REVOKED", { exact: true })).toBeVisible();
  await skill
    .getByRole("button", {
      name: `Set agent use of ${skillName} v1`,
      exact: true,
    })
    .click();
  await expect(
    skill.getByText("Attached to: No agents", { exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Conversation", exact: true }).click();
  await expect(page.locator(".team-agent-output")).toHaveCount(0);
  await page.getByRole("tab", { name: "Knowledge", exact: true }).click();
  // Hold delivery rather than assuming a click means the mutation committed.
  // This exercises the truthful pending state without an arbitrary sleep.
  let releaseDetach!: () => void;
  const detachGate = new Promise<void>((resolve) => {
    releaseDetach = resolve;
  });
  const endpoint = `/api/team-space/${f.room}/files`;
  await page.route(`**${endpoint}`, async (route) => {
    if (
      route.request().method() === "POST" &&
      route.request().postDataJSON().active === false
    )
      await detachGate;
    await route.continue();
  });
  const acknowledged = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === endpoint &&
      response.request().method() === "POST" &&
      response.request().postDataJSON().active === false,
  );
  void acknowledged.catch(() => undefined);
  const refreshed = workspaceRefreshAfter(
    page,
    testOrigin,
    f.room,
    acknowledged,
  );
  const detachStart = Date.now();
  try {
    await page
      .getByRole("button", { name: `Detach ${f.filename}`, exact: true })
      .click();
    await expect(
      fileRegion.getByRole("button", { name: "Working…", exact: true }),
    ).toBeVisible();
    await expect(
      fileRegion.getByRole("link", { name: f.filename + " · v1", exact: true }),
    ).toBeVisible();
    expect(
      (
        await page.request.get(`/api/team-space/${f.room}/files/${f.version}`)
      ).status(),
    ).toBe(200);
    releaseDetach();
    const response = await acknowledged;
    expect(response.status()).toBe(201);
    expect(await response.json()).toEqual({ saved: true });
  } finally {
    releaseDetach();
    console.log(
      `[${test.info().project.name}] Confirm file detach response: ${Date.now() - detachStart}ms`,
    );
  }
  const rendered = await refreshed;
  expect(rendered.status()).toBe(200);
  await expect(
    fileRegion.getByText("No eligible files attached.", { exact: true }),
  ).toBeVisible();
  expect(
    (
      await page.request.get(`/api/team-space/${f.room}/files/${f.version}`)
    ).status(),
  ).toBe(404);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
});
