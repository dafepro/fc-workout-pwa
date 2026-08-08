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

test("connected Home and Record Training use the server assignment", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await openReadyPage(page, "/");
  await expect(
    page.getByRole("heading", { name: "Hill Sprints" }),
  ).toBeVisible();
  await expect(page.getByText("of 3", { exact: true })).toBeVisible();

  await page.getByRole("link", { name: /Log session/i }).click();
  await expect(page.getByRole("link", { name: "Record training" })).toHaveCount(
    0,
  );
  await expect(
    page
      .locator(".selected-activity")
      .getByText("Hill Sprints", { exact: true }),
  ).toBeVisible();
  await page.locator(".selected-activity").click();
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

  const api = await request.newContext({ baseURL: apiBaseURL });
  const dashboard = await api.get(
    "/v1/me/training-dashboard?teamId=team-hill-striders",
    { headers: { Authorization: "Bearer e2e-player-mason" } },
  );
  expect(dashboard.ok()).toBe(true);
  expect((await dashboard.json()).currentAssignment.completed).toBe(true);
  await api.dispose();
});
