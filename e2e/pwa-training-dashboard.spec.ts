import {
  expect,
  request,
  test,
  type APIRequestContext,
} from "@playwright/test";
import { openReadyPage } from "./app-ready";

const apiBaseURL = process.env.E2E_API_BASE_URL ?? "http://api:8080";
const resetKey = process.env.E2E_RESET_KEY ?? "local-e2e-reset-only";

async function playerEffort(api: APIRequestContext): Promise<number> {
  const response = await api.get(
    "/v1/teams/team-hill-striders/leaderboards?period=weekly&metric=effort",
    { headers: { Authorization: "Bearer e2e-player-mason" } },
  );
  expect(response.ok()).toBe(true);
  const body = (await response.json()) as {
    items: Array<{ playerId: string; value: number }>;
  };
  const value = body.items.find(
    (item) => item.playerId === "player-mason",
  )?.value;
  expect(value).toBeDefined();
  return value as number;
}

test.beforeEach(async () => {
  const api = await request.newContext({ baseURL: apiBaseURL });
  const response = await api.post("/__e2e/reset", {
    headers: { "X-E2E-Reset-Key": resetKey },
  });
  expect(response.status()).toBe(204);
  await api.dispose();
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
  await page.setViewportSize({ width: 320, height: 700 });
  await openReadyPage(page, "/");
  await expect(
    page.getByRole("heading", { name: "Hill Sprints" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Started" })).toBeVisible();
  await expect(page.getByText("8 Momentum", { exact: true })).toBeVisible();
  await expect(
    page.getByText("2-day check-in streak", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("progressbar", { name: "Momentum: 8 out of 100" }),
  ).toHaveAttribute("aria-valuenow", "8");

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
  const challenge = page.getByRole("region", { name: "Hill Sprints" });
  await expect(
    challenge.getByText("1 of 12 teammates completed"),
  ).toBeVisible();
  await expect(
    challenge.locator(".challenge-participants .avatar--self"),
  ).toHaveAttribute("aria-label", /, you$/);
  await expect(
    challenge.locator(".challenge-participants").getByText("You", {
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(challenge.getByText(/tired|effort|result/i)).toHaveCount(0);

  const api = await request.newContext({ baseURL: apiBaseURL });
  const dashboard = await api.get(
    "/v1/me/training-dashboard?teamId=team-hill-striders",
    { headers: { Authorization: "Bearer e2e-player-mason" } },
  );
  expect(dashboard.ok()).toBe(true);
  expect((await dashboard.json()).currentAssignment.completed).toBe(true);

  const firstEffort = await playerEffort(api);

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

  const secondEffort = await playerEffort(api);
  expect(secondEffort).toBe(firstEffort);

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
