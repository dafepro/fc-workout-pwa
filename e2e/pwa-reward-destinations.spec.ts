import { expect, request, test } from "@playwright/test";

import { openReadyPage } from "./app-ready";

const apiBaseURL = process.env.E2E_API_BASE_URL ?? "http://api:8080";
const resetKey = process.env.E2E_RESET_KEY ?? "local-e2e-reset-only";

test.beforeEach(async () => {
  const api = await request.newContext({ baseURL: apiBaseURL });
  const reset = await api.post("/__e2e/reset", {
    headers: { "X-E2E-Reset-Key": resetKey },
  });
  expect(reset.status()).toBe(204);
  await api.dispose();
});

test("an earned Avatar reward saves and reaches Team Lounge after reload", async ({
  page,
}) => {
  await grantRewards(["avatar-head-dog"]);
  await openReadyPage(page, "/prizes/all");

  const reward = page
    .getByRole("listitem")
    .filter({ hasText: "Rover the dog" });
  await expect(reward.getByText("Avatar", { exact: true })).toBeVisible();
  await reward.getByRole("link", { name: "Use in Avatar" }).click();
  await expect(page).toHaveURL(/\/me\/avatar$/);

  const dog = page.getByRole("radio", { name: /Rover the dog.*new/i });
  await expect(dog).toBeEnabled();
  await dog.check();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("status")).toContainText("Avatar saved");

  await page.goto("/team");
  const loungeAvatar = page.getByRole("button", {
    name: "Move Mason’s avatar",
  });
  await expect(loungeAvatar).toBeVisible();
  await expect(
    loungeAvatar.locator('.avatar-art__layer--head ellipse[cx="13"]'),
  ).toBeVisible();
  await page.reload();
  await page.locator("html[data-app-ready='true']").waitFor();
  await expect(
    page
      .getByRole("button", { name: "Move Mason’s avatar" })
      .locator('.avatar-art__layer--head ellipse[cx="13"]'),
  ).toBeVisible();
});

test("an earned Team Lounge stamp enters the supported placement flow", async ({
  page,
}) => {
  await grantRewards(["canvas-stamp-lion"]);
  await recordShowingUpToday();
  await openReadyPage(page, "/prizes/all");

  const reward = page.getByRole("listitem").filter({ hasText: "Lion stamp" });
  await expect(reward.getByText("Team Lounge", { exact: true })).toBeVisible();
  const inventoryLoaded = page.waitForResponse(
    (response) =>
      response.url().includes("/v1/me/unlocks?kind=canvas_stamp") &&
      response.request().method() === "GET",
  );
  await reward.getByRole("link", { name: "Use in Team Lounge" }).click();
  await expect(page).toHaveURL(/\/team$/);
  await expect(page.getByLabel("Hill Striders weekly canvas")).toBeVisible();
  const inventoryResponse = await inventoryLoaded;
  expect(inventoryResponse.status()).toBe(200);
  expect(await inventoryResponse.json()).toMatchObject({
    items: [{ item: { id: "canvas-stamp-lion", assetId: "lion" } }],
  });
  await expect(page.getByText("Loading your stamp collection…")).toHaveCount(0);
  await expect
    .poll(() =>
      page
        .getByRole("button", { name: /Choose .* stamp/ })
        .evaluateAll((buttons) =>
          buttons.map((button) => button.getAttribute("aria-label")),
        ),
    )
    .toContain("Choose Lion stamp, new");

  const placed = page.waitForResponse(
    (response) =>
      response.url().endsWith("/canvas/pieces") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: /Choose Lion stamp.*new/i }).click();
  expect((await placed).status()).toBe(201);
  await expect(
    page.getByRole("button", { name: /Edit Lion live stamp/ }),
  ).toBeVisible();
});

async function grantRewards(itemIds: string[]) {
  const api = await request.newContext({ baseURL: apiBaseURL });
  const response = await api.post("/__e2e/unlocks", {
    headers: { "X-E2E-Reset-Key": resetKey },
    data: { playerId: "player-mason", itemIds },
  });
  expect(response.status()).toBe(204);
  await api.dispose();
}

async function recordShowingUpToday() {
  const api = await request.newContext({ baseURL: apiBaseURL });
  const rest = await api.post("/v1/teams/team-hill-striders/canvas/rest", {
    headers: { Authorization: "Bearer e2e-player-mason" },
    data: {},
  });
  expect(rest.status()).toBe(204);
  const activity = await api.post("/v1/me/training-entries", {
    headers: {
      Authorization: "Bearer e2e-player-mason",
      "Idempotency-Key": "reward-destination-placement",
    },
    data: {
      teamId: "team-hill-striders",
      activityDefinitionId: "hill-sprints",
      assignmentId: "assignment-hill-sprints",
      occurredAt: new Date().toISOString(),
      result: { kind: "repetitions", value: 10, unit: "reps" },
      effortLevel: 4,
      exhaustionLevel: 3,
    },
  });
  expect(activity.status()).toBe(201);
  await api.dispose();
}
