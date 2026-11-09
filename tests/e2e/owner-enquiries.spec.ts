import { test, expect, type Page } from "@playwright/test";
import {
  enquiryFixture,
  enquiryOrg,
  enquiryOwner,
} from "../support/owner-enquiry-fixture";
async function login(page: Page) {
  await page.goto("/login");
  await page.getByText("Local fixture identities", { exact: true }).click();
  await page.getByLabel("Synthetic identity").selectOption("owner");
  await page.getByRole("button", { name: "Use fixture", exact: true }).click();
  await expect(page).toHaveURL(/\/os$/);
}
async function visibleInbox(page: Page) {
  await expect(page.locator("[data-enquiry-document]")).toHaveCSS(
    "visibility",
    "visible",
  );
}
async function noPrivate(page: Page, marker: string) {
  await expect(page.locator("[data-enquiry-document] article")).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText(marker);
}

async function documentAction(
  page: Page,
  pathname: string,
  action: () => Promise<unknown>,
) {
  const response = page.waitForResponse(
    (response) =>
      response.request().isNavigationRequest() &&
      response.request().resourceType() === "document" &&
      new URL(response.url()).pathname === pathname,
  );
  await action();
  const result = await response;
  expect(result.request().method()).toBe("GET");
  expect(result.headers()["cache-control"]).toMatch(/no-store/);
  return result;
}

test("owner finds older enquiries, keeps filters through detail/history and recovers interrupted navigation", async ({
  page,
}, info) => {
  test.setTimeout(180000);
  const f = await enquiryFixture();
  try {
    await login(page);
    await page.goto("/os/enquiries?status=SPAM&type=CONTACT");
    await visibleInbox(page);
    await documentAction(page, "/os/enquiries", () =>
      page.getByRole("link", { name: "Next page", exact: true }).click(),
    );
    await visibleInbox(page);
    await documentAction(page, "/os/enquiries", () =>
      page.getByRole("link", { name: "Next page", exact: true }).click(),
    );
    await visibleInbox(page);
    await expect(page.getByLabel("Status", { exact: true })).toHaveValue(
      "SPAM",
    );
    await expect(page.getByLabel("Submission type")).toHaveValue("CONTACT");
    const old = f.ids[60];
    await documentAction(page, "/os/enquiries", () =>
      page
        .locator("#public-enquiry-" + old)
        .getByRole("link", { name: /Open enquiry/ })
        .click(),
    );
    await expect(page).toHaveURL(
      new RegExp(
        `status=SPAM&type=CONTACT&page=3&enquiry=${old}#public-enquiry-${old}$`,
      ),
    );
    await visibleInbox(page);
    await expect(page.locator("#public-enquiry-" + old)).toContainText(
      "Synthetic private body " + old,
    );
    await page.getByRole("link", { name: "Return to filtered inbox" }).click();
    await expect(page).toHaveURL(/status=SPAM&type=CONTACT&page=3$/);
    await visibleInbox(page);
    await page.goBack();
    await visibleInbox(page);
    await expect(page.locator("#public-enquiry-" + old)).toContainText(old);
    await page.goForward();
    await visibleInbox(page);
    await page.reload();
    await visibleInbox(page);
    await page
      .getByLabel("Status", { exact: true })
      .selectOption("AWAITING_REVIEW");
    await page.getByRole("button", { name: "Apply filters" }).click();
    await visibleInbox(page);
    expect(new URL(page.url()).searchParams.has("page")).toBe(false);
    await page.goto("/os/enquiries?status=SPAM&type=CONTACT");
    await visibleInbox(page);
    await page.route(
      "**/os/enquiries?status=SPAM&type=CONTACT&page=2",
      (route) => route.abort(),
      { times: 1 },
    );
    await page
      .getByRole("link", { name: "Next page", exact: true })
      .click()
      .catch(() => {});
    await page.goBack().catch(() => {});
    if (!page.url().includes("/os/enquiries"))
      await page.goto("/os/enquiries?status=SPAM&type=CONTACT");
    await visibleInbox(page);
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: info.outputPath(`enquiry-inbox-${width}.png`),
        fullPage: true,
      });
    }
    await page.goto(`/os/enquiries?enquiry=${old}#public-enquiry-${old}`);
    await visibleInbox(page);
    await page.screenshot({
      path: info.outputPath("enquiry-detail.png"),
      fullPage: true,
    });
    await page.locator(".skip").click({ force: true });
    await visibleInbox(page);
    for (const route of [
      "/os/enquiries/extra",
      "/os/enquiries/extra/more",
      `/os/enquiries?enquiry=${f.foreignId}`,
    ]) {
      const response = await page.goto(route);
      expect(response?.status()).toBe(404);
      await noPrivate(page, f.marker);
    }
  } finally {
    await f.close();
  }
});

