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

test("the consolidated default opens one durable prize box", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await openReadyPage(page, "/");

  await expect(
    page.getByRole("link", { name: /View prize boxes/ }),
  ).toBeVisible();
  await page.getByRole("link", { name: /View prize boxes/ }).click();
  await expect(page).toHaveURL(/\/prizes$/);
  await expectNoHorizontalOverflow(page);

  const claimed = page.waitForResponse(
    (response) =>
      response.url().includes("/api/zoomigo/v1/me/daily-drop/claim") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Open prize box" }).click();
  expect([200, 201]).toContain((await claimed).status());
  await expect(page.getByRole("status")).toContainText("Unlocked:");

  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Collected today" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Open prize box" }),
  ).toHaveCount(0);

  await page.goto("/");
  await page.getByRole("link", { name: /Your momentum/ }).click();
  await expect(page).toHaveURL(/\/progress$/);
  await expect(
    page.getByRole("heading", { name: "Your momentum" }),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("three proven plan days add an independent claimable prize box", async ({
  page,
}) => {
  await seedThreeCompletedPlanDays();
  await page.setViewportSize({ width: 320, height: 700 });
  await openReadyPage(page, "/");

  await expect(page.getByRole("status")).toContainText("Prize box earned!");
  await expect(page.getByText("2 unopened")).toBeVisible();
  await page.getByRole("link", { name: /View prize boxes/ }).click();
  await expect(
    page.getByText("Earned for completing 3 days in your coach plan."),
  ).toBeVisible();

  await page.getByRole("button", { name: "Open prize box" }).click();
  await page.getByRole("button", { name: "Open another prize box" }).click();
  await expect(page.getByText("1 box ready to open")).toBeVisible();
  await page.getByRole("button", { name: "Open prize box" }).click();
  await expect(
    page.getByRole("button", { name: /Open .*prize box/ }),
  ).toHaveCount(0);

  await page.goto("/");
  await expect(page.getByText(/unopened/)).toHaveCount(0);
  await expect(
    page.getByText("Prize box earned! Saved to Prize boxes."),
  ).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
});

test("the consolidated default completes today's plan and opens Team Canvas", async ({
  page,
}) => {
  await seedTeamPulse();
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
  await expectNoHorizontalOverflow(page);

  const startWorkout = page.getByRole("button", { name: "Start workout" });
  await startWorkout.focus();
  await expect(startWorkout).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("button", { name: "Save workout" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await startWorkout.click();
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

  await expect(page.getByText("Today complete", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Hill Sprints" }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByText("Today complete", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Hill Sprints" }),
  ).toBeVisible();
  await page.getByRole("link", { name: /Team lounge/ }).click();
  await expect(page).toHaveURL(/\/team$/);
  const pulse = page.getByRole("region", { name: "Latest from your team" });
  await expect(pulse.getByRole("listitem")).toHaveCount(3);
  await pulse.getByRole("button", { name: "Show more team activity" }).click();
  await expect(pulse.getByRole("listitem")).toHaveCount(5);
  const cheer = pulse.getByRole("button", { name: /^Cheer / }).first();
  await cheer.click();
  await expect(
    pulse.getByRole("button", { name: /^Cheered for / }),
  ).toBeVisible();
  await expect(page.getByLabel("Hill Striders weekly canvas")).toBeVisible();
  await expect(page.getByText(/stamp ready/)).toBeVisible();
  await expect(page.getByText("Canvas dev console")).toHaveCount(0);
  await expect(page.getByText(/effort|tired|result/i)).toHaveCount(0);
  await expectNoHorizontalOverflow(page);

  const api = await request.newContext({ baseURL: apiBaseURL });
  const dashboard = await api.get(
    "/v1/me/training-dashboard?teamId=team-hill-striders",
    { headers: { Authorization: "Bearer e2e-player-mason" } },
  );
  expect(dashboard.ok()).toBe(true);
  expect((await dashboard.json()).currentAssignment.completed).toBe(true);
  await api.dispose();
});

test("Today keeps the full coach plan compact and future details time-gated", async ({
  page,
}) => {
  await publishPlan("speed-recovery-v1", teamDate(0));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 320, height: 700 });
  await openReadyPage(page, "/");
  expect(
    await page.evaluate(
      () => matchMedia("(prefers-reduced-motion: reduce)").matches,
    ),
  ).toBe(true);

  const week = page.getByRole("region", { name: "Your 7-day plan" });
  await expect(week.getByRole("listitem")).toHaveCount(7);
  await expect(week.getByLabel(/^Locked /)).toHaveCount(6);
  await week.getByRole("link", { name: /View full 7-day plan/ }).click();
  await expect(page).toHaveURL(/\/plan$/);
  await expect(page.getByRole("link", { name: /Back to Today/ })).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(7);
  await expectNoHorizontalOverflow(page);

  await page
    .getByRole("link", { name: /Recovery walk or jog/ })
    .first()
    .click();
  await expect(page.getByText(/Come back/)).toBeVisible();
  await expect(page.getByRole("link", { name: /Your plan/ })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("a connected planned recovery day checks in without becoming a workout", async ({
  page,
}) => {
  await publishPlan("in-season-balance-v1", teamDate(-3));
  await page.setViewportSize({ width: 320, height: 700 });
  await openReadyPage(page, "/");

  await expect(
    page.getByRole("heading", { name: "Planned recovery day" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Start recovery day" }).click();
  const recorded = page.waitForResponse(
    (response) =>
      response.url().includes("/canvas/rest") &&
      response.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Complete recovery check-in" })
    .click();
  expect((await recorded).status()).toBe(204);
  await expect(page.getByText("Today complete", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Planned recovery day" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Start workout" })).toHaveCount(
    0,
  );
  await expectNoHorizontalOverflow(page);
});

async function expectNoHorizontalOverflow(
  page: import("@playwright/test").Page,
) {
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    )
    .toBe(true);
}

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
  const plan = (await response.json()) as { id: string };
  await api.dispose();
  return plan;
}

async function seedThreeCompletedPlanDays() {
  const startsOn = teamDate(-2);
  const plan = await publishPlan("in-season-balance-v1", startsOn);
  const api = await request.newContext({ baseURL: apiBaseURL });
  const days = [
    {
      dayIndex: 0,
      activityDefinitionId: "hill-sprints",
      result: { kind: "repetitions", value: 8, unit: "reps" },
    },
    {
      dayIndex: 1,
      activityDefinitionId: "recovery-walk-jog",
      result: { kind: "duration", value: 15, unit: "minutes" },
    },
    {
      dayIndex: 2,
      activityDefinitionId: "timed-run-walk",
      result: { kind: "duration", value: 20, unit: "minutes" },
    },
  ];
  for (const day of days) {
    const response = await api.post("/v1/me/training-entries", {
      headers: {
        Authorization: "Bearer e2e-player-mason",
        "Idempotency-Key": `plan-prize-day-${day.dayIndex}`,
      },
      data: {
        teamId: "team-hill-striders",
        activityDefinitionId: day.activityDefinitionId,
        occurredAt: `${teamDate(day.dayIndex - 2)}T18:00:00Z`,
        result: day.result,
        effortLevel: 4,
        exhaustionLevel: 3,
        plan: {
          planId: plan.id,
          dayIndex: day.dayIndex,
          blockIndex: 0,
        },
      },
    });
    expect(response.status()).toBe(201);
  }
  await api.dispose();
}

async function seedTeamPulse() {
  const api = await request.newContext({ baseURL: apiBaseURL });
  const players = ["ava", "liam", "noah", "zoe", "jayden"];
  for (const player of players) {
    const response = await api.post("/v1/me/training-entries", {
      headers: {
        Authorization: `Bearer e2e-player-${player}`,
        "Idempotency-Key": `team-pulse-${player}`,
      },
      data: {
        teamId: "team-hill-striders",
        activityDefinitionId: "hill-sprints",
        occurredAt: new Date().toISOString(),
        result: { kind: "repetitions", value: 8, unit: "reps" },
        effortLevel: 4,
        exhaustionLevel: 3,
      },
    });
    expect(response.status()).toBe(201);
  }
  await api.dispose();
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
