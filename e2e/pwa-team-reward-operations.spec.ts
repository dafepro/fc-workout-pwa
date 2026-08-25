import { expect, request, test, type Page } from "@playwright/test";
import { FIXTURE_TEAM_ID, signInAsCoach } from "./staff-sign-in";

const apiBaseURL = process.env.E2E_API_BASE_URL ?? "http://api:8080";
const resetKey = process.env.E2E_RESET_KEY ?? "local-e2e-reset-only";
const masonHeaders = { Authorization: "Bearer e2e-player-mason" };

test("a team reward moves from camera-photo publication through notices and cancellation at 320 pixels", async ({
  page,
}) => {
  const api = await request.newContext({ baseURL: apiBaseURL });
  expect(
    (
      await api.post("/__e2e/reset", {
        headers: { "X-E2E-Reset-Key": resetKey },
      })
    ).status(),
  ).toBe(204);

  await page.setViewportSize({ width: 320, height: 720 });
  await signInAsCoach(page);
  await page.getByRole("link", { name: "Hill Striders" }).click();
  await page.getByRole("link", { name: "Rewards" }).click();
  await publishConsistencyReward(page);
  await expect(
    page.getByRole("heading", { name: "Active reward" }),
  ).toBeVisible();
  await expectNoOverflow(page);

  const monday = teamWeekday() === "Monday";
  const closeOffsets = monday ? [-6, -5, -4, -3, -2] : [-6, -5, -4, -3];
  for (const [index, offset] of closeOffsets.entries()) {
    const response = await api.post("/v1/me/training-entries", {
      headers: {
        ...masonHeaders,
        "Idempotency-Key": `reward-close-${index}`,
      },
      data: entryForTeamDay(offset),
    });
    expect(response.status()).toBe(201);
  }

  await page.reload();
  await expect(
    page.getByText(/Close: (pending|sent) for 1 staff/),
  ).toBeVisible();
  await expect(
    page.getByRole("progressbar", { name: /Team contribution: (86|100)%/ }),
  ).toBeVisible();

  const achievementOffset = monday ? -1 : -2;
  const achieved = await api.post("/v1/me/training-entries", {
    headers: {
      ...masonHeaders,
      "Idempotency-Key": "reward-achieved",
    },
    data: entryForTeamDay(achievementOffset),
  });
  expect(achieved.status()).toBe(201);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Goal reached!" }),
  ).toBeVisible();
  await expect(
    page.getByText(/Achieved: (pending|sent) for 1 staff/),
  ).toBeVisible();

  await page.getByRole("button", { name: "Create a team reward" }).click();
  await page.getByLabel("Prize name").fill("Next team celebration");
  await page.getByLabel("Start date").fill(teamDate(0));
  await page.getByRole("button", { name: "Publish reward" }).click();
  await expect(
    page.getByRole("heading", { name: "Active reward" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancel reward" }).click();
  await page.getByRole("button", { name: "Yes, cancel reward" }).click();
  await expect(page.getByText("Cancelled reward")).toBeVisible();

  const refused = await page.request.get(
    "/staff/api/backend/v1/staff/teams/team-not-assigned/rewards",
  );
  expect(refused.status()).toBe(404);
  await expectNoOverflow(page);
  await api.dispose();
});

async function publishConsistencyReward(page: Page) {
  await page.getByRole("button", { name: "Create a team reward" }).click();
  await page.getByLabel("Prize name").fill("Team pizza picnic 🍕");
  await page
    .getByLabel("What players should know")
    .fill("Seven days of showing up earns the team a pizza picnic 🍕");
  await page.getByLabel("Prize image (optional)").setInputFiles({
    name: "camera-photo.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64",
    ),
  });
  await expect(page.getByText("Preparing photo…")).toHaveCount(0, {
    timeout: 10_000,
  });
  await page.getByText("Teammate consistency", { exact: true }).click();
  await page
    .getByLabel("What counts as participation?")
    .selectOption("any_approved_workout");
  await page.getByLabel("Number of teammates").fill("1");
  await page.getByLabel("Days per teammate").fill("7");
  await page.getByLabel("Start date").fill(teamDate(-6));
  await page.getByRole("button", { name: "Publish reward" }).click();
}

function entryForTeamDay(offset: number) {
  return {
    teamId: FIXTURE_TEAM_ID,
    activityDefinitionId: "hill-sprints",
    occurredAt: `${teamDate(offset)}T18:00:00Z`,
    result: { kind: "repetitions", value: 8, unit: "reps" },
    effortLevel: 4,
    exhaustionLevel: 3,
  };
}

function teamDate(offset: number) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = new Date(
    Date.UTC(
      Number(parts.find((part) => part.type === "year")?.value),
      Number(parts.find((part) => part.type === "month")?.value) - 1,
      Number(parts.find((part) => part.type === "day")?.value) + offset,
    ),
  );
  return value.toISOString().slice(0, 10);
}

function teamWeekday() {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    weekday: "long",
  }).format(new Date());
}

async function expectNoOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    ),
  ).toBe(false);
}
