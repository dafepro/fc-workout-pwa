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

test("the consolidated Team view opens the canonical canvas Lounge at 320 pixels", async ({
  page,
}) => {
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
