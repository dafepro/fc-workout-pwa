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
  const completion = await api.post("/v1/me/training-entries", {
    headers: {
      Authorization: "Bearer e2e-player-mason",
      "Idempotency-Key": "browser-lounge-visual-qualification",
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
});

test("the 320px Lounge keeps its approved visual states", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await openReadyPage(page, "/team?view=lounge");

  const lounge = page.getByRole("region", {
    name: "Beach Boardwalk Team Lounge",
  });
  const stage = lounge.getByLabel("Interactive lounge canvas");
  await stage.scrollIntoViewIfNeeded();
  await expect(stage.locator("canvas")).toBeVisible();
  await expect(lounge.locator(".team-lounge__world")).toHaveAttribute(
    "data-canvas-state",
    "ready",
  );
  await expect(lounge.getByLabel("Mason C., you")).toHaveCount(1);
  await expect(lounge.getByText("You", { exact: true })).toBeVisible();
  const dock = lounge.getByRole("navigation", { name: "Lounge actions" });
  const revealDock = async () => {
    await dock.scrollIntoViewIfNeeded();
    await expect(dock).toBeVisible();
  };
  await revealDock();

  await expect(lounge).toHaveScreenshot("team-lounge-idle.png", {
    animations: "disabled",
    maxDiffPixels: 4_000,
  });

  await lounge.getByRole("button", { name: "React" }).click();
  await expect(
    lounge.getByRole("dialog", { name: "Choose a reaction" }),
  ).toBeVisible();
  await expect(lounge).toHaveScreenshot("team-lounge-react.png", {
    animations: "disabled",
    maxDiffPixels: 4_000,
  });

  await lounge.getByRole("button", { name: "Chat" }).click();
  await expect(
    lounge.getByRole("dialog", { name: "Choose a chat set" }),
  ).toBeVisible();
  await expect(lounge).toHaveScreenshot("team-lounge-chat-sets.png", {
    animations: "disabled",
    maxDiffPixels: 4_000,
  });

  await lounge.getByRole("button", { name: "Standard" }).click();
  await expect(
    lounge.getByRole("dialog", { name: "Choose a Standard message" }),
  ).toBeVisible();
  await expect(lounge).toHaveScreenshot("team-lounge-chat-standard.png", {
    animations: "disabled",
    maxDiffPixels: 4_000,
  });

  await lounge.getByRole("button", { name: "Stamps" }).click();
  await lounge
    .getByRole("button", { name: "Choose Soccer ball stamp" })
    .click();
  await lounge
    .getByRole("button", {
      name: "Place Soccer ball stamp on the boardwalk",
    })
    .click({ position: { x: 160, y: 185 } });
  await expect(lounge.getByRole("status")).toHaveText("Soccer ball placed.", {
    timeout: 10_000,
  });
  const stamp = lounge.locator(".team-lounge__placed-item--editable");
  await expect(stamp).toBeVisible();
  await stamp.click();
  await expect(
    lounge.getByRole("group", { name: "Edit selected stamp" }),
  ).toBeVisible();
  await revealDock();
  await expect(lounge).toHaveScreenshot("team-lounge-stamp-editor.png", {
    animations: "disabled",
    maxDiffPixels: 4_000,
  });
});
