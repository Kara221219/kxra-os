import { expect, test, type Page } from "@playwright/test";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import pg from "pg";
import { runtimeFile } from "../support/runtime";

const database = JSON.parse(
  fs.readFileSync(runtimeFile("database.json"), "utf8"),
);
const admin = new pg.Pool({ ...database, user: os.userInfo().username });
const kxraOrg = "10000000-0000-4000-8000-000000000001";
const partnerId = "20000000-0000-4000-8000-000000000002";

test.afterAll(async () => admin.end());

async function startFixtureLogin(page: Page, fixture: string) {
  await page.goto("/login");
  await page.getByText("Local fixture identities", { exact: true }).click();
  await page.getByLabel("Synthetic identity").selectOption(fixture);
  await page.getByRole("button", { name: "Use fixture" }).click();
}

test("AT-31/32 browser tenant selection and exact legal gate fail closed", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "One authoritative browser journey",
  );
  test.setTimeout(90_000);

  const suffix = crypto.randomUUID().slice(0, 8);
  const organisationId = crypto.randomUUID();
  const projectId = crypto.randomUUID();
  const organisationName = `Browser Customer ${suffix}`;
  const documentId = crypto.randomUUID();
  const documentVersion = crypto.randomInt(10_000, 2_000_000_000);
  const requirementId = crypto.randomUUID();
  const title = `Synthetic browser NDA ${suffix}`;
  const content =
    "Synthetic browser NDA content. This fixture is not production legal text.";
  const wording = "I accept this exact synthetic browser NDA version.";
  const contentHash = crypto.createHash("sha256").update(content).digest("hex");
  const wordingHash = crypto.createHash("sha256").update(wording).digest("hex");

  await admin.query(
    "insert into kxra.organisations(id,name,slug) values($1,$2,$3)",
    [organisationId, organisationName, `browser-customer-${suffix}`],
  );
  await admin.query(
    `insert into kxra.organisation_memberships(
      org_id,account_id,security_role,relationship_type,state,display_name,grant_source
     ) values($1,$2,'ORG_ADMIN','CUSTOMER','ACTIVE','Browser dual member','AT_E2E')`,
    [organisationId, partnerId],
  );
  await admin.query(
    `insert into kxra.projects(id,org_id,code,name,stage,status,next_action)
     values($1,$2,$3,$4,'customer','active','Verify browser tenant boundary')`,
    [
      projectId,
      organisationId,
      `BROWSER-${suffix}`,
      `Customer project ${suffix}`,
    ],
  );

  try {
    await startFixtureLogin(page, "partner");
    await expect(page).toHaveURL(/\/select-organisation$/);
    await expect(
      page.getByRole("heading", { name: "Select your organisation" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: `${organisationName} · ORG_ADMIN`,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /KXRA Group · ORG_MEMBER/ }),
    ).toBeVisible();

    await page
      .getByRole("button", { name: `${organisationName} · ORG_ADMIN` })
      .click();
    await expect(page).toHaveURL(/\/os$/);
    await expect(
      page.getByRole("heading", { name: "Your project workspace" }),
    ).toBeVisible();
    await expect(
      page.getByText(`BROWSER-${suffix}`, { exact: true }).first(),
    ).toBeVisible();
    await expect(page.getByText("PROJECT-002", { exact: true })).toHaveCount(0);

    const ignoredHeader = await page.evaluate(async (otherOrg) => {
      const response = await fetch("/api/projects", {
        headers: { "x-kxra-organisation": otherOrg },
      });
      return { status: response.status, body: await response.json() };
    }, kxraOrg);
    expect(ignoredHeader.status).toBe(200);
    expect(ignoredHeader.body.map((row: { id: string }) => row.id)).toEqual([
      projectId,
    ]);

    const forgedSelection = await page.evaluate(async (organisationId) => {
      const response = await fetch("/api/context", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ organisation_id: organisationId }),
      });
      return { status: response.status, body: await response.json() };
    }, crypto.randomUUID());
    expect(forgedSelection).toEqual({
      status: 403,
      body: {
        error: "Organisation access unavailable",
        code: "TENANT_ACCESS_DENIED",
      },
    });

    await page.goto("/select-organisation");
    await page.getByRole("button", { name: /KXRA Group · ORG_MEMBER/ }).click();
    await expect(page).toHaveURL(/\/os$/);
    await expect(
      page.getByText("PROJECT-002", { exact: true }).first(),
    ).toBeVisible();
    await expect(
      page.getByText(`BROWSER-${suffix}`, { exact: true }),
    ).toHaveCount(0);
    await page.goto(`/os/projects/${projectId}`);
    await expect(
      page.getByRole("heading", { name: "Not available" }),
    ).toBeVisible();

    const membership = (
      await admin.query<{ id: string }>(
        `select id from kxra.organisation_memberships
         where org_id=$1 and account_id=$2 and state='ACTIVE'`,
        [kxraOrg, partnerId],
      )
    ).rows[0];
    await admin.query(
      `insert into kxra.legal_documents(
        id,org_id,document_type,audience,version,title,rendered_content,
        content_sha256,immutable_object_key,status,effective_at,legal_reviewer_reference
       ) values($1,$2,'NDA','PARTNER',$3,$4,$5,$6,$7,
        'APPROVED',now(),'SYNTHETIC_E2E_REVIEWER_NOT_COUNSEL')`,
      [
        documentId,
        kxraOrg,
        documentVersion,
        title,
        content,
        contentHash,
        `synthetic://legal/${documentId}/${documentVersion}`,
      ],
    );
    await admin.query(
      `insert into kxra.legal_document_requirements(
        id,org_id,membership_id,relationship_type,document_id,document_version,
        document_sha256,mandatory,state,acceptance_wording,
        acceptance_wording_version,acceptance_wording_sha256,effective_at
       ) values($1,$2,$3,'PARTNER',$4,$5,$6,true,'ACTIVE',$7,1,$8,now())`,
      [
        requirementId,
        kxraOrg,
        membership.id,
        documentId,
        documentVersion,
        contentHash,
        wording,
        wordingHash,
      ],
    );

    await page.goto("/os");
    await expect(page).toHaveURL(/\/agreements$/);
    await expect(
      page.getByRole("heading", { name: "Review required agreements" }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    await expect(page.getByText(content, { exact: true })).toBeVisible();
    await expect(page.getByText(wording, { exact: true })).toBeVisible();
    await expect(page.getByText(contentHash, { exact: false })).toBeVisible();

    const blocked = await page.evaluate(async () => {
      const response = await fetch("/api/projects");
      return { status: response.status, body: await response.json() };
    });
    expect(blocked).toEqual({
      status: 428,
      body: { error: "Agreement required", code: "AGREEMENT_REQUIRED" },
    });

    await page.getByRole("button", { name: "Accept exact version" }).click();
    await expect(page).toHaveURL(/\/os$/);
    await expect(
      page.getByRole("heading", { name: "Your project workspace" }),
    ).toBeVisible();
    const evidence = (
      await admin.query<{
        document_version: number;
        document_sha256: string;
        response: string;
        immutable_audit: { rendered_content: string };
      }>(
        `select document_version,document_sha256,response,immutable_audit
         from kxra.legal_acceptances
         where account_id=$1 and requirement_id=$2`,
        [partnerId, requirementId],
      )
    ).rows[0];
    expect(evidence).toMatchObject({
      document_version: documentVersion,
      document_sha256: contentHash,
      response: "ACCEPTED",
      immutable_audit: { rendered_content: content },
    });
  } finally {
    await admin.query(
      `update kxra.legal_document_requirements
       set state='RETIRED',retired_at=coalesce(retired_at,now()) where id=$1`,
      [requirementId],
    );
    await admin.query(
      `update kxra.legal_documents
       set status='RETIRED',retired_at=coalesce(retired_at,now())
       where id=$1 and version=$2`,
      [documentId, documentVersion],
    );
    await admin.query(
      `update kxra.organisation_memberships
       set state='REVOKED',revoked_at=coalesce(revoked_at,now()),version=version+1
       where org_id=$1 and account_id=$2`,
      [organisationId, partnerId],
    );
  }
});
