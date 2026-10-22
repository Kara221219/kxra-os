import { test, expect } from "@playwright/test";
test("reference baseline shell, samples and catalog stay local and usable", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Your team.",
  );
  if (info.project.name === "mobile")
    await page.getByRole("button", { name: "Menu", exact: true }).click();
  const product = page.getByRole("button", { name: "Product", exact: true });
  await product.click();
  await expect(product).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Escape");
  await expect(product).toBeFocused();
  await expect(product).toHaveAttribute("aria-expanded", "false");
  await page.getByRole("button", { name: "Book a demo", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog")).toContainText(
    "No time slot is booked automatically.",
  );
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  const preview = page.locator(".ref-workspace");
  await expect(preview.getByRole("row")).toHaveCount(5);
  await preview.getByRole("button", { name: "New sample record" }).click();
  await expect(preview.getByRole("row")).toHaveCount(6);
  await preview.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(preview.getByRole("row")).toHaveCount(5);
  await preview.getByRole("button", { name: /hiring/i }).click();
  await preview.getByRole("button", { name: /Sample candidate/ }).click();
  await expect(preview.locator(".ref-stage-columns>div").nth(1)).toContainText(
    "Sample candidate",
  );
  await preview.getByRole("button", { name: /sales/i }).click();
  await preview.getByLabel("Opportunity stage").selectOption("Proposal");
  await expect(preview).toContainText("Review the exact scope and price.");
  await preview.getByRole("button", { name: /operations/i }).click();
  await preview.getByLabel("Count for sample item").fill("-3");
  await preview.getByRole("button", { name: "Validate sample count" }).click();
  await expect(preview.getByRole("status")).toContainText(
    "Enter a whole number",
  );
  await preview.getByLabel("Count for sample item").fill("12");
  await preview.getByRole("button", { name: "Validate sample count" }).click();
  await expect(preview.getByRole("status")).toContainText(
    "No external stock record changed.",
  );
  await page.getByText("Is this a live agent demonstration?").click();
  await expect(page.locator("#faq details[open]")).toContainText(
    "does not call an agent",
  );
  for (const width of [360, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 950 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      String(width),
    ).toBe(true);
  }
  await page.screenshot({
    path: `.runtime/reference-baseline/${info.project.name}-home.png`,
    fullPage: true,
  });
  await page.goto("/integrations");
  await page.getByLabel("SEARCH INTEGRATIONS").fill("nothing-matches");
  await expect(page.getByRole("heading", { name: /No results/ })).toBeVisible();
  await page.getByRole("button", { name: "Reset filters" }).click();
  await expect(page.getByRole("status")).toContainText("6 results");
  for (const route of [
    "/product",
    "/product/workspace",
    "/product/agents",
    "/apps",
    "/solutions",
    "/use-cases",
    "/help",
    "/bring-your-own-agent",
    "/video-studio",
    "/brand-studio",
  ]) {
    const r = await page.goto(route);
    expect(r?.status(), route).toBe(200);
  }
  expect(errors).toEqual([]);
});
