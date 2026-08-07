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
  await openReadyPage(page, "/");
  await expect(
    page.getByRole("heading", { name: "Hill Sprints" }),
  ).toBeVisible();
  await expect(page.getByText("of 3", { exact: true })).toBeVisible();

  await page.getByRole("link", { name: /Log session/i }).click();
  await expect(page.getByText("Hill Sprints", { exact: true })).toBeVisible();
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
