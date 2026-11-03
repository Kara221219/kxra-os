import { chromium, expect } from "@playwright/test";
import crypto from "node:crypto";
import path from "node:path";
import fs from "node:fs";
const origin = process.env.KXRA_ORIGIN!,
  runtime = process.env.KXRA_RUNTIME!;
if (
  process.env.KXRA_AUTH_MODE !== "fixture" ||
  !origin.startsWith("http://127.0.0.1:") ||
  process.env.VERCEL
)
  throw Error("Isolated fixture UI only");
async function main() {
  const browser = await chromium.launch();
  try {
    for (const viewport of [
      { width: 1440, height: 1000 },
      { width: 390, height: 844 },
    ]) {
      const context = await browser.newContext({ baseURL: origin, viewport }),
        page = await context.newPage();
      await page.goto("/login");
      await page.getByText("Local fixture identities", { exact: true }).click();
      await page.getByLabel("Synthetic identity").selectOption("owner");
      await page
        .getByRole("button", { name: "Use fixture", exact: true })
        .click();
      await page.waitForURL(/\/os/);
      const post = async (url: string, body: unknown) => {
        const r = await context.request.post(url, {
          headers: { origin },
          data: body,
        });
        expect(r.status(), await r.text()).toBe(201);
        return r.json();
      };
      const room = (
        await post("/api/team-space", {
          project_id: "30000000-0000-4000-8000-000000000002",
          name: "Paired UI " + viewport.width,
          guidelines: "Synthetic only",
          access: "PRIVATE",
        })
      ).id;
      await post(`/api/team-space/${room}/messages`, {
        request_id: crypto.randomUUID(),
        body: "Synthetic evidence for a bounded checklist.",
      });
      await page.goto("/os/workspace/" + room);
      await page.getByRole("tab", { name: "Bridge", exact: true }).click();
      const region = page.getByRole("region", {
        name: "Synthetic paired agents",
      });
      await expect(region).toBeVisible();
      await region
        .getByLabel("Private synthetic agent name", { exact: true })
        .fill("Private acceptance agent");
      await region
        .getByRole("button", {
          name: "Create private synthetic agent",
          exact: true,
        })
        .click();
      await expect(
        region.getByRole("button", {
          name: "Request single-use fixture pairing",
          exact: true,
        }),
      ).toBeVisible();
      await region
        .getByRole("button", {
          name: "Request single-use fixture pairing",
          exact: true,
        })
        .click();
      await expect(region.getByLabel("Fixture pairing invitation")).toHaveValue(
        /^[a-f0-9]{64}$/,
      );
      await region
        .getByRole("button", {
          name: "Redeem on synthetic device",
          exact: true,
        })
        .click();
      await expect(region).toContainText("Synthetic device paired.");
      await region
        .getByLabel("Paired draft objective", { exact: true })
        .fill("Write a synthetic checklist");
      await region
        .getByRole("button", { name: "Propose paired text task", exact: true })
        .click();
      await expect(region.getByRole("article")).toContainText("PROPOSED");
      await region
        .getByRole("button", { name: "Inspect exact paired task", exact: true })
        .click();
      await expect(region).toContainText(
        "Synthetic evidence for a bounded checklist.",
      );
      await region
        .getByRole("button", { name: "Approve exact paired task", exact: true })
        .click();
      await expect(region.getByRole("article")).toContainText("APPROVED");
      await region
        .getByRole("button", {
          name: "Run one synthetic paired draft",
          exact: true,
        })
        .click();
      await expect(region.getByRole("article")).toContainText("DONE");
      await expect(region).toContainText("PAIRED_SYNTHETIC_DRAFT");
      await region
        .getByRole("button", { name: "Revoke paired device", exact: true })
        .click();
      await expect(region).toContainText(
        "Further polling and late results are rejected.",
      );
      await page.screenshot({
        path: path.join(runtime, `paired-ui-${viewport.width}.png`),
        fullPage: true,
      });
      await page
        .getByRole("tab", { name: "Conversation", exact: true })
        .click();
      await expect(
        page.getByText("[PAIRED SYNTHETIC DRAFT · review required]", {
          exact: false,
        }),
      ).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      ).toBe(true);
      await context.close();
      console.log(`Paired UI ${viewport.width}px PASS`);
    }
    fs.writeFileSync(
      path.join(runtime, "paired-ui-result.json"),
      JSON.stringify({
        passed: true,
        widths: [1440, 390],
        providerCalls: false,
      }),
    );
  } finally {
    await browser.close();
  }
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
