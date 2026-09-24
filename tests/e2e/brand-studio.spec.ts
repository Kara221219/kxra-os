import { expect, test, type Page } from "@playwright/test";

async function fixtureLogin(page: Page, fixture: string) {
  await page.goto("/login");
  await page.getByText("Local fixture identities", { exact: true }).click();
  await page.getByLabel("Synthetic identity").selectOption(fixture);
  await page.getByRole("button", { name: "Use fixture" }).click();
  await expect(page).toHaveURL(/\/os(?:$|\/|\?)/);
}

async function navigate(page: Page, name: string) {
  const mobileMenu = page.locator(".mobile-menu > summary");
  const desktopLink = page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name, exact: true });
  await expect
    .poll(async () => {
      const [mobile, desktop] = await Promise.all([
        mobileMenu.isVisible(),
        desktopLink.isVisible(),
      ]);
      return mobile === desktop ? "loading" : mobile ? "mobile" : "desktop";
    })
    .not.toBe("loading");
  if (await mobileMenu.isVisible()) {
    await mobileMenu.click();
    await page
      .getByRole("navigation", { name: "Mobile navigation" })
      .getByRole("link", { name, exact: true })
      .click();
    return;
  }
  await desktopLink.click();
}

async function expectNoDocumentOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
  }));
  expect(dimensions.document, JSON.stringify(dimensions)).toBeLessThanOrEqual(
    dimensions.viewport,
  );
}

