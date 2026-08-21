import { expect, request, test } from "@playwright/test";
import { loginAsMason } from "./app-ready";

const apiBaseURL = process.env.E2E_API_BASE_URL ?? "http://api:8080";
const resetKey = process.env.E2E_RESET_KEY ?? "local-e2e-reset-only";
const masonHeaders = { Authorization: "Bearer e2e-player-mason" };

test.beforeEach(async () => {
  const api = await request.newContext({ baseURL: apiBaseURL });
  const reset = await api.post("/__e2e/reset", {
    headers: { "X-E2E-Reset-Key": resetKey },
  });
  expect(reset.status()).toBe(204);
  const rest = await api.post("/v1/teams/team-hill-striders/canvas/rest", {
    headers: masonHeaders,
    data: {},
  });
  expect(rest.status()).toBe(204);
  const reach = await api.post("/v1/me/training-entries", {
    headers: { ...masonHeaders, "Idempotency-Key": "pwa-canvas-reach" },
    data: {
      teamId: "team-hill-striders",
      activityDefinitionId: "hill-sprints",
      assignmentId: "assignment-hill-sprints",
      occurredAt: new Date().toISOString(),
      result: { kind: "repetitions", value: 10, unit: "reps" },
      effortLevel: 5,
      exhaustionLevel: 4,
    },
  });
  expect(reach.status()).toBe(201);
  await api.dispose();
});

test("connected Team Canvas uses durable pieces, settings, and SSE updates", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await loginAsMason(page);
  await page.goto("/team-canvas/team");

  await expect(page.getByLabel("Hill Striders weekly canvas")).toBeVisible();
  await expect(page.getByText("Ari", { exact: true })).toHaveCount(0);
  await expect(page.getByText("1 stamp ready")).toBeVisible();

  await page
    .getByRole("button", { name: /Choose .* stamp/ })
    .first()
    .click();
  const ownedStamp = page.getByRole("button", {
    name: /Edit .* live stamp/,
  });
  await expect(ownedStamp).toBeVisible();
  await expect(page.getByRole("button", { name: "Smaller" })).toHaveCount(1);
  await ownedStamp.click();
  await expect(page.getByRole("button", { name: "Smaller" })).toHaveCount(0);
  await ownedStamp.click();
  await expect(page.getByRole("button", { name: "Smaller" })).toHaveCount(1);

  const toolbox = page.locator(".tc-toolbox");
  await toolbox.getByText("Developer canvas toolbox", { exact: true }).click();
  await toolbox.getByLabel("Background scene").selectOption("cosmic-stadium");
  await toolbox.getByLabel("Team-name style").selectOption("bubble");
  const settingsSaved = page.waitForResponse(
    (response) =>
      response.url().includes("/canvas/dev-settings") &&
      response.request().method() === "PUT",
  );
  await toolbox.getByRole("button", { name: "Apply to live canvas" }).click();
  expect((await settingsSaved).ok()).toBe(true);
  await expect(page.locator(".tc-board")).toHaveClass(/tc-board--bubble/);
  await expect(page.locator(".tc-board")).toHaveCSS(
    "background-image",
    /cosmic-stadium\.png/,
  );

  const api = await request.newContext({ baseURL: apiBaseURL });
  const avatarUpdate = await api.put(
    "/v1/teams/team-hill-striders/canvas/avatar",
    { headers: masonHeaders, data: { x: 84, y: 22 } },
  );
  expect(avatarUpdate.ok()).toBe(true);
  await expect
    .poll(() =>
      page
        .getByRole("button", { name: "Move Mason’s avatar" })
        .getAttribute("style"),
    )
    .toContain("left: 84%");

  await page.reload();
  await expect(page.getByLabel("Hill Striders weekly canvas")).toBeVisible();
  await expect(page.locator(".tc-board")).toHaveClass(/tc-board--bubble/);
  await expect(
    page.getByRole("button", { name: /Edit .* live stamp/ }),
  ).toBeVisible();
  await api.dispose();
});
