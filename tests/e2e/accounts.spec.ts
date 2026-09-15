import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";

const projectTwo = "30000000-0000-4000-8000-000000000002";
const projectThree = "30000000-0000-4000-8000-000000000003";

type FakeMessage = {
  recipient: string;
  template: string;
  text: string;
  state: string;
  createdAt: string;
};

type ApiResult = {
  status: number;
  body: Record<string, any> | Record<string, any>[];
};

function marker() {
  return `${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 10)}`;
}

function latestAction(recipient: string, template: string) {
  const state = JSON.parse(
    fs.readFileSync(".runtime/fake-email.json", "utf8"),
  ) as { messages: FakeMessage[] };
  const message = [...state.messages]
    .reverse()
    .find(
      (candidate) =>
        candidate.recipient === recipient &&
        candidate.template === template &&
        candidate.state === "SENT",
    );
  return (
    message?.text.match(/Continue securely: (https?:\/\/\S+)/)?.[1] || null
  );
}

async function waitForAction(recipient: string, template: string) {
  await expect
    .poll(() => latestAction(recipient, template), { timeout: 15_000 })
    .not.toBeNull();
  return latestAction(recipient, template)!;
}

async function fixtureLogin(page: Page, fixture: string) {
  await page.goto("/login");
  await page.getByText("Local fixture identities", { exact: true }).click();
  await page.getByLabel("Synthetic identity").selectOption(fixture);
  await page.getByRole("button", { name: "Use fixture" }).click();
  await expect(page).toHaveURL(/\/os(?:$|\/|\?)/);
}

async function providerLogin(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in →" }).click();
}

