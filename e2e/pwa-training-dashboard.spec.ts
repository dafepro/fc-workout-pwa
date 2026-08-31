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

test("connected failures never fall through to prototype identity or progress", async ({
  page,
}) => {
  const serverSummary = await playerDashboardSummary();
  await page.setViewportSize({ width: 320, height: 700 });
  await openReadyPage(page, "/");
  await expect(
    page.getByText(`${serverSummary.momentumScore} Momentum`, { exact: true }),
  ).toBeVisible();

  await page.route("**/api/zoomigo/v1/me/training-dashboard?*", async (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "dashboard_unavailable" } }),
    }),
  );
  await page.reload();
  await expect(
    page.getByRole("heading", {
      name: "Your training plan could not be loaded",
    }),
  ).toBeVisible();
  await expect(page.getByText("68 Momentum", { exact: true })).toHaveCount(0);
  await page.unroute("**/api/zoomigo/v1/me/training-dashboard?*");

  await page.route("**/api/auth/session", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    return route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "session_unavailable" } }),
    });
  });
  await page.reload();
  await expect(page.getByRole("alert")).toContainText(
    "ZoomiGo is taking a breather",
  );
  await expect(page.getByText(/Mason|Hill Striders/u)).toHaveCount(0);
});

test("Today logs the coach-plan duration instead of the catalog default", async ({
  page,
}) => {
  await publishPlan("quick-check-in-v1", teamDate(0));
  await page.setViewportSize({ width: 320, height: 700 });
  await openReadyPage(page, "/");

  await expect(
    page.getByRole("heading", { name: "Timed Run / Walk" }),
  ).toBeVisible();
  await expect(page.getByText("15 min", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: /Record this workout/i }).click();
  await expect(
    page.getByRole("spinbutton", { name: "Elapsed minutes" }),
  ).toHaveValue("15");

  const created = page.waitForResponse(
    (response) =>
      response.url().includes("/api/zoomigo/v1/me/training-entries") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Save" }).click();
  const response = await created;
  expect(response.status()).toBe(201);
  expect(await response.json()).toMatchObject({
    result: { kind: "duration", value: 15, unit: "minutes" },
    plan: { dayIndex: 0, blockIndex: 0 },
  });
});

test("connected Today and activity logging use the server assignment", async ({
  page,
}) => {
  const serverSummary = await playerDashboardSummary();
  await page.setViewportSize({ width: 320, height: 700 });
  await openReadyPage(page, "/");
  await expect(
    page.getByRole("heading", { name: "Hill Sprints" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Started" })).toBeVisible();
  await expect(
    page.getByText(`${serverSummary.momentumScore} Momentum`, { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(
      `${serverSummary.currentCheckInStreak}-day check-in streak`,
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("progressbar", {
      name: `Momentum: ${serverSummary.momentumScore} out of 100`,
    }),
  ).toHaveAttribute("aria-valuenow", String(serverSummary.momentumScore));
  await expect(page.getByRole("heading", { name: "My Sessions" })).toHaveCount(
    0,
  );
  const secondaryActions = page.getByRole("list", {
    name: "Other things you can do",
  });
  await expect(secondaryActions.getByRole("listitem")).toHaveCount(4);
  await expect(
    secondaryActions.getByRole("link", { name: /Your momentum/i }),
  ).toHaveAttribute("href", "/progress");
  await secondaryActions.getByRole("link", { name: /Your momentum/i }).click();
  await expect(page).toHaveURL(/\/progress$/);
  await expect(
    page.getByRole("heading", { name: "Your momentum" }),
  ).toBeVisible();
  await expect(
    page.getByRole("progressbar", {
      name: `Momentum: ${serverSummary.momentumScore} out of 100`,
    }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Today" }).click();

  await page.getByRole("link", { name: /Record this workout/i }).click();
  await expect(
    page.getByRole("link", { name: "Close training entry" }),
  ).toHaveCount(0);
  await expect(
    page
      .locator(".selected-activity")
      .getByText("Hill Sprints", { exact: true }),
  ).toBeVisible();
  await page.locator(".selected-activity").click();
  await expect(page.locator(".activity-options")).toBeVisible();
  await expect(
    page.getByRole("radio", { name: /Distance Run/i }),
  ).toBeVisible();
  await page.getByRole("button", { name: "How to do Distance Run" }).click();
  await expect(page.getByText("How to do Distance Run")).toBeVisible();
  await page.keyboard.press("Escape");

  const effort = page.getByRole("slider", {
    name: "How hard did you work?",
  });
  const tiredness = page.getByRole("slider", {
    name: "How tired were you after?",
  });
  await expect(effort).toHaveValue("4");
  await expect(tiredness).toHaveValue("4");
  const outcome = page.getByRole("group", { name: "Did you finish?" });
  await expect(
    outcome.getByRole("button", { name: "Did it!" }),
  ).toHaveAttribute("aria-pressed", "true");
  await effort.focus();
  await page.keyboard.press("ArrowRight");
  await tiredness.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(effort).toHaveValue("5");
  await expect(tiredness).toHaveValue("3");

  const createResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/api/zoomigo/v1/me/training-entries") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Save" }).click();
  expect((await createResponse).ok()).toBe(true);

  await expect(
    page.getByRole("heading", { name: "Done for today!" }),
  ).toBeVisible();
  await expect(page.getByText("Hill Sprints complete")).toBeVisible();
  await expect(
    page.getByText("Nice work—your effort helped Hill Striders move forward."),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "See team progress" }),
  ).toBeVisible();
  await expect(page.locator(".today-plan-hero.is-celebrating")).toBeVisible();

  await page.getByRole("link", { name: "See team progress" }).click();
  await expect(
    page.getByRole("heading", { name: "Teammate activity" }),
  ).toBeVisible();
  const teamActivity = page.getByRole("region", {
    name: "Teammate activity",
  });
  await teamActivity.getByRole("button", { name: /Cheer for Ava R\./ }).click();
  const teamPicker = page.getByRole("dialog", { name: "Cheer for Ava" });
  await teamPicker.getByRole("button", { name: "Send Clap to Ava" }).click();
  await expect(page.locator(".reaction-sent-status")).toContainText(
    "sent to Ava",
  );
  const challenge = page.getByRole("region", { name: "This week" });
  await expect(
    challenge.getByText("1 of 12 teammates completed"),
  ).toBeVisible();
  await expect(challenge.getByText(/tired|effort|result/i)).toHaveCount(0);

  const api = await request.newContext({ baseURL: apiBaseURL });
  const dashboard = await api.get(
    "/v1/me/training-dashboard?teamId=team-hill-striders",
    { headers: { Authorization: "Bearer e2e-player-mason" } },
  );
  expect(dashboard.ok()).toBe(true);
  expect((await dashboard.json()).currentAssignment.completed).toBe(true);

  await page.getByRole("link", { name: "Today" }).click();
  await page.getByRole("link", { name: /Log another activity/i }).click();
  await page
    .getByRole("button", { name: "Choose an activity", exact: true })
    .click();
  await page.getByRole("radio", { name: /^Distance Run/i }).click();
  const secondCreateResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/api/zoomigo/v1/me/training-entries") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: /^Save / }).click();
  expect((await secondCreateResponse).ok()).toBe(true);

  await expect(
    page.getByRole("heading", { name: "Done for today!" }),
  ).toBeVisible();
  await expect(page.locator(".today-plan-hero.is-celebrating")).toHaveCount(0);

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/?saved=1&completed=1");
  const completionHero = page.locator(".today-plan-hero.is-celebrating");
  await expect(completionHero).toBeVisible();
  await expect
    .poll(() =>
      completionHero.evaluate(
        (element) => getComputedStyle(element).animationName,
      ),
    )
    .toBe("none");
  await api.dispose();
});

async function publishPlan(templateId: string, startsOn: string) {
  const api = await request.newContext({ baseURL: apiBaseURL });
  const response = await api.post(
    "/v1/staff/teams/team-hill-striders/training-plans",
    {
      headers: { Authorization: "Bearer e2e-coach-hill" },
      data: { templateId, startsOn },
    },
  );
  expect(response.status()).toBe(201);
  await api.dispose();
}

async function playerDashboardSummary(): Promise<{
  momentumScore: number;
  currentCheckInStreak: number;
}> {
  const api = await request.newContext({ baseURL: apiBaseURL });
  const response = await api.get(
    "/v1/me/training-dashboard?teamId=team-hill-striders",
    { headers: { Authorization: "Bearer e2e-player-mason" } },
  );
  expect(response.ok()).toBe(true);
  const dashboard = (await response.json()) as {
    summary: { momentumScore: number; currentCheckInStreak: number };
  };
  await api.dispose();
  return dashboard.summary;
}

function teamDate(offsetDays: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offsetDays);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}
