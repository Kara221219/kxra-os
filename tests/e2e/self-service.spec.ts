import { test, expect, type Page } from "@playwright/test";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import pg from "pg";
import { runtimeFile, testOrigin } from "../support/runtime";
const password = "SyntheticSignupPass123";
function verification(email: string) {
  const messages = JSON.parse(
    fs.readFileSync(runtimeFile("fake-email.json"), "utf8"),
  ).messages;
  const message = [...messages]
    .reverse()
    .find(
      (m: { recipient: string; state: string }) =>
        m.recipient === email && m.state === "SENT",
    );
  return message?.text.match(/Continue securely: (https?:\/\/\S+)/)?.[1];
}
async function api(page: Page, data: unknown) {
  return page.request.post("/api/signup", {
    headers: { origin: testOrigin },
    data,
  });
}
async function completeOnboarding(page: Page) {
  const steps = [
    { acknowledged: true },
    {
      first_name: "Synthetic",
      last_name: "Customer",
      job_title: "Tester",
      company: "Local acceptance",
      phone: "",
    },
    { security_acknowledged: true },
    { access_acknowledged: true },
    { working_acknowledged: true },
    { whatsapp_choice: "SKIP" },
    {
      timezone: "Europe/London",
      email_notifications: false,
      whatsapp_notifications: false,
      display_density: "comfortable",
    },
    { agreement_ids: [], agreements_reviewed: true },
    { complete: true },
  ];
  for (let i = 0; i < steps.length; i++) {
    const r = await page.request.post("/api/onboarding/step", {
      headers: { origin: testOrigin },
      data: { step: i + 1, data: steps[i] },
    });
    expect(r.status(), `step ${i + 1}: ${await r.text()}`).toBe(200);
  }
}
test("self-service verifies before provisioning, recovers one tenant and gates persistent work on recorded entitlement", async ({
  page,
  browser,
}) => {
  test.setTimeout(90000);
  const email = `self-${crypto.randomUUID()}@example.test`,
    name = "Synthetic customer " + crypto.randomUUID();
  const cfg = JSON.parse(fs.readFileSync(runtimeFile("database.json"), "utf8"));
  const db = new pg.Client({ ...cfg, user: os.userInfo().username });
  await db.connect();
  try {
    await page.goto("/signup");
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByLabel("Confirm password", { exact: true }).fill(password);
    await page
      .getByRole("button", { name: "Create local account", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Verify your email", exact: true }),
    ).toBeVisible();
    const requestId = crypto.randomUUID();
    expect(
      (
        await api(page, {
          action: "provision",
          request_id: requestId,
          workspace_name: name,
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await db.query(
          "select count(*)::int n from kxra.organisations where name=$1",
          [name],
        )
      ).rows[0].n,
    ).toBe(0);
    await expect.poll(() => verification(email)).toBeTruthy();
    await page.goto(verification(email));
    await expect(
      page.getByRole("heading", { name: "Verified account", exact: true }),
    ).toBeVisible();
    const raw = {
      action: "provision",
      request_id: requestId,
      workspace_name: name,
    };
    expect((await api(page, { ...raw, role: "KXRA_OWNER" })).status()).toBe(
      400,
    );
    // Simulate duplicate delivery and lost acknowledgement, then recover via the UI.
    const results = await Promise.all([
      api(page, raw),
      api(page, raw),
      api(page, raw),
    ]);
    for (const r of results) expect(r.status()).toBe(201);
    const receipt = await results[0].json();
    for (const r of results.slice(1)) expect(await r.json()).toEqual(receipt);
    await page.reload();
    await page.getByLabel("Workspace name").fill(name);
    await page
      .getByRole("button", { name: "Create or recover workspace", exact: true })
      .click();
    await expect(page).toHaveURL(/\/onboarding/);
    expect(
      (
        await db.query(
          "select count(*)::int n from kxra.organisations where name=$1",
          [name],
        )
      ).rows[0].n,
    ).toBe(1);
    expect(
      (
        await db.query(
          "select security_role from kxra.organisation_memberships where org_id=$1",
          [receipt.organisation_id],
        )
      ).rows[0].security_role,
    ).toBe("ORG_ADMIN");
    expect((await page.request.get("/api/team-space/start")).status()).toBe(
      428,
    );
    await page.reload();
    await completeOnboarding(page);
    await page.goto("/os/start");
    await expect(
      page.getByRole("heading", {
        name: "Awaiting accepted subscription",
        exact: true,
      }),
    ).toBeVisible();
    const room = {
      project_id: receipt.project_id,
      name: "First customer room",
      guidelines: "Local persistence",
      access: "PRIVATE",
    };
    expect(
      (
        await page.request.post("/api/team-space", {
          headers: { origin: testOrigin },
          data: room,
        })
      ).status(),
    ).toBe(409);
    expect(
      (
        await page.request.post("/api/team-space/pilot/billing/checkout", {
          headers: { origin: testOrigin },
          data: { request_id: crypto.randomUUID() },
        })
      ).status(),
    ).toBe(503);
    // Seed an explicitly synthetic lifecycle record in this disposable DB. This is
    // not a payment/provider success and cannot be done by the customer endpoint.
    await db.query(
      "insert into kxra.workspace_pilots(org_id,state,period_start,period_end) values($1,'ACTIVE',now(),now()+interval '1 month')",
      [receipt.organisation_id],
    );
    const created = await page.request.post("/api/team-space", {
      headers: { origin: testOrigin },
      data: room,
    });
    expect(created.status()).toBe(201);
    const actual = await created.json();
    await page.goto("/os/workspace/" + actual.id);
    await page
      .getByLabel("Message", { exact: true })
      .fill("Actual local customer work");
    await page
      .getByRole("button", { name: "Send message", exact: true })
      .click();
    await expect(
      page
        .locator(".team-message p.team-text")
        .filter({ hasText: "Actual local customer work" }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page
        .locator(".team-message p.team-text")
        .filter({ hasText: "Actual local customer work" }),
    ).toBeVisible();
    const other = await browser.newContext({ baseURL: testOrigin });
    try {
      const p = await other.newPage();
      await p.goto("/login");
      await p.getByText("Local fixture identities", { exact: true }).click();
      await p.getByLabel("Synthetic identity").selectOption("owner");
      await p.getByRole("button", { name: "Use fixture", exact: true }).click();
      await expect(p).toHaveURL(/\/os/);
      expect(
        (await p.request.get("/api/team-space/" + actual.id)).status(),
      ).toBe(404);
      expect(
        (
          await p.request.post("/api/context", {
            headers: { origin: testOrigin },
            data: { organisation_id: receipt.organisation_id },
          })
        ).status(),
      ).toBe(403);
    } finally {
      await other.close();
    }
    await page.context().clearCookies();
    await page.goto("/login");
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in →", exact: true }).click();
    await expect(page).toHaveURL(/\/os/);
    await page.goto("/signup");
    await page.getByLabel("Workspace name").fill(name);
    await page
      .getByRole("button", { name: "Create or recover workspace", exact: true })
      .click();
    await expect(page).toHaveURL(/\/os/);
    await page.goto("/os/workspace/" + actual.id);
    await expect(
      page
        .locator(".team-message p.team-text")
        .filter({ hasText: "Actual local customer work" }),
    ).toBeVisible();
    expect(
      (
        await api(page, {
          action: "provision",
          request_id: crypto.randomUUID(),
          workspace_name: "Unapproved second workspace",
        })
      ).status(),
    ).toBe(409);
  } finally {
    await db.end();
  }
});