test("Brand Studio completes the governed customer journey at desktop and mobile viewports", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await fixtureLogin(page, "partner");
  await navigate(page, "Business Tools");
  await expect(
    page.getByRole("heading", { name: "Business Tools" }),
  ).toBeVisible();
  await expect(
    page.getByText("KXRA Brand Studio", { exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Open Brand Studio ↗" }).click();
  await expect(
    page.getByRole("heading", { name: "KXRA Brand Studio" }),
  ).toBeVisible();
  await expect(page.getByText(/Publication, scheduling/)).toBeVisible();
  await expect(page.getByRole("button", { name: /publish/i })).toHaveCount(0);
  await expectNoDocumentOverflow(page);

  const marker = `${test.info().project.name}-${Date.now()}`;
  const profileName = `Northstar ${marker}`;
  const profileForm = page.locator("form.brand-form").filter({
    has: page.getByRole("heading", {
      name: "Create a source-linked profile",
    }),
  });
  await profileForm
    .getByLabel("Supplied source snapshot")
    .fill(`${profileName} helps UK small businesses improve operations.`);
  await profileForm
    .getByLabel("Rights basis")
    .fill("Synthetic browser fixture content owned by the test account.");
  await profileForm.getByLabel(/I consent to KXRA processing/).check();
  await profileForm.getByLabel("Profile name").fill(profileName);
  await profileForm.getByLabel("Business name").fill(profileName);
  await profileForm.getByLabel("Tone words").fill("clear, credible, practical");
  await profileForm.getByLabel("Audiences").fill("UK small business owners");
  await profileForm.getByLabel("Offers").fill("A structured operating review");
  await profileForm
    .getByRole("button", { name: "Create draft profile" })
    .click();

  let profileCard = page.locator("article.record").filter({
    has: page.getByRole("heading", { name: profileName, exact: true }),
  });
  await expect(profileCard).toBeVisible();
  await page.waitForLoadState("networkidle");
  const profileDecision = page.waitForResponse(
    (response) =>
      response.url().includes(`/profiles/`) &&
      response.url().endsWith("/decision") &&
      response.request().method() === "POST",
  );
  await profileCard
    .getByRole("button", { name: "Approve exact profile" })
    .click();
  expect((await profileDecision).status()).toBe(200);
  profileCard = page.locator("article.record").filter({
    has: page.getByRole("heading", { name: profileName, exact: true }),
  });
  await expect(
    profileCard.getByText("APPROVED", { exact: true }),
  ).toBeVisible();

  const campaignName = `Operating review ${marker}`;
  const campaignForm = page.locator("form.brand-form").filter({
    has: page.getByRole("heading", { name: "Create a campaign brief" }),
  });
  const profileOption = campaignForm
    .locator('select[name="profile_id"] option')
    .filter({ hasText: profileName });
  await campaignForm
    .locator('select[name="profile_id"]')
    .selectOption(await profileOption.getAttribute("value"));
  await campaignForm.getByLabel("Brief name").fill(campaignName);
  await campaignForm
    .getByLabel("Objective")
    .fill("Introduce the operating review to qualified prospects.");
  await campaignForm.getByLabel("Audience").fill("UK small business owners");
  await campaignForm.getByLabel("Offer").fill("A structured operating review");
  await campaignForm.getByLabel("LINKEDIN", { exact: true }).check();
  await campaignForm.getByLabel("Constraints").fill("Do not promise outcomes.");
  await campaignForm.getByLabel("Success measure").fill("Qualified replies");
  await campaignForm
    .getByRole("button", { name: "Create draft brief" })
    .click();

  let campaignCard = page.locator("article.record").filter({
    has: page.getByRole("heading", { name: campaignName, exact: true }),
  });
  await expect(campaignCard).toBeVisible();
  await page.waitForLoadState("networkidle");
  const campaignDecision = page.waitForResponse(
    (response) =>
      response.url().includes(`/campaigns/`) &&
      response.url().endsWith("/decision") &&
      response.request().method() === "POST",
  );
  await campaignCard
    .getByRole("button", { name: "Approve exact brief" })
    .click();
  expect((await campaignDecision).status()).toBe(200);
  campaignCard = page.locator("article.record").filter({
    has: page.getByRole("heading", { name: campaignName, exact: true }),
  });
  await expect(
    campaignCard.getByText("APPROVED", { exact: true }),
  ).toBeVisible();

  const generationForm = page.locator("form.brand-form").filter({
    has: page.getByRole("heading", { name: "Generate review drafts" }),
  });
  const campaignOption = generationForm
    .locator('select[name="brief_id"] option')
    .filter({ hasText: campaignName });
  await generationForm
    .locator('select[name="brief_id"]')
    .selectOption(await campaignOption.getAttribute("value"));
  await page.waitForLoadState("networkidle");
  const generationResult = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/brand-studio/generate") &&
      response.request().method() === "POST",
  );
  await generationForm
    .getByRole("button", { name: "Reserve usage and generate" })
    .click();
  expect((await generationResult).status()).toBe(201);

  const reviewQueue = page.locator("section.studio-section").filter({
    has: page.getByRole("heading", { name: "Creative review queue" }),
  });
  const variantCard = reviewQueue
    .locator("article.record")
    .filter({ hasText: profileName })
    .filter({ hasText: "REVIEW_REQUIRED" })
    .first();
  await expect(variantCard).toBeVisible();
  await page.waitForLoadState("networkidle");
  await variantCard.getByLabel("Matches the approved brand profile").check();
  await variantCard.getByLabel("Claims are supported or removed").check();
  await variantCard
    .getByLabel("Inputs and intended use have appropriate rights")
    .check();
  await variantCard
    .getByLabel("Alt text and accessible treatment are adequate")
    .check();
  await variantCard
    .getByLabel("Compliance and required disclaimers are addressed")
    .check();
  await variantCard
    .getByLabel("Review note")
    .fill("All five synthetic browser review checks passed.");
  const reviewResult = page.waitForResponse(
    (response) =>
      response.url().includes("/variants/") &&
      response.url().endsWith("/review") &&
      response.request().method() === "POST",
  );
  await variantCard
    .getByRole("button", { name: "Record exact review" })
    .click();
  expect((await reviewResult).status()).toBe(201);

  const approvedVariant = reviewQueue
    .locator("article.record")
    .filter({ hasText: profileName })
    .filter({ hasText: "APPROVED" })
    .first();
  await expect(approvedVariant).toBeVisible();
  await page.waitForLoadState("networkidle");
  const downloadStarted = page.waitForEvent("download");
  await approvedVariant
    .getByRole("button", { name: "Export Markdown" })
    .click();
  const download = await downloadStarted;
  expect(download.suggestedFilename()).toMatch(/\.md$/);
  expect(await download.failure()).toBeNull();
});
