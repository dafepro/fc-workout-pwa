import { expect, request, test } from "@playwright/test";
import { openReadyPage } from "./app-ready";

const apiBaseURL = process.env.E2E_API_BASE_URL ?? "http://api:8080";
const resetKey = process.env.E2E_RESET_KEY ?? "local-e2e-reset-only";

test.beforeEach(async () => {
  const api = await request.newContext({ baseURL: apiBaseURL });
  const response = await api.post("/__e2e/reset", {
    headers: { "X-E2E-Reset-Key": resetKey },
  });
  expect(response.status()).toBe(204);
  await api.dispose();
});

test("the consolidated default opens one durable Daily Drop", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await openReadyPage(page, "/");

  const claimed = page.waitForResponse(
    (response) =>
      response.url().includes("/api/zoomigo/v1/me/daily-drop/claim") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Open today’s drop" }).click();
  expect([200, 201]).toContain((await claimed).status());
  await expect(page.getByRole("status")).toContainText("Unlocked:");

  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Collected today" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Open today’s drop" }),
  ).toHaveCount(0);
});

test("the consolidated default completes today's plan and opens Team Canvas", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await openReadyPage(page, "/");

  await expect(
    page.getByRole("heading", { name: "Hill Sprints" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /Team lounge/ })).toHaveAttribute(
    "href",
    "/team",
  );
  await expect(page.getByText("Leaders")).toHaveCount(0);

  await page.getByRole("button", { name: "Log today’s plan" }).click();
  await page.getByRole("button", { name: "Reach · 10 reps" }).click();
  const effort = page.getByRole("slider", { name: "Effort" });
  const tiredness = page.getByRole("slider", { name: "Tiredness" });
  await effort.fill("5");
  await tiredness.fill("4");

  const created = page.waitForResponse(
    (response) =>
      response.url().includes("/api/zoomigo/v1/me/training-entries") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Save workout" }).click();
  expect((await created).status()).toBe(201);

  await expect(
    page.getByRole("heading", { name: "Today is in the books" }),
  ).toBeVisible();
  await page.getByRole("link", { name: /Join Team lounge/ }).click();
  await expect(page).toHaveURL(/\/team$/);
  await expect(page.getByLabel("Hill Striders weekly canvas")).toBeVisible();
  await expect(page.getByText(/stamp ready/)).toBeVisible();
  await expect(page.getByText("Canvas dev console")).toHaveCount(0);
  await expect(page.getByText(/effort|tired|result/i)).toHaveCount(0);

  const api = await request.newContext({ baseURL: apiBaseURL });
  const dashboard = await api.get(
    "/v1/me/training-dashboard?teamId=team-hill-striders",
    { headers: { Authorization: "Bearer e2e-player-mason" } },
  );
  expect(dashboard.ok()).toBe(true);
  expect((await dashboard.json()).currentAssignment.completed).toBe(true);
  await api.dispose();
});

test("Classic Alpha remains available under Me", async ({ page }) => {
  await openReadyPage(page, "/me");
  await page.getByRole("link", { name: /Classic Alpha/ }).click();
  await expect(page).toHaveURL(/\/classic-alpha$/);
  await expect(
    page.getByRole("navigation", { name: "Primary navigation" }),
  ).toContainText("Leaders");
  await expect(
    page.getByRole("heading", { name: "Hill Sprints" }),
  ).toBeVisible();
});
