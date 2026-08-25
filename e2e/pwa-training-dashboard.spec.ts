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

test("the consolidated default claims, opens, and keeps one sealed prize box", async ({
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
      response.url().includes("/api/zoomigo/v1/me/prize-boxes/claim-daily") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Claim daily box" }).click();
  const claimedResponse = await claimed;
  expect(claimedResponse.status()).toBe(201);
  const claimedBody = await claimedResponse.json();
  const claimKey = claimedResponse.request().headers()["idempotency-key"];
  expect(claimKey).toBeTruthy();
  const claimReplay = await page.request.post(
    "/api/zoomigo/v1/me/prize-boxes/claim-daily",
    { headers: { "Idempotency-Key": claimKey } },
  );
  expect(claimReplay.status()).toBe(200);
  expect((await claimReplay.json()).box.id).toBe(claimedBody.box.id);
  await expect(page.getByRole("status")).toContainText("Daily box claimed");
  await expect(page.getByText("1 to open")).toBeVisible();

  const opened = page.waitForResponse(
    (response) =>
      /\/api\/zoomigo\/v1\/me\/prize-boxes\/[^/]+\/open$/.test(
        response.url(),
      ) && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Open Daily freebie box" }).click();
  const openedResponse = await opened;
  expect(openedResponse.status()).toBe(201);
  const openedBody = await openedResponse.json();
  const openKey = openedResponse.request().headers()["idempotency-key"];
  expect(openKey).toBeTruthy();
  const openReplay = await page.request.post(
    `/api/zoomigo/v1/me/prize-boxes/${claimedBody.box.id}/open`,
    { headers: { "Idempotency-Key": openKey } },
  );
  expect(openReplay.status()).toBe(200);
  expect((await openReplay.json()).claim).toEqual(openedBody.claim);
  const reveal = page.getByRole("dialog", { name: "Zoomi found something!" });
  await expect(reveal).toBeVisible();
  await expect(reveal.getByRole("status")).toBeVisible();
  await expect(reveal.getByRole("link", { name: /^Use / })).toBeVisible();
  await reveal.getByRole("button", { name: "Keep in collection" }).click();

  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Recently earned" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Claim daily box" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Open Daily freebie box" }),
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
  await expect(page.getByText("1 unopened")).toBeVisible();
  await page.getByRole("link", { name: /View prize boxes/ }).click();
  await expect(
    page.getByRole("button", { name: "Open From workouts box" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Claim daily box" }).click();
  await expect(page.getByText("2 waiting")).toBeVisible();

  await page.getByRole("button", { name: "Open From workouts box" }).click();
  await page.getByRole("button", { name: "Keep in collection" }).click();
  await page.getByRole("button", { name: "Open Daily freebie box" }).click();
  await page.getByRole("button", { name: "Keep in collection" }).click();
  await expect(page.getByRole("button", { name: /^Open .* box$/ })).toHaveCount(
    0,
  );

  await page.goto("/");
  await expect(page.getByText(/unopened/)).toHaveCount(0);
  await expect(
    page.getByText("Prize box earned! Saved to Prize boxes."),
  ).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
});

test("Today displays and persists the coach-plan duration instead of the catalog default", async ({
  page,
}) => {
  await publishPlan("quick-check-in-v1", teamDate(0));
  await page.setViewportSize({ width: 320, height: 700 });
  await openReadyPage(page, "/");

  await expect(
    page.getByRole("heading", { name: "Timed Run / Walk" }),
  ).toBeVisible();
  await expect(page.getByText("15 min · Easy")).toBeVisible();
  await expect(page.getByText("Goal · 15 minutes")).toBeVisible();
  await expect(page.getByText("Goal · 20 minutes")).toHaveCount(0);

  await page.getByRole("button", { name: "Start workout" }).click();
  const created = page.waitForResponse(
    (response) =>
      response.url().includes("/api/zoomigo/v1/me/training-entries") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Save workout" }).click();
  const response = await created;
  expect(response.status()).toBe(201);
  expect(await response.json()).toMatchObject({
    result: { kind: "duration", value: 15, unit: "minutes" },
    plan: { dayIndex: 0, blockIndex: 0 },
  });
  await expect(page.getByText("Today complete", { exact: true })).toBeVisible();
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
  await expect(page.getByRole("button", { name: "Did it!" })).toHaveCSS(
    "color",
    "rgb(32, 53, 0)",
  );
  await expect(page.getByRole("button", { name: "Almost…" })).toHaveCSS(
    "color",
    "rgb(23, 52, 42)",
  );
  await page.getByRole("button", { name: "Cancel" }).click();
  await startWorkout.click();
  await page.getByRole("button", { name: "Extra!" }).click();
  await page.getByText("Add a note").click();
  await page
    .getByRole("textbox", { name: "Workout note" })
    .fill("Felt strong after the warm-up.");
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
  const createdResponse = await created;
  expect(createdResponse.status()).toBe(201);
  expect(await createdResponse.json()).toMatchObject({
    completionOutcome: "extra",
    note: "Felt strong after the warm-up.",
  });

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

test("coach quick plans keep structured edits and linked reschedule history", async () => {
  const api = await request.newContext({ baseURL: apiBaseURL });
  const headers = { Authorization: "Bearer e2e-coach-hill" };
  const templates = await api.get("/v1/staff/training-plan-templates", {
    headers,
  });
  expect(templates.ok()).toBe(true);
  const quick = (await templates.json()).templates.find(
    (template: { id: string }) => template.id === "quick-check-in-v1",
  );
  expect(quick).toBeTruthy();
  quick.days[0].durationMinutes = 10;
  quick.days[0].blocks[0].durationMinutes = 10;

  const published = await api.post(
    "/v1/staff/teams/team-hill-striders/training-plans",
    {
      headers,
      data: {
        templateId: quick.id,
        startsOn: "2099-08-24",
        days: quick.days,
      },
    },
  );
  expect(published.status()).toBe(201);
  const original = await published.json();
  expect(original.days).toMatchObject([
    { durationMinutes: 10, blocks: [{ durationMinutes: 10 }] },
  ]);

  const rescheduled = await api.post(
    `/v1/staff/teams/team-hill-striders/training-plans/${original.id}/reschedule`,
    {
      headers,
      data: {
        templateId: quick.id,
        startsOn: "2099-08-25",
        days: quick.days,
      },
    },
  );
  expect(rescheduled.status()).toBe(201);
  const replacement = await rescheduled.json();
  expect(replacement.replacesPlanId).toBe(original.id);

  const history = await api.get(
    "/v1/staff/teams/team-hill-striders/training-plans",
    { headers },
  );
  const plans = (await history.json()).plans;
  expect(
    plans.find((plan: { id: string }) => plan.id === original.id),
  ).toMatchObject({
    status: "cancelled",
    replacedByPlanId: replacement.id,
  });

  const cancelled = await api.post(
    `/v1/staff/teams/team-hill-striders/training-plans/${replacement.id}/cancel`,
    { headers },
  );
  expect(cancelled.status()).toBe(200);
  expect((await cancelled.json()).status).toBe("cancelled");
  await api.dispose();
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
