import { sprintCustomerFixture } from "../support/sprint-customer";
import { expect, test } from "@playwright/test";
async function login(page: import("@playwright/test").Page, fixture: string) {
  await page.goto("/login");
  await page.getByText("Local fixture identities", { exact: true }).click();
  await page.getByLabel("Synthetic identity").selectOption(fixture);
  await page.getByRole("button", { name: "Use fixture" }).click();
  await expect(page).toHaveURL(/\/(os|select-organisation)$/);
}
test("owner prepares a sprint proposal while customer has no draft controls", async ({
  browser,
}, info) => {
  test.skip(
    info.project.name !== "desktop",
    "One authoritative preparation workflow",
  );
  const fixture = await sprintCustomerFixture();
  const customerContext = await browser.newContext(),
    ownerContext = await browser.newContext();
  try {
    const customer = await customerContext.newPage(),
      owner = await ownerContext.newPage();
    await login(customer, "partner");
    expect(
      (
        await customer.request.post("/api/context", {
          headers: {
            origin:
              (info.project.use.baseURL as string) || process.env.KXRA_ORIGIN!,
          },
          data: { organisation_id: fixture.org },
        })
      ).status(),
    ).toBe(200);
    await customer.goto("/os/custom-projects");
    const marker = `Synthetic sprint ${Date.now()}`;
    await customer
      .getByLabel("Starting package")
      .selectOption("improvement-sprint");
    await customer.getByLabel("Problem or need").fill(marker);
    await customer
      .getByLabel("Desired outcome")
      .fill("One process with measurable handoffs.");
    await customer
      .getByRole("button", { name: "Submit private request" })
      .click();
    const request = customer.locator("article.record").filter({
      has: customer.getByRole("heading", { name: marker, exact: true }),
    });
    await expect(request).toBeVisible();
    await expect(
      customer.getByRole("button", { name: "Prepare sprint draft" }),
    ).toHaveCount(0);
    await login(owner, "owner");
    expect(
      (
        await owner.request.post("/api/context", {
          headers: {
            origin:
              (info.project.use.baseURL as string) || process.env.KXRA_ORIGIN!,
          },
          data: { organisation_id: fixture.org },
        })
      ).status(),
    ).toBe(200);
    await owner.goto("/os/custom-projects");
    const record = owner.locator("article.record").filter({
      has: owner.getByRole("heading", { name: marker, exact: true }),
    });
    await record
      .getByLabel("Proposal starting point")
      .selectOption("decision-review");
    await record.getByRole("button", { name: "Prepare sprint draft" }).click();
    await expect(
      record.getByText(
        "Draft prepared for your review. No proposal has been issued.",
      ),
    ).toBeVisible();
    await expect(record.getByLabel("Total in minor units")).toHaveValue(
      "25000",
    );
    await expect(record.getByLabel(/^Payment gate/)).toHaveValue(
      "PAID_IN_FULL",
    );
    await expect(record.getByLabel("Scope", { exact: true })).toHaveValue(
      new RegExp(marker),
    );
    await customer.reload();
    await expect(
      customer.getByText("Proposal version 1", { exact: true }),
    ).toHaveCount(0);
  } finally {
    await customerContext.close();
    await ownerContext.close();
    await fixture.close();
  }
});
