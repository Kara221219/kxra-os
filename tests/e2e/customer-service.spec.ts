import { expect, test, type Page } from "@playwright/test";

async function login(page: Page, fixture: "owner" | "partner") {
  await page.goto("/login");
  await page.getByText("Local fixture identities", { exact: true }).click();
  await page.getByLabel("Synthetic identity").selectOption(fixture);
  await page.getByRole("button", { name: "Use fixture" }).click();
  await expect(page).toHaveURL(/\/os$/);
}

test("AT-46 customer and owner complete an auditable support request journey", async ({
  browser,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "One authoritative lifecycle journey",
  );
  const marker = `Synthetic support ${Date.now()}`;
  const customerContext = await browser.newContext();
  const ownerContext = await browser.newContext();
  const customer = await customerContext.newPage();
  const owner = await ownerContext.newPage();
  try {
    await login(customer, "partner");
    await customer.goto("/os/support");
    await expect(
      customer.getByRole("heading", { name: "Support & privacy" }),
    ).toBeVisible();
    await customer
      .getByLabel("Request type")
      .selectOption("DATA_RECTIFICATION");
    await customer.getByLabel("Subject").fill(marker);
    await customer
      .getByLabel("Details")
      .fill(
        "Please review this synthetic correction request through the private portal.",
      );
    await customer
      .getByRole("button", { name: "Submit private request" })
      .click();
    const submittedRequest = customer
      .locator("article.record")
      .filter({ has: customer.getByRole("heading", { name: marker }) });
    await expect(submittedRequest).toBeVisible();
    await expect(
      submittedRequest.locator("span.badge").filter({ hasText: "SUBMITTED" }),
    ).toBeVisible();

    await login(owner, "owner");
    await owner.goto("/os/support");
    const request = owner.locator("article.record").filter({ hasText: marker });
    await expect(request).toBeVisible();
    await request.getByText("Owner handling controls").click();
    await request
      .getByLabel("Acknowledge")
      .fill(
        "KXRA received this request. Identity verification is required before action.",
      );
    await request.getByRole("button", { name: "Acknowledge" }).click();
    await expect(
      request.locator("span.badge").filter({ hasText: "ACKNOWLEDGED" }),
    ).toBeVisible();

    await customer.reload();
    const customerRequest = customer
      .locator("article.record")
      .filter({ hasText: marker });
    await expect(
      customerRequest.locator("span.badge").filter({ hasText: "ACKNOWLEDGED" }),
    ).toBeVisible();
    await customerRequest.getByText(/Request history/).click();
    await expect(
      customerRequest.getByText(/Identity verification is required/),
    ).toBeVisible();
    await expect(
      customerRequest.getByText(/Private handling notes/),
    ).toHaveCount(0);
  } finally {
    await customerContext.close();
    await ownerContext.close();
  }
});
