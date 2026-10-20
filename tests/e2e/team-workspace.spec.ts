import { test, expect } from "@playwright/test";
import crypto from "node:crypto";
test("conversation history loads older threads, retries failures and survives refresh", async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.goto("/login");
  await page.getByText("Local fixture identities", { exact: true }).click();
  await page.getByLabel("Synthetic identity").selectOption("partner");
  await page.getByRole("button", { name: "Use fixture" }).click();
  await expect(page).toHaveURL(/\/os/);
  const origin = new URL(page.url()).origin;
  const result = await page.request.post("/api/team-space", {
    headers: { origin },
    data: {
      project_id: "30000000-0000-4000-8000-000000000002",
      name: "Browser history " + crypto.randomUUID(),
      guidelines: "",
      access: "PRIVATE",
    },
  });
  expect(result.status()).toBe(201);
  const { id: room } = await result.json();
  const root = crypto.randomUUID();
  const send = async (
    body: string,
    request_id: string,
    parent_id: string | null = null,
  ) => {
    const response = await page.request.post(
      `/api/team-space/${room}/messages`,
      { headers: { origin }, data: { body, request_id, parent_id } },
    );
    expect(response.status(), await response.text()).toBe(201);
  };
  await send("Original historical thread", root);
  for (let n = 1; n <= 101; n++)
    await send("Historical reply " + n, crypto.randomUUID(), root);
  await page.goto("/os/workspace/" + room);
  await expect(page.locator(".team-message")).toHaveCount(100);
  await expect(
    page
      .getByText("Reply to an earlier thread · load earlier messages to view")
      .first(),
  ).toBeVisible();
  const historyRoute = `**/api/team-space/${room}/messages?before=*`;
  await page.route(historyRoute, (route) => route.abort("failed"));
  await page
    .getByRole("button", { name: "Load earlier messages", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: /fetch|load earlier/i }),
  ).toBeVisible();
  await page.unroute(historyRoute);
  await page
    .getByRole("button", { name: "Load earlier messages", exact: true })
    .click();
  await expect(page.locator(".team-message")).toHaveCount(102);
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Beginning of conversation reached." }),
  ).toBeVisible();
  await expect(page.locator(`#message-${root}`)).toContainText(
    "Original historical thread",
  );
  await expect(
    page.getByRole("link", { name: "Reply to thread", exact: true }).first(),
  ).toHaveAttribute("href", "#message-" + root);
  await expect(
    page.getByRole("button", { name: "Load earlier messages", exact: true }),
  ).toHaveCount(0);
  await page.getByLabel("Thread", { exact: true }).selectOption(root);
  await page
    .getByLabel("Message", { exact: true })
    .fill("Reply after history retrieval");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.locator(".team-message")).toHaveCount(103);
  await expect(page.locator(`#message-${root}`)).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
});
test("workspace browser flow: connect synthetic model, create room, message agent and approve task", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByText("Local fixture identities", { exact: true }).click();
  await page.getByLabel("Synthetic identity").selectOption("owner");
  await page.getByRole("button", { name: "Use fixture" }).click();
  await expect(page).toHaveURL(/\/os/);
  await page.goto("/os/workspace");
  await page.getByText(/Model connections \(/).click();
  const suffix = Date.now().toString();
  await page.getByLabel("Connection name").fill("Browser model " + suffix);
  await page
    .getByRole("button", { name: "Connect model", exact: true })
    .click();
  await expect(
    page.getByText("Browser model " + suffix + " · fixture-draft", {
      exact: true,
    }),
  ).toBeVisible();
  await page.getByLabel("Room name").fill("Browser workspace " + suffix);
  await page
    .getByLabel("Project", { exact: true })
    .selectOption("30000000-0000-4000-8000-000000000002");
  await page
    .getByLabel("Room guidelines")
    .fill("Review the evidence before proposing work.");
  await page.getByRole("button", { name: "Create room", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Browser workspace " + suffix,
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Agents", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill("Delivery analyst");
  await page
    .getByLabel("Model connection", { exact: true })
    .selectOption({ label: "Browser model " + suffix + " · fixture-draft" });
  await page
    .getByLabel("Role and objective")
    .fill("Identify the main bottleneck and propose a next step.");
  await page.getByRole("button", { name: "Add agent", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Delivery analyst", exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Conversation", exact: true }).click();
  await page
    .getByLabel("Message", { exact: true })
    .fill("Help improve our customer handoff.");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(
    page
      .getByText("Help improve our customer handoff.", { exact: true })
      .first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Ask agent", exact: true }).click();
  await expect(page.locator(".team-agent-output")).toContainText("SUCCEEDED");
  await expect(page.locator(".team-agent-output")).toContainText(
    "LOCAL DEMONSTRATION",
  );
  const roomUrl = page.url();
  await page.getByRole("tab", { name: "Tasks", exact: true }).click();
  await page
    .getByLabel("Outcome and responsible person")
    .fill("Owner: interview one customer " + suffix);
  await page.getByRole("button", { name: "Propose task", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Owner: interview one customer " + suffix,
      exact: true,
    }),
  ).toBeVisible();
  await page.goto("/os/approvals");
  const approval = page
    .getByRole("region", { name: "Room task approvals" })
    .locator("article")
    .filter({ hasText: "Owner: interview one customer " + suffix });
  await approval
    .getByRole("button", { name: "Approve task", exact: true })
    .click();
  await expect(approval).toHaveCount(0);
  await page.goto("/os/tasks");
  const task = page
    .getByRole("region", { name: "Room tasks", exact: true })
    .locator("article")
    .filter({ hasText: "Owner: interview one customer " + suffix });
  await expect(task).toContainText("APPROVED");
  await task.getByRole("button", { name: "Mark task complete" }).click();
  await expect(task).toContainText("DONE");
  await page.goto("/os/runs");
  await expect(
    page
      .getByRole("region", { name: "Room agent runs" })
      .locator("article")
      .filter({ hasText: "Browser workspace " + suffix }),
  ).toContainText("SUCCEEDED");
  await page.goto(roomUrl);
  await page.getByRole("tab", { name: "Tasks", exact: true }).click();
  await expect(page.getByText("DONE", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Agents", exact: true }).click();
  await page.getByRole("button", { name: "Pause agent", exact: true }).click();
  await expect(page.getByText("Paused", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Conversation", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Ask agent", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("tab", { name: "Agents", exact: true }).click();
  await page.getByRole("button", { name: "Resume agent", exact: true }).click();
  await expect(page.getByText("Active", { exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
});
