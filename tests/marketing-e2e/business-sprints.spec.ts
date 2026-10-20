import { expect, test } from "@playwright/test";
for (const route of ["/business-sprints"])
  test(`sprint intake persists a structured assessment request from ${route}`, async ({
    page,
  }) => {
    await page.setExtraHTTPHeaders({
      "user-agent": `KXRA-sprint-acceptance-${crypto.randomUUID()}`,
    });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(
      `${route}?package=decision-review${route === "/" ? "#contact" : "#start"}`,
    );
    await expect(
      page.getByRole("heading", {
        name:
          route === "/"
            ? "What would make your business work better?"
            : "From stuck. To a clear next move.",
      }),
    ).toBeVisible();
    await expect(page.getByLabel("Starting package")).toHaveValue(
      "decision-review",
    );
    await page.getByLabel("Name", { exact: true }).fill("Sprint Browser Test");
    await page
      .getByLabel("Work email")
      .fill(`sprint-${Date.now()}@example.invalid`);
    await page
      .getByLabel("Business or organisation")
      .fill("Synthetic Business");
    await page
      .getByLabel("What should the project solve?")
      .fill("Our enquiries need a clear response and follow-up process.");
    await page
      .getByLabel("What would a useful outcome look like?")
      .fill("Every enquiry has an owner and a next action.");
    await page
      .getByLabel("Current systems, previous attempts and constraints")
      .fill("Two people use a spreadsheet; no new software budget.");
    await page
      .getByLabel("Indicative project budget")
      .selectOption("UNDER_500");
    await page.getByLabel("Desired deadline").fill("Within one month");
    await page.getByRole("checkbox").check();
    const responsePromise = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/enquiries") &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Send to KXRA" }).click();
    const response = await responsePromise;
    expect(response.status()).toBe(202);
    expect((await response.json()).receipt).toMatch(/^[0-9a-f-]{36}$/);
    await expect(page.getByRole("status")).toContainText(
      "private KXRA review inbox",
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(errors).toEqual([]);
  });
test("sprint public intake rejects forged packages and mismatched form kinds", async ({
  request,
  baseURL,
}) => {
  const base = {
    kind: "CUSTOM_PROJECT",
    name: "Synthetic Test",
    email: "test@example.invalid",
    company: "Test",
    message: "A sufficiently detailed synthetic problem.",
    sourcePath: "/submit-opportunity",
    consent: true,
    website: "",
    desiredOutcome: "A practical action plan.",
  };
  for (const payload of [
    { ...base, sprintPackage: "forged" },
    {
      ...base,
      sprintPackage: "decision-review",
      kind: "CONTACT",
      sourcePath: "/contact",
    },
    { ...base, sprintPackage: "decision-review", desiredOutcome: undefined },
  ]) {
    const response = await request.post("/api/enquiries", {
      headers: { origin: baseURL!, "idempotency-key": crypto.randomUUID() },
      data: payload,
    });
    expect(response.status()).toBe(400);
  }
});
