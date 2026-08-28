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

test("a player can save, reopen, and delete a private session", async ({
  page,
}) => {
  await openReadyPage(page, "/log");
  await page.getByRole("button", { name: "Save" }).click();

  await expect(page.getByRole("status")).toContainText("Training saved");
  await page.getByRole("link", { name: "Me", exact: true }).click();

  const newestSession = page
    .getByRole("link", {
      name: "View Hill Sprints session details",
    })
    .first();
  await expect(newestSession).toBeVisible();
  await newestSession.click();
  await expect(
    page.getByRole("heading", { name: "Hill Sprints" }),
  ).toBeVisible();
  const createdPath = new URL(page.url()).pathname;

  await page.getByRole("button", { name: "Delete session" }).click();
  await page.getByRole("button", { name: "Yes, delete" }).click();
  await expect(page).toHaveURL(/\/$/);

  const api = await request.newContext({ baseURL: apiBaseURL });
  const deleted = await api.get(
    `/v1/training-entries/${createdPath.split("/").pop()}`,
    {
      headers: { Authorization: "Bearer e2e-player-mason" },
    },
  );
  expect(deleted.status()).toBe(404);
  await api.dispose();
});

test("an expired session detail explains that player deletion is closed", async ({
  page,
}) => {
  await openReadyPage(page, "/sessions/entry-mason-expired");

  await expect(
    page.getByRole("heading", { name: "Hill Sprints" }),
  ).toBeVisible();
  await expect(
    page.getByText("The 24-hour deletion window has closed."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Delete session" }),
  ).toHaveCount(0);
});
