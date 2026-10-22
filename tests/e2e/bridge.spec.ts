import { test, expect } from "@playwright/test";
import crypto from "node:crypto";
import {
  knowledgeLogin,
  knowledgeOk as ok,
  knowledgeProject,
} from "../support/team-knowledge";
test("manual bridge reviews exact context, recovers one lost receipt, persists a reviewed draft and stays unpaired", async ({
  page,
}) => {
  test.setTimeout(120000);
  const cookie = await knowledgeLogin("partner"),
    body = "Synthetic bridge browser context " + crypto.randomUUID(),
    objective = "Browser handoff " + crypto.randomUUID();
  const room = (
    await ok("", cookie, {
      project_id: knowledgeProject,
      name: "Browser handoff room " + crypto.randomUUID(),
      guidelines: "Draft only",
      access: "PRIVATE",
    })
  ).id;
  await ok(`/${room}/messages`, cookie, {
    request_id: crypto.randomUUID(),
    body,
  });
  await page.goto("/login");
  await page.getByText("Local fixture identities", { exact: true }).click();
  await page.getByLabel("Synthetic identity").selectOption("partner");
  await page.getByRole("button", { name: "Use fixture", exact: true }).click();
  await expect(page).toHaveURL(/\/os/);
  await page.goto(`/os/workspace/${room}?view=bridge`);
  await expect(
    page.getByRole("tab", { name: "Bridge", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText(/No native device is paired/)).toBeVisible();
  await page.getByLabel("Draft objective", { exact: true }).fill(objective);
  await page.getByRole("checkbox", { name: body, exact: true }).check();
  await page
    .getByRole("button", { name: "Create draft handoff request", exact: true })
    .click();
  const card = page.getByRole("article", { name: objective, exact: true });
  await expect(card).toContainText("State PROPOSED", { timeout: 15000 });
  await card
    .getByRole("button", { name: "Inspect scoped request", exact: true })
    .click();
  await expect(card.locator("blockquote")).toContainText(body);
  await card
    .getByRole("button", { name: "Record handoff review", exact: true })
    .click();
  await expect(card).toContainText("State APPROVED", { timeout: 15000 });
  const path = "**/api/team-space/*/bridge/*/export";
  await page.route(path, async (r) => {
    await r.fetch();
    await r.abort("failed");
  });
  await card
    .getByRole("button", { name: "Get reviewed handoff packet", exact: true })
    .click();
  await expect(
    card.getByRole("status").filter({ hasText: /fetch/i }),
  ).toBeVisible();
  await page.unroute(path);
  await card
    .getByRole("button", { name: "Get reviewed handoff packet", exact: true })
    .click();
  await expect(card).toContainText("Original handoff receipt recovered");
  await expect(card).toContainText("Handoffs recorded 1");
  const packet = JSON.parse(
    await card
      .getByLabel("Manual handoff packet", { exact: true })
      .inputValue(),
  );
  expect(packet.packet.execution_permitted).toBe(false);
  expect(packet.packet.connection_status).toBe("UNCONNECTED");
  await card
    .getByLabel("Returned draft text", { exact: true })
    .fill("Synthetic returned draft. No provider was called.");
  await card
    .getByRole("button", { name: "Record returned draft", exact: true })
    .click();
  await expect(card).toContainText("State RESULT_PROPOSED", { timeout: 15000 });
  await expect(card).toContainText(
    "Synthetic returned draft. No provider was called.",
  );
  await card
    .getByRole("button", { name: "Record returned draft review", exact: true })
    .click();
  await expect(card).toContainText("State ACCEPTED", { timeout: 15000 });
  await page.reload();
  await expect(card).toContainText("State ACCEPTED");
  await card
    .getByRole("button", { name: "Inspect scoped request", exact: true })
    .click();
  await expect(card).toContainText(
    "Synthetic returned draft. No provider was called.",
  );
  await expect(card).toContainText("Nothing was executed or sent.");
  await page
    .getByLabel("Search handoffs", { exact: true })
    .fill("no-such-handoff");
  await expect(
    page.getByText("No matching loaded handoffs.", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Reset handoff search", exact: true })
    .click();
  await expect(card).toBeVisible();
  for (const width of [360, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 950 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      String(width),
    ).toBe(true);
  }
});