test("history restoration rechecks real revoked membership and changed selected tenant", async ({
  page,
  context,
}) => {
  test.setTimeout(180000);
  const f = await enquiryFixture();
  let suspended = false;
  let membership: string | undefined;
  try {
    await login(page);
    const target = `/os/enquiries?enquiry=${f.ids[0]}`;
    for (const direction of ["back", "forward"] as const) {
      await page.goto("/os");
      await page.goto(target);
      await visibleInbox(page);
      if (direction === "back") await page.goto("/os");
      else await documentAction(page, "/os", () => page.goBack());
      await f.db.query(
        "update kxra.organisation_memberships set state='SUSPENDED' where org_id=$1 and account_id=$2",
        [enquiryOrg, enquiryOwner],
      );
      suspended = true;
      await documentAction(page, "/os/enquiries", () =>
        direction === "back" ? page.goBack() : page.goForward(),
      );
      await noPrivate(page, f.marker);
      await f.db.query(
        "update kxra.organisation_memberships set state='ACTIVE' where org_id=$1 and account_id=$2",
        [enquiryOrg, enquiryOwner],
      );
      suspended = false;
    }
    membership = (
      await f.db.query(
        "insert into kxra.organisation_memberships(org_id,account_id,security_role,relationship_type,state,display_name,grant_source) values($1,$2,'ORG_MEMBER','CUSTOMER','ACTIVE','Synthetic inbox tenant','OWNER_ENQUIRY_LOCAL_TEST') returning id",
        [f.foreignOrg, enquiryOwner],
      )
    ).rows[0].id;
    const other = await context.newPage();
    for (const direction of ["back", "forward"] as const) {
      await page.goto("/os");
      await page.goto(target);
      await visibleInbox(page);
      if (direction === "back") await page.goto("/os");
      else await documentAction(page, "/os", () => page.goBack());
      await other.goto("/select-organisation");
      await other
        .getByRole("button", { name: `${f.marker} · ORG_MEMBER`, exact: true })
        .click();
      await expect(other).toHaveURL(/\/os\/workspace$/);
      await documentAction(page, "/os/enquiries", () =>
        direction === "back" ? page.goBack() : page.goForward(),
      );
      await noPrivate(page, f.marker);
      await expect(
        page.getByRole("heading", { name: "Not available" }),
      ).toBeVisible();
      await other.goto("/select-organisation");
      await other
        .getByRole("button", { name: /KXRA Group · KXRA_OWNER/ })
        .click();
    }
    await other.close();
  } finally {
    if (suspended)
      await f.db.query(
        "update kxra.organisation_memberships set state='ACTIVE' where org_id=$1 and account_id=$2",
        [enquiryOrg, enquiryOwner],
      );
    if (membership)
      await f.db.query(
        "update kxra.organisation_memberships set state='REVOKED',revoked_at=now(),version=version+1 where id=$1 and org_id=$2 and account_id=$3 and grant_source='OWNER_ENQUIRY_LOCAL_TEST'",
        [membership, f.foreignOrg, enquiryOwner],
      );
    await f.close();
  }
});

test("disabled JavaScript and failed hydration never visibly reveal private enquiry details", async ({
  page,
  browser,
}) => {
  test.setTimeout(180000);
  const f = await enquiryFixture();
  try {
    await login(page);
    const storageState = await page.context().storageState();
    for (const javaScriptEnabled of [false, true]) {
      const context = await browser.newContext({
        storageState,
        javaScriptEnabled,
      });
      try {
        if (javaScriptEnabled)
          await context.route("**/*.js*", (route) => route.abort());
        const tab = await context.newPage();
        await tab.goto(
          process.env.KXRA_ORIGIN + `/os/enquiries?enquiry=${f.ids[0]}`,
        );
        await expect(
          tab.getByText(/JavaScript may be disabled or failed to load/),
        ).toBeVisible();
        await expect(tab.locator("[data-enquiry-document]")).toHaveCSS(
          "visibility",
          "hidden",
        );
        await expect(
          tab.locator("[data-enquiry-document] article"),
        ).toBeHidden();
      } finally {
        await context.close();
      }
    }
  } finally {
    await f.close();
  }
});
