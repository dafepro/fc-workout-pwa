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

test("the Team Hub deduplicates positive activity and lazily opens Lounge", async ({
  page,
}) => {
  const api = await request.newContext({ baseURL: apiBaseURL });
  const completion = await api.post("/v1/me/training-entries", {
    headers: {
      Authorization: "Bearer e2e-player-ava",
      "Idempotency-Key": "team-hub-ava-challenge",
    },
    data: challengeEntry(),
  });
  expect(completion.status()).toBe(201);

  const prematureLoungeRequests: string[] = [];
  page.on("request", (outgoing) => {
    const url = outgoing.url();
    if (
      url.includes("canvas.worker") ||
      url.includes("/lounge/socket-ticket") ||
      url.includes("/v1/realtime/rooms/")
    ) {
      prematureLoungeRequests.push(url);
    }
  });
  await page.setViewportSize({ width: 320, height: 700 });
  await openReadyPage(page, "/team");

  await expect(
    page.getByRole("heading", { name: "Hill Striders" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "This week" })).toBeVisible();
  await expect(page.getByText("1 of 12 teammates completed")).toBeVisible();
  const activity = page.getByRole("region", { name: "Teammate activity" });
  const avaRows = activity.getByRole("listitem").filter({ hasText: "Ava R." });
  await expect(avaRows).toHaveCount(1);
  await expect(
    avaRows.getByRole("button", {
      name: "Cheer for Ava R. for Hill Sprints challenge",
    }),
  ).toHaveCount(1);
  await expect(page.getByText(/0 of 3/i)).toHaveCount(0);
  await expect(page.getByText(/3 active days in 5/i)).toHaveCount(0);
  const loungePreview = page.locator(".team-lounge-preview__art img");
  await expect(loungePreview).toBeVisible();
  await expect
    .poll(() =>
      loungePreview.evaluate(
        (image) =>
          (image as HTMLImageElement).complete &&
          (image as HTMLImageElement).naturalWidth > 0,
      ),
    )
    .toBe(true);
  expect(prematureLoungeRequests).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - innerWidth,
    ),
  ).toBeLessThanOrEqual(1);

  const hubResponse = await api.get("/v1/teams/team-hill-striders/hub", {
    headers: { Authorization: "Bearer e2e-player-mason" },
  });
  expect(hubResponse.ok()).toBe(true);
  const hubBody = JSON.stringify(await hubResponse.json());
  for (const forbidden of [
    "resultValue",
    "resultUnit",
    "weeklySessions",
    "exhaustion",
    "occurredAt",
    "assessment",
  ]) {
    expect(hubBody).not.toContain(forbidden);
  }

  await avaRows.getByRole("button", { name: /Cheer for Ava R\./ }).click();
  const picker = page.getByRole("dialog", { name: "Cheer for Ava" });
  await expect(picker.getByText("For Hill Sprints challenge")).toBeVisible();
  await picker.getByRole("button", { name: "Send Strong to Ava" }).click();
  await expect(page.getByRole("status")).toContainText("Ava");
  await expect(picker).toBeHidden();
  const inbox = await api.get("/v1/me/reaction-badges", {
    headers: { Authorization: "Bearer e2e-player-ava" },
  });
  expect(inbox.ok()).toBe(true);
  expect(JSON.stringify(await inbox.json())).toContain(
    "Hill Sprints challenge",
  );

  const openLounge = page.getByRole("button", { name: "Open Lounge" });
  await openLounge.click();
  await expect(page).toHaveURL(/\/team\?view=lounge$/);
  const lounge = page.getByRole("region", {
    name: "Beach Boardwalk Team Lounge",
  });
  await expect(lounge).toBeVisible();
  await expect(lounge.locator("canvas")).toBeVisible({ timeout: 10_000 });
  expect(prematureLoungeRequests.length).toBeGreaterThan(0);

  await page.goBack();
  await expect(page).toHaveURL(/\/team$/);
  await expect(openLounge).toBeFocused();
  await api.dispose();
});

function challengeEntry() {
  return {
    teamId: "team-hill-striders",
    activityDefinitionId: "hill-sprints",
    assignmentId: "assignment-hill-sprints",
    occurredAt: new Date(Date.now() - 60_000).toISOString(),
    result: { kind: "repetitions", value: 8, unit: "reps" },
    effortLevel: 4,
    exhaustionLevel: 3,
    completionOutcome: "as_listed",
  };
}
