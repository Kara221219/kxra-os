import { test, expect } from "@playwright/test";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import pg from "pg";
import { localModeConfiguration } from "../../packages/authz/local-guard";
import { runtimeFile, testOrigin } from "../support/runtime";
import { retireFirstUseMembership } from "../support/first-use-fixture";
import {
  knowledgeLogin,
  knowledgeOk,
  knowledgeProject,
} from "../support/team-knowledge";

test("public workspace entry is honest when registration is unavailable", async ({
  page,
}, info) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Bring your work together." }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Sign in →", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Create a customer workspace" }),
  ).toHaveCount(0);
  await expect(
    page.getByText(/Self-service registration is currently unavailable/),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("workspace-entry.png"),
    fullPage: true,
  });
  await page.getByRole("link", { name: "Sign in →", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goBack();
  await expect(
    page.getByRole("heading", { name: "Bring your work together." }),
  ).toBeVisible();
});

test("selected customer and client memberships enter real workspace without inventing writable access", async ({
  page,
}, info) => {
  test.setTimeout(180000);
  expect(localModeConfiguration(process.env)).toBeTruthy();
  expect(new URL(testOrigin).hostname).toBe("127.0.0.1");
  const cfg = JSON.parse(fs.readFileSync(runtimeFile("database.json"), "utf8"));
  expect(cfg.user).toBe("kxra_app");
  expect(cfg.host).toBe(runtimeFile("socket"));
  const db = new pg.Client({ ...cfg, user: os.userInfo().username });
  const org = crypto.randomUUID(),
    viewer = "20000000-0000-4000-8000-000000000003";
  const name = `First-use synthetic ${org}`;
  let membership: string | undefined;
  let returnedToPartner = false;
  await db.connect();
  const originalOrg = "10000000-0000-4000-8000-000000000001";
  let originalMembership: unknown;
  try {
    originalMembership = (
      await db.query(
        "select * from kxra.organisation_memberships where org_id=$1 and account_id=$2",
        [originalOrg, viewer],
      )
    ).rows;
    await db.query(
      "insert into kxra.organisations(id,name,slug,organisation_kind,relationship_type) values($1,$2,$3,'CUSTOMER','CUSTOMER')",
      [org, name, `first-use-${org}`],
    );
    membership = (
      await db.query(
        "insert into kxra.organisation_memberships(org_id,account_id,security_role,relationship_type,state,display_name,grant_source) values($1,$2,'ORG_MEMBER','CUSTOMER','ACTIVE','Synthetic first-use member','FIRST_USE_LOCAL_TEST') returning id",
        [org, viewer],
      )
    ).rows[0].id;
    await page.goto("/login");
    await page.getByText("Local fixture identities", { exact: true }).click();
    await page.getByLabel("Synthetic identity").selectOption("viewer");
    await page
      .getByRole("button", { name: "Use fixture", exact: true })
      .click();
    await expect(page).toHaveURL(/\/select-organisation$/);
    // Onboarding must recover ambiguous selected-tenant context, even for an active identity.
    await page.goto("/onboarding");
    await expect(page).toHaveURL(/\/select-organisation$/);
    await page
      .getByRole("button", { name: `${name} · ORG_MEMBER`, exact: true })
      .click();
    await expect(page).toHaveURL(/\/os\/workspace$/);
    const creatorCookie = await knowledgeLogin("partner");
    const privateMarker = `Private first-use room ${crypto.randomUUID()}`;
    const privateRoom = await knowledgeOk("", creatorCookie, {
      project_id: knowledgeProject,
      name: privateMarker,
      guidelines: "Separate private membership boundary",
      access: "PRIVATE",
    });
    const creatorView = await knowledgeOk(`/${privateRoom.id}`, creatorCookie);
    expect(creatorView.room.name).toBe(privateMarker);
    for (const relationship of ["CUSTOMER", "CLIENT"]) {
      for (const role of ["ORG_ADMIN", "ORG_MEMBER"]) {
        await db.query(
          "update kxra.organisation_memberships set security_role=$2,relationship_type=$3 where id=$1",
          [membership, role, relationship],
        );
        await page.goto("/os?tour=1");
        await expect(page).toHaveURL(/\/os\/workspace\?tour=1$/);
        await expect(
          page.getByRole("heading", {
            name: "Your team workspace",
            exact: true,
          }),
        ).toBeVisible();
        await expect(
          page.getByRole("heading", {
            name: "Room creation needs project access",
            exact: true,
          }),
        ).toBeVisible();
        await expect(
          page.getByRole("button", { name: "Create room", exact: true }),
        ).toHaveCount(0);
        await expect(
          page.getByRole("link", { name: "＋ Create a room", exact: true }),
        ).toHaveCount(0);
        await expect(
          page.getByText("Create your first room to start.", { exact: true }),
        ).toHaveCount(0);
        await expect(
          page.getByRole("link", { name: "WhatsApp Connection", exact: true }),
        ).toHaveCount(0);
        await expect(page.locator('a[href="/billing"]')).toHaveCount(0);
        await expect(page.locator('a[href="/os/connections"]')).toHaveCount(0);
        await expect(page.locator(".owner-metric")).toHaveCount(0);
        expect(
          (
            await page.request.get(`/api/team-space/${privateRoom.id}`)
          ).status(),
        ).toBe(404);
        const deniedPage = await page.request.get(
          `/os/workspace/${privateRoom.id}`,
        );
        const deniedHtml = await deniedPage.text();
        expect(deniedHtml).toContain("Not available");
        expect(deniedHtml).not.toContain(privateMarker);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
      }
    }
    await page.screenshot({
      path: info.outputPath("read-only-client-workspace.png"),
      fullPage: true,
    });
    await page
      .getByRole("link", { name: "Check workspace access", exact: true })
      .click();
    await expect(page).toHaveURL(/\/os\/start$/);
    await expect(
      page.getByRole("heading", { name: "Getting started", exact: true }),
    ).toBeVisible();
    await page.goBack();
    await expect(
      page.getByRole("heading", { name: "Room creation needs project access" }),
    ).toBeVisible();
    await page
      .getByRole("link", { name: "Support & privacy", exact: true })
      .click();
    await expect(page).toHaveURL(/\/os\/support$/);
    await page.goBack();
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Room creation needs project access" }),
    ).toBeVisible();
    await page.goto("/os/enquiries");
    await expect(
      page.getByRole("heading", { name: "Not available", exact: true }),
    ).toBeVisible();
    expect((await page.request.get("/os/customer-directory")).status()).toBe(
      404,
    );
    expect(
      (
        await page.request.post("/api/team-space", {
          headers: { origin: testOrigin },
          data: {
            name: "Denied",
            project_id: "30000000-0000-4000-8000-000000000002",
            guidelines: "",
            access: "PROJECT",
          },
        })
      ).status(),
    ).toBe(403);
    // Returning to the original PARTNER membership must restore its own presentation.
    const selected = await page.request.post("/api/context", {
      headers: { origin: testOrigin },
      data: { organisation_id: "10000000-0000-4000-8000-000000000001" },
    });
    expect(selected.status()).toBe(200);
    await page.goto("/os");
    await expect(page).toHaveURL(/\/os$/);
    await expect(
      page.getByRole("heading", {
        name: "Your project workspace",
        exact: true,
      }),
    ).toBeVisible();
    returnedToPartner = true;
  } finally {
    try {
      if (membership) {
        const scope = { membership, organisation: org, account: viewer };
        const events = async () =>
          (
            await db.query(
              "select * from kxra.active_context_events where membership_id=$1 order by id",
              [membership],
            )
          ).rows;
        const priorEvents = await events();
        await retireFirstUseMembership(
          (sql, values) => db.query(sql, values),
          scope,
        );
        const retired = (
          await db.query(
            "select * from kxra.organisation_memberships where id=$1",
            [membership],
          )
        ).rows[0];
        expect(retired.state).toBe("REVOKED");
        expect(retired.revoked_at).not.toBeNull();
        // A repeated cleanup keeps version, timestamps and selection history intact.
        await retireFirstUseMembership(
          (sql, values) => db.query(sql, values),
          scope,
        );
        expect(
          (
            await db.query(
              "select * from kxra.organisation_memberships where id=$1",
              [membership],
            )
          ).rows[0],
        ).toEqual(retired);
        expect(await events()).toEqual(priorEvents);
        expect(
          (
            await db.query(
              "select * from kxra.organisation_memberships where org_id=$1 and account_id=$2",
              [originalOrg, viewer],
            )
          ).rows,
        ).toEqual(originalMembership);
        if (returnedToPartner) {
          expect(priorEvents.length).toBeGreaterThan(0);
          const contexts = await page.request.get("/api/context");
          expect(contexts.status()).toBe(200);
          const available = (await contexts.json()).organisations;
          expect(
            available.some((item: { org_id: string }) => item.org_id === org),
          ).toBe(false);
          expect(
            available.some(
              (item: { org_id: string }) => item.org_id === originalOrg,
            ),
          ).toBe(true);
          await page.reload();
          await expect(page).toHaveURL(/\/os$/);
          await expect(
            page.getByRole("heading", {
              name: "Your project workspace",
              exact: true,
            }),
          ).toBeVisible();
        }
      }
    } finally {
      await db.end();
    }
  }
});
