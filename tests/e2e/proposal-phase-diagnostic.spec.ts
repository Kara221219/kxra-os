import { test, expect, errors, type Response } from "@playwright/test";
import crypto from "node:crypto";
import { knowledgeFixture, knowledgeOk } from "../support/team-knowledge";
import {
  matchesCaseProposal,
  syntheticCaseReviewNote,
} from "../support/case-proposal";
import { testOrigin } from "../support/runtime";

for (const phase of ["ACTIONABILITY", "RESPONSE"] as const)
  test(`proposal phase probe distinguishes delayed ${phase} without changing the five-second response limit`, async ({
    page,
  }) => {
    test.setTimeout(90000);
    const f = await knowledgeFixture(false);
    const title = "Synthetic phase record " + crypto.randomUUID();
    const record = await knowledgeOk(`/${f.room}/remodel-save`, f.cookie, {
      request_id: crypto.randomUUID(),
      title,
      body: "Synthetic probe only",
      responsible: "Synthetic reviewer",
      next_step: "Review locally",
      details: {
        property: "Synthetic room",
        scope: "Synthetic scope",
        exclusions: "No external work",
        estimate_amount: "25.00",
        milestone: "Human review",
      },
    });
    await page.goto("/login");
    await page.getByText("Local fixture identities", { exact: true }).click();
    await page.getByLabel("Synthetic identity").selectOption("partner");
    await page
      .getByRole("button", { name: "Use fixture", exact: true })
      .click();
    await expect(page).toHaveURL(/\/os/);
    await page.goto(`/os/workspace/${f.room}?view=remodeling`);
    const card = page.getByRole("article", { name: title, exact: true });
    await card.getByText("Propose case step", { exact: true }).click();
    await card
      .getByLabel("Proposed stage", { exact: true })
      .selectOption("ESTIMATE_DRAFT");
    await card
      .getByLabel("Human review reason", { exact: true })
      .fill(syntheticCaseReviewNote);
    const button = card.getByRole("button", {
      name: "Propose reviewed case step",
      exact: true,
    });
    await expect(button).toBeEnabled();
    const scope = {
      origin: testOrigin,
      room: f.room,
      prefix: "remodel" as const,
      sourceId: record.record_id,
      sourceVersion: 1,
      target: "ESTIMATE_DRAFT",
    };
    const matches = (request: import("@playwright/test").Request) =>
      matchesCaseProposal(request, scope);
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const endpoint = `/api/team-space/${f.room}/remodel-propose`;
    if (phase === "RESPONSE")
      await page.route(`**${endpoint}`, async (route) => {
        if (matches(route.request())) await gate;
        await route.continue();
      });
    let actual!: (response: Response) => void;
    const actualResponse = new Promise<Response>((r) => {
      actual = r;
    });
    let requestAt = -1,
      responseAt = -1;
    const start = performance.now();
    const requested = (request: import("@playwright/test").Request) => {
      if (matches(request)) requestAt = performance.now() - start;
    };
    const responded = (response: Response) => {
      if (matches(response.request())) {
        responseAt = performance.now() - start;
        actual(response);
      }
    };
    page.on("request", requested);
    page.on("response", responded);
    // This is deliberately the existing wait-before-click ordering, not a fix.
    const originalWait = page
      .waitForResponse((response) => matches(response.request()), {
        timeout: 5000,
      })
      .then(
        () => ({ timedOut: false }),
        (error) => {
          if (!(error instanceof errors.TimeoutError)) throw error;
          return { timedOut: true };
        },
      );
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      if (phase === "ACTIONABILITY") {
        await button.evaluate((element) => {
          (element as HTMLButtonElement).disabled = true;
        });
        timer = setTimeout(() => {
          void button.evaluate((element) => {
            (element as HTMLButtonElement).disabled = false;
          });
        }, 6100);
      }
      const clicked = button.click();
      if (phase === "RESPONSE") {
        await clicked;
        await expect(
          card.getByRole("button", { name: "Working…", exact: true }),
        ).toBeVisible();
        expect((await originalWait).timedOut).toBe(true);
        expect(
          (await knowledgeOk(`/${f.room}/remodel-actions`, f.cookie)).actions,
        ).toHaveLength(0);
        await new Promise((r) =>
          setTimeout(r, Math.max(0, 6100 - (performance.now() - start))),
        );
        release();
      } else await clicked;
      expect((await originalWait).timedOut).toBe(true);
      const response = await actualResponse;
      expect(response.status()).toBe(201);
      expect((await response.json()).action_id).toMatch(/^[0-9a-f-]{36}$/i);
      const actions = (
        await knowledgeOk(`/${f.room}/remodel-actions`, f.cookie)
      ).actions;
      expect(actions).toHaveLength(1);
      expect(actions[0].state).toBe("PROPOSED");
      if (phase === "ACTIONABILITY") {
        expect(requestAt).toBeGreaterThanOrEqual(5000);
        expect(responseAt - requestAt).toBeLessThan(5000);
      } else {
        expect(requestAt).toBeGreaterThanOrEqual(0);
        expect(requestAt).toBeLessThan(5000);
        expect(responseAt - requestAt).toBeGreaterThanOrEqual(5000);
      }
      await expect(
        page.getByRole("article", { name: "Review " + title, exact: true }),
      ).toContainText("PROPOSED · Review revision 1");
      console.log(
        "SYNTHETIC_PROPOSAL_PHASE " +
          JSON.stringify({
            phase,
            timerExpired: true,
            requestBeforeExpiry: requestAt < 5000,
            responseAfterExpiry: responseAt >= 5000,
            canonicalSingleProposal: true,
          }),
      );
    } finally {
      if (timer) clearTimeout(timer);
      release();
      page.off("request", requested);
      page.off("response", responded);
      if (phase === "RESPONSE") await page.unroute(`**${endpoint}`);
    }
  });
