import { test, expect, type Page } from "@playwright/test";
import crypto from "node:crypto";
import { knowledgeFixture } from "../support/team-knowledge";
async function enter(page: Page, room: string, view: string) {
  await page.goto("/login");
  await page.getByText("Local fixture identities", { exact: true }).click();
  await page.getByLabel("Synthetic identity").selectOption("partner");
  await page.getByRole("button", { name: "Use fixture", exact: true }).click();
  await expect(page).toHaveURL(/\/os/);
  await page.goto(`/os/workspace/${room}?view=${view}`);
}
async function common(page: Page, label: string, title: string) {
  await page.getByLabel(label, { exact: true }).fill(title);
  await page
    .getByLabel("Recorded context", { exact: true })
    .fill("Fictional local acceptance record only");
  await page.getByLabel("Responsible person", { exact: true }).fill("Maya");
  await page
    .getByLabel("Next follow-up", { exact: true })
    .fill("Review the recorded next step");
}
async function reviewed(
  page: Page,
  title: string,
  target: string,
  path?: string,
) {
  const card = page.getByRole("article", { name: title, exact: true });
  const proposal = card.locator("details").filter({
    has: page.locator("summary").filter({ hasText: "Propose case step" }),
  });
  if ((await proposal.getAttribute("open")) === null)
    await proposal.locator("summary").click();
  await card.getByLabel("Proposed stage", { exact: true }).selectOption(target);
  await card
    .getByLabel("Human review reason", { exact: true })
    .fill("Synthetic human-reviewed record; no external action");
  await card
    .getByRole("button", { name: "Propose reviewed case step", exact: true })
    .click();
  const review = page
    .getByRole("article", { name: "Review " + title, exact: true })
    .first();
  await expect(review).toContainText("PROPOSED · Review revision 1");
  await review
    .getByRole("button", { name: "Record case review", exact: true })
    .click();
  await expect(review).toContainText("APPROVED · Review revision 2", {
    timeout: 15000,
  });
  if (path)
    await page.route(path, async (r) => {
      await r.fetch();
      await r.abort("failed");
    });
  await review
    .getByRole("button", { name: "Apply reviewed case step once", exact: true })
    .click();
  if (path) {
    await expect(
      review.getByRole("status").filter({ hasText: /fetch/i }),
    ).toBeVisible();
    await page.unroute(path);
    await review
      .getByRole("button", {
        name: "Apply reviewed case step once",
        exact: true,
      })
      .click();
  }
  await expect(review).toContainText("EXECUTED · Review revision 3");
  await expect(card).toContainText("Stage " + target);
}
test("remodeling scope and manual estimate reset review when changed and persist after reload", async ({
  page,
}) => {
  test.setTimeout(90000);
  const f = await knowledgeFixture(false),
    name = "Fictional remodel " + crypto.randomUUID();
  await enter(page, f.room, "remodeling");
  await common(page, "Project name", name);
  await page
    .getByLabel("Property or project", { exact: true })
    .fill("Synthetic garden room");
  await page
    .getByLabel("Scope of work", { exact: true })
    .fill("Recorded survey and constraints");
  await page
    .getByLabel("Scope exclusions", { exact: true })
    .fill("No binding quote or service");
  await page
    .getByLabel("Recorded estimate (GBP)", { exact: true })
    .fill("1250.45");
  await page
    .getByLabel("Next milestone", { exact: true })
    .fill("Review the survey");
  await page
    .getByRole("button", { name: "Add remodeling brief", exact: true })
    .click();
  const card = page.getByRole("article", { name, exact: true });
  await expect(card).toContainText("£1,250.45");
  await reviewed(page, name, "ESTIMATE_DRAFT");
  await reviewed(page, name, "SCOPE_REVIEWED");
  await card.getByText("Edit recorded case", { exact: true }).click();
  await card
    .getByLabel("Recorded estimate (GBP)", { exact: true })
    .fill("1300.01");
  await card
    .getByLabel("Scope of work", { exact: true })
    .fill("Changed scope needs a fresh review");
  await card
    .getByRole("button", { name: "Save case details", exact: true })
    .click();
  await expect(card).toContainText("Stage ESTIMATE_DRAFT · Revision 4");
  await expect(card).toContainText("£1,300.01");
  await page.reload();
  await expect(card).toContainText("Stage ESTIMATE_DRAFT · Revision 4");
  await reviewed(page, name, "SCOPE_REVIEWED");
  await reviewed(page, name, "MILESTONE_PLANNED");
  await reviewed(page, name, "HANDOFF");
  await page.reload();
  await expect(card).toContainText("Stage HANDOFF");
});
test("private recruiting keeps an application attached to its role and records only explicit human-reviewed stages", async ({
  page,
}) => {
  test.setTimeout(90000);
  const f = await knowledgeFixture(false),
    role = "Fictional operations role " + crypto.randomUUID(),
    candidate = "Fictional Jordan / Operations " + crypto.randomUUID();
  await enter(page, f.room, "roles");
  await common(page, "Role name", role);
  await page
    .getByLabel("Role brief", { exact: true })
    .fill("Fictional role used only for local testing");
  await page
    .getByLabel("Review criteria", { exact: true })
    .fill("Recorded relevant experience; no ranking");
  await page.getByRole("button", { name: "Define role", exact: true }).click();
  await reviewed(page, role, "OPEN");
  await page.getByRole("tab", { name: "Recruiting", exact: true }).click();
  await page
    .getByLabel("Open role", { exact: true })
    .selectOption({ label: role + " · Revision 2" });
  await common(page, "Application label", candidate);
  await page
    .getByLabel("Application reference", { exact: true })
    .fill("SYNTHETIC-APPLICATION");
  await page
    .getByLabel("Recorded application evidence", { exact: true })
    .fill("Fictional evidence; no real applicant");
  await page
    .getByLabel("Human review note", { exact: true })
    .fill("Synthetic note only, no actual hiring determination");
  await page
    .getByRole("button", { name: "Record application", exact: true })
    .click();
  const card = page.getByRole("article", { name: candidate, exact: true });
  await expect(
    card.getByRole("link", { name: role, exact: true }),
  ).toBeVisible();
  for (const target of ["REVIEW", "INTERVIEW", "DECISION_RECORDED"])
    await reviewed(page, candidate, target);
  await page.reload();
  await expect(card).toContainText("Stage DECISION_RECORDED · Revision 4");
  await expect(
    card.getByText("Edit recorded case", { exact: true }),
  ).toHaveCount(0);
});
test("travel validates dates, retries a lost acknowledgement once and resets edited proposal review", async ({
  page,
}) => {
  test.setTimeout(90000);
  const f = await knowledgeFixture(false),
    name = "Fictional trip " + crypto.randomUUID();
  await enter(page, f.room, "travel");
  await common(page, "Enquiry name", name);
  await page
    .getByLabel("Traveller or party reference", { exact: true })
    .fill("Synthetic party A");
  await page
    .getByLabel("Destination", { exact: true })
    .fill("Fictional coastal itinerary");
  await page.getByLabel("Start date", { exact: true }).fill("2026-12-01");
  await page.getByLabel("End date", { exact: true }).fill("2026-11-30");
  await page
    .getByLabel("Recorded itinerary proposal", { exact: true })
    .fill("Local proposal; no supplier or booking");
  await page
    .getByLabel("Proposal exclusions", { exact: true })
    .fill("No passport/visa/transit advice, payment or reservation");
  await page
    .getByRole("button", { name: "Add travel enquiry", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Invalid request fields" }),
  ).toBeVisible();
  await page.getByLabel("End date", { exact: true }).fill("2026-12-04");
  await page
    .getByRole("button", { name: "Add travel enquiry", exact: true })
    .click();
  const card = page.getByRole("article", { name, exact: true });
  await reviewed(page, name, "PROPOSAL_DRAFT");
  await reviewed(
    page,
    name,
    "REVIEWED",
    `**/api/team-space/${f.room}/travel-execute`,
  );
  await card.getByText("Edit recorded case", { exact: true }).click();
  await card
    .getByLabel("Recorded itinerary proposal", { exact: true })
    .fill("Changed itinerary requires a fresh version review");
  await card
    .getByRole("button", { name: "Save case details", exact: true })
    .click();
  await expect(card).toContainText("Stage PROPOSAL_DRAFT · Revision 4");
  await page.reload();
  await expect(card).toContainText(
    "Changed itinerary requires a fresh version review",
  );
  await page
    .getByLabel("Search Travel Desk", { exact: true })
    .fill("no-such-trip");
  await expect(
    page.getByText("No matching loaded cases. Reset the filters to return.", {
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Reset case filters", exact: true })
    .click();
  await expect(card).toBeVisible();
  for (const width of [360, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 950 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      String(width),
    ).toBe(true);
  }
});
