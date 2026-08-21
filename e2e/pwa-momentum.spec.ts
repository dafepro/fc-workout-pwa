import { expect, request, test } from "@playwright/test";
import { loginAsMason } from "./app-ready";

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

test("Momentum selects real assignments and persists check-ins across devices", async ({
  browser,
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await loginAsMason(page);
  await page.goto("/me");
  await page.getByLabel("App view").selectOption("/momentum-alpha/me");
  await expect(page).toHaveURL(/\/momentum-alpha\/me$/);
  await expect(page.getByRole("heading", { name: "Mason C." })).toBeVisible();

  await page.getByRole("link", { name: "Today" }).click();
  await expect(
    page.getByRole("heading", { name: "Hill Sprints" }),
  ).toBeVisible();
  await expect(page.getByText("Goal · 8 reps")).toBeVisible();

  await page.getByRole("button", { name: /Check in/ }).click();
  await page.getByRole("button", { name: "Goal · 8 reps" }).click();
  await page.getByRole("button", { name: "Tired", exact: true }).click();
  const saved = page.waitForResponse(
    (response) =>
      response.url().includes("/api/zoomigo/v1/me/training-entries") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Save check-in" }).click();
  expect((await saved).status()).toBe(201);
  await expect(
    page.getByRole("heading", { name: "Main work complete" }),
  ).toBeVisible();

  await page.getByRole("link", { name: "Team", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Hill Striders Momentum" }),
  ).toBeVisible();
  await expect(page.getByText("Ari", { exact: true })).toHaveCount(0);

  const secondDevice = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const secondPage = await secondDevice.newPage();
  await loginAsMason(secondPage);
  await secondPage.goto("/momentum-alpha/me");
  await expect(
    secondPage.getByRole("heading", { name: "Private activity" }),
  ).toBeVisible();
  await expect(
    secondPage
      .locator(".ma-history li")
      .filter({ hasText: "Hill Sprints" })
      .filter({ hasText: "8 reps" })
      .first(),
  ).toBeVisible();
  await secondDevice.close();
});
