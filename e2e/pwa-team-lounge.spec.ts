import { expect, request, test } from "@playwright/test";

import { loginAsAva, openReadyPage } from "./app-ready";

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

test("the consolidated Team view opens the canonical canvas Lounge at 320 pixels", async ({
  page,
}) => {
  const api = await request.newContext({ baseURL: apiBaseURL });
  const completion = await api.post("/v1/me/training-entries", {
    headers: {
      Authorization: "Bearer e2e-player-mason",
      "Idempotency-Key": "browser-lounge-today-qualification",
    },
    data: {
      teamId: "team-hill-striders",
      activityDefinitionId: "hill-sprints",
      assignmentId: "assignment-hill-sprints",
      occurredAt: new Date(Date.now() - 60_000).toISOString(),
      result: { kind: "repetitions", value: 8, unit: "reps" },
      effortLevel: 4,
      exhaustionLevel: 3,
      completionOutcome: "as_listed",
    },
  });
  expect(completion.status()).toBe(201);
  await api.dispose();

  await page.setViewportSize({ width: 320, height: 720 });
  await openReadyPage(page, "/team");

  const lounge = page.getByRole("region", {
    name: "Beach Boardwalk Team Lounge",
  });
  await expect(lounge).toBeVisible();
  const stage = lounge.getByLabel("Interactive lounge canvas");
  await expect(stage).toBeVisible();
  await expect(stage.locator("canvas")).toBeVisible({ timeout: 15_000 });
  await expect(
    lounge.getByText("Press your player, then drag to move."),
  ).toBeVisible();
  await expect(lounge.getByLabel("Mason C., you")).toBeVisible();

  const playerName = lounge.getByText("You", { exact: true });
  await expect(playerName).toBeVisible();
  const startingPlayer = await playerName.boundingBox();
  expect(startingPlayer).not.toBeNull();
  const canvas = stage.locator("canvas");
  const canvasBox = await canvas.boundingBox();
  expect(canvasBox).not.toBeNull();
  await page.mouse.move(
    startingPlayer!.x + startingPlayer!.width / 2,
    startingPlayer!.y + 30,
  );
  await page.mouse.down();
  await page.mouse.move(
    Math.min(startingPlayer!.x + 55, canvasBox!.x + canvasBox!.width - 8),
    startingPlayer!.y + 30,
    { steps: 8 },
  );
  await page.mouse.up();
  await expect
    .poll(async () => (await playerName.boundingBox())?.x ?? startingPlayer!.x)
    .toBeGreaterThan(startingPlayer!.x + 3);

  await expect(lounge.getByRole("combobox")).toHaveCount(0);
  await expect(lounge).not.toContainText(/\bV[12]\b|alternative|preview/i);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
});

test("two qualified players share Lounge presence and avatar movement", async ({
  browser,
  page,
}) => {
  const api = await request.newContext({ baseURL: apiBaseURL });
  for (const player of ["mason", "ava"]) {
    const completion = await api.post("/v1/me/training-entries", {
      headers: {
        Authorization: `Bearer e2e-player-${player}`,
        "Idempotency-Key": `browser-lounge-two-player-${player}`,
      },
      data: {
        teamId: "team-hill-striders",
        activityDefinitionId: "hill-sprints",
        assignmentId: "assignment-hill-sprints",
        occurredAt: new Date(Date.now() - 60_000).toISOString(),
        result: { kind: "repetitions", value: 8, unit: "reps" },
        effortLevel: 4,
        exhaustionLevel: 3,
        completionOutcome: "as_listed",
      },
    });
    expect(completion.status()).toBe(201);
  }
  await api.dispose();

  const avaContext = await browser.newContext({
    baseURL: process.env.E2E_PWA_BASE_URL ?? "http://pwa:3000",
  });
  const avaPage = await avaContext.newPage();
  try {
    await Promise.all([
      page.setViewportSize({ width: 320, height: 720 }),
      avaPage.setViewportSize({ width: 320, height: 720 }),
    ]);
    await openReadyPage(page, "/team");
    await loginAsAva(avaPage);
    await avaPage.goto("/team");
    await avaPage.locator("html[data-app-ready='true']").waitFor();

    const masonLounge = page.getByRole("region", {
      name: "Beach Boardwalk Team Lounge",
    });
    const avaLounge = avaPage.getByRole("region", {
      name: "Beach Boardwalk Team Lounge",
    });
    await expect(masonLounge.getByText("2 here")).toBeVisible({
      timeout: 15_000,
    });
    await expect(avaLounge.getByText("2 here")).toBeVisible({
      timeout: 15_000,
    });
    await expect(masonLounge.getByLabel("Ava R.")).toBeVisible();
    await expect(avaLounge.getByLabel("Mason C.")).toBeVisible();

    const masonSelf = masonLounge
      .locator(".team-lounge__shared-avatar")
      .filter({ hasText: "You" });
    const masonOnAvaPage = avaLounge
      .locator(".team-lounge__shared-avatar")
      .filter({ hasText: "Mason" });
    const startSelf = await masonSelf.boundingBox();
    const startRemote = await masonOnAvaPage.boundingBox();
    expect(startSelf).not.toBeNull();
    expect(startRemote).not.toBeNull();

    await page.mouse.move(
      startSelf!.x + startSelf!.width / 2,
      startSelf!.y + 30,
    );
    await page.mouse.down();
    await page.mouse.move(startSelf!.x + 45, startSelf!.y + 30, { steps: 8 });
    await page.mouse.up();

    await expect
      .poll(async () => {
        const current = await masonOnAvaPage.boundingBox();
        return current ? Math.abs(current.x - startRemote!.x) : 0;
      })
      .toBeGreaterThan(3);
  } finally {
    await avaContext.close();
  }
});