async function browserApi(
  page: Page,
  url: string,
  body?: Record<string, unknown>,
  method = body === undefined ? "GET" : "POST",
) {
  return page.evaluate(
    async ({ url, body, method }) => {
      const response = await fetch(url, {
        method,
        headers:
          body === undefined
            ? undefined
            : { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return {
        status: response.status,
        body: await response.json(),
      };
    },
    { url, body, method },
  ) as Promise<ApiResult>;
}

async function createInvitation(
  page: Page,
  email: string,
  grants: Array<{
    project: "PROJECT-002" | "PROJECT-003";
    role: "viewer" | "contributor";
  }>,
) {
  await page.goto("/os/partners");
  const form = page.locator("form").filter({
    has: page.getByRole("heading", { name: "Create an invitation" }),
  });
  await form.getByLabel("Verified account email").fill(email);
  for (const grant of grants) {
    const projectName =
      grant.project === "PROJECT-002"
        ? "US Vehicle Seat Covers"
        : "AI Property Fly-Through";
    await form
      .getByRole("checkbox", { name: new RegExp(grant.project) })
      .check();
    await form.getByLabel(`Role for ${projectName}`).selectOption(grant.role);
  }
  await form
    .getByLabel("Optional note")
    .fill("Synthetic browser invitation with exact project grants");
  await form.getByLabel("Expires after").selectOption("24");
  await form.getByRole("button", { name: "Create invitation" }).click();
  await expect(page.getByText(email, { exact: true })).toBeVisible();
  return waitForAction(email, "PARTNER_INVITATION");
}

async function createAndVerifyAccount(
  page: Page,
  invitationUrl: string,
  email: string,
  password: string,
  testReturnPath: boolean,
) {
  const rawToken = new URLSearchParams(
    new URL(invitationUrl).hash.slice(1),
  ).get("token");
  expect(rawToken).toBeTruthy();
  const networkUrls: string[] = [];
  const consoleLines: string[] = [];
  page.on("request", (request) => networkUrls.push(request.url()));
  page.on("console", (message) => consoleLines.push(message.text()));

  await page.goto(invitationUrl);
  await expect(page).toHaveURL(/\/join\/account$/);
  await expect(
    page.getByRole("heading", { name: "Create your KXRA account." }),
  ).toBeVisible();
  expect(page.url()).not.toContain(rawToken!);
  expect(networkUrls.some((url) => url.includes(rawToken!))).toBe(false);
  expect(consoleLines.some((line) => line.includes(rawToken!))).toBe(false);
  expect(
    await page.evaluate(
      (token) =>
        JSON.stringify({ ...localStorage, ...sessionStorage }).includes(token),
      rawToken!,
    ),
  ).toBe(false);
  const intentCookie = (await page.context().cookies()).find(
    (cookie) => cookie.name === "kxra_join_intent",
  );
  expect(intentCookie?.httpOnly).toBe(true);
  expect(intentCookie?.value).not.toContain(rawToken!);

  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Create your KXRA account." }),
  ).toBeVisible();
  await expect(page.getByLabel("Email")).toHaveCount(0);
  await page.getByLabel("Create your password").fill(password);
  await page.getByLabel("Confirm your password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(
    page.getByRole("heading", { name: "Verify your email." }),
  ).toBeVisible();

  if (testReturnPath) {
    await page.evaluate(async () => {
      await fetch("/api/auth", {
        method: "POST",
        body: new URLSearchParams({ logout: "1" }),
      });
    });
    await providerLogin(page, email, password);
    await expect(page).toHaveURL(/\/join\/account$/);
    await expect(
      page.getByRole("heading", { name: "Verify your email." }),
    ).toBeVisible();
  }

  const verificationUrl = await waitForAction(email, "EMAIL_VERIFICATION");
  await page.goto(verificationUrl);
  await expect(page).toHaveURL(/\/onboarding(?:$|\?)/);
  await expect(page.getByText("Step 1 of 9", { exact: true })).toBeVisible();
  return rawToken!;
}

async function continueStep(page: Page) {
  await page.getByRole("button", { name: "Save and continue" }).click();
}

async function completeStepsOneToFour(
  page: Page,
  firstName: string,
  expectedProjects: Array<"PROJECT-002" | "PROJECT-003">,
) {
  await page
    .getByLabel("I understand that KXRA access is project-scoped.")
    .check();
  await continueStep(page);
  await expect(page.getByText("Step 2 of 9", { exact: true })).toBeVisible();
  await page.getByLabel("First name").fill(firstName);
  await page.getByLabel("Last name").fill("Browser");
  await page.getByLabel("Role or title").fill("Synthetic partner");
  await page.getByLabel("Employer or company").fill("KXRA fixture");
  await page.getByLabel("Phone (optional)").fill("+44 7700 900456");
  await continueStep(page);
  await expect(page.getByText("Step 3 of 9", { exact: true })).toBeVisible();
  await page
    .getByLabel("I understand the account security requirements.")
    .check();
  await continueStep(page);
  await expect(page.getByText("Step 4 of 9", { exact: true })).toBeVisible();
  for (const project of expectedProjects) {
    await expect(page.getByText(project, { exact: true })).toBeVisible();
    const card = page
      .locator(".access-cards article")
      .filter({ hasText: project });
    await expect(
      card.getByText(project === "PROJECT-002" ? "contributor" : "viewer", {
        exact: true,
      }),
    ).toBeVisible();
  }
  for (const project of ["PROJECT-002", "PROJECT-003"] as const)
    if (!expectedProjects.includes(project))
      await expect(page.getByText(project, { exact: true })).toHaveCount(0);
  await expect(page.getByText("PROJECT-001", { exact: true })).toHaveCount(0);
  await page
    .getByLabel("I have reviewed my read-only project roles and permissions.")
    .check();
  await continueStep(page);
  await expect(page.getByText("Step 5 of 9", { exact: true })).toBeVisible();
}

async function completeStepsFiveToNine(page: Page) {
  await page.getByLabel("I understand how to work within KXRA OS.").check();
  await continueStep(page);
  await expect(page.getByText("Step 6 of 9", { exact: true })).toBeVisible();
  await page.getByLabel("Skip for now").check();
  await continueStep(page);
  await expect(page.getByText("Step 7 of 9", { exact: true })).toBeVisible();
  await page.getByLabel("Timezone").selectOption("UTC");
  await page.getByLabel("Display density").selectOption("compact");
  await continueStep(page);
  await expect(page.getByText("Step 8 of 9", { exact: true })).toBeVisible();
  await expect(page.getByText(/UNAPPROVED PLACEHOLDER/).first()).toBeVisible();
  const agreements = page.locator('input[name="agreement_id"]');
  expect(await agreements.count()).toBe(2);
  for (let index = 0; index < 2; index++) await agreements.nth(index).check();
  await page
    .getByLabel(/I understand that documents marked UNAPPROVED PLACEHOLDER/)
    .check();
  await continueStep(page);
  await expect(page.getByText("Step 9 of 9", { exact: true })).toBeVisible();
  await page
    .getByLabel("Complete onboarding and open my KXRA dashboard.")
    .check();
  await page.getByRole("button", { name: "Complete onboarding" }).click();
  await expect(page).toHaveURL(/\/os\?tour=1/);
  await expect(
    page.getByRole("heading", { name: "Your project workspace" }),
  ).toBeVisible();
}

async function approveLifecycle(
  page: Page,
  userId: string,
  desiredState: "ACTIVE" | "SUSPENDED",
) {
  const created = await browserApi(page, "/api/approvals", {
    action: "account.lifecycle",
    project_id: null,
    payload: {
      user_id: userId,
      desired_state: desiredState,
      reason: `Synthetic E2E transition to ${desiredState}`,
    },
  });
  expect(created.status).toBe(201);
  const approval = created.body as Record<string, any>;
  expect(
    (
      await browserApi(page, `/api/approvals/${approval.id}`, {
        hash: approval.payload_hash,
        approve: true,
      })
    ).status,
  ).toBe(200);
  expect(
    (await browserApi(page, `/api/approvals/${approval.id}/execute`, {}))
      .status,
  ).toBe(200);
}

test("AT-19/20/21 owner invitation, partner account and lifecycle journey", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Desktop account journey");
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const suffix = marker();
  const email = `e2e-account-${suffix}@fixture.invalid`;
  const firstName = `E2E${suffix.slice(-8)}`;
  const initialPassword = "BrowserStartPass123";
  const changedPassword = "BrowserChangedPass456";

  await fixtureLogin(page, "owner");
  const invitationUrl = await createInvitation(page, email, [
    { project: "PROJECT-002", role: "contributor" },
    { project: "PROJECT-003", role: "viewer" },
  ]);
  await page.context().clearCookies();
  const rawToken = await createAndVerifyAccount(
    page,
    invitationUrl,
    email,
    initialPassword,
    true,
  );
  await completeStepsOneToFour(page, firstName, ["PROJECT-002", "PROJECT-003"]);
  await completeStepsFiveToNine(page);

  await page.goto("/os/profile");
  await expect(page.getByText("PROJECT-002", { exact: true })).toBeVisible();
  await expect(page.getByText("PROJECT-003", { exact: true })).toBeVisible();
  await expect(page.getByText("PROJECT-001", { exact: true })).toHaveCount(0);
  const profileForm = page.locator("form").filter({
    has: page.getByRole("heading", { name: "Profile", exact: true }),
  });
  await profileForm.getByLabel("Role or title").fill("Updated browser partner");
  await profileForm.getByLabel("Employer or company").fill("Updated fixture");
  await profileForm.getByRole("button", { name: "Save profile" }).click();
  await expect(profileForm.getByRole("status")).toHaveText("Profile updated.");
  const preferencesForm = page.locator("form").filter({
    has: page.getByRole("heading", { name: "Preferences", exact: true }),
  });
  await preferencesForm.getByLabel("Email notifications").uncheck();
  await preferencesForm
    .getByLabel("Display density")
    .selectOption("comfortable");
  await preferencesForm
    .getByRole("button", { name: "Save preferences" })
    .click();
  await expect(preferencesForm.getByRole("status")).toHaveText(
    "Preferences updated.",
  );
  const forged = await browserApi(
    page,
    "/api/account/profile",
    {
      first_name: firstName,
      last_name: "Browser",
      job_title: "Updated browser partner",
      company: "Updated fixture",
      phone: "+44 7700 900456",
      role: "owner",
    },
    "PATCH",
  );
  expect(forged.status).toBe(400);

  await page.getByRole("button", { name: "Begin enrollment" }).click();
  await expect(page.getByText("ENROLLING", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Complete enrollment" }).click();
  await expect(page.getByText("ENROLLED", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Test recovery" }).click();
  await expect(
    page.getByText("RECOVERY REQUIRED", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Provider proof").fill("KXRA-LOCAL-RECOVERY");
  await page.getByRole("button", { name: "Recover MFA" }).click();
  await expect(page.getByText("ENROLLED", { exact: true })).toBeVisible();

  await page.getByLabel("Current password").fill(initialPassword);
  await page.getByLabel("New password", { exact: true }).fill(changedPassword);
  await page.getByLabel("Confirm new password").fill(changedPassword);
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByText(/Password changed/)).toBeVisible();

  await page.context().clearCookies();
  await fixtureLogin(page, "owner");
  const partnerResponse = await browserApi(page, "/api/partners");
  expect(partnerResponse.status).toBe(200);
  const partner = (partnerResponse.body as Record<string, any>[]).find(
    (candidate) => candidate.first_name === firstName,
  );
  expect(partner?.id).toBeTruthy();
  await approveLifecycle(page, partner!.id, "SUSPENDED");
  await page.goto("/os/partners");
  const partnerCard = page.locator(".partner-admin-card").filter({
    hasText: firstName,
  });
  await expect(
    partnerCard.getByText("SUSPENDED", { exact: true }),
  ).toBeVisible();

  await page.context().clearCookies();
  await providerLogin(page, email, changedPassword);
  await expect(page).toHaveURL(/\/login\?error=1/);
  await fixtureLogin(page, "owner");
  await approveLifecycle(page, partner!.id, "ACTIVE");
  await page.context().clearCookies();
  await providerLogin(page, email, changedPassword);
  await expect(page).toHaveURL(/\/os(?:$|\?)/);
  expect(page.url()).not.toContain(rawToken);
});

test("AT-20 mobile interruption resumes the exact onboarding step", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "Mobile resume journey");
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  const suffix = marker();
  const email = `e2e-mobile-${suffix}@fixture.invalid`;
  const password = "MobileResumePass123";
  await fixtureLogin(page, "owner");
  const invitationUrl = await createInvitation(page, email, [
    { project: "PROJECT-003", role: "viewer" },
  ]);
  await page.context().clearCookies();
  await createAndVerifyAccount(page, invitationUrl, email, password, false);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await completeStepsOneToFour(page, `Mobile${suffix.slice(-6)}`, [
    "PROJECT-003",
  ]);
  await page.getByRole("button", { name: "Save and sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await providerLogin(page, email, password);
  await expect(page).toHaveURL(/\/onboarding(?:$|\?)/);
  await expect(page.getByText("Step 5 of 9", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Working With KXRA" }),
  ).toBeVisible();
  await page.setViewportSize({ width: 320, height: 800 });
  await page.reload();
  await expect(page.getByText("Step 5 of 9", { exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("Milestone 1 account surfaces reflow and retain keyboard navigation", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Single responsive matrix");
  test.setTimeout(60_000);
  await fixtureLogin(page, "owner");
  await page.goto("/os/partners");

  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Create an invitation" }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    if (width <= 390) {
      await expect(page.locator(".desktop-nav")).toBeHidden();
      await expect(page.locator(".mobile-menu")).toBeVisible();
    }
    await page.screenshot({
      path: testInfo.outputPath(`owner-partners-${width}.png`),
      fullPage: false,
    });
  }

  await page.setViewportSize({ width: 720, height: 900 });
  await page.reload();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("owner-partners-200pct-equivalent.png"),
    fullPage: false,
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip navigation" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#content$/);
  await page.getByText("Menu", { exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("navigation", { name: "Mobile navigation" }),
  ).toBeVisible();
});
