import { test, expect } from "@playwright/test";
import { knowledgeFixture, knowledgeOk } from "../support/team-knowledge";
import { workspaceRefreshAfter } from "../support/workspace-refresh";
import { testOrigin } from "../support/runtime";

test("detach assertion waits for the post-commit server render without widening its UI timeout", async ({
  page,
}) => {
  test.setTimeout(60000);
  const f = await knowledgeFixture();
  await page.goto("/login");
  await page.getByText("Local fixture identities", { exact: true }).click();
  await page.getByLabel("Synthetic identity").selectOption("partner");
  await page.getByRole("button", { name: "Use fixture", exact: true }).click();
  await expect(page).toHaveURL(/\/os/);
  const workspace = `/os/workspace/${f.room}`;
  await page.goto(workspace + "?view=knowledge");
  const region = page.getByRole("region", { name: "Room file evidence" });
  const link = region.getByRole("link", {
    name: f.filename + " · v1",
    exact: true,
  });
  const empty = region.getByText("No eligible files attached.", {
    exact: true,
  });
  await expect(link).toBeVisible();
  let committed = false;
  let release!: () => void, held!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  const refreshHeld = new Promise<void>((r) => {
    held = r;
  });
  await page.route(`**${workspace}**`, async (route) => {
    if (
      route.request().method() !== "GET" ||
      route.request().headers()["rsc"] !== "1" ||
      !committed
    ) {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    held();
    await gate;
    await route.fulfill({ response });
  });
  await page.route(`**/api/team-space/${f.room}/files`, async (route) => {
    if (
      route.request().method() !== "POST" ||
      route.request().postDataJSON().active !== false
    ) {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    expect(response.status()).toBe(201);
    expect(await response.json()).toEqual({ saved: true });
    committed = true;
    await route.fulfill({ response });
  });
  const acknowledged = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === `/api/team-space/${f.room}/files` &&
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
  let renderObserved = false;
  void refreshed.then(
    () => {
      renderObserved = true;
    },
    () => undefined,
  );
  try {
    await region
      .getByRole("button", { name: `Detach ${f.filename}`, exact: true })
      .click();
    await refreshHeld;
    const canonical = await knowledgeOk(`/${f.room}/knowledge`, f.cookie);
    expect(
      canonical.files.find(
        (file: { file_version_id: string }) =>
          file.file_version_id === f.version,
      ).active,
    ).toBe(false);
    expect(
      (
        await page.request.get(`/api/team-space/${f.room}/files/${f.version}`)
      ).status(),
    ).toBe(404);
    // Controlled network latency deliberately exceeds the unchanged 5s UI
    // assertion. This is injected transport delay, not an application sleep.
    await new Promise((resolve) => setTimeout(resolve, 6100));
    expect(renderObserved).toBe(false);
    await expect(empty).toHaveCount(0);
    await expect(link).toBeVisible();
    release();
    const rendered = await refreshed;
    expect(rendered.status()).toBe(200);
    await expect(empty).toBeVisible();
    await expect(link).toHaveCount(0);
    console.log(
      "SYNTHETIC_REFRESH_DIAGNOSTIC " +
        JSON.stringify({
          committed: true,
          canonicalInactive: true,
          accessRevoked: true,
          refreshNotMistakenForAcknowledgement: true,
          originalFiveSecondAssertionPassesAfterRefresh: true,
        }),
    );
  } finally {
    release();
  }
});
