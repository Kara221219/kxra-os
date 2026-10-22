import { test, expect } from "@playwright/test";
import crypto from "node:crypto";
import { knowledgeFixture, knowledgeOk } from "../support/team-knowledge";
import { testOrigin } from "../support/runtime";
test("creator and sample apps keep reviewed stages and receipts through lost acknowledgements, reload and mobile filters", async ({
  page,
}) => {
  test.setTimeout(90000);
  const f = await knowledgeFixture(false),
    creator = "Creator " + crypto.randomUUID(),
    sample = "Sample " + crypto.randomUUID();
  await page.goto("/login");
  await page.getByText("Local fixture identities", { exact: true }).click();
  await page.getByLabel("Synthetic identity").selectOption("partner");
  await page.getByRole("button", { name: "Use fixture", exact: true }).click();
  await expect(page).toHaveURL(/\/os/);
  await page.goto(`/os/workspace/${f.room}?view=creators`);
  await page.getByLabel("Creator name", { exact: true }).fill(creator);
  await page
    .getByLabel("Brief and recorded evidence", { exact: true })
    .fill("Synthetic creator; no live metrics");
  await page.getByLabel("Responsible person", { exact: true }).fill("Maya");
  await page
    .getByLabel("Next follow-up", { exact: true })
    .fill("Review content brief");
  await page.getByLabel("Follow-up date", { exact: true }).fill("2026-11-10");
  await page.route(`**/api/team-space/${f.room}/creator-save`, async (r) => {
    await r.fetch();
    await r.abort("failed");
  });
  await page.getByRole("button", { name: "Add creator", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: /fetch/i }),
  ).toBeVisible();
  await page.unroute(`**/api/team-space/${f.room}/creator-save`);
  await page.getByRole("button", { name: "Add creator", exact: true }).click();
  let card = page.getByRole("article", { name: creator, exact: true });
  await expect(card).toContainText("Stage RESEARCH · Revision 1");
  expect(
    (await knowledgeOk(`/${f.room}/creator-records`, f.cookie)).records,
  ).toHaveLength(1);
  await card.getByText("Propose reviewed step", { exact: true }).click();
  await card
    .getByLabel("Review note or outreach draft")
    .fill("Synthetic shortlist review; do not send");
  await card
    .getByRole("button", { name: "Propose recorded step", exact: true })
    .click();
  let review = page.getByRole("article", {
    name: "Review " + creator,
    exact: true,
  });
  await expect(review).toContainText("PROPOSED · Review revision 1");
  await review
    .getByRole("button", { name: "Record app review", exact: true })
    .click();
  await expect(review).toContainText("APPROVED · Review revision 2");
  await review
    .getByRole("button", { name: "Apply reviewed step once", exact: true })
    .click();
  await expect(review).toContainText("EXECUTED · Review revision 3");
  await expect(card).toContainText("Stage SHORTLIST · Revision 2");
  await page.reload();
  await expect(card).toContainText("Stage SHORTLIST · Revision 2");
  await page.getByRole("tab", { name: "Samples", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Sampling Desk", exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Recorded creator")
    .selectOption({ label: creator + " · Revision 2" });
  await page.getByLabel("Sample item", { exact: true }).fill(sample);
  await page
    .getByLabel("Sample details", { exact: true })
    .fill("Synthetic desk kit; no address or courier");
  await page.getByLabel("Responsible person", { exact: true }).fill("Theo");
  await page
    .getByLabel("Next follow-up", { exact: true })
    .fill("Review preparation");
  await page
    .getByRole("button", { name: "Add sample request", exact: true })
    .click();
  card = page.getByRole("article", { name: sample, exact: true });
  await expect(card).toContainText("Stage REQUESTED · Revision 1");
  await expect(
    card.getByRole("link", { name: creator, exact: true }),
  ).toBeVisible();
  await card.getByText("Propose reviewed step", { exact: true }).click();
  await card
    .getByLabel("Review note or outreach draft")
    .fill("Human-recorded preparation only");
  await card
    .getByRole("button", { name: "Propose recorded step", exact: true })
    .click();
  review = page.getByRole("article", { name: "Review " + sample, exact: true });
  await review
    .getByRole("button", { name: "Record app review", exact: true })
    .click();
  await expect(review).toContainText("APPROVED · Review revision 2");
  await page.route(`**/api/team-space/${f.room}/sample-execute`, async (r) => {
    await r.fetch();
    await r.abort("failed");
  });
  await review
    .getByRole("button", { name: "Apply reviewed step once", exact: true })
    .click();
  await expect(
    review.getByRole("status").filter({ hasText: /fetch/i }),
  ).toBeVisible();
  await page.unroute(`**/api/team-space/${f.room}/sample-execute`);
  await review
    .getByRole("button", { name: "Apply reviewed step once", exact: true })
    .click();
  await expect(review).toContainText("EXECUTED · Review revision 3");
  await expect(card).toContainText("Stage PREPARED · Revision 2");
  await page.reload();
  await expect(card).toContainText("Stage PREPARED · Revision 2");
  await page
    .getByLabel("Search Sampling Desk", { exact: true })
    .fill("no-such-sample");
  await expect(
    page.getByText(
      "No matching loaded records. Reset the filters to return to the records.",
      { exact: true },
    ),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Reset app filters", exact: true })
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
  const actual = (await knowledgeOk(`/${f.room}/sample-records`, f.cookie))
    .records;
  expect(actual).toHaveLength(1);
  expect(actual[0].version).toBe(2);
  const denied = await page.request.post(
    `/api/team-space/${f.room}/sample-propose`,
    {
      headers: { origin: testOrigin },
      data: {
        request_id: crypto.randomUUID(),
        source_id: actual[0].id,
        source_version: 1,
        target_stage: "DELIVERED",
        note: "Stale source",
      },
    },
  );
  expect(denied.status()).toBe(409);
});
