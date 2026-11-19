import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { chromium, expect } from "@playwright/test";
import { fixtureUsers, signSession } from "../../packages/authz/session";
import { runtimeFile, testOrigin } from "../support/runtime";
test("desktop and mobile restore human delegation/app history UI after database restart", async () => {
  const saved = JSON.parse(
    fs.readFileSync(runtimeFile("integration-journey.json"), "utf8"),
  );
  const browser = await chromium.launch({
    headless: true,
    chromiumSandbox: true,
  });
  try {
    for (const width of [1440, 390]) {
      const context = await browser.newContext({
        viewport: { width, height: 1000 },
      });
      await context.addCookies([
        {
          name: "kxra_local_session",
          value: signSession(
            fixtureUsers.owner,
            process.env.KXRA_LOCAL_SECRET!,
          ),
          url: testOrigin,
        },
      ]);
      const page = await context.newPage();
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await context.route("**/*", (route) =>
        new URL(route.request().url()).origin === testOrigin
          ? route.continue()
          : route.abort(),
      );
      await page.goto(testOrigin + "/os/delegations/" + saved.task);
      await expect(
        page.getByRole("heading", {
          name: "Local task delegation",
          exact: true,
        }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "Load local accounts", exact: true })
        .click();
      await expect(page.getByRole("option").first()).toContainText(
        "fixture-org/fixture-repo",
      );
      await page
        .getByRole("button", { name: "Refresh proposals", exact: true })
        .click();
      await expect(
        page.getByRole("heading", { name: "Proposed app schema", exact: true }),
      ).toBeVisible();
      await page.reload();
      await expect(
        page.getByRole("heading", { name: "Proposed app schema", exact: true }),
      ).toBeVisible();
      await page.goto(testOrigin + "/os/apps/" + saved.room + "/" + saved.app);
      await expect(
        page.getByText("Revised integrated persistent value", { exact: true }),
      ).toBeVisible();
      await page.screenshot({
        path: runtimeFile(
          "integration-debug-" +
            (process.env.KXRA_INTEGRATION_BROWSER_PHASE || "source") +
            "-" +
            width +
            ".png",
        ),
        fullPage: true,
      });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
        true,
      );
      await page.screenshot({
        path: runtimeFile(
          "integration-ui-" +
            (process.env.KXRA_INTEGRATION_BROWSER_PHASE || "source") +
            "-" +
            width +
            ".png",
        ),
        fullPage: true,
      });
      const replay = await page.request.post(
        testOrigin +
          "/api/custom-apps/" +
          saved.room +
          "/" +
          saved.app +
          "/records",
        {
          headers: { origin: testOrigin },
          data: {
            operation_id: saved.operation,
            record_id: saved.record,
            expected_app_revision: 2,
            schema_version: 1,
            expected_record_revision: 0,
            data: {
              brief: "Integrated persistent value",
              priority: "High",
              reviewed: true,
            },
          },
        },
      );
      assert.equal(replay.status(), 200, await replay.text());
      assert.deepEqual(await replay.json(), {
        record_id: saved.record,
        version: 1,
        schema_version: 1,
        operation_id: saved.operation,
      });
      await page.reload();
      await expect(
        page.getByText("Revised integrated persistent value", { exact: true }),
      ).toBeVisible();
      assert.deepEqual(errors, []);
      await context.close();
    }
  } finally {
    await browser.close();
  }
});
